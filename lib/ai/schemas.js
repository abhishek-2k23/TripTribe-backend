// lib/ai/schemas.js
//
// JSON schemas for structured outputs. Structured outputs require every object to set
// `additionalProperties: false` and list all properties as required, and don't support string
// length limits or recursion — so ranges, lengths and cross-field rules are enforced in code
// (lib/ai/validate.js and the handlers), not here. Versioned together with prompts.js.

const string = { type: "string" };
const stringArray = { type: "array", items: string };
const nullable = (schema) => ({ anyOf: [schema, { type: "null" }] });

const object = (properties) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});

export const ACTIVITY_TYPES = ["Flight", "Hotel", "Food", "Sightseeing", "Activity", "Shopping", "Transport", "Other"];
export const EXPENSE_CATEGORIES = ["Food", "Transport", "Activities", "Shopping", "Hotel", "Other"];
export const SECTIONS = ["Morning", "Afternoon", "Evening", "Night"];

export const INTENT_SCHEMA = object({
  pace: { type: "string", enum: ["relaxed", "balanced", "packed"] },
  interests: stringArray,
  mustSee: stringArray,
  budgetBand: nullable({ type: "string", enum: ["budget", "moderate", "premium"] }),
  avoid: stringArray,
  notes: nullable(string),
});

const ACTIVITY_SCHEMA = object({
  placeId: string,
  title: string,
  section: { type: "string", enum: SECTIONS },
  time: { type: "string", description: "Start time, 24-hour HH:MM" },
  type: { type: "string", enum: ACTIVITY_TYPES },
  estCostPerPerson: { type: "number", description: "Per person, in the trip currency" },
  durationMin: { type: "integer" },
  notes: string,
});

export const DAY_SCHEMA = object({
  date: { type: "string", description: "YYYY-MM-DD" },
  title: string,
  activities: { type: "array", items: ACTIVITY_SCHEMA },
});

export const DRAFT_SCHEMA = object({
  summary: string,
  days: { type: "array", items: DAY_SCHEMA },
  gaps: stringArray,
});

export const REPAIR_SCHEMA = DAY_SCHEMA;

export const CHAT_SCHEMA = object({
  reply: string,
  suggestions: stringArray,
});

export const PACKING_SCHEMA = object({
  categories: {
    type: "array",
    items: object({
      name: string,
      items: {
        type: "array",
        items: object({ title: string, reason: string }),
      },
    }),
  },
});

export const RECEIPT_SCHEMA = object({
  merchant: nullable(string),
  date: nullable(string),
  currency: nullable(string),
  total: nullable({ type: "number" }),
  subtotal: nullable({ type: "number" }),
  tax: nullable({ type: "number" }),
  lineItems: {
    type: "array",
    items: object({ description: string, amount: nullable({ type: "number" }) }),
  },
  suggestedTitle: string,
  suggestedCategory: { type: "string", enum: EXPENSE_CATEGORIES },
  unreadable: stringArray,
});
