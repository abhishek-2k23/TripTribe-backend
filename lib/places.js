// lib/places.js
//
// Google Maps Platform adapter: Places (New) Text Search, Place Details and Place Photos, Routes
// computeRoutes, and the Maps Static API. Server key only (design.md D-003) — every client reaches
// these through a backend proxy. Results are cached in PlaceCache.
//
// Billing notes (confirm against the current SKU list):
//  - The AI search uses opening hours and price level, which are Enterprise-tier fields. They're what
//    lets validation catch closed places, so they're kept deliberately.
//  - The place picker and destination lookups ask only for Pro-tier fields (name, address, location,
//    types, address components, photos), so typing into a search box never bills at Enterprise.
//  - Travel times use one computeRoutes call per day with intermediate waypoints, whose legs give the
//    consecutive stop-to-stop durations — cheaper than a Route Matrix, which bills every pair.

import crypto from "crypto";

import PlaceCache from "../models/placeCache.model.js";

const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const DETAILS_URL = "https://places.googleapis.com/v1/places";
const PHOTO_URL = "https://places.googleapis.com/v1";
const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const STATIC_MAP_URL = "https://maps.googleapis.com/maps/api/staticmap";

// Google's terms let us keep a place ID indefinitely but other place content only for a limited
// window. Copies outside PlaceCache carry `fetchedAt` and are swept on the same clock
// (lib/placeFreshness.js).
export const CACHE_DAYS = 30;

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

/** Pro-tier only: what a place picker and a destination lookup need, and nothing billed above it. */
const BASIC_PLACE_FIELDS = ["id", "displayName", "formattedAddress", "location", "types", "addressComponents", "photos"];

const PICKER_FIELDS = BASIC_PLACE_FIELDS.map((field) => `places.${field}`).join(",");
const DETAILS_FIELDS = BASIC_PLACE_FIELDS.join(",");

const PRICE_LEVELS = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

/** A photo resource name as Places (New) returns it: `places/{placeId}/photos/{photoId}`. */
export const PHOTO_REF_PATTERN = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;
export const PLACE_ID_PATTERN = /^[A-Za-z0-9_-]{10,300}$/;

function mapsKey() {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) {
    const error = new Error("Google Maps is not configured");
    error.code = "PLACES_NOT_CONFIGURED";
    error.statusCode = 503;
    error.retryable = false;
    throw error;
  }
  return key;
}

export const mapsConfigured = () => Boolean(process.env.GOOGLE_MAPS_SERVER_KEY);

async function callGoogle(url, { body, fieldMask, method = body ? "POST" : "GET" } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      "X-Goog-Api-Key": mapsKey(),
      ...(fieldMask ? { "X-Goog-FieldMask": fieldMask } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15_000),
  });

  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!response.ok) {
    const error = new Error(`Google Maps ${response.status}: ${data.error?.message ?? "request failed"}`);
    error.status = response.status;
    if (response.status === 401 || response.status === 403) {
      // The API isn't enabled for this key's project, or the key's restrictions exclude it. That's
      // configuration, so clients get the same answer as for a missing key and the log says why.
      console.error(`[places] ${error.message}`);
      error.code = "PLACES_NOT_CONFIGURED";
      error.statusCode = 503;
    } else {
      // A bad place id or photo name is the caller's mistake, not an outage.
      error.statusCode = response.status === 400 || response.status === 404 ? 404 : 502;
    }
    error.retryable = response.status === 429 || response.status >= 500;
    throw error;
  }
  return data;
}

function addressPart(components, type) {
  return components?.find((component) => component.types?.includes(type))?.longText ?? undefined;
}

/** Up to three photo references, with the attributions Google requires wherever a photo is shown. */
function toPhotos(raw) {
  return (raw ?? []).slice(0, 3).map((photo) => ({
    ref: photo.name,
    width: photo.widthPx ?? null,
    height: photo.heightPx ?? null,
    attributions: (photo.authorAttributions ?? []).map((author) => ({
      name: author.displayName ?? "",
      uri: author.uri ?? null,
    })),
  }));
}

/**
 * A Google place in our shape. Keys whose field wasn't requested stay `undefined`, so caching a
 * Pro-tier lookup never erases the Enterprise-tier hours an AI search stored for the same place.
 */
