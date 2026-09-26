// controllers/home.controller.js
//
// The two cross-trip screens: Home (GET /api/home) and Wallet (GET /api/wallet). Both aggregate
// across every trip the user belongs to, which is why they're single endpoints rather than a
// fan-out of per-trip calls from the client (ai-plan §4, Phase 13).

import Expense from "../models/expense.model.js";
import Trip from "../models/trip.model.js";
import { balancesFor } from "../lib/balances.js";
import { getBalance } from "../lib/credits.js";
import { buildHome } from "../lib/home.js";
import { dayId } from "../lib/itinerary.js";
import { createTtlCache } from "../lib/ttlCache.js";

// Per user, a minute: the dashboard is opened far more often than anything on it changes, and a
// fresh write shows up there within the minute either way. `?fresh=1` (pull to refresh) skips it.
const homeCache = createTtlCache({ ttlMs: 60 * 1000, maxEntries: 2000 });

// GET /api/home
export const getHome = async (req, res, next) => {
  try {
    const key = String(req.user._id);
    let data = req.query.fresh ? undefined : homeCache.get(key);
    if (!data) {
      data = await buildHome(req.user);
      homeCache.set(key, data);
    }
    res.set("Cache-Control", "private, max-age=60");
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

// GET /api/wallet
export const getWallet = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const trips = await Trip.find({ "members.user": userId })
      .select("name location image theme startDate endDate budget members.user members.role")
      .sort({ startDate: -1 })
      .lean();

    const [balances, spentRows, credits] = await Promise.all([
      balancesFor(userId, trips),
      Expense.aggregate([
        { $match: { trip: { $in: trips.map((trip) => trip._id) } } },
        { $group: { _id: "$trip", spent: { $sum: "$amount" } } },
      ]),
      getBalance(userId),
    ]);
    const spentByTrip = new Map(spentRows.map((row) => [String(row._id), row.spent]));
    const today = dayId(new Date());

    const tripEntries = trips.map((trip) => {
      const id = String(trip._id);
      const balance = balances.byTrip.get(id);
      const total = trip.budget?.total ?? 0;
      const spent = spentByTrip.get(id) ?? 0;
      const role = trip.members.find((m) => String(m.user) === String(userId))?.role ?? "viewer";
      return {
        trip: {
          _id: trip._id,
          name: trip.name,
          location: trip.location,
          image: trip.image?.url ? trip.image : undefined,
          theme: trip.theme ?? null,
          startDate: trip.startDate,
          endDate: trip.endDate,
          status: dayId(trip.endDate) < today ? "past" : dayId(trip.startDate) <= today ? "ongoing" : "upcoming",
          role,
        },
        currency: trip.budget?.currency ?? "INR",
        youAreOwed: balance?.youAreOwed ?? 0,
        youOwe: balance?.youOwe ?? 0,
        debts: balance?.debts ?? [],
        budget: {
          total,
          spent,
          remaining: Math.max(0, total - spent),
          utilization: total > 0 ? (spent / total) * 100 : 0,
        },
      };
    });

    res.json({
      success: true,
      data: {
        totals: balances.totals,
        trips: tripEntries,
        credits,
      },
    });
  } catch (error) {
    next(error);
  }
};
