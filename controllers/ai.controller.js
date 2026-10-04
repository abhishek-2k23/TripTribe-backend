// controllers/ai.controller.js
//
// AI routes. Every action that calls Claude is a background job: the route validates, reserves
// credits and returns 202 with a job id; the client polls GET /ai/jobs/:jobId for progress and the
// result (ai-plan §7, design.md D-038).

import mongoose from "mongoose";

import AiJob from "../models/aiJob.model.js";
import AiMessage from "../models/aiMessage.model.js";
import AiThread from "../models/aiThread.model.js";
import AiUpload from "../models/aiUpload.model.js";
import ItineraryProposal from "../models/itineraryProposal.model.js";
import Trip from "../models/trip.model.js";
import { findMember } from "../middleware/membership.js";
import { aiConfigured, CREDIT_COST, PLAN, planCredits, plannerConfigured } from "../lib/ai/config.js";
import { createJob } from "../lib/ai/jobs.js";
import { jobRunnerMode } from "../lib/inngest.js";
import { addActivityToDay, tripDayIds } from "../lib/itinerary.js";
import { bumpRevisionFor } from "../lib/revisions.js";

const EDIT_ROLES = ["owner", "editor"];
/** Viewers use their own credits; owners and editors may spend the trip's pool (ai-plan §8.3). */
const poolFor = (trip, role) => (trip && EDIT_ROLES.includes(role) ? trip._id : null);
const MAX_MESSAGE_LENGTH = 4000;
const MAX_REQUEST_LENGTH = 2000;

const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });
const validId = (id) => mongoose.isValidObjectId(id);

async function loadMemberTrip(tripId, userId, roles) {
  if (!tripId) return { error: [400, "tripId is required"] };
  if (!validId(tripId)) return { error: [400, "Invalid trip id"] };
  const trip = await Trip.findById(tripId);
  if (!trip) return { error: [404, "Trip not found"] };
  const member = findMember(trip, userId);
  if (!member) return { error: [403, "You are not part of this trip"] };
  if (roles && !roles.includes(member.role)) {
    return { error: [403, "Only the trip owner or an editor can do this"] };
  }
  return { trip, role: member.role };
}

function publicJob(job) {
  return {
    _id: job._id,
    kind: job.kind,
    status: job.status,
    cost: job.cost,
    trip: job.trip,
    thread: job.thread,
    proposal: job.proposal,
    steps: job.steps,
    result: job.result,
    error: job.error?.code ? job.error : null,
    cancelRequested: job.cancelRequested,
    createdAt: job.createdAt,
    startedAt: job.startedAt ?? null,
    finishedAt: job.finishedAt ?? null,
  };
}

function handleJobError(res, next, error) {
  if (error?.statusCode === 402) {
    return fail(res, 402, error.message, {
      code: "INSUFFICIENT_CREDITS",
      needed: error.needed,
      available: error.available,
    });
  }
  if (error?.statusCode === 503) return fail(res, 503, error.message, { code: "AI_UNAVAILABLE" });
  return next(error);
}

export const requireAi = (req, res, next) =>
  aiConfigured()
    ? next()
    : fail(res, 503, "AI features aren't set up on this server yet.", { code: "AI_NOT_CONFIGURED" });

// GET /api/ai/status
export const getAiStatus = (req, res) => {
  res.json({
    success: true,
    data: {
      ai: aiConfigured(),
      planner: {
        available: aiConfigured() && plannerConfigured(),
        reason: plannerConfigured() ? null : "Trip planning needs Google Maps, which isn't set up yet.",
      },
      jobRunner: jobRunnerMode(),
      costs: { ...CREDIT_COST, plan: PLAN },
    },
  });
};

// POST /api/ai/threads
export const createThread = async (req, res, next) => {
  try {
    const { tripId, title } = req.body ?? {};
    let trip = null;
    if (tripId) {
      const result = await loadMemberTrip(tripId, req.user._id);
      if (result.error) return fail(res, ...result.error);
      trip = result.trip;
    }
    const thread = await AiThread.create({
      user: req.user._id,
      trip: trip?._id ?? null,
      title: (typeof title === "string" && title.trim().slice(0, 80)) || (trip ? `Planning ${trip.name}` : "New conversation"),
    });
    res.status(201).json({ success: true, data: thread });
  } catch (error) {
    next(error);
  }
};