function toPlace(raw) {
  return {
    placeId: raw.id,
    name: raw.displayName?.text ?? "",
    address: raw.formattedAddress ?? "",
    lat: raw.location?.latitude,
    lng: raw.location?.longitude,
    types: raw.types ?? [],
    country: addressPart(raw.addressComponents, "country"),
    admin1: addressPart(raw.addressComponents, "administrative_area_level_1"),
    priceLevel: raw.priceLevel === undefined ? undefined : (PRICE_LEVELS[raw.priceLevel] ?? null),
    rating: raw.rating,
    openingHours: raw.regularOpeningHours
      ? {
          periods: raw.regularOpeningHours.periods ?? [],
          weekdayDescriptions: raw.regularOpeningHours.weekdayDescriptions ?? [],
        }
      : undefined,
    photos: raw.photos ? toPhotos(raw.photos) : undefined,
  };
}

const definedOnly = (object) => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));

async function cachePlaces(places) {
  if (!places.length) return;
  const expiresAt = new Date(Date.now() + CACHE_DAYS * 24 * 60 * 60 * 1000);
  try {
    await PlaceCache.bulkWrite(
      places.map((place) => ({
        updateOne: {
          filter: { placeId: place.placeId },
          update: { $set: { ...definedOnly(place), fetchedAt: new Date(), expiresAt } },
          upsert: true,
        },
      })),
      { ordered: false }
    );
  } catch (error) {
    console.warn("[places] cache write failed:", error.message);
  }
}

const locationBias = (near, radiusMeters) =>
  near && Number.isFinite(near.lat) && Number.isFinite(near.lng)
    ? {
        locationBias: {
          circle: {
            center: { latitude: near.lat, longitude: near.lng },
            radius: Math.min(radiusMeters, 50_000),
          },
        },
      }
    : {};

/** The AI planner's candidate search: Enterprise fields, so validation can check hours. */
export async function searchPlaces({ query, near, radiusMeters = 30_000, pageSize = 20 }) {
  const data = await callGoogle(SEARCH_URL, {
    body: { textQuery: query, pageSize, languageCode: "en", ...locationBias(near, radiusMeters) },
    fieldMask: SEARCH_FIELDS,
  });
  const places = (data.places ?? []).map(toPlace).filter((p) => p.placeId && Number.isFinite(p.lat));
  await cachePlaces(places);
  return places;
}

/** The place picker's search: Pro fields only, a handful of results, biased toward the trip. */
export async function searchPlacesForPicker({ query, near, pageSize = 8 }) {
  const data = await callGoogle(SEARCH_URL, {
    body: { textQuery: query, pageSize, languageCode: "en", ...locationBias(near, 40_000) },
    fieldMask: PICKER_FIELDS,
  });
  const places = (data.places ?? []).map(toPlace).filter((p) => p.placeId && Number.isFinite(p.lat));
  await cachePlaces(places);
  return places;
}

/** A place from the cache when it's still fresh, otherwise from Place Details (and then cached). */
export async function getPlace(placeId, { spend } = {}) {
  const cached = await PlaceCache.findOne({ placeId, expiresAt: { $gt: new Date() } }).lean();
  // An entry written by an AI search has no photos field; one lookup fills it in.
  if (cached && Number.isFinite(cached.lat) && cached.photos !== undefined) return { place: cached, cached: true };

  await spend?.();
  const raw = await callGoogle(`${DETAILS_URL}/${encodeURIComponent(placeId)}`, { fieldMask: DETAILS_FIELDS });
  const place = toPlace(raw);
  await cachePlaces([place]);
  return { place: { ...cached, ...definedOnly(place), fetchedAt: new Date() }, cached: false };
}

/** The trip's destination as a structured place, or null if nothing matches. */
export async function resolveDestination(query) {
  const data = await callGoogle(SEARCH_URL, {
    body: { textQuery: query, pageSize: 1, languageCode: "en" },
    fieldMask: PICKER_FIELDS,
  });
  const raw = data.places?.[0];
  if (!raw) return null;
  const place = toPlace(raw);
  await cachePlaces([place]);
  return destinationSnapshot(place);
}

/** The fields a trip stores about its destination (models/trip.model.js). */
export function destinationSnapshot(place) {
  return definedOnly({
    placeId: place.placeId,
    name: place.name,
    address: place.address,
    lat: place.lat,
    lng: place.lng,
    country: place.country,
    admin1: place.admin1,
    types: place.types ?? [],
    fetchedAt: place.fetchedAt ?? new Date(),
  });
}

