import express from "express";
import { createTrip, getMyTrips, getSingleTrip, joinTrip, updateMemberRole, updateTrip, updateTripBudget } from "../controllers/trip.controller.js";
import { protect } from "../middleware/auth.js";
import { requireTripMember } from "../middleware/membership.js";

const router = express.Router();

router.post("/create", protect, createTrip);
router.post("/join", protect, joinTrip);

// requireTripMember replaces the old authorizeTripRole: same roles, but it also rejects a malformed
// trip id with a 400 instead of throwing, and it is the single membership check used everywhere.
router.put(
  "/:tripId",
  protect,
  requireTripMember(["owner", "editor"]),
  updateTrip
);
router.patch(
  "/:tripId/role",
  protect,
  requireTripMember(["owner"]),
  updateMemberRole
);

router.patch("/:tripId/budget", protect,
  requireTripMember(["owner", "editor"]), updateTripBudget);

//get my trips 
router.get("/my-trips", protect, getMyTrips);
router.get("/:tripId", protect, requireTripMember(), getSingleTrip);
export default router;
