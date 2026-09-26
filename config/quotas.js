// config/quotas.js
//
// Per-user daily quotas on calls that cost money or hit a third party (ai-plan §1.3, design.md D-002).
//
// These sit in front of Google's own per-API daily quotas, which are the hard cap on the bill. Ours
// stop one account — a bug, a script, a stolen session — from spending the whole project's daily
// allowance and taking maps away from everyone else. Only upstream calls count: a PlaceCache hit or
// a cached static map costs nothing and spends nothing.
//
// Each is one environment variable; days roll over at UTC midnight.
//
//   QUOTA_DISABLED=1               turn quotas off entirely
//   QUOTA_PLACES_SEARCH_PER_DAY    GET /api/places/search
//   QUOTA_PLACES_DETAILS_PER_DAY   GET /api/places/:placeId
//   QUOTA_PLACES_PHOTO_PER_DAY     GET /api/places/photo/:photoRef
//   QUOTA_STATIC_MAP_PER_DAY       GET /api/places/static-map
//   QUOTA_WEATHER_PER_DAY          GET /api/weather (free upstream; this is abuse control)

import dotenv from "dotenv";

// Read during import-graph evaluation, before index.js loads the environment (see config/rateLimits.js).
dotenv.config();

const fromEnv = (value, fallback) => {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const truthy = (value) => ["1", "true", "yes", "on"].includes(String(value ?? "").toLowerCase());

/**
 * Sized so normal use never meets them: a place picker debounced at 400ms spends one search per
 * pause in typing, and a week-long trip's itinerary renders one map per day plus one per opened
 * activity. Every one is overridable, so tuning is an env change and a restart.
 */
export const quotas = {
  disabled: truthy(process.env.QUOTA_DISABLED),
  placesSearch: fromEnv(process.env.QUOTA_PLACES_SEARCH_PER_DAY, 150),
  placesDetails: fromEnv(process.env.QUOTA_PLACES_DETAILS_PER_DAY, 150),
  placesPhoto: fromEnv(process.env.QUOTA_PLACES_PHOTO_PER_DAY, 200),
  staticMap: fromEnv(process.env.QUOTA_STATIC_MAP_PER_DAY, 300),
  weather: fromEnv(process.env.QUOTA_WEATHER_PER_DAY, 500),
};

export const QUOTA_BUCKETS = ["placesSearch", "placesDetails", "placesPhoto", "staticMap", "weather"];
