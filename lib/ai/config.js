// lib/ai/config.js
//
// One place for model choice, effort, credit prices and job progress steps.
//
// Every step starts on the same model, with depth set by `effort` (design.md D-031). A cheaper
// model replaces one only after the eval shows it holds quality — change it here, nowhere else.
// Credit prices are provisional until real job costs are measured (design.md D-042).

export const MODEL = "claude-opus-5";

export const STEP_CONFIG = {
  intent: { model: MODEL, effort: "low", maxTokens: 4000 },
  chat: { model: MODEL, effort: "low", maxTokens: 8000 },
  packing: { model: MODEL, effort: "low", maxTokens: 8000 },
  receipt: { model: MODEL, effort: "low", maxTokens: 4000 },
  // Non-streaming keeps the structured-output parse helper; 16K stays inside SDK request timeouts.
  draft: { model: MODEL, effort: "medium", maxTokens: 16000 },
  repair: { model: MODEL, effort: "low", maxTokens: 8000 },
};

export const FREE_MONTHLY_CREDITS = 50;

export const CREDIT_COST = {
  chat: 1,
  receipt: 1,
  packing: 2,
};

export const PLAN = {
  baseCredits: 20,
  baseDays: 5,
  extraDayCredits: 4,
  maxDays: 14,
};

export const planCredits = (days) =>
  PLAN.baseCredits + Math.max(0, days - PLAN.baseDays) * PLAN.extraDayCredits;

export const aiConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);
export const plannerConfigured = () => Boolean(process.env.GOOGLE_MAPS_SERVER_KEY);

/** Progress steps shown to the user, in order, per job kind. */
export const JOB_STEPS = {
  chat: [
    { key: "context", label: "Reading the conversation" },
    { key: "reply", label: "Writing a reply" },
  ],
  packing: [
    { key: "context", label: "Looking at your trip" },
    { key: "weather", label: "Checking the weather" },
    { key: "suggest", label: "Building your packing list" },
  ],
  receipt: [{ key: "read", label: "Reading the receipt" }],
  plan: [
    { key: "intent", label: "Understanding what you want" },
    { key: "destination", label: "Finding the destination" },
    { key: "weather", label: "Checking the weather" },
    { key: "places", label: "Finding places to visit" },
    { key: "draft", label: "Building the days" },
    { key: "validate", label: "Checking travel times and opening hours" },
    { key: "repair", label: "Fixing days that didn't fit" },
    { key: "budget", label: "Estimating costs" },
    { key: "proposal", label: "Preparing your plan" },
  ],
};
