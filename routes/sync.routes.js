import express from "express";

import { getTripRevisions } from "../controllers/sync.controller.js";
import { protect } from "../middleware/auth.js";
import { requireTripMember } from "../middleware/membership.js";

const syncRouter = express.Router();

// Its own rate-limit bucket (index.js): this runs on every reconnect and every foreground, which
// is exactly the burst the general limiter is there to stop.
syncRouter.get("/:tripId/rev", protect, requireTripMember(), getTripRevisions);

export default syncRouter;
