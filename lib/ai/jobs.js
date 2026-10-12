// lib/ai/jobs.js
//
// Creating and dispatching AI jobs. A job and its credit hold are written in one transaction, so a
// job never exists without its credits reserved and credits are never held without a job.

import mongoose from "mongoose";

import AiJob from "../../models/aiJob.model.js";
import { ensureMonthlyGrant, reserveCredits } from "../credits.js";
import { AI_JOB_EVENT, inngest, jobRunnerMode } from "../inngest.js";
import { JOB_STEPS } from "./config.js";
import { JobFailure } from "./errors.js";
import { failJob, inlineStep, runJob } from "./runner.js";

export async function dispatchJob(jobId) {
  if (jobRunnerMode() === "inngest") {
    await inngest.send({ name: AI_JOB_EVENT, data: { jobId: String(jobId) } });
    return;
  }
  setImmediate(() => {
    runJob(String(jobId), inlineStep()).catch((error) => {
      console.error(`[ai] in-process job ${jobId} crashed:`, error);
    });
  });
}

/**
 * Creates a job, reserves its credits, runs `beforeDispatch(job)` (e.g. storing a receipt image the
 * job will read), then dispatches it. Throws InsufficientCreditsError (402) or a 503 if dispatch fails.
 *
 * `poolTripId`: the trip whose shared credit pool may pay (ai-plan §8.3) — only passed when the
 * requester is an owner or editor of it. The pool pays when it covers the whole cost.
 */
export async function createJob({ userId, kind, input = {}, trip = null, thread = null, cost, poolTripId = null, beforeDispatch }) {
  await ensureMonthlyGrant(userId);

  const session = await mongoose.startSession();
  let job;
  try {
    await session.withTransaction(async () => {
      [job] = await AiJob.create(
        [
          {
            user: userId,
            kind,
            input,
            trip,
            thread,
            cost,
            steps: JOB_STEPS[kind].map((step) => ({ ...step, status: "pending" })),
          },
        ],
        { session }
      );
      const { fundedBy } = await reserveCredits({ userId, jobId: job._id, amount: cost, session, poolTripId });
      if (fundedBy !== "user") {
        job.fundedBy = fundedBy;
        await AiJob.updateOne({ _id: job._id }, { $set: { fundedBy } }, { session });
      }
    });
  } finally {
    await session.endSession();
  }

  try {
    if (beforeDispatch) await beforeDispatch(job);
    await dispatchJob(job._id);
  } catch (error) {
    console.error(`[ai] couldn't start job ${job._id}:`, error);
    await failJob(job._id, new JobFailure("DISPATCH_FAILED", "Couldn't start this. Your credits were refunded."));
    const unavailable = new Error("The AI service is unavailable right now. Try again shortly.");
    unavailable.statusCode = 503;
    throw unavailable;
  }

  return job;
}

/**
 * In-process jobs don't survive a restart. On boot, fail and refund any that were left mid-run.
 * (Inngest-run jobs resume on their own, so this only applies in inline mode.)
 */
export async function recoverStaleJobs() {
  if (jobRunnerMode() !== "inline") return;
  const stale = await AiJob.find({ status: { $in: ["queued", "running"] } }).select("_id").lean();
  for (const { _id } of stale) {
    await failJob(
      _id,
      new JobFailure("INTERRUPTED", "This was interrupted by a server restart. Your credits were refunded.")
    );
  }
  if (stale.length) console.log(`[ai] refunded ${stale.length} job(s) interrupted by a restart`);
}
