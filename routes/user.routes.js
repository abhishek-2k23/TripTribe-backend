// routes/userRoutes.js

import express from "express";
import {
  syncUser,
  getMe,
  updateProfile
} from "../controllers/user.controller.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

// Sync user after login (can also use Clerk webhook)
router.post("/sync", syncUser);

// Protected routes
router.get("/me", protect, getMe);
router.put("/update", protect, updateProfile);

export default router;