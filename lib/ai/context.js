// lib/ai/context.js
//
// Plain, JSON-safe snapshots of a trip for AI steps. Job steps may be memoized and replayed, so
// they pass these snapshots around rather than Mongoose documents.

import Checklist from "../../models/checklist.model.js";
import Itinerary from "../../models/Itinerary.model.js";
import Trip from "../../models/trip.model.js";
import { dayId, tripDayIds } from "../itinerary.js";
import { resolveDestination } from "../places.js";
import { geocode, getDailyWeather } from "../weather.js";
import { plannerConfigured } from "./config.js";
import { JobFailure } from "./errors.js";

export async function loadTripSnapshot(tripId) {
  const trip = await Trip.findById(tripId).lean();
  if (!trip) throw new JobFailure("TRIP_NOT_FOUND", "This trip no longer exists.");

  const [days, checklist] = await Promise.all([
    Itinerary.find({ trip: trip._id }).sort({ date: 1 }).lean(),
    Checklist.findOne({ tripId: String(trip._id) }).lean(),
  ]);

  // Historical data can hold two documents for one calendar day; present them as one.
  const itineraryByDate = new Map();
  for (const day of days) {
    const date = dayId(day.date);
    const activities = day.sections.flatMap((section) =>
      section.activities.map((activity) => ({
        section: section.section,
        title: activity.title,
        time: activity.time ?? null,
        type: activity.type,
        location: activity.location ?? null,
        placeId: activity.place?.placeId ?? null,
        done: Boolean(activity.isDone),
      }))
    );
    itineraryByDate.set(date, [...(itineraryByDate.get(date) ?? []), ...activities]);
  }

  return {
    id: String(trip._id),
    name: trip.name,
    location: trip.location,
    description: trip.description ?? null,
    startDate: dayId(trip.startDate),
    endDate: dayId(trip.endDate),
    dayIds: tripDayIds(trip.startDate, trip.endDate),
    memberCount: trip.members.length,
    budget: {
      total: trip.budget?.total ?? 0,
      currency: trip.budget?.currency ?? "INR",
      categories: trip.budget?.categories ?? {},
    },
    place: trip.place ?? null,
    theme: trip.theme ?? null,
    itinerary: [...itineraryByDate.entries()].map(([date, activities]) => ({ date, activities })),
    checklist: (checklist?.categories ?? []).map((category) => ({
      name: category.name,
      items: category.items.map((item) => item.title),
    })),
  };
}

/** The trip context given to the chat assistant — compact, so long trips don't crowd the prompt. */
export function chatTripContext(trip) {
  return {
    name: trip.name,
    destination: trip.location,
    description: trip.description,
    dates: `${trip.startDate} to ${trip.endDate} (${trip.dayIds.length} days)`,
    travellers: trip.memberCount,
    budget: `${trip.budget.total} ${trip.budget.currency}`,
    itinerary: trip.itinerary.map((day) => ({
      date: day.date,
      plans: day.activities.map((a) => [a.time, a.title, a.type && `(${a.type})`].filter(Boolean).join(" ")),
    })),
    checklist: trip.checklist.map((category) => ({
      category: category.name,
      items: category.items.slice(0, 40),
    })),
  };
}

/**
 * Daily weather for a trip. Uses the trip's resolved place; otherwise resolves it with Google Maps
 * when configured (and saves it to the trip), and only as a last resort uses the strict free-text
 * geocoder — which returns nothing rather than a wrong match. `calls` counts weather API requests.
 */
export async function weatherForTrip(trip) {
  let location = trip.place && Number.isFinite(trip.place.lat) ? trip.place : null;
  let calls = 0;
  let placesCalls = 0;

  if (!location && plannerConfigured()) {
    placesCalls += 1;
    location = await resolveDestination(trip.location);
    if (location) {
      await Trip.updateOne({ _id: trip.id, place: { $exists: false } }, { $set: { place: location } });
    }
  }
  if (!location) {
    calls += 1;
    location = await geocode(trip.location);
  }
  if (!location) return { days: [], calls, placesCalls };

  const weather = await getDailyWeather({ lat: location.lat, lng: location.lng, dayIds: trip.dayIds });
  return { days: weather.days, calls: calls + weather.calls, placesCalls };
}
