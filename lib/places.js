// lib/places.js
//
// Google Maps Platform adapter: Places Text Search (New) and Routes computeRoutes. Server key only
// (design.md D-003). Every call is counted by the caller against a per-job cap, and results are
// cached in PlaceCache.
//
// Billing notes (confirm against the current SKU list):
//  - Search uses opening hours and price level, which are Enterprise-tier fields. They're what lets
//    validation catch closed places, so they're kept deliberately.
//  - Travel times use one computeRoutes call per day with intermediate waypoints, whose legs give the
//    consecutive stop-to-stop durations — cheaper than a Route Matrix, which bills every pair.

import PlaceCache from "../models/placeCache.model.js";

const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

const SEARCH_FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.types",
  "places.priceLevel",
  "places.rating",
  "places.regularOpeningHours",
].join(",");

const DESTINATION_FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.types",
].join(",");

const PRICE_LEVELS = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

async function callGoogle(url, body, fieldMask) {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) {
    const error = new Error("Google Maps is not configured");
    error.code = "PLACES_NOT_CONFIGURED";
    error.retryable = false;
    throw error;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": fieldMask,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const error = new Error(`Google Maps ${response.status}: ${data.error?.message ?? "request failed"}`);
    error.status = response.status;
    error.retryable = response.status === 429 || response.status >= 500;
    throw error;
  }
  return data;
}

function toPlace(raw) {
  return {
    placeId: raw.id,
    name: raw.displayName?.text ?? "",
    address: raw.formattedAddress ?? "",
    lat: raw.location?.latitude,
    lng: raw.location?.longitude,
    types: raw.types ?? [],
    priceLevel: PRICE_LEVELS[raw.priceLevel] ?? null,
    rating: raw.rating ?? null,
    openingHours: raw.regularOpeningHours
      ? {
          periods: raw.regularOpeningHours.periods ?? [],
          weekdayDescriptions: raw.regularOpeningHours.weekdayDescriptions ?? [],
        }
      : null,
  };
}

async function cachePlaces(places) {
  if (!places.length) return;
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  try {
    await PlaceCache.bulkWrite(
      places.map((place) => ({
        updateOne: {
          filter: { placeId: place.placeId },
          update: { $set: { ...place, fetchedAt: new Date(), expiresAt } },
          upsert: true,
        },
      })),
      { ordered: false }
    );
  } catch (error) {
    console.warn("[places] cache write failed:", error.message);
  }
}

export async function searchPlaces({ query, near, radiusMeters = 30_000, pageSize = 20 }) {
  const body = {
    textQuery: query,
    pageSize,
    languageCode: "en",
    ...(near && Number.isFinite(near.lat)
      ? {
          locationBias: {
            circle: {
              center: { latitude: near.lat, longitude: near.lng },
              radius: Math.min(radiusMeters, 50_000),
            },
          },
        }
      : {}),
  };
  const data = await callGoogle(SEARCH_URL, body, SEARCH_FIELDS);
  const places = (data.places ?? []).map(toPlace).filter((p) => p.placeId && Number.isFinite(p.lat));
  await cachePlaces(places);
  return places;
}

/** The trip's destination as a structured place, or null if nothing matches. */
export async function resolveDestination(query) {
  const data = await callGoogle(SEARCH_URL, { textQuery: query, pageSize: 1, languageCode: "en" }, DESTINATION_FIELDS);
  const raw = data.places?.[0];
  if (!raw) return null;
  const place = toPlace(raw);
  return {
    placeId: place.placeId,
    name: place.name,
    address: place.address,
    lat: place.lat,
    lng: place.lng,
    types: place.types,
  };
}

/** Driving minutes between consecutive stops, in order. One API call. */
export async function computeLegMinutes(stops) {
  if (stops.length < 2) return [];
  const waypoint = (stop) => ({ location: { latLng: { latitude: stop.lat, longitude: stop.lng } } });
  const data = await callGoogle(
    ROUTES_URL,
    {
      origin: waypoint(stops[0]),
      destination: waypoint(stops[stops.length - 1]),
      intermediates: stops.slice(1, -1).map(waypoint),
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_UNAWARE",
    },
    "routes.legs.duration,routes.legs.distanceMeters"
  );
  const legs = data.routes?.[0]?.legs ?? [];
  return legs.map((leg) => Math.round(parseInt(String(leg.duration ?? "0s"), 10) / 60));
}
