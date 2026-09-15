// lib/weather.js
//
// Daily weather from Open-Meteo — free, no API key. Dates inside the forecast window get the
// forecast; dates further out get the same dates a year earlier from the historical archive, as a
// "typical for this time of year" outlook. Responses are cached in memory for 3 hours.

import { dayId } from "./itinerary.js";

const CACHE_TTL_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const cache = new Map();

const WEATHER_CODES = {
  0: "Clear",
  1: "Mostly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  56: "Freezing drizzle",
  57: "Freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Light showers",
  81: "Showers",
  82: "Violent showers",
  85: "Snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Thunderstorm with hail",
};
const SEVERE_CODES = new Set([65, 67, 75, 82, 86, 95, 96, 99]);

async function fetchJson(url) {
  const hit = cache.get(url);
  if (hit && hit.expires > Date.now()) return hit.data;

  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) {
    const error = new Error(`Weather service responded ${response.status}`);
    error.retryable = response.status === 429 || response.status >= 500;
    throw error;
  }
  const data = await response.json();
  cache.set(url, { data, expires: Date.now() + CACHE_TTL_MS });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return data;
}

const normalizeName = (value) =>
  (value ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

const MAJOR_FEATURE_CODES = new Set(["PPLC", "PPLA"]);
const MAJOR_POPULATION = 100_000;

/**
 * Place-name lookup for trips without a resolved destination (no Google Maps key).
 *
 * Open-Meteo's geocoder indexes populated places, not states or regions, and many Indian names are
 * shared by small villages: "Goa, India" returns a village in Rajasthan, "Manali" ranks a Tamil
 * Nadu suburb above the hill station, and "Coorg" returns nothing. Wrong weather is worse than
 * none, so a result is accepted only when its name matches exactly and either the query names its
 * state, or it's a capital or a city of 100k+ people in the country the query names. Otherwise null.
 */
export async function geocode(query) {
  const [name, ...context] = (query ?? "").split(",").map((part) => part.trim()).filter(Boolean);
  if (!name) return null;

  const params = new URLSearchParams({ name, count: "20", language: "en", format: "json" });
  const data = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
  const exact = (data.results ?? []).filter((r) => normalizeName(r.name) === normalizeName(name));

  const contextNames = context.map(normalizeName);
  const mentioned = (value) => Boolean(value) && contextNames.includes(normalizeName(value));

  const inNamedState = exact.find((r) => mentioned(r.admin1));
  const majorCity = exact.find(
    (r) =>
      (MAJOR_FEATURE_CODES.has(r.feature_code) || (r.population ?? 0) >= MAJOR_POPULATION) &&
      (contextNames.length === 0 || mentioned(r.country) || mentioned(r.admin1))
  );

  const match = inNamedState ?? majorCity;
  return match
    ? { name: match.name, lat: match.latitude, lng: match.longitude, country: match.country ?? null }
    : null;
}

const shiftDays = (id, days) => new Date(Date.parse(`${id}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

const yearEarlier = (id) => {
  const date = new Date(`${id}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() - 1);
  return date.toISOString().slice(0, 10);
};

function toDay(date, source, daily, index) {
  const code = daily.weather_code?.[index] ?? null;
  const tempMaxC = daily.temperature_2m_max?.[index] ?? null;
  const precipitationMm = daily.precipitation_sum?.[index] ?? null;
  return {
    date,
    source,
    summary: WEATHER_CODES[code] ?? "Mixed",
    tempMaxC,
    tempMinC: daily.temperature_2m_min?.[index] ?? null,
    precipitationMm,
    rainChancePct: daily.precipitation_probability_max?.[index] ?? null,
    severe: SEVERE_CODES.has(code) || (precipitationMm ?? 0) >= 25 || (tempMaxC ?? 0) >= 38,
  };
}

/** Weather per trip day: `{ days, calls }`. Days with no data come back with `source: "unavailable"`. */
export async function getDailyWeather({ lat, lng, dayIds }) {
  if (!dayIds.length || !Number.isFinite(lat) || !Number.isFinite(lng)) return { days: [], calls: 0 };

  const today = dayId(new Date());
  const forecastFrom = shiftDays(today, -60);
  const forecastTo = shiftDays(today, 15);
  const inForecast = dayIds.filter((id) => id >= forecastFrom && id <= forecastTo);
  const outside = dayIds.filter((id) => !inForecast.includes(id));

  const byDate = new Map();
  const location = { latitude: lat.toFixed(4), longitude: lng.toFixed(4), timezone: "auto" };
  let calls = 0;

  if (inForecast.length) {
    calls += 1;
    const params = new URLSearchParams({
      ...location,
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max",
      start_date: inForecast[0],
      end_date: inForecast[inForecast.length - 1],
    });
    const data = await fetchJson(`https://api.open-meteo.com/v1/forecast?${params}`);
    (data.daily?.time ?? []).forEach((date, index) => {
      if (inForecast.includes(date)) byDate.set(date, toDay(date, "forecast", data.daily, index));
    });
  }

  if (outside.length) {
    // Future dates beyond the forecast map to the same dates last year; long-past dates use themselves.
    const referenceOf = new Map(outside.map((id) => [id > today ? yearEarlier(id) : id, id]));
    const references = [...referenceOf.keys()].sort();
    calls += 1;
    const params = new URLSearchParams({
      ...location,
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum",
      start_date: references[0],
      end_date: references[references.length - 1],
    });
    const data = await fetchJson(`https://archive-api.open-meteo.com/v1/archive?${params}`);
    (data.daily?.time ?? []).forEach((reference, index) => {
      const date = referenceOf.get(reference);
      if (date) byDate.set(date, toDay(date, date > today ? "typical" : "observed", data.daily, index));
    });
  }

  return {
    days: dayIds.map((id) => byDate.get(id) ?? { date: id, source: "unavailable" }),
    calls,
  };
}
