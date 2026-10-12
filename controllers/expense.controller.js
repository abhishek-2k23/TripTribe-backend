import mongoose from "mongoose";
import Expense from "../models/expense.model.js";
import { createIdempotent, readClientRef } from "../lib/idempotency.js";
import { bumpRevisionFor } from "../lib/revisions.js";


// Membership and role are checked by requireTripMember before each of these runs, so `req.trip` is
// the verified trip. The body's own trip id is ignored: pairing someone else's trip id with a trip
// you belong to must not write across the boundary.
export const addExpense = async (req, res, next) => {
  try {
    const {
      title,
      description,
      amount,
      category,
      splitType,
      participants = [],
      paidBy: payerId
    } = req.body;

    const recorder = req.user._id;
    const trip = req.trip;
    const tripId = trip._id;

    const payer = payerId || recorder;

    // Ensure payer is included in participants
    const uniqueParticipants = [...new Set([...participants, payer.toString()])];

    let splitDetails = [];

    // Split Equally
    if (splitType === "equally" && uniqueParticipants.length > 1) {

      const share = amount / uniqueParticipants.length;

      splitDetails = uniqueParticipants
        .filter(id => id.toString() !== payer.toString())
        .map(id => ({
          user: id,
          share
        }));
    }

    // Selected Split
    if (splitType === "selected" && uniqueParticipants.length > 1) {

      const share = amount / uniqueParticipants.length;

      splitDetails = uniqueParticipants
        .filter(id => id.toString() !== payer.toString())
        .map(id => ({
          user: id,
          share
        }));
    }

    // No Split → nobody owes anything
    if (splitType === "none") {
      splitDetails = [];
    }

    // A replayed offline write carrying the same clientRef returns the original (D-021).
    const { document: expense, created } = await createIdempotent(Expense, {
      scope: { trip: tripId },
      clientRef: readClientRef(req.body),
      data: {
        trip: tripId,
        title,
        description,
        amount,
        category,
        paidBy: payer,
        recordedBy: recorder,
        splitType,
        participants: uniqueParticipants,
        splitDetails
      }
    });

    const populatedExpense = await expense.populate([
  { path: "paidBy", select: "name imageUrl" },
  { path: "participants", select: "name imageUrl" }
]);

    if (created) {
      const io = req.app.get("socketio");
      io?.to(tripId.toString()).emit("expense_added", populatedExpense);
      // The budget dashboard reads the same expenses, so both sections moved.
      await bumpRevisionFor(req, tripId, "expenses");
      await bumpRevisionFor(req, tripId, "budget");
    }

    res.status(created ? 201 : 200).json({
      success: true,
      data: expense
    });

  } catch (error) {
    next(error);
  }
};

export const getTripDebts = async (req, res, next) => {
  try {
    const tripId = req.trip._id;
    const userId = req.user._id;

    const expenses = await Expense.find({ trip: tripId })
      .populate("paidBy", "name email imageUrl")
      .populate("splitDetails.user", "name email imageUrl");

    const balances = {};
    const users = {};
    const debts = [];

    expenses.forEach((expense) => {

      const payer = expense.paidBy;
      const payerId = payer._id.toString();

      users[payerId] = payer;

      expense.splitDetails.forEach((split) => {

        if (split.isSettled) return;

        const debtor = split.user;
        const debtorId = debtor._id.toString();

        users[debtorId] = debtor;

        const amount = split.share;

        if (!balances[debtorId]) balances[debtorId] = 0;
        if (!balances[payerId]) balances[payerId] = 0;

        balances[debtorId] -= amount;
        balances[payerId] += amount;

        debts.push({
          from: debtor,
          to: payer,
          amount,
          title: expense.title,
          recordedBy: expense.recordedBy,
          expenseId: expense._id
        });

      });

    });

    const travelerBalances = Object.entries(balances).map(([id, balance]) => ({
      user: users[id],
      balance
    }));

    const totalDebt = debts.reduce((acc, curr) => acc + curr.amount, 0);

    // `balances` is keyed by string id; `userId` is an ObjectId, so indexing with it directly always
    // missed and every caller saw zero (ai-plan §5.5).
    const yourBalance = balances[userId.toString()] || 0;

    const filtedDebts = debts.filter((d) => d.amount !== 0);
    res.status(200).json({
      success: true,
      data: {
        totalDebt,
        yourBalance,
        debts: filtedDebts,
        travelerBalances
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * Marking a debt paid is the creditor's call: they are the one who knows the money arrived. Before
 * this check any signed-in user could clear anyone's debt on any trip (design.md D-012).
 */
export const settleDebt = async (req, res, next) => {

  try {
    const { expenseId, userId } = req.body;

    if (!mongoose.isValidObjectId(expenseId)) {
      return res.status(400).json({ success: false, message: "Invalid expense id" });
    }

    const expense = await Expense.findById(expenseId);
    if (!expense) {
      return res.status(404).json({ success: false, message: "Expense not found" });
    }

    if (expense.paidBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Only the person who paid can mark this settled"
      });
    }

    const split = expense.splitDetails.find(
      s => s.user.toString() === userId
    );

    if (!split) {
      return res.status(404).json({
        message: "Split not found"
      });
    }

    split.isSettled = true;

    await expense.save();

    // Settling emits no socket event, so without this a member who was offline would keep showing
    // a debt that is already paid (design.md D-010).
    await bumpRevisionFor(req, expense.trip, "expenses");

    res.status(200).json({
      success: true,
      message: "Debt settled"
    });

  } catch (error) {
    next(error);
  }

};

export const getBudgetDashboard = async (req, res, next) => {
  try {
    const trip = req.trip;
    const tripId = trip._id;

    const stats = await Expense.aggregate([
      { $match: { trip: new mongoose.Types.ObjectId(tripId) } },
      {
        $group: {
          _id: "$category",
          spent: { $sum: "$amount" }
        }
      }
    ]);

    const categoryBreakdown = Object.keys(trip.budget.categories).map(cat => {
      const spentData = stats.find(s => s._id === cat);
      const spent = spentData ? spentData.spent : 0;
      const limit = trip.budget.categories[cat] || 0;
      
      return {
        category: cat,
        spent,
        limit,
        percentage: limit > 0 ? Math.min(100, (spent / limit) * 100) : 0
      };
    });

    const totalSpent = categoryBreakdown.reduce((acc, curr) => acc + curr.spent, 0);

    const recentExpenses = await Expense.find({ trip: tripId })
      .sort({ expenseDate: -1 })
      .limit(5)
      .populate("paidBy", "name imageUrl") 
      .populate("participants", "name imageUrl") 
      .populate({
        path: "splitDetails.user",
        select: "name imageUrl"
      });

    res.status(200).json({
      success: true,
      data: {
        totalBudget: trip.budget.total,
        totalSpent,
        remaining: Math.max(0, trip.budget.total - totalSpent),
        utilization: trip.budget.total > 0 ? (totalSpent / trip.budget.total) * 100 : 0,
        categories: categoryBreakdown,
        recentExpenses
      }
    });
  } catch (error) {
    next(error);
  }
};