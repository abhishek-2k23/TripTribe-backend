// Packing and preparation suggestions for a trip. Returned for review — nothing is added to the
// checklist until a member adds items through the normal checklist route.

import { callStructured } from "../client.js";
import { loadTripSnapshot, weatherForTrip } from "../context.js";
import { PACKING_PROMPT_V1 } from "../prompts.js";
import { PACKING_SCHEMA } from "../schemas.js";
import { loadJob } from "./shared.js";

const normalize = (text) => text.toLowerCase().replace(/\s+/g, " ").trim();

export async function packingHandler({ jobId, step, runStep }) {
  const job = await loadJob(step, jobId);

  const trip = await runStep("context", async () => ({ value: await loadTripSnapshot(job.trip) }));

  const weather = await runStep("weather", async () => {
    try {
      const result = await weatherForTrip(trip);
      return { value: result.days, apiCalls: { weather: result.calls, places: result.placesCalls } };
    } catch (error) {
      // Suggestions are still useful without weather.
      console.warn(`[ai] weather unavailable for job ${jobId}:`, error.message);
      return { value: [] };
    }
  });

  const suggestion = await runStep("suggest", async () => {
    const input = {
      destination: trip.place?.name ?? trip.location,
      startDate: trip.startDate,
      endDate: trip.endDate,
      travellers: trip.memberCount,
      weather,
      activities: trip.itinerary.flatMap((day) =>
        day.activities.map((activity) => ({ date: day.date, title: activity.title, type: activity.type }))
      ),
      alreadyOnChecklist: trip.checklist.flatMap((category) => category.items),
    };
    const { data, usage } = await callStructured({
      step: "packing",
      system: PACKING_PROMPT_V1,
      messages: [{ role: "user", content: JSON.stringify(input) }],
      schema: PACKING_SCHEMA,
    });
    return { value: data, usage: [usage] };
  });

  const seen = new Set(trip.checklist.flatMap((category) => category.items.map(normalize)));
  const categories = suggestion.categories
    .map((category) => ({
      name: category.name.trim(),
      items: category.items.filter((item) => {
        const key = normalize(item.title);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
    }))
    .filter((category) => category.name && category.items.length);

  return { tripId: trip.id, categories, weather };
}
