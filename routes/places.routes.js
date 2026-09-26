import express from "express";

import { getPlaceDetails, getPlacePhoto, getStaticMap, searchPlaces } from "../controllers/places.controller.js";
import { protect } from "../middleware/auth.js";
import { withQuota } from "../middleware/quota.js";

const router = express.Router();

router.use(protect);

// Fixed paths first: `/:placeId` would otherwise swallow them.
router.get("/search", withQuota("placesSearch"), searchPlaces);
router.get("/static-map", withQuota("staticMap"), getStaticMap);
// A photo reference is itself a path (`places/{placeId}/photos/{photoId}`), hence the wildcard param.
router.get("/photo/:photoRef(*)", withQuota("placesPhoto"), getPlacePhoto);
router.get("/:placeId", withQuota("placesDetails"), getPlaceDetails);

export default router;
