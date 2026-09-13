// routes/userRoutes.js

import express from "express";
import {
  syncUser,
  getMe,
  updateProfile
} from "../controllers/user.controller.js";
import { deleteMyAccount, exportMyData } from "../controllers/account.controller.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

// Sync user after login (can also use Clerk webhook)
router.post("/sync", syncUser);

// Protected routes
router.get("/me", protect, getMe);
router.put("/update", protect, updateProfile);

// Account deletion and data export (store compliance)
router.delete("/me", protect, deleteMyAccount);
router.get("/me/export", protect, exportMyData);

export default router;