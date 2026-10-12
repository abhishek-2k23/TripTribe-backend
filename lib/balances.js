// lib/balances.js
//
// What one user owes and is owed, across every trip they're in — for the Home dashboard's money
// strip and the Wallet (ai-plan §4, Phase 13).
//
// Same rules as GET /expenses/debts/:tripId: an unsettled split is a debt from its user to the
// expense's payer. Amounts are in the trip's budget currency, which is what every client shows —
// an expense's own `currency` field defaults to USD and has never been set by a client (route.md
// caution 3), so it can't be trusted.

import Expense from "../models/expense.model.js";

const DUST = 0.005;

/**
 * @param userId the Mongo user id
 * @param trips  the user's trips, lean, with `_id`, `name` and `budget.currency`
 * @returns `{ byTrip: Map<tripId, TripBalance>, totals: [{ currency, youAreOwed, youOwe }] }`
 */
export async function balancesFor(userId, trips) {
  const me = String(userId);
  const tripById = new Map(trips.map((trip) => [String(trip._id), trip]));

  const expenses = await Expense.find({
    trip: { $in: trips.map((trip) => trip._id) },
    $or: [{ paidBy: userId }, { "splitDetails.user": userId }],
    "splitDetails.isSettled": false,
  })
    .select("trip title paidBy splitDetails expenseDate")
    .populate("paidBy", "name imageUrl")
    .populate("splitDetails.user", "name imageUrl")
    .sort({ expenseDate: -1 })
    .lean();

  const byTrip = new Map();
  const entryFor = (tripId) => {
    if (!byTrip.has(tripId)) {
      const trip = tripById.get(tripId);
      byTrip.set(tripId, {
        tripId,
        currency: trip?.budget?.currency ?? "INR",
        youAreOwed: 0,
        youOwe: 0,
        debts: [],
      });
    }
    return byTrip.get(tripId);
  };

  for (const expense of expenses) {
    const payer = expense.paidBy;
    if (!payer?._id) continue;
    const payerId = String(payer._id);
    const entry = entryFor(String(expense.trip));

    for (const split of expense.splitDetails ?? []) {
      if (split.isSettled || !split.user?._id || split.share <= DUST) continue;
      const debtorId = String(split.user._id);
      if (debtorId === payerId) continue;

      if (payerId === me) {
        entry.youAreOwed += split.share;
        entry.debts.push({ direction: "owed", counterpart: split.user, amount: split.share, title: expense.title, expenseId: expense._id });
      } else if (debtorId === me) {
        entry.youOwe += split.share;
        entry.debts.push({ direction: "owe", counterpart: payer, amount: split.share, title: expense.title, expenseId: expense._id });
      }
    }
  }

  const totals = new Map();
  for (const entry of byTrip.values()) {
    const total = totals.get(entry.currency) ?? { currency: entry.currency, youAreOwed: 0, youOwe: 0 };
    total.youAreOwed += entry.youAreOwed;
    total.youOwe += entry.youOwe;
    totals.set(entry.currency, total);
  }

  return { byTrip, totals: [...totals.values()].sort((a, b) => b.youAreOwed + b.youOwe - (a.youAreOwed + a.youOwe)) };
}

/** First names of the people in a list of debts, most money first: "Rahul and 2 others". */
export function namesOf(debts) {
  const byPerson = new Map();
  for (const debt of debts) {
    const id = String(debt.counterpart._id);
    const current = byPerson.get(id) ?? { name: debt.counterpart.name ?? "A member", amount: 0 };
    current.amount += debt.amount;
    byPerson.set(id, current);
  }
  return [...byPerson.values()].sort((a, b) => b.amount - a.amount).map((person) => person.name.split(" ")[0]);
}