// GET /api/ai/threads
export const listThreads = async (req, res, next) => {
  try {
    const filter = { user: req.user._id };
    if (req.query.tripId) {
      if (!validId(req.query.tripId)) return fail(res, 400, "Invalid trip id");
      filter.trip = req.query.tripId;
    }
    const threads = await AiThread.find(filter).sort({ lastMessageAt: -1 }).limit(50).lean();
    res.json({ success: true, count: threads.length, data: threads });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/ai/threads/:threadId
export const deleteThread = async (req, res, next) => {
  try {
    const { threadId } = req.params;
    if (!validId(threadId)) return fail(res, 400, "Invalid thread id");
    const thread = await AiThread.findOne({ _id: threadId, user: req.user._id }).select("_id").lean();
    if (!thread) return fail(res, 404, "Conversation not found");
    // The job would finish by writing its reply into a conversation that no longer exists.
    if (await AiJob.exists({ thread: threadId, status: { $in: ["queued", "running"] } })) {
      return fail(res, 409, "A reply is still being written. Delete the conversation once it's done.");
    }

    await AiMessage.deleteMany({ thread: threadId });
    // Jobs stay as the record behind the credit ledger and cost tracking, minus what was said in
    // them. A plan job's request also lives on its proposal, which belongs to the trip.
    await AiJob.updateMany({ thread: threadId, kind: "chat" }, { $set: { input: {}, result: null }, $unset: { thread: 1 } });
    await AiJob.updateMany({ thread: threadId }, { $unset: { thread: 1 } });
    await AiThread.deleteOne({ _id: threadId });
    res.json({ success: true, message: "Conversation deleted" });
  } catch (error) {
    next(error);
  }
};

// GET /api/ai/threads/:threadId/messages
export const getThreadMessages = async (req, res, next) => {
  try {
    const { threadId } = req.params;
    if (!validId(threadId)) return fail(res, 400, "Invalid thread id");
    const thread = await AiThread.findOne({ _id: threadId, user: req.user._id }).lean();
    if (!thread) return fail(res, 404, "Conversation not found");
    const [messages, activeJob] = await Promise.all([
      AiMessage.find({ thread: threadId }).sort({ createdAt: 1 }).limit(200).lean(),
      // Lets a client that left mid-reply pick the progress back up.
      AiJob.findOne({ thread: threadId, status: { $in: ["queued", "running"] } }).sort({ createdAt: -1 }).lean(),
    ]);
    res.json({ success: true, data: { thread, messages, activeJob: activeJob ? publicJob(activeJob) : null } });
  } catch (error) {
    next(error);
  }
};

// POST /api/ai/chat
export const sendChatMessage = async (req, res, next) => {
  let userMessage;
  try {
    const text = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (!text) return fail(res, 400, "message is required");
    if (text.length > MAX_MESSAGE_LENGTH) {
      return fail(res, 400, `Keep messages under ${MAX_MESSAGE_LENGTH} characters`);
    }

    let thread;
    if (req.body.threadId) {
      if (!validId(req.body.threadId)) return fail(res, 400, "Invalid thread id");
      thread = await AiThread.findOne({ _id: req.body.threadId, user: req.user._id });
      if (!thread) return fail(res, 404, "Conversation not found");
    } else {
      let tripRef = null;
      if (req.body.tripId) {
        const result = await loadMemberTrip(req.body.tripId, req.user._id);
        if (result.error) return fail(res, ...result.error);
        tripRef = result.trip._id;
      }
      thread = await AiThread.create({ user: req.user._id, trip: tripRef, title: text.slice(0, 60) });
    }

    // Someone removed from a trip loses access to its context, even in an existing conversation.
    let poolTripId = null;
    if (thread.trip) {
      const result = await loadMemberTrip(thread.trip, req.user._id);
      if (result.error) return fail(res, ...result.error);
      poolTripId = poolFor(result.trip, result.role);
    }

    if (await AiJob.exists({ thread: thread._id, status: { $in: ["queued", "running"] } })) {
      return fail(res, 409, "Wait for the current reply before sending another message", {
        code: "REPLY_IN_PROGRESS",
      });
    }

    userMessage = await AiMessage.create({ thread: thread._id, user: req.user._id, role: "user", content: text });
    await AiThread.updateOne({ _id: thread._id }, { $set: { lastMessageAt: userMessage.createdAt } });

    const job = await createJob({
      userId: req.user._id,
      kind: "chat",
      input: { messageId: userMessage._id },
      trip: thread.trip,
      thread: thread._id,
      cost: CREDIT_COST.chat,
      poolTripId,
    });

    res.status(202).json({
      success: true,
      data: { jobId: job._id, threadId: thread._id, messageId: userMessage._id, cost: job.cost, fundedBy: job.fundedBy },
    });
  } catch (error) {
    // Without a job, the question would sit unanswered in the thread.
    if (userMessage && (error?.statusCode === 402 || error?.statusCode === 503)) {
      await AiMessage.deleteOne({ _id: userMessage._id }).catch(() => {});
    }
    handleJobError(res, next, error);
  }
};

// POST /api/ai/packing-list
export const requestPackingList = async (req, res, next) => {
  try {
    const result = await loadMemberTrip(req.body?.tripId, req.user._id);
    if (result.error) return fail(res, ...result.error);

    const job = await createJob({
      userId: req.user._id,
      kind: "packing",
      trip: result.trip._id,
      cost: CREDIT_COST.packing,
      poolTripId: poolFor(result.trip, result.role),
    });
    res.status(202).json({ success: true, data: { jobId: job._id, cost: job.cost, fundedBy: job.fundedBy } });
  } catch (error) {
    handleJobError(res, next, error);
  }
};

// POST /api/ai/receipt (multipart, field `image`)
export const requestReceiptScan = async (req, res, next) => {
  try {
    if (!req.file) {
      return fail(res, 400, "Attach a receipt photo as `image` — JPEG, PNG, WebP or GIF, up to 5 MB");
    }

    let tripRef = null;
    let poolTripId = null;
    if (req.body?.tripId) {
      const result = await loadMemberTrip(req.body.tripId, req.user._id);
      if (result.error) return fail(res, ...result.error);
      tripRef = result.trip._id;
      poolTripId = poolFor(result.trip, result.role);
    }

    const job = await createJob({
      poolTripId,
      userId: req.user._id,
      kind: "receipt",
      input: { fileName: req.file.originalname?.slice(0, 120) ?? null },
      trip: tripRef,
      cost: CREDIT_COST.receipt,
      beforeDispatch: (created) =>
        AiUpload.create({
          user: req.user._id,
          job: created._id,
          mimeType: req.file.mimetype,
          data: req.file.buffer,
        }),
    });
    res.status(202).json({ success: true, data: { jobId: job._id, cost: job.cost, fundedBy: job.fundedBy } });
  } catch (error) {
    handleJobError(res, next, error);
  }
};

// POST /api/ai/plan
export const requestPlan = async (req, res, next) => {
  try {
    if (!plannerConfigured()) {
      return fail(res, 503, "Trip planning needs Google Maps, which isn't set up on this server yet.", {
        code: "PLANNER_NOT_CONFIGURED",
      });
    }

    const request = typeof req.body?.request === "string" ? req.body.request.trim() : "";
    if (request.length > MAX_REQUEST_LENGTH) {
      return fail(res, 400, `Keep the request under ${MAX_REQUEST_LENGTH} characters`);
    }

    const result = await loadMemberTrip(req.body?.tripId, req.user._id, EDIT_ROLES);
    if (result.error) return fail(res, ...result.error);
    const { trip } = result;

    const days = tripDayIds(trip.startDate, trip.endDate).length;
    if (days > PLAN.maxDays) return fail(res, 400, `AI plans cover trips of up to ${PLAN.maxDays} days`);

    if (await AiJob.exists({ trip: trip._id, kind: "plan", status: { $in: ["queued", "running"] } })) {
      return fail(res, 409, "A plan for this trip is already being built", { code: "PLAN_IN_PROGRESS" });
    }

    const job = await createJob({
      userId: req.user._id,
      kind: "plan",
      input: { request, days },
      trip: trip._id,
      cost: planCredits(days),
      poolTripId: poolFor(trip, result.role),
    });
    res.status(202).json({ success: true, data: { jobId: job._id, cost: job.cost, fundedBy: job.fundedBy } });
  } catch (error) {
    handleJobError(res, next, error);
  }
};

// GET /api/ai/plans?tripId=
// A trip's recent proposals and the plan being built right now, if any — any member.
export const listTripPlans = async (req, res, next) => {
  try {
    const result = await loadMemberTrip(req.query.tripId, req.user._id);
    if (result.error) return fail(res, ...result.error);
    const tripId = result.trip._id;

    const [proposals, activeJob] = await Promise.all([
      ItineraryProposal.find({ trip: tripId })
        .sort({ createdAt: -1 })
        .limit(10)
        .select("status summary request days.activities._id acceptedActivityIds createdBy createdAt")
        .lean(),
      AiJob.findOne({ trip: tripId, kind: "plan", status: { $in: ["queued", "running"] } })
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    res.json({
      success: true,
      data: {
        // Only the requester can poll a job, so others see that a plan is on the way but not its steps.
        activeJob: activeJob
          ? String(activeJob.user) === String(req.user._id)
            ? publicJob(activeJob)
            : { _id: activeJob._id, kind: "plan", status: activeJob.status, mine: false }
          : null,
        proposals: proposals.map((proposal) => ({
          _id: proposal._id,
          status: proposal.status,
          summary: proposal.summary,
          request: proposal.request,
          createdBy: proposal.createdBy,
          createdAt: proposal.createdAt,
          activityCount: proposal.days.reduce((count, day) => count + day.activities.length, 0),
          acceptedCount: proposal.acceptedActivityIds.length,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/ai/jobs/:jobId
export const getJob = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    if (!validId(jobId)) return fail(res, 400, "Invalid job id");
    const job = await AiJob.findOne({ _id: jobId, user: req.user._id }).lean();
    if (!job) return fail(res, 404, "Job not found");
    res.json({ success: true, data: publicJob(job) });
  } catch (error) {
    next(error);
  }
};

// POST /api/ai/jobs/:jobId/cancel
export const cancelJob = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    if (!validId(jobId)) return fail(res, 400, "Invalid job id");
    const job = await AiJob.findOneAndUpdate(
      { _id: jobId, user: req.user._id, status: { $in: ["queued", "running"] } },
      { $set: { cancelRequested: true } },
      { new: true }
    ).lean();
    if (!job) {
      const exists = await AiJob.exists({ _id: jobId, user: req.user._id });
      return exists ? fail(res, 409, "This has already finished") : fail(res, 404, "Job not found");
    }
    // The runner stops at the next step and refunds the credits.
    res.status(202).json({ success: true, data: publicJob(job) });
  } catch (error) {
    next(error);
  }
};

async function loadProposal(req, res, roles) {
  const { proposalId } = req.params;
  if (!validId(proposalId)) return { response: fail(res, 400, "Invalid proposal id") };
  const proposal = await ItineraryProposal.findById(proposalId);
  if (!proposal) return { response: fail(res, 404, "Plan not found") };
  const result = await loadMemberTrip(proposal.trip, req.user._id, roles);
  if (result.error) return { response: fail(res, ...result.error) };
  return { proposal, trip: result.trip };
}

// GET /api/ai/proposals/:proposalId
export const getProposal = async (req, res, next) => {
  try {
    const { proposal, response } = await loadProposal(req, res);
    if (response) return;
    res.json({ success: true, data: proposal });
  } catch (error) {
    next(error);
  }
};

// POST /api/ai/proposals/:proposalId/accept
export const acceptProposal = async (req, res, next) => {
  try {
    const { proposal, response } = await loadProposal(req, res, EDIT_ROLES);
    if (response) return;
    if (proposal.status === "rejected") return fail(res, 409, "This plan was dismissed");

    const requested = Array.isArray(req.body?.activityIds) ? new Set(req.body.activityIds.map(String)) : null;
    const alreadyAccepted = new Set(proposal.acceptedActivityIds.map(String));
    const touchedDays = new Map();
    const accepted = [];

    for (const day of proposal.days) {
      for (const activity of day.activities) {
        const activityId = String(activity._id);
        if (alreadyAccepted.has(activityId) || (requested && !requested.has(activityId))) continue;

        // The clientRef makes a retried or repeated accept return the existing activity.
        const { dayPlan } = await addActivityToDay({
          tripId: proposal.trip,
          date: day.date,
          section: activity.section || "Plan",
          activity: {
            title: activity.title,
            time: activity.time ?? undefined,
            type: activity.type,
            notes: activity.notes,
            location: [activity.place?.name, activity.place?.address].filter(Boolean).join(", ") || undefined,
            place: activity.place ?? undefined,
            estCost: activity.estCostPerPerson,
            durationMin: activity.durationMin,
            source: "ai",
            clientRef: `${proposal._id}:${activityId}`,
          },
        });
        touchedDays.set(String(dayPlan._id), dayPlan);
        accepted.push(activity._id);
      }
    }

    if (accepted.length) {
      proposal.acceptedActivityIds.push(...accepted);
      proposal.decisions.push({ by: req.user._id, action: "accept", activityIds: accepted });
      const total = proposal.days.reduce((count, day) => count + day.activities.length, 0);
      proposal.status = proposal.acceptedActivityIds.length >= total ? "accepted" : "partially_accepted";
      await proposal.save();

      await bumpRevisionFor(req, proposal.trip, "itinerary");

      const io = req.app.get("socketio");
      for (const dayPlan of touchedDays.values()) {
        io?.to(String(proposal.trip)).emit("activity_added", dayPlan);
      }
    }

    res.json({ success: true, data: { proposal, added: accepted.length } });
  } catch (error) {
    next(error);
  }
};

// POST /api/ai/proposals/:proposalId/reject
export const rejectProposal = async (req, res, next) => {
  try {
    const { proposal, response } = await loadProposal(req, res, EDIT_ROLES);
    if (response) return;
    if (proposal.status === "accepted") return fail(res, 409, "This plan is already on the itinerary");

    proposal.status = "rejected";
    proposal.decisions.push({ by: req.user._id, action: "reject", activityIds: [] });
    await proposal.save();
    res.json({ success: true, data: proposal });
  } catch (error) {
    next(error);
  }
};
