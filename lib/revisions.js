// lib/revisions.js
//
// Bumping a trip's section counters (design.md D-010).
//
// Every write that changes something a client can see calls `bumpRevision`. That does three things
// in one place: increments the counter the sync endpoint reports, emits the single generic
// `trip_changed` socket event that replaces one handler per write, and queues a push for members
// whose app is backgrounded.
//
// A failure here must never fail the request that caused it. The write has already happened; a
// missed bump costs a client one stale section until its next catch-up, which is strictly better
// than a 500 on a save that actually succeeded.

import TripRevision, { TRIP_SECTIONS } from "../models/tripRevision.model.js";
import { notifyTripChanged } from "./push.js";

export { TRIP_SECTIONS };

/**
 * @param tripId   the trip that changed
 * @param section  one of TRIP_SECTIONS
 * @param io       socket.io server, when the caller has one
 * @param actorId  who made the change; they are not notified about it
 */
export async function bumpRevision(tripId, section, { io, actorId } = {}) {
  if (!TRIP_SECTIONS.includes(section)) {
    throw new Error(`Unknown trip section "${section}"`);
  }

  try {
    const updated = await TripRevision.findOneAndUpdate(
      { trip: tripId },
      { $inc: { [`sections.${section}`]: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    const rev = updated?.sections?.[section] ?? 0;

    io?.to(String(tripId)).emit("trip_changed", { tripId: String(tripId), section, rev });
    notifyTripChanged(tripId, { section, actorId });

    return rev;
  } catch (error) {
    console.error(`[sync] couldn't bump ${section} on trip ${tripId}:`, error?.message ?? error);
    return null;
  }
}

/** The same call from inside a request handler, which already knows the socket server and actor. */
export function bumpRevisionFor(req, tripId, section) {
  return bumpRevision(tripId, section, {
    io: req.app.get("socketio"),
    actorId: req.user?._id,
  });
}

/** Every counter for a trip, with zeros for sections that have never changed. */
export async function readRevisions(tripId) {
  const doc = await TripRevision.findOne({ trip: tripId }).lean();
  return TRIP_SECTIONS.reduce(
    (sections, section) => ({ ...sections, [section]: doc?.sections?.[section] ?? 0 }),
    {}
  );
}
