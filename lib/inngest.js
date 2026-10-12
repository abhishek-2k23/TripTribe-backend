// lib/inngest.js
//
// Inngest runs AI jobs as durable, individually retried steps (design.md D-038).
//
// Inngest 4 defaults to cloud mode, where sending an event needs INNGEST_EVENT_KEY. So jobs go to
// Inngest only when it is configured — INNGEST_EVENT_KEY in production, or INNGEST_DEV=1 with the
// local dev server (`npx inngest-cli@latest dev`). Otherwise they run in-process: fine for local
// development, but not durable across restarts.

import { Inngest } from "inngest";

export const AI_JOB_EVENT = "ai/job.requested";

export const inngest = new Inngest({ id: "triptribe-backend" });

export const jobRunnerMode = () =>
  process.env.INNGEST_EVENT_KEY || process.env.INNGEST_DEV ? "inngest" : "inline";
