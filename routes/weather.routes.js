import express from "express";

import { getWeather } from "../controllers/weather.controller.js";
import { protect } from "../middleware/auth.js";
import { withQuota } from "../middleware/quota.js";

const router = express.Router();

// Membership is checked in the handler when the request names a trip; plain coordinates need none.
router.get("/", protect, withQuota("weather"), getWeather);

export default router;
