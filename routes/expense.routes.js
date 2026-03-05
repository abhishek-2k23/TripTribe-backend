import express from "express";
import {
  addExpense,
  getTripBudgetSummary,
  getTripDebts,
  settleExpense,
  settleDebt,
} from "../controllers/expense.controller.js";

import {protect} from "../middleware/auth.js";

const router = express.Router();

router.post("/add", protect, addExpense);

router.get("/summary/:tripId", protect, getTripBudgetSummary);

router.get("/debts/:tripId", protect, getTripDebts);

router.post("/settle", protect, settleExpense);

router.get("/trip/:tripId/debts", protect, getTripDebts);

router.post("/settle", protect, settleDebt);

export default router;