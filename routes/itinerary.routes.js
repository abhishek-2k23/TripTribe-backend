import express from "express";
import {
  addActivity,
  toggleActivityStatus,
  addActivityComment,
  deleteActivity,
  getTripItinerary,
} from "../controllers/Itinerary.controller.js";
import { protect } from "../middleware/auth.js";
import { requireTripMember } from "../middleware/membership.js";

const itinerary = express.Router();

itinerary.use(protect);

// Every route checks trip membership (ai-plan §5.1). Routes that name an itinerary day resolve the
// trip from that day, so a client-supplied tripId can't point at a different trip.
itinerary.post("/addActivity", requireTripMember(), addActivity);

itinerary.get("/getTripItinerary/:tripId", requireTripMember(), getTripItinerary);

itinerary.post("/activity/status", requireTripMember(), toggleActivityStatus);

itinerary.post("/activity/comment", requireTripMember(), addActivityComment);

itinerary.delete("/activity/:itineraryId/:activityId/:tripId", requireTripMember(), deleteActivity);

export default itinerary;
