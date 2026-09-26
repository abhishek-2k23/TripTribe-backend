// lib/home.js
//
// The Home dashboard in one response (ai-plan §4): greeting, the next trip with its weather, money
// across trips, recent activity in the user's trips, featured templates and a suggestion. Six
// round-trips would be a slow empty screen and six hits on the rate limit; this is one, cached for
// a minute per user by the controller.

import Itinerary from "../models/Itinerary.model.js";
import Expense from "../models/expense.model.js";
import Message from "../models/message.model.js";
import PlanTemplate from "../models/planTemplate.model.js";
import Trip from "../models/trip.model.js";
import { balancesFor, namesOf } from "./balances.js";
import { getBalance } from "./credits.js";
import { dayId, tripDayIds } from "./itinerary.js";
import { geocode, getDailyWeather } from "./weather.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEATHER_DAYS = 5;
const RECENT_LIMIT = 5;

const TEMPLATE_FIELDS = "slug title summary destination.name destination.region days nights theme heroImage budgetBand estCostPerPerson bestMonths tags featured";

/** A trip as the dashboard shows it. */
function compactTrip(trip, today) {
  const start = dayId(trip.startDate);
  const end = dayId(trip.endDate);
  return {
    _id: trip._id,
    name: trip.name,
    location: trip.location,
    image: trip.image?.url ? trip.image : undefined,
    theme: trip.theme ?? null,
    place: trip.place ?? null,
    startDate: trip.startDate,
    endDate: trip.endDate,
    memberCount: trip.members.length,
    currency: trip.budget?.currency ?? "INR",
    status: start <= today ? "ongoing" : "upcoming",
    daysUntil: Math.max(0, Math.round((Date.parse(`${start}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS)),
    totalDays: tripDayIds(start, end).length,
  };
}

/**
 * Weather for the next few days of the trip — from today if it's under way. Uses the trip's
 * resolved place, or the strict geocoder (D-061); never spends a Places call on a dashboard load.
 */
async function tripWeather(trip, today) {
  try {
    const location =
      trip.place && Number.isFinite(trip.place.lat)
        ? { name: trip.place.name, lat: trip.place.lat, lng: trip.place.lng }
        : await geocode(trip.location);
    if (!location) return null;

    const from = dayId(trip.startDate) > today ? dayId(trip.startDate) : today;
    const dayIds = tripDayIds(from, trip.endDate).slice(0, WEATHER_DAYS);
    if (!dayIds.length) return null;

    const { days } = await getDailyWeather({ lat: location.lat, lng: location.lng, dayIds });
    const usable = days.filter((day) => day.source !== "unavailable");
    return usable.length ? { location: location.name ?? trip.location, days: usable } : null;
  } catch (error) {
    console.warn(`[home] weather unavailable for trip ${trip._id}:`, error.message);
    return null;
  }
}

/** Planned days and activity counts for one trip. */
async function planProgress(trip) {
  const days = await Itinerary.find({ trip: trip._id }).select("date sections.activities.isDone").lean();
  const dayIds = new Set();
  let activities = 0;
  let done = 0;
  for (const day of days) {
    const count = day.sections.reduce((sum, section) => sum + section.activities.length, 0);
    if (count) dayIds.add(dayId(day.date));
    activities += count;
    done += day.sections.reduce((sum, section) => sum + section.activities.filter((a) => a.isDone).length, 0);
  }
  return { plannedDays: dayIds.size, activityCount: activities, doneCount: done };
}

/**
 * The newest things that happened in the user's trips: expenses, new activities, messages and
 * people joining. Activities carry no author in the schema, so they're reported without one.
 */
async function recentActivity(trips, userId) {
  const tripIds = trips.map((trip) => trip._id);
  const nameOf = new Map(trips.map((trip) => [String(trip._id), trip.name]));
  const me = String(userId);
  const actor = (user) =>
    user?._id ? { _id: user._id, name: String(user._id) === me ? "You" : user.name, imageUrl: user.imageUrl } : null;

  const [expenses, messages, activities] = await Promise.all([
    Expense.find({ trip: { $in: tripIds } })
      .sort({ createdAt: -1 })
      .limit(RECENT_LIMIT)
      .select("trip title paidBy createdAt")
      .populate("paidBy", "name imageUrl")
      .lean(),
    Message.find({ trip: { $in: tripIds } })
      .sort({ createdAt: -1 })
      .limit(RECENT_LIMIT)
      .select("trip text sender createdAt")
      .populate("sender", "name imageUrl")
      .lean(),
    Itinerary.aggregate([
      { $match: { trip: { $in: tripIds } } },
      { $unwind: "$sections" },
      { $unwind: "$sections.activities" },
      { $sort: { "sections.activities.createdAt": -1 } },
      { $limit: RECENT_LIMIT },
      {
        $project: {
          trip: 1,
          title: "$sections.activities.title",
          source: "$sections.activities.source",
          createdAt: "$sections.activities.createdAt",
        },
      },
    ]),
  ]);

  const joins = trips
    .flatMap((trip) =>
      trip.members
        .filter((member) => member.role !== "owner" && member.joinedAt)
        .map((member) => ({ trip: trip._id, user: member.user, at: member.joinedAt }))
    )
    .sort((a, b) => b.at - a.at)
    .slice(0, RECENT_LIMIT);

  const items = [
    ...expenses.map((e) => ({
      kind: "expense",
      actor: actor(e.paidBy),
      text: `paid for ${e.title}`,
      tripId: e.trip,
      at: e.createdAt,
    })),
    ...messages.map((m) => ({
      kind: "message",
      actor: actor(m.sender),
      text: m.text.length > 80 ? `${m.text.slice(0, 77)}…` : m.text,
      tripId: m.trip,
      at: m.createdAt,
    })),
    ...activities.map((a) => ({
      kind: "activity",
      actor: null,
      text: `${a.title} was added${a.source === "ai" ? " from an AI plan" : ""}`,
      tripId: a.trip,
      at: a.createdAt,
    })),
    ...joins.map((j) => ({
      kind: "member",
      actor: actor(j.user),
      text: "joined the trip",
      tripId: j.trip,
      at: j.at,
    })),
  ];

  return items
    .filter((item) => item.at)
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, RECENT_LIMIT)
    .map((item) => ({ ...item, tripName: nameOf.get(String(item.tripId)) ?? null }));
}

/** A template that's in season, or a nudge to plan with AI when none is. */
function suggestionFrom(templates, month) {
  const inSeason = templates.find((t) => t.bestMonths?.includes(month));
  if (inSeason) {
    return {
      kind: "seasonal",
      text: `${inSeason.destination.name} is at its best this month. ${inSeason.days} days, planned already.`,
      templateSlug: inSeason.slug,
    };
  }
  return { kind: "plan", text: "Tell me your dates and I'll build the whole plan.", templateSlug: null };
}

export async function buildHome(user) {
  const today = dayId(new Date());
  const month = new Date().getUTCMonth() + 1;

  const trips = await Trip.find({ "members.user": user._id })
    .select("name location image theme place startDate endDate members budget.currency")
    .populate("members.user", "name imageUrl")
    .lean();

  const current = trips
    .filter((trip) => dayId(trip.endDate) >= today)
    .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

  const [next, ...others] = current;
  const [nextWeather, nextProgress, balances, recent, credits, templates] = await Promise.all([
    next ? tripWeather(next, today) : null,
    next ? planProgress(next) : null,
    balancesFor(user._id, trips),
    recentActivity(trips, user._id),
    getBalance(user._id),
    PlanTemplate.find({ published: true })
      .sort({ featured: -1, usageCount: -1 })
      .limit(12)
      .select(TEMPLATE_FIELDS)
      .lean(),
  ]);

  // Headline money in the currency with the most at stake; any others are listed beside it.
  const [headline, ...otherCurrencies] = balances.totals;
  const allDebts = [...balances.byTrip.values()].flatMap((entry) =>
    entry.currency === headline?.currency ? entry.debts : []
  );

  // Featured and in season first, so the carousel opens on something worth doing now.
  const featured = [...templates]
    .sort((a, b) => Number(b.bestMonths?.includes(month)) - Number(a.bestMonths?.includes(month)))
    .slice(0, 6);

  return {
    user: { _id: user._id, name: user.name, imageUrl: user.imageUrl, creditBalance: credits.total },
    nextTrip: next ? { ...compactTrip(next, today), ...nextProgress, weather: nextWeather } : null,
    activeTrips: others.slice(0, 3).map((trip) => compactTrip(trip, today)),
    tripCount: trips.length,
    balances: {
      currency: headline?.currency ?? next?.budget?.currency ?? "INR",
      youAreOwed: headline?.youAreOwed ?? 0,
      youOwe: headline?.youOwe ?? 0,
      owedBy: namesOf(allDebts.filter((d) => d.direction === "owed")),
      oweTo: namesOf(allDebts.filter((d) => d.direction === "owe")),
      otherCurrencies,
    },
    recentActivity: recent,
    featuredTemplates: featured,
    suggestion: suggestionFrom(featured, month),
  };
}
