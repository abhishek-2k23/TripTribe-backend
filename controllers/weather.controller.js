// controllers/weather.controller.js
//
// Daily weather through the backend (ai-plan §4). Open-Meteo needs no key, but going through here
// gets the 3-hour cache in lib/weather.js, one place to resolve a trip's location, and the same
// forecast / "typical for the season" split the AI planner uses.

import mongoose from "mongoose";

import Trip from "../models/trip.model.js";
import { dayId, tripDayIds } from "../lib/itinerary.js";
import { QuotaExceededError } from "../lib/quota.js";
import { ensureTripPlace } from "../lib/tripPlace.js";
import { geocode, getDailyWeather } from "../lib/weather.js";
import { findMember } from "../middleware/membership.js";
import { sendQuotaExceeded } from "../middleware/quota.js";

const MAX_DAYS = 31;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const fail = (res, status, message) => res.status(status).json({ success: false, message });

/** Where a trip's weather comes from: its place, a fresh resolve, or the strict geocoder (D-061). */
async function tripLocation(trip, io) {
  const place = trip.place && Number.isFinite(trip.place.lat) ? trip.place : await ensureTripPlace(trip, { io });
  if (place) return { name: place.name, lat: place.lat, lng: place.lng, source: "place" };
  const match = await geocode(trip.location).catch(() => null);
  return match ? { name: match.name, lat: match.lat, lng: match.lng, source: "geocoder" } : null;
}

// GET /api/weather?tripId=   or   GET /api/weather?lat=&lng=&from=YYYY-MM-DD&to=YYYY-MM-DD
export const getWeather = async (req, res, next) => {
  try {
    const { tripId } = req.query;
    let location;
    let dayIds;

    if (tripId) {
      if (!mongoose.isValidObjectId(tripId)) return fail(res, 400, "Invalid trip id");
      const trip = await Trip.findById(tripId);
      if (!trip) return fail(res, 404, "Trip not found");
      if (!findMember(trip, req.user._id)) return fail(res, 403, "You are not part of this trip");

      await req.spendQuota();
      location = await tripLocation(trip, req.app.get("socketio"));
      dayIds = tripDayIds(trip.startDate, trip.endDate).slice(0, MAX_DAYS);
    } else {
      const lat = Number(req.query.lat);
      const lng = Number(req.query.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        return fail(res, 400, "Send tripId, or lat and lng");
      }
      const from = String(req.query.from ?? dayId(new Date()));
      const to = String(req.query.to ?? from);
      if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to) || to < from) {
        return fail(res, 400, "from and to must be YYYY-MM-DD, with to on or after from");
      }
      dayIds = tripDayIds(from, to);
      if (dayIds.length > MAX_DAYS) return fail(res, 400, `At most ${MAX_DAYS} days at a time`);

      await req.spendQuota();
      location = { name: null, lat, lng, source: "coordinates" };
    }

    if (!location) {
      return res.json({ success: true, data: { location: null, days: [] } });
    }

    let weather;
    try {
      weather = await getDailyWeather({ lat: location.lat, lng: location.lng, dayIds });
    } catch (error) {
      console.warn("[weather] upstream failure:", error.message);
      return fail(res, 502, "The weather service couldn't be reached. Try again later.");
    }

    res.set("Cache-Control", "private, max-age=1800");
    res.json({ success: true, data: { location: { ...location, elevation: weather.elevation }, days: weather.days } });
  } catch (error) {
    if (error instanceof QuotaExceededError) return sendQuotaExceeded(res, error);
    next(error);
  }
};
