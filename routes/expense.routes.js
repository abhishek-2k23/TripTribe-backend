import express from "express";
import {
  addExpense,
  getTripDebts,
  settleDebt,
  getBudgetDashboard,
} from "../controllers/expense.controller.js";

import {protect} from "../middleware/auth.js";
import { authorizeTripRole } from "../middleware/tripRole.middleware.js";

const router = express.Router();

router.post("/add/:tripId", protect, authorizeTripRole(["owner", "editor"]), addExpense);


router.get("/debts/:tripId", protect, getTripDebts);

router.get("/trip/:tripId/debts", protect, getTripDebts);

router.post("/settle", protect, settleDebt);

router.get("/budgetDashBoard/:tripId", protect, getBudgetDashboard);

export default router;