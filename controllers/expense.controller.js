import mongoose from "mongoose";
import Expense from "../models/expense.model.js";
import Trip from "../models/trip.model.js";


export const addExpense = async (req, res, next) => {
  try {
    const {
      selectedTripId: tripId,
      title,
      description,
      amount,
      category,
      splitType,
      participants = [],
      paidBy: payerId
    } = req.body;

    const recorder = req.user._id;

    const trip = await Trip.findById(tripId);

    if (!trip) {
      return res.status(404).json({
        success: false,
        message: "Trip not found"
      });
    }

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

    const expense = await Expense.create({
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
    });

    res.status(201).json({
      success: true,
      data: expense
    });

  } catch (error) {
    next(error);
  }
};

export const getTripBudgetSummary = async (req, res, next) => {
  try {
    const { tripId } = req.params;
    const userId = req.user._id;

    const trip = await Trip.findOne({
      _id: tripId,
      "members.user": userId,
    });

    if (!trip) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const stats = await Expense.aggregate([
      {
        $match: {
          trip: new mongoose.Types.ObjectId(tripId),
        },
      },
      {
        $group: {
          _id: "$category",
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]);

    const totalSpent = stats.reduce(
      (acc, curr) => acc + curr.totalAmount,
      0
    );

    const recentExpenses = await Expense.find({ trip: tripId })
      .populate("paidBy", "name email imageUrl")
      .sort({ expenseDate: -1 })
      .limit(5);

    res.status(200).json({
      success: true,
      data: {
        totalSpent,
        categoryBreakdown: stats,
        recentExpenses,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const settleExpense = async (req, res, next) => {
  try {
    const { expenseId, userId } = req.body;

    const expense = await Expense.findById(expenseId);

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: "Expense not found",
      });
    }

    const split = expense.splitDetails.find(
      (s) => s.user.toString() === userId
    );

    if (!split) {
      return res.status(404).json({
        success: false,
        message: "Split not found",
      });
    }

    split.isSettled = true;

    await expense.save();

    res.status(200).json({
      success: true,
      message: "Payment settled",
    });
  } catch (error) {
    next(error);
  }
};

export const getTripDebts = async (req, res, next) => {
  try {
    const { tripId } = req.params;
    const userId = req.user._id;

    const trip = await Trip.findOne({
      _id: tripId,
      "members.user": userId
    });

    if (!trip) {
      return res.status(403).json({
        success: false,
        message: "Access denied"
      });
    }

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
          title: expense.title
        });

      });

    });

    const travelerBalances = Object.entries(balances).map(([id, balance]) => ({
      user: users[id],
      balance
    }));

    const totalDebt = debts.reduce((acc, curr) => acc + curr.amount, 0);

    const yourBalance = balances[userId] || 0;

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

export const settleDebt = async (req, res, next) => {

  try {
    const { expenseId, userId } = req.body;

    const expense = await Expense.findById(expenseId);

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

    res.status(200).json({
      success: true,
      message: "Debt settled"
    });

  } catch (error) {
    next(error);
  }

};