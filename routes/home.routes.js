import express from "express";

import { getHome, getWallet } from "../controllers/home.controller.js";
import { protect } from "../middleware/auth.js";

// Mounted at /api, so these are GET /api/home and GET /api/wallet.
const router = express.Router();

router.get("/home", protect, getHome);
router.get("/wallet", protect, getWallet);

export default router;
