import express from "express";
import {
  addActivity,
  toggleActivityStatus,
  addActivityComment,
  deleteActivity,
  getTripItinerary,
} from "../controllers/Itinerary.controller.js";
import { protect } from "../middleware/auth.js";

const itinerary = express.Router();

itinerary.use(protect);

itinerary.post("/addActivity", addActivity);

itinerary.get("/getTripItinerary/:tripId", protect, getTripItinerary);

itinerary.post("/activity/status", toggleActivityStatus);

itinerary.post("/activity/comment", addActivityComment);

itinerary.delete("/activity/:itineraryId/:activityId/:tripId", deleteActivity);

export default itinerary;