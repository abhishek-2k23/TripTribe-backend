// lib/tripPlace.js
//
// Resolving a trip's structured destination and archetype (ai-plan §3.1).
//
// Existing trips carry only free-text `location`, and the web keeps writing only that. Rather than
// migrate, `place` is backfilled lazily, the first time a trip is opened after this shipped, and
// `theme` is derived at the same moment from the place, the travel months and the typical climate.
// A location Google can't match is retried at most once a week, so an unresolvable trip doesn't
// spend a Places call on every open.

import Trip from "../models/trip.model.js";
import { tripDayIds } from "./itinerary.js";
import { destinationSnapshot, getPlace, mapsConfigured, resolveDestination } from "./places.js";
import { bumpRevision } from "./revisions.js";
import { deriveDestinationTheme } from "./theme.js";
import { getDailyWeather } from "./weather.js";

const RETRY_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
// Climate for the theme only needs the flavour of the trip, not every day of a long one.
const CLIMATE_DAYS = 14;

const inFlight = new Map();

/** The trip's typical weather and elevation, or null when Open-Meteo is unreachable. */
async function climateFor(place, trip) {
  try {
    const dayIds = tripDayIds(trip.startDate, trip.endDate).slice(0, CLIMATE_DAYS);
    return await getDailyWeather({ lat: place.lat, lng: place.lng, dayIds });
  } catch (error) {
    console.warn(`[trip-place] climate unavailable for ${trip._id}:`, error.message);
    return null;
  }
}

export async function themeForPlace(place, trip) {
  const climate = await climateFor(place, trip);
  return deriveDestinationTheme({ place, startDate: trip.startDate, endDate: trip.endDate, climate });
}

/**
 * A destination the place sweep cut back to its ID (lib/placeFreshness.js) is fetched by that ID:
 * Place Details is cheaper than a text search and can't land on a different place.
 */
async function lookUpStripped(placeId) {
  if (!placeId) return null;
  try {
    const { place } = await getPlace(placeId);
    return Number.isFinite(place.lat) ? destinationSnapshot(place) : null;
  } catch (error) {
    if (error.statusCode !== 404) throw error;
    return null;
  }
}

async function resolve(trip, { io } = {}) {
  const claimed = await Trip.updateOne(
    {
      _id: trip._id,
      "place.lat": { $exists: false },
      $or: [{ placeLookupAt: { $exists: false } }, { placeLookupAt: { $lt: new Date(Date.now() - RETRY_AFTER_MS) } }],
    },
    { $set: { placeLookupAt: new Date() } }
  );
  // Someone else resolved it, or tried recently.
  if (!claimed.modifiedCount) return null;

  const place = (await lookUpStripped(trip.place?.placeId)) ?? (await resolveDestination(trip.location));
  if (!place) return null;

  const update = { place };
  // An AI plan's theme is built from far more evidence; never overwrite it.
  if (!trip.theme) update.theme = await themeForPlace(place, trip);

  await Trip.updateOne({ _id: trip._id, "place.lat": { $exists: false } }, { $set: update });
  await bumpRevision(trip._id, "trip", { io });
  return place;
}

/**
 * Makes sure the trip has a `place`, resolving it from `location` if it hasn't been tried lately.
 * Never throws: a trip without a place still works everywhere, just without maps or weather.
 * Concurrent calls for the same trip share one lookup.
 */
export async function ensureTripPlace(trip, options) {
  if (trip.place && Number.isFinite(trip.place.lat)) return trip.place;
  if (!mapsConfigured() || !trip.location) return null;

  const key = String(trip._id);
  if (!inFlight.has(key)) {
    inFlight.set(
      key,
      resolve(trip, options)
        .catch((error) => {
          console.warn(`[trip-place] couldn't resolve "${trip.location}" for ${key}:`, error.message);
          return null;
        })
        .finally(() => inFlight.delete(key))
    );
  }
  return inFlight.get(key);
}
