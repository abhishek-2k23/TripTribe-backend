// lib/placeFreshness.js
//
// Keeping copies of Google place data inside Google's caching window (design.md D-087).
//
// Google lets us store a place ID indefinitely, but coordinates and other place content only for a
// limited time — the same 30 days PlaceCache runs on. Trips, itinerary activities, AI proposals and
// templates each hold a copy, stamped with `fetchedAt`. Once a day the sweep looks at copies older
// than the window: it refreshes them from PlaceCache when someone has looked the place up recently,
// which costs nothing, and otherwise strips them back to the place ID.
//
// A stripped place is filled in again when someone opens what shows it: a trip through
// ensureTripPlace, an itinerary or a template here, spending the viewer's Place Details quota.
// Clients already treat a place without coordinates as "no map", so in between nothing breaks.

import Itinerary from "../models/Itinerary.model.js";
import ItineraryProposal from "../models/itineraryProposal.model.js";
import PlaceCache from "../models/placeCache.model.js";
import PlanTemplate from "../models/planTemplate.model.js";
import Trip from "../models/trip.model.js";
import { CACHE_DAYS, getPlace, mapsConfigured } from "./places.js";
import { QuotaExceededError, spendQuota } from "./quota.js";
import { bumpRevision } from "./revisions.js";
import { createTtlCache } from "./ttlCache.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_MS = CACHE_DAYS * DAY_MS;
// One open of a long trip shouldn't spend a day's quota; the rest fill in on a later open.
const MAX_LOOKUPS = 20;

// The fields each kind of snapshot holds, besides `placeId` and `fetchedAt`.
const TRIP_FIELDS = ["name", "address", "lat", "lng", "country", "admin1", "types"];
const ACTIVITY_FIELDS = ["name", "address", "lat", "lng", "types", "photoRef"];
const PROPOSAL_FIELDS = ["name", "address", "lat", "lng"];
const TEMPLATE_FIELDS = ["name", "address", "lat", "lng", "country", "admin1", "types", "photoRef"];
const CONTENT_FIELDS = [...new Set([...TRIP_FIELDS, ...TEMPLATE_FIELDS])];

const hasContent = (place) =>
  Boolean(place) &&
  CONTENT_FIELDS.some((field) => {
    const value = place[field];
    return value !== undefined && value !== null && !(Array.isArray(value) && value.length === 0);
  });

/** Holds Google content fetched longer ago than the window allows (or never stamped). */
const isStale = (place, cutoff) => hasContent(place) && !(place.fetchedAt && new Date(place.fetchedAt) > cutoff);

/** Stripped by the sweep and waiting for someone to open it. */
const needsLookup = (place) => Boolean(place?.placeId) && !Number.isFinite(place.lat);

/** A snapshot of the given fields, rebuilt from a fresh cache entry or Place Details result. */
function snapshot(placeId, source, fields) {
  const next = { placeId };
  for (const field of fields) {
    const value = field === "photoRef" ? source.photos?.[0]?.ref : source[field];
    if (value !== undefined && value !== null) next[field] = value;
  }
  next.fetchedAt = source.fetchedAt ?? new Date();
  return next;
}

/** The refreshed copy when the cache has the place, else just its ID (or nothing, without one). */
function renew(place, cache, fields) {
  const cached = place.placeId && cache.get(place.placeId);
  if (cached) return snapshot(place.placeId, cached, fields);
  return place.placeId ? { placeId: place.placeId } : undefined;
}

