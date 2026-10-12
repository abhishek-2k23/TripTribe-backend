// middleware/auth.js

import { getAuth } from "@clerk/express";
import User from "../models/user.model.js";

/**
 * A valid Clerk session, without requiring a Mongo user.
 *
 * `POST /users/sync` is what *creates* the Mongo user, so it can't use `protect` — that would 404
 * every first sign-in. It still must not be open to anonymous callers, so it gets this instead
 * (ai-plan §10, Phase 10).
 */
export const requireSignedIn = (req, res, next) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
    req.clerkUserId = userId;
    next();
  } catch (error) {
    next(error);
  }
};

export const protect = async (req, res, next) => {
  try {
    const { userId } = getAuth(req);

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await User.findOne({ clerkId: userId });

    if (!user) {
      return res.status(404).json({ message: "User not found in DB" });
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};
