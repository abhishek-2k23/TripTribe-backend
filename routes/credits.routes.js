import express from "express";

import { getCreditBalance, getCreditLedger } from "../controllers/credits.controller.js";
import { revenueCatWebhook } from "../controllers/purchases.controller.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.get("/balance", protect, getCreditBalance);
router.get("/ledger", protect, getCreditLedger);
// RevenueCat, not a user: authenticated by its shared Authorization header, not Clerk.
router.post("/grant", revenueCatWebhook);

export default router;
