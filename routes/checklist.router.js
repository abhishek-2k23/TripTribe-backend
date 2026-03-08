import express from "express";
import { bulkAddChecklistItems, getTripChecklist, toggleItem } from "../controllers/checklist.controller.js";
import { protect } from "../middleware/auth.js";
import { authorizeTripRole } from "../middleware/tripRole.middleware.js";
const checklistRouter = express.Router();

checklistRouter.post("/addItems/:tripId", protect, authorizeTripRole(["owner", "editor"]),  bulkAddChecklistItems);
checklistRouter.get("/fetchLists/:tripId", getTripChecklist)
checklistRouter.post(
  "/:tripId/checklist/:categoryId/items/:itemId", 
  protect, 
  toggleItem
);
export default checklistRouter;