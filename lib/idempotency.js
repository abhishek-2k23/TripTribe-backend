// lib/idempotency.js
//
// Idempotent creates (ai-plan §5.3, design.md D-021).
//
// A request can succeed on the server while the response is lost on the way back — a tunnel, a
// backgrounded app, a timeout. The client can't tell that from a genuine failure, so its offline
// queue replays the write and the trip gets the expense twice. Inngest retrying an AI accept step
// does the same thing.
//
// So every create carries a `clientRef` generated when the user acted, not when the request was
// sent, and a repeat returns the document that already exists. The unique index is what actually
// enforces this: the lookup below is the common path, and the duplicate-key catch covers two
// replays arriving at once.

/**
 * @param Model      the mongoose model to create in
 * @param scope      the fields that make `clientRef` unique, usually `{ trip }` or `{ tripId }`
 * @param clientRef  the client's idempotency key; without one this is a plain create
 * @param data       the document to create
 * @returns `{ document, created }` — `created: false` means this was a replay
 */
export async function createIdempotent(Model, { scope, clientRef, data }) {
  if (!clientRef) return { document: await Model.create(data), created: true };

  const existing = await Model.findOne({ ...scope, clientRef });
  if (existing) return { document: existing, created: false };

  try {
    return { document: await Model.create({ ...data, clientRef }), created: true };
  } catch (error) {
    if (error?.code === 11000) {
      const raced = await Model.findOne({ ...scope, clientRef });
      if (raced) return { document: raced, created: false };
    }
    throw error;
  }
}

/** A client-supplied idempotency key, or undefined. Long or non-string values are ignored. */
export function readClientRef(input) {
  const value = input?.clientRef;
  return typeof value === "string" && value.trim() && value.length <= 200 ? value.trim() : undefined;
}
