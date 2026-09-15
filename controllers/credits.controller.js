// controllers/credits.controller.js

import CreditLedger from "../models/creditLedger.model.js";
import { getBalance } from "../lib/credits.js";

// GET /api/credits/balance — also writes this month's free grant if it hasn't been written yet.
export const getCreditBalance = async (req, res, next) => {
  try {
    res.json({ success: true, data: await getBalance(req.user._id) });
  } catch (error) {
    next(error);
  }
};

// GET /api/credits/ledger — newest first.
export const getCreditLedger = async (req, res, next) => {
  try {
    const entries = await CreditLedger.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(100)
      .select("bucket delta reason job note createdAt")
      .lean();
    res.json({ success: true, count: entries.length, data: entries });
  } catch (error) {
    next(error);
  }
};
