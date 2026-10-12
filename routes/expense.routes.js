import express from "express";
import {
  addExpense,
  getTripDebts,
  settleDebt,
  getBudgetDashboard,
} from "../controllers/expense.controller.js";

import { protect } from "../middleware/auth.js";
import { requireTripMember } from "../middleware/membership.js";

const router = express.Router();

router.post("/add/:tripId", protect, requireTripMember(["owner", "editor"]), addExpense);

// Both spellings are in use by the web and mobile clients.
router.get("/debts/:tripId", protect, requireTripMember(), getTripDebts);
router.get("/trip/:tripId/debts", protect, requireTripMember(), getTripDebts);

// No tripId in the body — settle resolves the trip from the expense and checks that the caller is
// the person owed (design.md D-012).
router.post("/settle", protect, settleDebt);

router.get("/budgetDashBoard/:tripId", protect, requireTripMember(), getBudgetDashboard);

export default router;
