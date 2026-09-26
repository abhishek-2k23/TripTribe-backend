// A day-by-day plan for an existing trip (ai-plan §7.2). The output is an ItineraryProposal that
// members review and accept per activity — never a direct write to the itinerary (design.md D-037).

import AiJob from "../../../models/aiJob.model.js";
import ItineraryProposal from "../../../models/itineraryProposal.model.js";
import Trip from "../../../models/trip.model.js";
import { computeLegMinutes, resolveDestination } from "../../places.js";
import { estimateBudget } from "../budget.js";
import { compactCandidates, gatherCandidates } from "../candidates.js";
import { callStructured } from "../client.js";
import { loadTripSnapshot, weatherForTrip } from "../context.js";
import { JobFailure } from "../errors.js";
import { DRAFT_PROMPT_V1, INTENT_PROMPT_V1, REPAIR_PROMPT_V1 } from "../prompts.js";
import { DRAFT_SCHEMA, INTENT_SCHEMA, REPAIR_SCHEMA } from "../schemas.js";
import { deriveTheme } from "../../theme.js";
import { sanitizeDraft, sortByTime, validateItinerary } from "../validate.js";
import { loadJob } from "./shared.js";

const weekday = (date) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });

/** Driving minutes between consecutive known stops, for the given dates. */
async function legsFor(draft, candidatesById, dates) {
  const byDay = {};
  let calls = 0;
  for (const day of draft.days) {
    if (!dates.includes(day.date)) continue;
    const stops = sortByTime(day.activities)
      .map((activity) => candidatesById.get(activity.placeId))
      .filter(Boolean);
    if (stops.length < 2) continue;
    calls += 1;
    try {
      byDay[day.date] = await computeLegMinutes(stops);
    } catch (error) {
      if (error.retryable) throw error;
      // A route that can't be computed leaves that day's timing unchecked rather than failing the plan.
      console.warn(`[ai] routes unavailable for ${day.date}:`, error.message);
    }
  }
  return { byDay, calls };
}

