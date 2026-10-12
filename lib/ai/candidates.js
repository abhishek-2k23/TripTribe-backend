// lib/ai/candidates.js
//
// Candidate places for a plan (ai-plan §7.2 step 4). The draft may only use places gathered here
// (design.md D-037), so coverage decides plan quality — within a hard cap on Places calls per job.

import { searchPlaces } from "../places.js";

export const PLACES_CALLS_PER_JOB = 25;

// Places a group doesn't schedule as activities.
const EXCLUDED_TYPES = new Set([
  "lodging",
  "hotel",
  "airport",
  "bus_station",
  "train_station",
  "transit_station",
  "gas_station",
  "hospital",
  "atm",
  "bank",
  "car_rental",
  "travel_agency",
  "real_estate_agency",
]);

// Typical visit length by place type, as a starting point the draft can adjust.
const DURATIONS = [
  [["amusement_park", "water_park", "zoo", "aquarium", "national_park", "hiking_area"], 180],
  [["beach"], 120],
  [["museum", "art_gallery", "shopping_mall", "market"], 90],
  [["restaurant", "cafe", "bar", "bakery", "meal_takeaway"], 75],
  [["park", "garden", "tourist_attraction"], 60],
  [["hindu_temple", "church", "mosque", "place_of_worship", "monument", "historical_landmark"], 45],
  [["observation_deck"], 30],
];

function typicalDuration(types) {
  for (const [list, minutes] of DURATIONS) {
    if (types.some((type) => list.includes(type))) return minutes;
  }
  return 60;
}

export async function gatherCandidates({ destination, intent, dayCount }) {
  const area = destination.name;
  const queries = [
    ...intent.mustSee.slice(0, 5).map((name) => ({ text: `${name}, ${area}`, pageSize: 3 })),
    ...intent.interests.slice(0, 6).map((interest) => ({ text: `${interest} in ${area}` })),
    { text: `top tourist attractions in ${area}` },
    { text: `best local restaurants in ${area}` },
    { text: `things to do in ${area}` },
    ...(dayCount > 3 ? [{ text: `cafes in ${area}` }, { text: `hidden gems in ${area}` }] : []),
  ];

  const limit = Math.min(80, Math.max(30, dayCount * 12));
  const byId = new Map();
  let calls = 0;

  for (const query of queries) {
    if (calls >= PLACES_CALLS_PER_JOB || byId.size >= limit) break;
    calls += 1;
    const places = await searchPlaces({ query: query.text, near: destination, pageSize: query.pageSize ?? 20 });
    for (const place of places) {
      if (byId.has(place.placeId) || place.types.some((type) => EXCLUDED_TYPES.has(type))) continue;
      if (intent.budgetBand === "budget" && (place.priceLevel ?? 0) >= 4) continue;
      byId.set(place.placeId, { ...place, durationMin: typicalDuration(place.types) });
    }
  }

  return { candidates: [...byId.values()].slice(0, limit), calls };
}

const round4 = (value) => (Number.isFinite(value) ? Math.round(value * 1e4) / 1e4 : null);

/** The candidate fields the model needs, serialized in a stable order. */
export function compactCandidates(candidates) {
  return candidates.map((c) => ({
    placeId: c.placeId,
    name: c.name,
    types: c.types.slice(0, 4),
    lat: round4(c.lat),
    lng: round4(c.lng),
    rating: c.rating ?? null,
    priceLevel: c.priceLevel ?? null,
    typicalVisitMin: c.durationMin,
    hours: c.openingHours?.weekdayDescriptions?.length ? c.openingHours.weekdayDescriptions.join("; ") : null,
  }));
}
