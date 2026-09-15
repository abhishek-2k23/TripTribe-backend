// lib/ai/theme.js
//
// The trip's archetype for adaptive theming (ai-plan §3.1), stored on the trip so web and mobile
// agree. Derived from what's actually around the destination plus the season.

const TYPE_GROUPS = {
  coast: ["beach", "marina"],
  mountain: ["hiking_area", "ski_resort", "mountain_peak"],
  wild: ["national_park", "wildlife_park", "wildlife_refuge", "zoo"],
  heritage: ["hindu_temple", "historical_landmark", "museum", "monument", "historical_place", "cultural_landmark"],
  desert: ["desert"],
};

export function deriveTheme({ destination, candidates, startDate }) {
  const scores = Object.fromEntries(
    Object.entries(TYPE_GROUPS).map(([theme, types]) => [
      theme,
      candidates.filter((c) => c.types.some((type) => types.includes(type))).length,
    ])
  );

  const month = new Date(`${startDate}T00:00:00Z`).getUTCMonth() + 1;
  const inIndia = /india/i.test(destination?.address ?? "");
  // June to September is the southwest monsoon across most of India.
  if (inIndia && month >= 6 && month <= 9 && scores.desert === 0) return "monsoon";

  const [best, count] = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return count >= 3 ? best : "city";
}
