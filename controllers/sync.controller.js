// controllers/sync.controller.js
//
// The reconnect / foreground catch-up read (design.md D-010). Membership is checked by
// requireTripMember; the counters themselves come from lib/revisions.js.

import { readRevisions } from "../lib/revisions.js";

// GET /api/sync/:tripId/rev
export const getTripRevisions = async (req, res, next) => {
  try {
    const tripId = String(req.trip._id);
    res.set("Cache-Control", "no-store");
    res.json({ success: true, data: { tripId, sections: await readRevisions(tripId) } });
  } catch (error) {
    next(error);
  }
};
