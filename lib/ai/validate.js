// lib/ai/validate.js
//
// Checks a drafted itinerary before anyone sees it (ai-plan §7.2 step 6). This is where the
// grounding rule is enforced (design.md D-037), along with the rules the JSON schema can't express.

const PACE_RANGE = { relaxed: [2, 3], balanced: [3, 4], packed: [5, 6] };
const TRAVEL_SLACK_MIN = 15;

export function toMinutes(hhmm) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? "");
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

export const sortByTime = (activities) =>
  [...activities].sort((a, b) => (toMinutes(a.time) ?? 9999) - (toMinutes(b.time) ?? 9999));

/** Google opening-hours periods: day 0 is Sunday; a period without `close` is open around the clock. */
function isOpenAt(openingHours, date, minuteOfDay) {
  const periods = openingHours?.periods;
  if (!periods?.length) return true;

  const WEEK = 7 * 1440;
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const at = weekday * 1440 + minuteOfDay;

  return periods.some((period) => {
    if (!period.open) return false;
    if (!period.close) return true;
    const start = period.open.day * 1440 + period.open.hour * 60 + (period.open.minute ?? 0);
    let end = period.close.day * 1440 + period.close.hour * 60 + (period.close.minute ?? 0);
    if (end <= start) end += WEEK;
    return (at >= start && at < end) || (at + WEEK >= start && at + WEEK < end);
  });
}

/**
 * @returns {{ valid: boolean, dayProblems: Record<string, string[]> }}
 */
export function validateItinerary({ draft, candidatesById, dayIds, pace, legMinutesByDay = {} }) {
  const dayProblems = {};
  const add = (date, message) => (dayProblems[date] ??= []).push(message);
  const seenDates = new Set();
  const [minPerDay, maxPerDay] = PACE_RANGE[pace] ?? PACE_RANGE.balanced;

  for (const day of draft.days) {
    if (!dayIds.includes(day.date)) {
      add(day.date, `${day.date} is not a day of this trip.`);
      continue;
    }
    if (seenDates.has(day.date)) add(day.date, `${day.date} appears more than once.`);
    seenDates.add(day.date);

    const isEdgeDay = day.date === dayIds[0] || day.date === dayIds[dayIds.length - 1];
    const min = Math.max(1, minPerDay - (isEdgeDay ? 1 : 0));
    if (day.activities.length < min || day.activities.length > maxPerDay) {
      add(day.date, `Has ${day.activities.length} activities; a ${pace} day here needs ${min}-${maxPerDay}.`);
    }

    const legs = legMinutesByDay[day.date] ?? [];
    let stopIndex = -1;
    let previousEnd = null;

    for (const activity of sortByTime(day.activities)) {
      const place = candidatesById.get(activity.placeId);
      if (!place) {
        add(day.date, `"${activity.title}" uses placeId ${activity.placeId}, which isn't in the candidate list.`);
        continue;
      }
      stopIndex += 1;

      const start = toMinutes(activity.time);
      if (start === null) {
        add(day.date, `"${activity.title}" has an invalid start time "${activity.time}".`);
        continue;
      }
      if (!Number.isInteger(activity.durationMin) || activity.durationMin < 10 || activity.durationMin > 720) {
        add(day.date, `"${activity.title}" has an unrealistic duration of ${activity.durationMin} minutes.`);
      }
      if (!isOpenAt(place.openingHours, day.date, start)) {
        add(day.date, `${place.name} is closed at ${activity.time} on ${day.date}.`);
      }
      if (previousEnd !== null) {
        const travel = stopIndex > 0 ? (legs[stopIndex - 1] ?? 0) : 0;
        if (start + TRAVEL_SLACK_MIN < previousEnd + travel) {
          add(
            day.date,
            `"${activity.title}" starts at ${activity.time}, before the previous stop ends plus ${travel} min of travel.`
          );
        }
      }
      previousEnd = start + (Number(activity.durationMin) || 0);
    }
  }

  for (const id of dayIds) {
    if (!seenDates.has(id)) add(id, `There's no plan for ${id}.`);
  }

  return { valid: Object.keys(dayProblems).length === 0, dayProblems };
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * The proposal's days: trip dates only, in order, activities sorted by time, unknown places
 * dropped, numbers clamped, and a place snapshot attached. Problems that remain after repair are
 * shown to members as warnings rather than failing a paid job.
 */
export function sanitizeDraft({ draft, candidatesById, dayIds, legMinutesByDay = {}, dayProblems = {} }) {
  const byDate = new Map();
  for (const day of draft.days) {
    if (dayIds.includes(day.date) && !byDate.has(day.date)) byDate.set(day.date, day);
  }

  const days = dayIds
    .filter((id) => byDate.has(id))
    .map((id) => {
      const day = byDate.get(id);
      const legs = legMinutesByDay[id] ?? [];
      const activities = sortByTime(day.activities).filter((a) => candidatesById.has(a.placeId));
      return {
        date: id,
        title: day.title,
        activities: activities.map((activity, index) => {
          const place = candidatesById.get(activity.placeId);
          return {
            placeId: activity.placeId,
            title: activity.title,
            section: activity.section,
            time: toMinutes(activity.time) === null ? null : activity.time,
            type: activity.type,
            estCostPerPerson: Math.max(0, Number(activity.estCostPerPerson) || 0),
            durationMin: clamp(Math.round(Number(activity.durationMin) || 60), 10, 720),
            notes: activity.notes,
            travelFromPreviousMin: index > 0 ? (legs[index - 1] ?? null) : null,
            place: {
              placeId: place.placeId,
              name: place.name,
              address: place.address,
              lat: place.lat,
              lng: place.lng,
            },
          };
        }),
      };
    });

  const warnings = Object.entries(dayProblems)
    .filter(([date]) => dayIds.includes(date))
    .map(([date, messages]) => ({ date, messages }));

  return { days, warnings };
}
