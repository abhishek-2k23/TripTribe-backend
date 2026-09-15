// lib/ai/functions.js — Inngest functions served at /api/inngest.

import { AI_JOB_EVENT, inngest } from "../inngest.js";
import { runJob } from "./runner.js";

export const aiJobFunction = inngest.createFunction(
  {
    id: "ai-job",
    name: "AI job",
    retries: 3,
    concurrency: { limit: 5 },
    triggers: [{ event: AI_JOB_EVENT }],
  },
  async ({ event, step }) => runJob(event.data.jobId, step)
);

export const inngestFunctions = [aiJobFunction];
