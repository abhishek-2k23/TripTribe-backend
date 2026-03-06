import express from "express";
import { createTrip, getMyTrips, getSingleTrip, joinTrip, updateMemberRole, updateTrip } from "../controllers/trip.controller.js";
import { protect } from "../middleware/auth.js";
import { authorizeTripRole } from "../middleware/tripRole.middleware.js";

const router = express.Router();

router.post("/create", protect, createTrip);
router.post("/join", protect, joinTrip);
router.put(
  "/:tripId",
  protect,
  authorizeTripRole(["owner", "editor"]),
  updateTrip
);
router.patch(
  "/:tripId/role",
  protect,
  authorizeTripRole(["owner"]),
  updateMemberRole
);

//get my trips 
router.get("/my-trips", protect, getMyTrips);
router.get("/:tripId", protect, getSingleTrip);
export default router;