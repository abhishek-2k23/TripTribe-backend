// lib/theme.js
//
// The trip's archetype for adaptive theming (ai-plan §3.1, UI/trip_tribe/DESIGN.md). Stored on the
// trip so web and mobile agree, and derived here because it needs data neither client has: the
// destination's place types, the travel month and the climate there.
//
// Two entry points:
//  - `deriveDestinationTheme` when a trip's destination is resolved. It knows only the destination.
//  - `deriveTheme` after an AI plan has gathered candidate places, which say far more about what the
//    trip will actually be like, so it overrides the first.

export const THEMES = ["monsoon", "mountain", "coast", "desert", "heritage", "wild", "city"];

const TYPE_GROUPS = {
  coast: ["beach", "marina"],
  mountain: ["hiking_area", "ski_resort", "mountain_peak"],
  wild: ["national_park", "wildlife_park", "wildlife_refuge", "zoo"],
  heritage: ["hindu_temple", "historical_landmark", "museum", "monument", "historical_place", "cultural_landmark"],
  desert: ["desert"],
};

/**
 * India-first destinations whose archetype is well known. Google's destination types for a town are
 * `locality, political` — they say nothing about beaches or forts — so without an AI plan, a named
 * destination is the most reliable signal there is. Matched on whole words of the place's name,
 * state or address.
 */
const KNOWN_DESTINATIONS = {
  coast: [
    "goa", "gokarna", "varkala", "kovalam", "pondicherry", "puducherry", "andaman", "havelock",
    "swaraj dweep", "neil island", "lakshadweep", "diu", "alibaug", "tarkarli", "mahabalipuram",
    "mamallapuram", "puri", "digha", "kanyakumari", "murudeshwar", "dapoli",
  ],
  mountain: [
    "manali", "shimla", "leh", "ladakh", "spiti", "kasol", "dharamshala", "mcleod ganj", "dalhousie",
    "darjeeling", "gangtok", "sikkim", "mussoorie", "nainital", "auli", "rishikesh", "munnar", "ooty",
    "udhagamandalam", "kodaikanal", "coorg", "kodagu", "madikeri", "chikmagalur", "chikkamagaluru",
    "tawang", "shillong", "cherrapunji", "sohra", "gulmarg", "pahalgam", "sonamarg", "srinagar",
    "mount abu", "lonavala", "mahabaleshwar", "wayanad",
  ],
  heritage: [
    "jaipur", "udaipur", "jodhpur", "agra", "varanasi", "hampi", "khajuraho", "mysore", "mysuru",
    "madurai", "amritsar", "orchha", "chittorgarh", "bundi", "pushkar", "bodh gaya", "aurangabad",
    "ellora", "ajanta", "thanjavur", "konark", "mahabalipuram", "badami", "fatehpur sikri", "gwalior",
  ],
  desert: ["jaisalmer", "bikaner", "kutch", "rann of kutch", "bhuj", "thar"],
  wild: [
    "ranthambore", "jim corbett", "corbett", "kaziranga", "bandhavgarh", "kanha", "pench", "tadoba",
    "gir", "sasan gir", "sundarbans", "periyar", "thekkady", "kabini", "nagarhole", "bandipur",
  ],
};

/**
 * Behind the Himalaya the southwest monsoon barely arrives. Reanalysis weather over-reads rain at
 * that altitude (Leh's July came back at ~5 mm/day), so these are named rather than measured.
 */
const RAIN_SHADOW = ["leh", "ladakh", "nubra", "pangong", "zanskar", "kargil", "spiti", "kaza", "lahaul"];

const DAY_MS = 24 * 60 * 60 * 1000;

const words = (value) =>
  ` ${(value ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;

function knownTheme(place) {
  // Name first: "Jaisalmer, Rajasthan" is a desert even though Rajasthan also holds Jaipur.
  for (const text of [place.name, place.admin1, place.address]) {
    const haystack = words(text);
    for (const [theme, names] of Object.entries(KNOWN_DESTINATIONS)) {
      if (names.some((name) => haystack.includes(` ${name} `))) return theme;
    }
  }
  return null;
}

const isIndia = (place) => /india/i.test(`${place.country ?? ""} ${place.address ?? ""}`);

const monthsOf = (startDate, endDate) => {
  const start = Date.parse(`${String(startDate).slice(0, 10)}T00:00:00Z`);
  const end = Date.parse(`${String(endDate ?? startDate).slice(0, 10)}T00:00:00Z`);
  const months = [];
  for (let t = start; t <= end && months.length < 31; t += DAY_MS) months.push(new Date(t).getUTCMonth() + 1);
  return months;
};

/** June to September is the southwest monsoon across most of India. */
const mostlyMonsoonMonths = (months) =>
  months.length > 0 && months.filter((m) => m >= 6 && m <= 9).length / months.length >= 0.5;

const average = (values) => {
  const numbers = values.filter(Number.isFinite);
  return numbers.length ? numbers.reduce((sum, n) => sum + n, 0) / numbers.length : null;
};

/**
 * @param place     the resolved destination: `{ name, address, country, admin1, types }`
 * @param startDate trip start, `YYYY-MM-DD` or a Date
 * @param endDate   trip end
 * @param climate   optional `{ days, elevation }` from lib/weather.js getDailyWeather for the trip
 */
export function deriveDestinationTheme({ place, startDate, endDate, climate }) {
  if (!place) return null;
  const types = place.types ?? [];
  const rainMm = average((climate?.days ?? []).map((day) => day.precipitationMm));
  const tempMaxC = average((climate?.days ?? []).map((day) => day.tempMaxC));
  const elevation = climate?.elevation;

  let theme =
    knownTheme(place) ??
    Object.entries(TYPE_GROUPS).find(([, group]) => types.some((type) => group.includes(type)))?.[0] ??
    (Number.isFinite(elevation) && elevation >= 1500 ? "mountain" : null) ??
    (rainMm !== null && tempMaxC !== null && rainMm < 0.5 && tempMaxC >= 36 ? "desert" : null) ??
    "city";

  // The season decides, and the climate can only veto it. "Typical" weather is one past year's same
  // dates, far too noisy to prove a place wet (Goa's July came back at 4 mm/day), but a place in the
  // rain shadow — Leh, Spiti — reads near zero every year, and a monsoon look there would be wrong.
  if (isIndia(place) && theme !== "desert" && mostlyMonsoonMonths(monthsOf(startDate, endDate))) {
    const rainShadow = [place.name, place.admin1].some((value) =>
      RAIN_SHADOW.some((name) => words(value).includes(` ${name} `))
    );
    const clearlyDry = rainShadow || (rainMm !== null && rainMm < 1);
    if (!clearlyDry) theme = "monsoon";
  }
  return theme;
}

/** After an AI plan: what the candidate places around the destination actually are. */
export function deriveTheme({ destination, candidates, startDate }) {
  const scores = Object.fromEntries(
    Object.entries(TYPE_GROUPS).map(([theme, group]) => [
      theme,
      candidates.filter((c) => c.types.some((type) => group.includes(type))).length,
    ])
  );

  const month = new Date(`${startDate}T00:00:00Z`).getUTCMonth() + 1;
  const inIndia = /india/i.test(`${destination?.country ?? ""} ${destination?.address ?? ""}`);
  if (inIndia && month >= 6 && month <= 9 && scores.desert === 0) return "monsoon";

  const [best, count] = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return count >= 3 ? best : "city";
}
