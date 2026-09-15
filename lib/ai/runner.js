// lib/ai/runner.js
//
// Runs one AI job, step by step. The same code path serves Inngest (durable, retried steps) and the
// in-process fallback used when Inngest isn't configured (lib/inngest.js).
//
// Inngest memoizes each completed step and replays the function to continue, so everything with a
// side effect happens inside `step.run`, and step results are plain JSON.
//
// Failure handling: user-facing failures (JobFailure), refusals, rejected requests and malformed
// output are recorded on the job and never retried. Transient failures (rate limits, overload,
// network, database hiccups) are retried by the runner. When a job ends failed or cancelled, its
// credits are refunded.

import Anthropic from "@anthropic-ai/sdk";
import { NonRetriableError } from "inngest";

import AiJob from "../../models/aiJob.model.js";
import { refundJob } from "../credits.js";
import { AiOutputError, AiRefusalError, JobFailure } from "./errors.js";
import { handlers } from "./handlers/index.js";

const GENERIC_FAILURE = "Something went wrong while working on this. Your credits were refunded.";

function classify(error) {
  if (error instanceof JobFailure) return { retryable: false, code: error.code, message: error.message };
  if (error instanceof AiRefusalError) {
    return { retryable: false, code: "REFUSED", message: "This request couldn't be completed. Try rephrasing it." };
  }
  if (error instanceof AiOutputError) {
    return { retryable: false, code: "AI_OUTPUT_INVALID", message: GENERIC_FAILURE };
  }
  if (error instanceof Anthropic.APIConnectionError || error instanceof Anthropic.RateLimitError) {
    return { retryable: true, code: "AI_UNAVAILABLE", message: GENERIC_FAILURE };
  }
  if (error instanceof Anthropic.APIError) {
    const status = error.status ?? 0;
    if (status >= 500) return { retryable: true, code: "AI_UNAVAILABLE", message: GENERIC_FAILURE };
    return { retryable: false, code: "AI_REQUEST_REJECTED", message: GENERIC_FAILURE };
  }
  if (error instanceof NonRetriableError || error?.retryable === false) {
    return { retryable: false, code: error.code ?? "FAILED", message: GENERIC_FAILURE };
  }
  return { retryable: true, code: "FAILED", message: GENERIC_FAILURE };
}

async function recordError(jobId, code, message) {
  await AiJob.updateOne({ _id: jobId, "error.code": { $exists: false } }, { $set: { error: { code, message } } });
}

/**
 * A tracked step: marks it running/done in `job.steps`, records usage and API call counts, and turns
 * non-retryable errors into NonRetriableError so they aren't retried.
 * `fn` returns `{ value, usage?, apiCalls? }`; the step resolves to `value`.
 */
export function createStepRunner(jobId, step) {
  return (key, fn) =>
    step.run(key, async () => {
      const job = await AiJob.findById(jobId).select("cancelRequested").lean();
      if (!job) throw new NonRetriableError("AI job not found");
      if (job.cancelRequested) {
        await recordError(jobId, "CANCELLED", "Cancelled. Your credits were refunded.");
        throw new NonRetriableError("Job cancelled");
      }

      await AiJob.updateOne(
        { _id: jobId, "steps.key": key },
        { $set: { "steps.$.status": "running", "steps.$.startedAt": new Date() } }
      );

      try {
        const out = (await fn()) ?? {};
        const update = { $set: { "steps.$.status": "done", "steps.$.finishedAt": new Date() } };
        if (out.usage?.length) update.$push = { usage: { $each: out.usage } };
        if (out.apiCalls) {
          update.$inc = Object.fromEntries(
            Object.entries(out.apiCalls).map(([name, count]) => [`apiCalls.${name}`, count])
          );
        }
        await AiJob.updateOne({ _id: jobId, "steps.key": key }, update);
        return out.value ?? null;
      } catch (error) {
        if (error.usage?.length) {
          await AiJob.updateOne({ _id: jobId }, { $push: { usage: { $each: error.usage } } });
        }
        const outcome = classify(error);
        if (!outcome.retryable) {
          console.warn(`[ai] job ${jobId} step ${key} failed (${outcome.code}):`, error.message);
          await recordError(jobId, outcome.code, outcome.message);
          throw new NonRetriableError(outcome.message);
        }
        throw error;
      }
    });
}

export async function failJob(jobId, error) {
  const job = await AiJob.findById(jobId);
  if (!job || ["succeeded", "failed", "cancelled"].includes(job.status)) return false;

  const outcome = error ? classify(error) : null;
  if (!job.error?.code) job.error = { code: outcome?.code ?? "FAILED", message: outcome?.message ?? GENERIC_FAILURE };

  job.status = job.cancelRequested || job.error.code === "CANCELLED" ? "cancelled" : "failed";
  for (const step of job.steps) {
    if (step.status === "running") step.status = "failed";
    else if (step.status === "pending") step.status = "skipped";
  }
  job.finishedAt = new Date();
  await job.save();
  await refundJob(job._id);
  return true;
}

export async function runJob(jobId, step) {
  const kind = await step.run("start", async () => {
    const job = await AiJob.findOneAndUpdate(
      { _id: jobId, status: { $in: ["queued", "running"] } },
      { $set: { status: "running" }, $min: { startedAt: new Date() } },
      { new: true }
    )
      .select("kind")
      .lean();
    return job?.kind ?? null;
  });

  if (!kind || !handlers[kind]) return { skipped: true };

  try {
    const result = await handlers[kind]({ jobId: String(jobId), step, runStep: createStepRunner(jobId, step) });
    await step.run("finish", async () => {
      await AiJob.updateOne(
        { _id: jobId, status: "running" },
        { $set: { status: "succeeded", result: result ?? null, finishedAt: new Date() } }
      );
      return true;
    });
    return { status: "succeeded" };
  } catch (error) {
    await step.run("fail", () => failJob(jobId, error));
    return { status: "failed" };
  }
}

/** Step tools for running a job in-process: light retries, JSON round-trip like Inngest's memoization. */
export function inlineStep() {
  return {
    run: async (_id, fn) => {
      for (let attempt = 1; ; attempt += 1) {
        try {
          const result = await fn();
          return result === undefined ? null : JSON.parse(JSON.stringify(result));
        } catch (error) {
          if (error instanceof NonRetriableError || attempt >= 3) throw error;
          await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
        }
      }
    },
  };
}
