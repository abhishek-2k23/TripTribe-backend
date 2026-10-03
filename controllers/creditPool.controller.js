// controllers/creditPool.controller.js
//
// Trip credit pools (ai-plan §8.3): the owner puts purchased credits into a trip, and every owner
// and editor's AI work on that trip spends from it first. Membership is checked by
// requireTripMember; moving credits is owner-only (routes/trip.routes.js).

import { CreditRequestError, allocateToPool, poolSummary, withdrawFromPool } from "../lib/credits.js";
import { bumpRevisionFor } from "../lib/revisions.js";

const MAX_TRANSFER = 100_000;

// GET /api/trips/:tripId/credit-pool
export const getCreditPool = async (req, res, next) => {
  try {
    const summary = await poolSummary(req.trip._id);
    res.json({
      success: true,
      data: { ...summary, canSpend: ["owner", "editor"].includes(req.tripRole), canManage: req.tripRole === "owner" },
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/trips/:tripId/credit-pool   { action: "allocate" | "withdraw", amount, requestId }
export const moveCreditPool = async (req, res, next) => {
  try {
    const { action, amount, requestId } = req.body ?? {};
    if (!["allocate", "withdraw"].includes(action)) {
      return res.status(400).json({ success: false, message: "action must be allocate or withdraw" });
    }
    if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_TRANSFER) {
      return res.status(400).json({ success: false, message: "amount must be a whole number of credits" });
    }
    if (typeof requestId !== "string" || !requestId.trim() || requestId.length > 100) {
      return res.status(400).json({ success: false, message: "requestId is required, so a retry can't move credits twice" });
    }

    const args = { userId: req.user._id, tripId: req.trip._id, amount, requestId: requestId.trim() };
    const balance = action === "allocate" ? await allocateToPool(args) : await withdrawFromPool(args);
    await bumpRevisionFor(req, req.trip._id, "budget");

    res.json({ success: true, data: { balance } });
  } catch (error) {
    if (error instanceof CreditRequestError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};