async function freshCache(placeIds) {
  const ids = [...new Set(placeIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const rows = await PlaceCache.find({
    placeId: { $in: ids },
    expiresAt: { $gt: new Date() },
    lat: { $type: "number" },
  }).lean();
  return new Map(rows.map((row) => [row.placeId, row]));
}

/** Matches documents where any place under `path` may be stale; callers re-check each one. */
const staleFilter = (path, cutoff) => ({
  $or: [
    { [`${path}.fetchedAt`]: { $lt: cutoff } },
    { [`${path}.lat`]: { $exists: true }, [`${path}.fetchedAt`]: { $exists: false } },
  ],
});

const tally = () => ({ refreshed: 0, stripped: 0 });
const count = (counts, next) => {
  if (next && Number.isFinite(next.lat)) counts.refreshed += 1;
  else counts.stripped += 1;
};

async function sweepTrips(cutoff) {
  const counts = tally();
  const trips = await Trip.find(staleFilter("place", cutoff)).select("place").lean();
  const cache = await freshCache(trips.map((trip) => trip.place?.placeId));

  for (const trip of trips) {
    if (!isStale(trip.place, cutoff)) continue;
    const next = renew(trip.place, cache, TRIP_FIELDS);
    const update = next ? { $set: { place: next } } : { $unset: { place: 1 } };
    // A stripped trip is looked up again on its next open, without waiting out the weekly retry.
    if (!Number.isFinite(next?.lat)) update.$unset = { ...update.$unset, placeLookupAt: 1 };
    await Trip.updateOne({ _id: trip._id, "place.fetchedAt": trip.place.fetchedAt ?? { $exists: false } }, update);
    count(counts, next);
  }
  return counts;
}

/**
 * Activities and proposal activities live in nested arrays, so each is updated by its `_id` through
 * an array filter rather than by saving the document — a member editing that day at the same moment
 * keeps their change.
 */
async function sweepNested(Model, { arrays, fields, cutoff }) {
  const [outer, inner] = arrays;
  const path = `${outer}.${inner}.place`;
  const target = `${outer}.$[].${inner}.$[a].place`;
  const counts = tally();

  const docs = await Model.find(staleFilter(path, cutoff))
    .select(`${outer}.${inner}._id ${path}`)
    .lean();

  for (const doc of docs) {
    const stale = doc[outer].flatMap((group) => group[inner] ?? []).filter((item) => isStale(item.place, cutoff));
    if (!stale.length) continue;
    const cache = await freshCache(stale.map((item) => item.place.placeId));

    const ops = stale.map((item) => {
      const next = renew(item.place, cache, fields);
      count(counts, next);
      return {
        updateOne: {
          filter: { _id: doc._id },
          update: next ? { $set: { [target]: next } } : { $unset: { [target]: 1 } },
          arrayFilters: [{ "a._id": item._id }],
        },
      };
    });
    await Model.bulkWrite(ops, { ordered: false });
  }
  return counts;
}

/** Template activities have no `_id`, and nobody edits templates concurrently, so these are rewritten whole. */
async function sweepTemplates(cutoff) {
  const counts = tally();
  const templates = await PlanTemplate.find({
    $or: [
      staleFilter("destination.place", cutoff),
      staleFilter("itinerary.activities.place", cutoff),
      { "heroImage.fetchedAt": { $lt: cutoff } },
      { "heroImage.photoRef": { $exists: true }, "heroImage.fetchedAt": { $exists: false } },
    ],
  })
    .select("destination.place heroImage itinerary")
    .lean();

  for (const template of templates) {
    const places = [template.destination?.place, ...template.itinerary.flatMap((day) => day.activities.map((a) => a.place))];
    const cache = await freshCache(places.map((place) => place?.placeId));
    const update = { $set: {}, $unset: {} };

    const destination = template.destination?.place;
    if (isStale(destination, cutoff)) {
      const next = renew(destination, cache, TEMPLATE_FIELDS);
      if (next) update.$set["destination.place"] = next;
      else update.$unset["destination.place"] = 1;
      count(counts, next);
    }

    const hero = template.heroImage;
    if (hero?.photoRef && !(hero.fetchedAt && new Date(hero.fetchedAt) > cutoff)) {
      const cached = destination?.placeId ? cache.get(destination.placeId) : null;
      const photo = cached?.photos?.[0];
      if (photo) {
        update.$set.heroImage = { photoRef: photo.ref, attributions: photo.attributions, fetchedAt: cached.fetchedAt };
        counts.refreshed += 1;
      } else {
        // Cards fall back to the archetype banner until someone opens the template.
        update.$unset.heroImage = 1;
        counts.stripped += 1;
      }
    }

    let changed = false;
    const itinerary = template.itinerary.map((day) => ({
      ...day,
      activities: day.activities.map((activity) => {
        if (!isStale(activity.place, cutoff)) return activity;
        changed = true;
        const next = renew(activity.place, cache, TEMPLATE_FIELDS);
        count(counts, next);
        return { ...activity, place: next };
      }),
    }));
    if (changed) update.$set.itinerary = itinerary;

    if (!Object.keys(update.$unset).length) delete update.$unset;
    if (!Object.keys(update.$set).length) delete update.$set;
    if (Object.keys(update).length) await PlanTemplate.updateOne({ _id: template._id }, update);
  }
  return counts;
}

/** Refreshes or strips every stored place copy older than the window. Safe to run repeatedly. */
export async function sweepStalePlaces({ now = Date.now() } = {}) {
  const cutoff = new Date(now - WINDOW_MS);
  return {
    trips: await sweepTrips(cutoff),
    activities: await sweepNested(Itinerary, { arrays: ["sections", "activities"], fields: ACTIVITY_FIELDS, cutoff }),
    proposals: await sweepNested(ItineraryProposal, { arrays: ["days", "activities"], fields: PROPOSAL_FIELDS, cutoff }),
    templates: await sweepTemplates(cutoff),
  };
}

/** Runs the sweep a minute after boot and then daily. `PLACE_SWEEP_DISABLED=1` turns it off. */
export function startPlaceSweep() {
  if (["1", "true", "yes", "on"].includes(String(process.env.PLACE_SWEEP_DISABLED ?? "").toLowerCase())) return;
  const run = () =>
    sweepStalePlaces()
      .then((summary) => console.log("[place-sweep]", JSON.stringify(summary)))
      .catch((error) => console.error("[place-sweep] failed:", error));
  setTimeout(run, 60_000).unref();
  setInterval(run, DAY_MS).unref();
}

// ---------------------------------------------------------------------------------------------
// Lazy refresh

// Shared lookups per itinerary or template, and a cooldown so a place Google can't resolve isn't
// retried on every open.
const inFlight = new Map();
const recentlyTried = createTtlCache({ ttlMs: 10 * 60 * 1000, maxEntries: 2000 });

function once(key, task) {
  if (inFlight.has(key) || recentlyTried.get(key)) return;
  recentlyTried.set(key, true);
  inFlight.set(
    key,
    task()
      .catch((error) => console.warn(`[place-refresh] ${key}:`, error.message))
      .finally(() => inFlight.delete(key))
  );
}

/**
 * Looks places up again — PlaceCache first, then Place Details on `userId`'s quota. Returns what was
 * found, and the IDs Google no longer knows (a closed or merged place), which callers drop.
 */
async function lookUp(placeIds, userId) {
  const found = new Map();
  const gone = new Set();
  for (const placeId of placeIds.slice(0, MAX_LOOKUPS)) {
    try {
      const { place } = await getPlace(placeId, { spend: () => spendQuota(userId, "placesDetails") });
      if (Number.isFinite(place.lat)) found.set(placeId, place);
    } catch (error) {
      if (error.statusCode === 404) {
        gone.add(placeId);
        continue;
      }
      if (!(error instanceof QuotaExceededError) && error.code !== "PLACES_NOT_CONFIGURED") {
        console.warn(`[place-refresh] ${placeId}:`, error.message);
      }
      break;
    }
  }
  return { found, gone };
}

/** After an itinerary read: fills in activities whose place the sweep stripped. Never throws. */
export function refreshItineraryPlaces({ tripId, days, userId, io }) {
  if (!mapsConfigured()) return;
  const pending = days.flatMap((day) =>
    day.sections.flatMap((section) =>
      section.activities
        .filter((activity) => needsLookup(activity.place))
        .map((activity) => ({ dayId: day._id, activityId: activity._id, placeId: activity.place.placeId }))
    )
  );
  if (!pending.length) return;

  once(`itinerary:${tripId}`, async () => {
    const { found, gone } = await lookUp([...new Set(pending.map((p) => p.placeId))], userId);
    const target = "sections.$[].activities.$[a].place";
    const ops = pending
      .filter((p) => found.has(p.placeId) || gone.has(p.placeId))
      .map((p) => ({
        updateOne: {
          filter: { _id: p.dayId },
          update: found.has(p.placeId)
            ? { $set: { [target]: snapshot(p.placeId, found.get(p.placeId), ACTIVITY_FIELDS) } }
            : { $unset: { [target]: 1 } },
          // Only if it's still the stripped copy this read saw.
          arrayFilters: [{ "a._id": p.activityId, "a.place.placeId": p.placeId, "a.place.lat": { $exists: false } }],
        },
      }));
    if (!ops.length) return;
    await Itinerary.bulkWrite(ops, { ordered: false });
    await bumpRevision(tripId, "itinerary", { io });
  });
}

/** After a template read: fills in its destination, photo and activity places. Never throws. */
export function refreshTemplatePlaces(template, userId) {
  if (!mapsConfigured()) return;
  const destination = template.destination?.place;
  const wantsDestination = needsLookup(destination) || (destination?.placeId && !template.heroImage);
  const activityIds = template.itinerary.flatMap((day) => day.activities.map((a) => a.place)).filter(needsLookup).map((p) => p.placeId);
  if (!wantsDestination && !activityIds.length) return;

  once(`template:${template._id}`, async () => {
    const ids = [...new Set([...(wantsDestination ? [destination.placeId] : []), ...activityIds])];
    const { found, gone } = await lookUp(ids, userId);
    if (!found.size && !gone.size) return;

    // Re-read, so the write starts from the current document rather than the one the request saw.
    const current = await PlanTemplate.findById(template._id).select("destination.place heroImage itinerary").lean();
    if (!current) return;
    const update = { $set: {} };

    const currentDestination = current.destination?.place;
    const destinationPlace = currentDestination?.placeId && found.get(currentDestination.placeId);
    if (destinationPlace && needsLookup(currentDestination)) {
      update.$set["destination.place"] = snapshot(currentDestination.placeId, destinationPlace, TEMPLATE_FIELDS);
    }
    const photo = destinationPlace?.photos?.[0];
    if (photo && !current.heroImage) {
      update.$set.heroImage = { photoRef: photo.ref, attributions: photo.attributions, fetchedAt: destinationPlace.fetchedAt ?? new Date() };
    }

    let changed = false;
    const itinerary = current.itinerary.map((day) => ({
      ...day,
      activities: day.activities.map((activity) => {
        if (!needsLookup(activity.place)) return activity;
        const { placeId } = activity.place;
        if (gone.has(placeId)) {
          changed = true;
          return { ...activity, place: undefined };
        }
        if (!found.has(placeId)) return activity;
        changed = true;
        return { ...activity, place: snapshot(placeId, found.get(placeId), TEMPLATE_FIELDS) };
      }),
    }));
    if (changed) update.$set.itinerary = itinerary;

    if (Object.keys(update.$set).length) await PlanTemplate.updateOne({ _id: template._id }, update);
  });
}
