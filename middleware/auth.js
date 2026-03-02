// middleware/authMiddleware.js

import { getAuth } from "@clerk/express";
import User from "../models/user.model.js";

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