export async function planHandler({ jobId, step, runStep }) {
  const job = await loadJob(step, jobId);
  const trip = await step.run("load-trip", () => loadTripSnapshot(job.trip));

  const intent = await runStep("intent", async () => {
    const input = {
      trip: {
        destination: trip.location,
        startDate: trip.startDate,
        endDate: trip.endDate,
        days: trip.dayIds.length,
        travellers: trip.memberCount,
        budget: trip.budget,
      },
      request: job.input.request || "Plan the whole trip.",
    };
    const { data, usage } = await callStructured({
      step: "intent",
      system: INTENT_PROMPT_V1,
      messages: [{ role: "user", content: JSON.stringify(input) }],
      schema: INTENT_SCHEMA,
    });
    return { value: data, usage: [usage] };
  });

  const destination = await runStep("destination", async () => {
    if (trip.place?.placeId && Number.isFinite(trip.place.lat)) return { value: trip.place };
    const place = await resolveDestination(trip.location);
    if (!place) {
      throw new JobFailure(
        "DESTINATION_NOT_FOUND",
        `Couldn't find "${trip.location}" on the map. Check the trip's location and try again.`
      );
    }
    await Trip.updateOne({ _id: trip.id }, { $set: { place } });
    return { value: place, apiCalls: { places: 1 } };
  });

  const weather = await runStep("weather", async () => {
    try {
      const result = await weatherForTrip({ ...trip, place: destination });
      return { value: result.days, apiCalls: { weather: result.calls } };
    } catch (error) {
      console.warn(`[ai] weather unavailable for job ${jobId}:`, error.message);
      return { value: [] };
    }
  });

  const candidates = await runStep("places", async () => {
    const { candidates: found, calls } = await gatherCandidates({
      destination,
      intent,
      dayCount: trip.dayIds.length,
    });
    const minimum = Math.max(6, trip.dayIds.length * 3);
    if (found.length < minimum) {
      throw new JobFailure(
        "NOT_ENOUGH_PLACES",
        `Found only ${found.length} places around ${destination.name} — not enough for a ${trip.dayIds.length}-day plan.`
      );
    }
    await Trip.updateOne(
      { _id: trip.id },
      { $set: { theme: deriveTheme({ destination, candidates: found, startDate: trip.startDate }) } }
    );
    return { value: found, apiCalls: { places: calls } };
  });

  const candidatesById = new Map(candidates.map((candidate) => [candidate.placeId, candidate]));
  const candidateList = compactCandidates(candidates);

  let draft = await runStep("draft", async () => {
    const input = {
      destination: { name: destination.name, address: destination.address },
      dates: trip.dayIds.map((date, index) => ({
        date,
        weekday: weekday(date),
        dayNumber: index + 1,
        weather: weather.find((w) => w.date === date) ?? null,
      })),
      travellers: trip.memberCount,
      currency: trip.budget.currency,
      pace: intent.pace,
      interests: intent.interests,
      mustSee: intent.mustSee,
      avoid: intent.avoid,
      budgetBand: intent.budgetBand,
      notes: intent.notes,
      alreadyOnItinerary: trip.itinerary,
      candidates: candidateList,
    };
    const { data, usage } = await callStructured({
      step: "draft",
      system: DRAFT_PROMPT_V1,
      messages: [{ role: "user", content: JSON.stringify(input) }],
      schema: DRAFT_SCHEMA,
    });
    return { value: data, usage: [usage] };
  });

  const checked = await runStep("validate", async () => {
    const legs = await legsFor(draft, candidatesById, trip.dayIds);
    const result = validateItinerary({
      draft,
      candidatesById,
      dayIds: trip.dayIds,
      pace: intent.pace,
      legMinutesByDay: legs.byDay,
    });
    if (result.valid) {
      await AiJob.updateOne({ _id: jobId, "steps.key": "repair" }, { $set: { "steps.$.status": "skipped" } });
    }
    return { value: { ...result, legs: legs.byDay }, apiCalls: { routes: legs.calls } };
  });

  let legMinutesByDay = checked.legs;
  let dayProblems = checked.dayProblems;

  if (!checked.valid) {
    const repaired = await runStep("repair", async () => {
      const usage = [];
      const days = new Map(draft.days.map((day) => [day.date, day]));
      const failingDates = Object.keys(checked.dayProblems).filter((date) => trip.dayIds.includes(date)).sort();

      // One day at a time, so each call can read the previous call's prompt-cache write.
      for (const date of failingDates) {
        const input = {
          date,
          weekday: weekday(date),
          currentPlan: days.get(date) ?? null,
          problems: checked.dayProblems[date],
          drivingMinutesBetweenStops: checked.legs[date] ?? [],
          placeIdsUsedOnOtherDays: [...days.values()]
            .filter((day) => day.date !== date)
            .flatMap((day) => day.activities.map((activity) => activity.placeId)),
          pace: intent.pace,
          currency: trip.budget.currency,
          candidates: candidateList,
        };
        const { data, usage: callUsage } = await callStructured({
          step: "repair",
          system: REPAIR_PROMPT_V1,
          messages: [{ role: "user", content: JSON.stringify(input) }],
          schema: REPAIR_SCHEMA,
        });
        usage.push(callUsage);
        days.set(date, { ...data, date });
      }

      const next = { ...draft, days: trip.dayIds.map((id) => days.get(id)).filter(Boolean) };
      const legs = await legsFor(next, candidatesById, failingDates);
      const mergedLegs = { ...checked.legs, ...legs.byDay };
      const recheck = validateItinerary({
        draft: next,
        candidatesById,
        dayIds: trip.dayIds,
        pace: intent.pace,
        legMinutesByDay: mergedLegs,
      });
      return {
        value: { draft: next, legs: mergedLegs, dayProblems: recheck.dayProblems },
        usage,
        apiCalls: { routes: legs.calls },
      };
    });
    draft = repaired.draft;
    legMinutesByDay = repaired.legs;
    dayProblems = repaired.dayProblems;
  }

  const plan = sanitizeDraft({ draft, candidatesById, dayIds: trip.dayIds, legMinutesByDay, dayProblems });
  if (!plan.days.some((day) => day.activities.length)) {
    throw new JobFailure("PLAN_INVALID", "Couldn't build a plan that passes our checks. Your credits were refunded.");
  }

  const budgetEstimate = await runStep("budget", async () => ({
    value: estimateBudget({
      days: plan.days,
      partySize: trip.memberCount,
      currency: trip.budget.currency,
      tripBudget: trip.budget,
    }),
  }));

  const proposalId = await runStep("proposal", async () => {
    const proposal = await ItineraryProposal.create({
      trip: trip.id,
      job: jobId,
      createdBy: job.user,
      request: job.input.request ?? "",
      summary: draft.summary,
      pace: intent.pace,
      days: plan.days,
      gaps: draft.gaps ?? [],
      warnings: plan.warnings,
      weather,
      budgetEstimate,
    });
    await AiJob.updateOne({ _id: jobId }, { $set: { proposal: proposal._id } });
    return { value: String(proposal._id) };
  });

  return { tripId: trip.id, proposalId };
}
