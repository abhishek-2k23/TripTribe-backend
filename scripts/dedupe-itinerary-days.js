// scripts/dedupe-itinerary-days.js
//
// Merges itinerary days that forked, then adds the `{ trip, date }` unique index
// (ai-plan §5.2, design.md D-013, D-062).
//
// One `Itinerary` document is meant to be one calendar day. The web wrote its key at local midnight
// (18:30Z the previous UTC day, from IST) and mobile at UTC midnight, so the same day could exist
// twice and the timeline showed it twice. Writes now normalize to the nearest UTC midnight, but the
// unique index that would make that guarantee stick cannot be built while historical forks remain.
//
// Merging keeps the oldest document — the one other records are most likely to reference — moves
// every section and activity onto it, and deletes the rest. Activities already carried over by a
// `clientRef` are not copied twice.
//
//   node scripts/dedupe-itinerary-days.js            # report only, changes nothing
//   node scripts/dedupe-itinerary-days.js --apply    # merge, then build the unique index

import mongoose from "mongoose";
import dotenv from "dotenv";

import Itinerary from "../models/Itinerary.model.js";
import { dayId, normalizeDayKey } from "../lib/itinerary.js";

dotenv.config();

const apply = process.argv.includes("--apply");

/** Everything in `extra` that the keeper doesn't already have, folded into the keeper's sections. */
function mergeInto(keeper, extra) {
  const seenRefs = new Set(
    keeper.sections.flatMap((section) => section.activities.map((a) => a.clientRef).filter(Boolean))
  );
  let moved = 0;

  for (const section of extra.sections) {
    const activities = section.activities.filter((a) => !a.clientRef || !seenRefs.has(a.clientRef));
    if (!activities.length) continue;

    const target = keeper.sections.find((s) => s.section === section.section);
    if (target) target.activities.push(...activities);
    else keeper.sections.push({ section: section.section, activities });

    for (const activity of activities) if (activity.clientRef) seenRefs.add(activity.clientRef);
    moved += activities.length;
  }

  return moved;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const days = await Itinerary.find({}).sort({ createdAt: 1 });

  // trip + calendar day → the documents claiming it, oldest first.
  const groups = new Map();
  for (const day of days) {
    const key = `${day.trip}|${dayId(day.date)}`;
    groups.set(key, [...(groups.get(key) ?? []), day]);
  }

  const forked = [...groups.entries()].filter(([, docs]) => docs.length > 1);
  const misaligned = days.filter((day) => day.date.getTime() !== normalizeDayKey(day.date).getTime());

  console.log(`${days.length} day document(s) across ${groups.size} calendar day(s)`);
  console.log(`${forked.length} forked day(s), ${misaligned.length} not on UTC midnight\n`);

  for (const [key, docs] of forked) {
    console.log(`  ${key}: ${docs.length} documents (${docs.map((d) => d._id).join(", ")})`);
  }

  if (!apply) {
    console.log(forked.length || misaligned.length ? "\nDry run — pass --apply to fix." : "\nNothing to do.");
    await mongoose.disconnect();
    return;
  }

  let merged = 0;
  let movedActivities = 0;

  for (const [, docs] of forked) {
    const [keeper, ...rest] = docs;
    for (const extra of rest) movedActivities += mergeInto(keeper, extra);
    keeper.date = normalizeDayKey(keeper.date);
    await keeper.save();
    await Itinerary.deleteMany({ _id: { $in: rest.map((d) => d._id) } });
    merged += rest.length;
  }

  // Days that never forked but still sit at local midnight: the index is on the stored value, so
  // they have to move too or the same day can fork again tomorrow.
  for (const day of misaligned) {
    if (!(await Itinerary.exists({ _id: day._id }))) continue;
    const normalized = normalizeDayKey(day.date);
    if (day.date.getTime() === normalized.getTime()) continue;
    await Itinerary.updateOne({ _id: day._id }, { $set: { date: normalized } });
  }

  console.log(`\nmerged ${merged} duplicate day(s), moved ${movedActivities} activity/activities`);

  await Itinerary.collection.createIndex({ trip: 1, date: 1 }, { unique: true, name: "trip_1_date_1" });
  console.log("unique index { trip: 1, date: 1 } is in place");

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
