import AiJob from "../../../models/aiJob.model.js";

/** The job's inputs as a memoized, JSON-safe step. */
export const loadJob = (step, jobId) =>
  step.run("load", async () => {
    const job = await AiJob.findById(jobId).select("user trip thread input cost kind").lean();
    return JSON.parse(JSON.stringify(job));
  });
