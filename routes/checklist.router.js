import express from "express";
import { bulkAddChecklistItems, getTripChecklist, toggleItem } from "../controllers/checklist.controller.js";
import { protect } from "../middleware/auth.js";
import { requireTripMember } from "../middleware/membership.js";

const checklistRouter = express.Router();

// Every route is membership-gated (design.md D-012). `fetchLists` in particular had no `protect` at
// all, so any trip's checklist could be read without signing in.
checklistRouter.post(
  "/addItems/:tripId",
  protect,
  requireTripMember(["owner", "editor"]),
  bulkAddChecklistItems
);

checklistRouter.get("/fetchLists/:tripId", protect, requireTripMember(), getTripChecklist);

checklistRouter.post(
  "/:tripId/checklist/:categoryId/items/:itemId",
  protect,
  requireTripMember(),
  toggleItem
);

export default checklistRouter;