/** Driving minutes between consecutive stops, in order. One API call. */
export async function computeLegMinutes(stops) {
  if (stops.length < 2) return [];
  const waypoint = (stop) => ({ location: { latLng: { latitude: stop.lat, longitude: stop.lng } } });
  const data = await callGoogle(ROUTES_URL, {
    body: {
      origin: waypoint(stops[0]),
      destination: waypoint(stops[stops.length - 1]),
      intermediates: stops.slice(1, -1).map(waypoint),
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_UNAWARE",
    },
    fieldMask: "routes.legs.duration,routes.legs.distanceMeters",
  });
  const legs = data.routes?.[0]?.legs ?? [];
  return legs.map((leg) => Math.round(parseInt(String(leg.duration ?? "0s"), 10) / 60));
}

/**
 * A short-lived, key-free image URL for a place photo. Google serves the bytes from its own CDN, so
 * the client is redirected there rather than streamed through this server.
 */
export async function getPhotoUri(photoRef, { maxWidthPx = 800 } = {}) {
  const params = new URLSearchParams({ maxWidthPx: String(maxWidthPx), skipHttpRedirect: "true" });
  const data = await callGoogle(`${PHOTO_URL}/${photoRef}/media?${params}`);
  if (!data.photoUri) {
    const error = new Error("Photo not available");
    error.statusCode = 404;
    throw error;
  }
  return data.photoUri;
}

// Maps Static API ---------------------------------------------------------------------------------

const MARKER_LABELS = "123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// Nocturne Expedition (design.md D-053): a muted night basemap, so a map strip doesn't glare in dark mode.
const DARK_STYLE = [
  "element:geometry|color:0x1d2330",
  "element:labels.text.fill|color:0x8a93a6",
  "element:labels.text.stroke|color:0x1d2330",
  "feature:road|element:geometry|color:0x2c3444",
  "feature:road.highway|element:geometry|color:0x3a4356",
  "feature:water|element:geometry|color:0x0f1622",
  "feature:poi|visibility:off",
  "feature:transit|visibility:off",
];
const LIGHT_STYLE = ["feature:poi.business|visibility:off", "feature:transit|visibility:off"];

/**
 * Signs a Static Maps URL when a signing secret is configured. Google recommends signing for any
 * key used with the Static API; unsigned requests work but are capped lower.
 */
function signUrl(url) {
  const secret = process.env.GOOGLE_MAPS_SIGNING_SECRET;
  if (!secret) return url;
  const { pathname, search } = new URL(url);
  const key = Buffer.from(secret.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const signature = crypto
    .createHmac("sha1", key)
    .update(pathname + search)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${url}&signature=${signature}`;
}

/**
 * The Static Maps request for a set of stops: numbered markers in order, joined by a line when there
 * is more than one. `stops` are `{ lat, lng }` already validated by the caller.
 */
export function staticMapUrl({ stops, width, height, scale, theme, color = "0x0E7C86" }) {
  const params = new URLSearchParams({ size: `${width}x${height}`, scale: String(scale), format: "png" });
  const point = (stop) => `${stop.lat},${stop.lng}`;

  stops.forEach((stop, index) => {
    params.append("markers", `color:${color}|label:${MARKER_LABELS[index] ?? ""}|${point(stop)}`);
  });
  if (stops.length > 1) {
    params.append("path", `color:${color}CC|weight:4|${stops.map(point).join("|")}`);
  } else {
    params.set("zoom", "15");
  }
  for (const style of theme === "dark" ? DARK_STYLE : LIGHT_STYLE) params.append("style", style);

  params.set("key", mapsKey());
  return signUrl(`${STATIC_MAP_URL}?${params}`);
}

/** The PNG for a static map. */
export async function fetchStaticMap(options) {
  const response = await fetch(staticMapUrl(options), { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    const error = new Error(`Static map ${response.status}: ${(await response.text()).slice(0, 200)}`);
    if (response.status === 401 || response.status === 403) {
      // Maps Static API not enabled for the key, or excluded by its restrictions (see callGoogle).
      console.error(`[places] ${error.message}`);
      error.code = "PLACES_NOT_CONFIGURED";
      error.statusCode = 503;
      throw error;
    }
    error.statusCode = 502;
    error.retryable = response.status === 429 || response.status >= 500;
    throw error;
  }
  return {
    body: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") ?? "image/png",
  };
}
