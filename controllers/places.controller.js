// controllers/places.controller.js
//
// Proxies for Google Maps Platform (ai-plan §4, design.md D-003). The Maps key never leaves the
// server; each handler checks the user's daily quota (middleware/quota.js) and spends it only when
// it's about to go upstream, so cached answers are free.

import {
  PHOTO_REF_PATTERN,
  PLACE_ID_PATTERN,
  fetchStaticMap,
  getPhotoUri,
  getPlace,
  searchPlacesForPicker,
} from "../lib/places.js";
import { QuotaExceededError } from "../lib/quota.js";
import { createTtlCache } from "../lib/ttlCache.js";
import { sendQuotaExceeded } from "../middleware/quota.js";

// Someone refining "fort" → "fort aguada" → back to "fort" shouldn't pay twice.
const searchCache = createTtlCache({ ttlMs: 10 * 60 * 1000, maxEntries: 1000 });
// Google's photo URIs are short-lived; well under an hour is safe to hand out again.
const photoCache = createTtlCache({ ttlMs: 45 * 60 * 1000, maxEntries: 2000 });
// One image per unique stop-set and size. Bounded by bytes so a burst of trips can't eat the heap.
const mapCache = createTtlCache({
  ttlMs: 24 * 60 * 60 * 1000,
  maxEntries: 2000,
  maxBytes: 48 * 1024 * 1024,
  sizeOf: (value) => value.body.length,
});

const MAX_STOPS = 12;
const PHOTO_WIDTHS = [200, 400, 800, 1200];

function fail(res, status, message) {
  return res.status(status).json({ success: false, message });
}

/** Maps upstream and quota errors onto responses; anything else goes to the error handler. */
function handleError(res, next, error) {
  if (error instanceof QuotaExceededError) return sendQuotaExceeded(res, error);
  if (error.code === "PLACES_NOT_CONFIGURED") {
    return res.status(503).json({ success: false, code: error.code, message: "Maps aren't available right now." });
  }
  if (error.statusCode === 404) return fail(res, 404, "Place not found");
  if (error.statusCode === 502) {
    console.warn("[places] upstream failure:", error.message);
    return fail(res, 502, "Maps couldn't be reached. Try again in a moment.");
  }
  next(error);
}

/** `"12.34,56.78"` → `{ lat, lng }` rounded to ~11 m, or null when malformed or out of range. */
function parsePoint(value) {
  const [lat, lng] = String(value ?? "").split(",").map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat: Math.round(lat * 1e4) / 1e4, lng: Math.round(lng * 1e4) / 1e4 };
}

const firstPhoto = (place) => place.photos?.[0] ?? null;

/** What a client needs to pick a place and show it. */
function toResult(place) {
  const photo = firstPhoto(place);
  return {
    placeId: place.placeId,
    name: place.name,
    address: place.address,
    lat: place.lat,
    lng: place.lng,
    types: (place.types ?? []).slice(0, 5),
    photoRef: photo?.ref ?? null,
  };
}

// GET /api/places/search?q=&near=lat,lng
export const searchPlaces = async (req, res, next) => {
  try {
    const query = String(req.query.q ?? "").trim().replace(/\s+/g, " ");
    if (query.length < 2) return fail(res, 400, "Type at least two characters");
    if (query.length > 120) return fail(res, 400, "That search is too long");

    const near = req.query.near ? parsePoint(req.query.near) : null;
    if (req.query.near && !near) return fail(res, 400, "near must be lat,lng");

    const key = `${query.toLowerCase()}|${near ? `${near.lat.toFixed(2)},${near.lng.toFixed(2)}` : ""}`;
    let results = searchCache.get(key);
    if (!results) {
      await req.spendQuota();
      results = (await searchPlacesForPicker({ query, near })).map(toResult);
      searchCache.set(key, results);
    }

    res.set("Cache-Control", "private, max-age=600");
    res.json({ success: true, count: results.length, data: results });
  } catch (error) {
    handleError(res, next, error);
  }
};

// GET /api/places/:placeId
export const getPlaceDetails = async (req, res, next) => {
  try {
    const { placeId } = req.params;
    if (!PLACE_ID_PATTERN.test(placeId)) return fail(res, 400, "Invalid place id");

    const { place } = await getPlace(placeId, { spend: () => req.spendQuota() });
    res.set("Cache-Control", "private, max-age=3600");
    res.json({
      success: true,
      data: {
        ...toResult(place),
        country: place.country ?? null,
        admin1: place.admin1 ?? null,
        // Google requires these to be shown wherever the photo is (Places API policies).
        photos: place.photos ?? [],
      },
    });
  } catch (error) {
    handleError(res, next, error);
  }
};

// GET /api/places/photo/places/{placeId}/photos/{photoId}?w=400
export const getPlacePhoto = async (req, res, next) => {
  try {
    const { photoRef } = req.params;
    if (!PHOTO_REF_PATTERN.test(photoRef ?? "")) return fail(res, 400, "Invalid photo reference");

    // Snap to a few widths, so the cache isn't split by every screen size.
    const requested = Number(req.query.w) || 800;
    const width = PHOTO_WIDTHS.find((w) => w >= requested) ?? PHOTO_WIDTHS[PHOTO_WIDTHS.length - 1];

    const key = `${photoRef}|${width}`;
    let uri = photoCache.get(key);
    if (!uri) {
      await req.spendQuota();
      uri = await getPhotoUri(photoRef, { maxWidthPx: width });
      photoCache.set(key, uri);
    }

    // The bytes come from Google's CDN, not through this server, and that URL carries no key.
    res.set("Cache-Control", "private, max-age=1800");
    res.redirect(302, uri);
  } catch (error) {
    handleError(res, next, error);
  }
};

// GET /api/places/static-map?stops=lat,lng|lat,lng&w=640&h=240&theme=light|dark
export const getStaticMap = async (req, res, next) => {
  try {
    const raw = String(req.query.stops ?? "").split("|").filter(Boolean);
    if (!raw.length) return fail(res, 400, "stops is required: lat,lng|lat,lng");
    if (raw.length > MAX_STOPS) return fail(res, 400, `At most ${MAX_STOPS} stops`);
    const stops = raw.map(parsePoint);
    if (stops.some((stop) => !stop)) return fail(res, 400, "Each stop must be lat,lng");

    const clamp = (value, fallback) => Math.min(640, Math.max(80, Math.round(Number(value) || fallback)));
    const width = clamp(req.query.w, 640);
    const height = clamp(req.query.h, 240);
    const theme = req.query.theme === "dark" ? "dark" : "light";

    const key = `${stops.map((s) => `${s.lat},${s.lng}`).join("|")}|${width}x${height}|${theme}`;
    let image = mapCache.get(key);
    if (!image) {
      await req.spendQuota();
      image = await fetchStaticMap({ stops, width, height, scale: 2, theme });
      mapCache.set(key, image);
    }

    res.set("Content-Type", image.contentType);
    res.set("Cache-Control", "private, max-age=86400");
    res.send(image.body);
  } catch (error) {
    handleError(res, next, error);
  }
};
