import express from "express";

import { getCreditBalance, getCreditLedger } from "../controllers/credits.controller.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.get("/balance", protect, getCreditBalance);
router.get("/ledger", protect, getCreditLedger);

export default router;
