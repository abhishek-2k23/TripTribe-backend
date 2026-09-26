// scripts/seed-templates.js
//
// Loads the plan templates in scripts/data/templates.js into the PlanTemplate collection, and
// optionally grounds their places in Google Places (ai-plan Phase 11).
//
// Places are never typed in by hand. Each activity carries a `placeQuery`; `--resolve` runs one
// Text Search per unresolved query, biased toward the destination, and stores the top match. A match
// far from the destination is almost always the wrong place with the same name, so it's reported
// and left unresolved rather than stored. Resolved places survive a re-seed as long as the activity's
// `placeQuery` is unchanged, so editing copy never re-bills a search.
//
//   node scripts/seed-templates.js                     # validate the data file only; no database
//   node scripts/seed-templates.js --apply             # upsert templates by slug
//   node scripts/seed-templates.js --apply --resolve   # ...and resolve missing places (Places API)
//   --max-calls=250                                    # cap on Places calls for this run

import mongoose from "mongoose";
import dotenv from "dotenv";

import PlanTemplate from "../models/planTemplate.model.js";
import { destinationSnapshot, searchPlacesForPicker } from "../lib/places.js";
import { TEMPLATES } from "./data/templates.js";

dotenv.config();

const apply = process.argv.includes("--apply");
const resolve = process.argv.includes("--resolve");
const maxCalls = Number(process.argv.find((arg) => arg.startsWith("--max-calls="))?.split("=")[1]) || 250;

// Leh to Pangong is ~160 km by road; anything past this is a namesake somewhere else.
const MAX_DISTANCE_KM = 250;

let calls = 0;
const problems = [];

function distanceKm(a, b) {
  const rad = (deg) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

async function search(query, near) {
  if (calls >= maxCalls) return null;
  calls += 1;
  const [match] = await searchPlacesForPicker({ query, near, pageSize: 1 });
  return match ?? null;
}

const activityPlace = (match) => ({
  placeId: match.placeId,
  name: match.name,
  address: match.address,
  lat: match.lat,
  lng: match.lng,
  types: match.types.slice(0, 6),
  photoRef: match.photos?.[0]?.ref,
});

/** The data file's template, carrying over places an earlier run already resolved. */
function merge(data, existing) {
  const previous = new Map();
  for (const day of existing?.itinerary ?? []) {
    for (const activity of day.activities) {
      if (activity.place?.placeId) previous.set(`${day.day}|${activity.placeQuery}`, activity.place);
    }
  }
  const sameDestination = existing?.destination?.query === data.destination.query;

  return {
    ...data,
    destination: {
      ...data.destination,
      place: sameDestination ? existing.destination.place : undefined,
    },
    heroImage: sameDestination ? existing.heroImage : undefined,
    itinerary: data.itinerary.map((day) => ({
      ...day,
      activities: day.activities.map((activity) => ({
        ...activity,
        place: previous.get(`${day.day}|${activity.placeQuery}`),
      })),
    })),
  };
}

async function resolvePlaces(template) {
  const { destination } = template;
  if (!destination.place?.placeId) {
    const match = await search(destination.query);
    if (match) {
      destination.place = destinationSnapshot(match);
      const photo = match.photos?.[0];
      if (photo) template.heroImage = { photoRef: photo.ref, attributions: photo.attributions };
    } else {
      problems.push(`${template.slug}: destination "${destination.query}" didn't resolve`);
    }
  }
  const near = destination.place;

  for (const day of template.itinerary) {
    for (const activity of day.activities) {
      if (activity.place?.placeId || !activity.placeQuery) continue;
      const match = await search(activity.placeQuery, near);
      if (!match) {
        if (calls < maxCalls) problems.push(`${template.slug} day ${day.day}: no match for "${activity.placeQuery}"`);
        continue;
      }
      const km = near ? distanceKm(near, match) : 0;
      if (km > MAX_DISTANCE_KM) {
        problems.push(
          `${template.slug} day ${day.day}: "${activity.placeQuery}" matched ${match.name} (${match.address}), ${Math.round(km)} km away — skipped`
        );
        continue;
      }
      activity.place = activityPlace(match);
    }
  }
}

function countResolved(template) {
  const activities = template.itinerary.flatMap((day) => day.activities);
  return { resolved: activities.filter((a) => a.place?.placeId).length, total: activities.length };
}

async function main() {
  // Validate every template against the schema before touching anything.
  const slugs = new Set();
  for (const data of TEMPLATES) {
    if (slugs.has(data.slug)) throw new Error(`Duplicate slug ${data.slug}`);
    slugs.add(data.slug);
    const error = new PlanTemplate(data).validateSync();
    if (error) throw new Error(`${data.slug}: ${error.message}`);
    if (data.itinerary.length !== data.days) throw new Error(`${data.slug}: ${data.itinerary.length} days listed, ${data.days} declared`);
  }
  console.log(`✓ ${TEMPLATES.length} templates valid`);

  if (!apply) {
    console.log("Dry run — nothing written. Re-run with --apply (and --resolve to ground places).");
    return;
  }
  if (resolve && !process.env.GOOGLE_MAPS_SERVER_KEY) throw new Error("--resolve needs GOOGLE_MAPS_SERVER_KEY");

  await mongoose.connect(process.env.MONGODB_URI);
  await PlanTemplate.syncIndexes();

  for (const data of TEMPLATES) {
    const existing = await PlanTemplate.findOne({ slug: data.slug }).lean();
    const template = merge(data, existing);
    if (resolve) await resolvePlaces(template);

    const { heroImage, ...fields } = template;
    await PlanTemplate.updateOne(
      { slug: template.slug },
      {
        $set: heroImage ? { ...fields, heroImage } : fields,
        // Mongoose drops undefined keys from an update, so a stale photo has to be removed explicitly.
        ...(heroImage ? {} : { $unset: { heroImage: 1 } }),
        // usageCount and published belong to the live collection, not the data file.
        $setOnInsert: { usageCount: 0, published: true },
      },
      { upsert: true, runValidators: true }
    );
    const { resolved, total } = countResolved(template);
    console.log(`${existing ? "updated" : "created"}  ${template.slug}  places ${resolved}/${total}`);
  }

  // Templates removed from the data file are unpublished, not deleted: trips reference them.
  const removed = await PlanTemplate.updateMany({ slug: { $nin: [...slugs] }, published: true }, { $set: { published: false } });
  if (removed.modifiedCount) console.log(`unpublished ${removed.modifiedCount} template(s) no longer in the data file`);

  if (resolve) console.log(`\nPlaces calls this run: ${calls}${calls >= maxCalls ? ` (hit --max-calls=${maxCalls})` : ""}`);
  if (problems.length) {
    console.log(`\n${problems.length} place(s) need a better placeQuery:`);
    for (const problem of problems) console.log(`  - ${problem}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
