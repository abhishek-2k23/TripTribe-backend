// lib/ai/errors.js

/** A job failure with a message safe to show the user. Never retried. */
export class JobFailure extends Error {
  constructor(code, message) {
    super(message);
    this.name = "JobFailure";
    this.code = code;
  }
}

/** The model declined the request and the server-side fallback didn't rescue it. */
export class AiRefusalError extends Error {
  constructor({ usage, category }) {
    super("The model declined this request.");
    this.name = "AiRefusalError";
    this.usage = usage ? [usage] : [];
    this.category = category ?? null;
  }
}

/** The model's response was cut off or didn't parse against the step's schema. */
export class AiOutputError extends Error {
  constructor(message, usage) {
    super(message);
    this.name = "AiOutputError";
    this.usage = usage ? [usage] : [];
  }
}
