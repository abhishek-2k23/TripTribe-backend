// middleware/membership.js
//
// Trip membership checks (ai-plan §5.1, design.md D-012). Resolves the trip a request is about,
// confirms the signed-in user is a member (optionally with one of `roles`), and exposes
// `req.trip` and `req.tripRole` to the handler.
//
// When a request names an itinerary day, the trip is read from that day rather than from a
// client-supplied `tripId`, so a caller can't pair someone else's day with a trip they belong to.

import mongoose from "mongoose";
import Trip from "../models/trip.model.js";
import Itinerary from "../models/Itinerary.model.js";

async function resolveTripId(req) {
  const itineraryId = req.params.itineraryId || req.body?.itineraryId;
  if (itineraryId) {
    if (!mongoose.isValidObjectId(itineraryId)) return { error: [400, "Invalid itinerary id"] };
    const day = await Itinerary.findById(itineraryId).select("trip").lean();
    if (!day) return { error: [404, "Itinerary day not found"] };
    return { tripId: String(day.trip) };
  }

  const tripId = req.params.tripId || req.body?.tripId || req.query?.tripId;
  if (!tripId) return { error: [400, "tripId is required"] };
  if (!mongoose.isValidObjectId(tripId)) return { error: [400, "Invalid trip id"] };
  return { tripId: String(tripId) };
}

export const requireTripMember = (roles) => async (req, res, next) => {
  try {
    const { tripId, error } = await resolveTripId(req);
    if (error) return res.status(error[0]).json({ success: false, message: error[1] });

    const trip = await Trip.findById(tripId);
    if (!trip) return res.status(404).json({ success: false, message: "Trip not found" });

    const member = trip.members.find((m) => m.user.toString() === req.user._id.toString());
    if (!member) {
      return res.status(403).json({ success: false, message: "You are not part of this trip" });
    }
    if (roles && !roles.includes(member.role)) {
      return res.status(403).json({ success: false, message: "You do not have permission" });
    }

    req.trip = trip;
    req.tripRole = member.role;
    next();
  } catch (error) {
    next(error);
  }
};

/** For handlers that load a trip themselves (AI routes): the member entry, or undefined. */
export function findMember(trip, userId) {
  return trip?.members?.find((m) => m.user.toString() === userId.toString());
}
