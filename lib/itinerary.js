// lib/itinerary.js
//
// Adding activities, shared by the itinerary route and the AI proposal accept flow.
//
// Day keys (ai-plan §5.2, design.md D-013). One `Itinerary` document holds one calendar day, keyed
// by `date`. Clients have written that key in different shapes: the web stores local midnight
// (18:30Z the previous UTC day, from IST), mobile stores UTC midnight. Matching `date` exactly forks
// a day into two documents. So a date is normalized to the nearest UTC midnight — which maps both
// shapes to the same calendar day for any timezone within ±12h — and an existing document is found
// anywhere in the 24-hour window around that key, so historical local-midnight days keep working.

import Itinerary from "../models/Itinerary.model.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const HALF_DAY_MS = DAY_MS / 2;

export function normalizeDayKey(value) {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) {
    const error = new Error("Invalid date");
    error.statusCode = 400;
    throw error;
  }
  return new Date(Math.round(time / DAY_MS) * DAY_MS);
}

/** `YYYY-MM-DD` for the calendar day a stored or submitted date represents. */
export const dayId = (value) => normalizeDayKey(value).toISOString().slice(0, 10);

/** Every calendar day of a trip, inclusive, as `YYYY-MM-DD`. */
export function tripDayIds(startDate, endDate) {
  const start = normalizeDayKey(startDate).getTime();
  const end = normalizeDayKey(endDate).getTime();
  const ids = [];
  for (let t = start; t <= end; t += DAY_MS) ids.push(new Date(t).toISOString().slice(0, 10));
  return ids;
}

export function findDay(tripId, dateInput) {
  const key = normalizeDayKey(dateInput).getTime();
  return Itinerary.findOne({
    trip: tripId,
    date: { $gte: new Date(key - HALF_DAY_MS), $lt: new Date(key + HALF_DAY_MS) },
  }).sort({ createdAt: 1 });
}

const ACTIVITY_FIELDS = [
  "title",
  "time",
  "location",
  "type",
  "notes",
  "attachment",
  "place",
  "estCost",
  "durationMin",
  "source",
  "clientRef",
];

/** The activity fields a client may set, ignoring everything else in the body. */
export function pickActivityFields(input) {
  const activity = {};
  for (const field of ACTIVITY_FIELDS) {
    if (input[field] !== undefined && input[field] !== "") activity[field] = input[field];
  }
  return activity;
}

/**
 * Adds one activity to a trip day, creating the day or section as needed.
 * With a `clientRef` that already exists in the trip, returns the original instead (`created: false`).
 */
export async function addActivityToDay({ tripId, date, section, activity }) {
  if (activity.clientRef) {
    const existing = await Itinerary.findOne({
      trip: tripId,
      "sections.activities.clientRef": activity.clientRef,
    });
    if (existing) return { dayPlan: existing, created: false };
  }

  let dayPlan = await findDay(tripId, date);

  if (!dayPlan) {
    dayPlan = await Itinerary.create({
      trip: tripId,
      date: normalizeDayKey(date),
      sections: [{ section, activities: [activity] }],
    });
    return { dayPlan, created: true };
  }

  const existingSection = dayPlan.sections.find((s) => s.section === section);
  if (existingSection) existingSection.activities.push(activity);
  else dayPlan.sections.push({ section, activities: [activity] });

  await dayPlan.save();
  return { dayPlan, created: true };
}
