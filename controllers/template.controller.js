// controllers/template.controller.js
//
// Plan templates: browse, read, and clone into a real trip (ai-plan §4, Phase 11).

import Itinerary from "../models/Itinerary.model.js";
import PlanTemplate from "../models/planTemplate.model.js";
import Trip from "../models/trip.model.js";
import { normalizeDayKey } from "../lib/itinerary.js";
import { THEMES } from "../lib/theme.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const BUDGET_BANDS = ["budget", "mid", "premium"];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const fail = (res, status, message) => res.status(status).json({ success: false, message });

const LIST_FIELDS =
  "slug title summary destination.name destination.region destination.country days nights theme heroImage budgetBand estCostPerPerson bestMonths tags featured usageCount";

// GET /api/templates?theme=&days=&maxDays=&budget=&month=&featured=&limit=
export const listTemplates = async (req, res, next) => {
  try {
    const { theme, budget, featured } = req.query;
    const filter = { published: true };

    if (theme !== undefined) {
      if (!THEMES.includes(theme)) return fail(res, 400, `theme must be one of: ${THEMES.join(", ")}`);
      filter.theme = theme;
    }
    if (budget !== undefined) {
      if (!BUDGET_BANDS.includes(budget)) return fail(res, 400, `budget must be one of: ${BUDGET_BANDS.join(", ")}`);
      filter.budgetBand = budget;
    }
    if (req.query.days !== undefined) {
      const days = Number(req.query.days);
      if (!Number.isInteger(days) || days < 1) return fail(res, 400, "days must be a whole number of days");
      filter.days = days;
    } else if (req.query.maxDays !== undefined) {
      const maxDays = Number(req.query.maxDays);
      if (!Number.isInteger(maxDays) || maxDays < 1) return fail(res, 400, "maxDays must be a whole number of days");
      filter.days = { $lte: maxDays };
    }
    if (req.query.month !== undefined) {
      const month = Number(req.query.month);
      if (!Number.isInteger(month) || month < 1 || month > 12) return fail(res, 400, "month must be 1-12");
      filter.bestMonths = month;
    }
    if (featured !== undefined) filter.featured = featured === "true" || featured === "1";

    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

    const templates = await PlanTemplate.find(filter)
      .sort({ featured: -1, usageCount: -1, title: 1 })
      .limit(limit)
      .select(LIST_FIELDS)
      .lean();

    res.set("Cache-Control", "private, max-age=300");
    res.json({ success: true, count: templates.length, data: templates });
  } catch (error) {
    next(error);
  }
};

// GET /api/templates/:slug
export const getTemplate = async (req, res, next) => {
  try {
    const template = await PlanTemplate.findOne({ slug: req.params.slug, published: true })
      .select("-__v -itinerary.activities.placeQuery")
      .lean();
    if (!template) return fail(res, 404, "Template not found");
    res.set("Cache-Control", "private, max-age=300");
    res.json({ success: true, data: template });
  } catch (error) {
    next(error);
  }
};

const populateTrip = (query) =>
  query.populate([
    { path: "createdBy", select: "name email imageUrl" },
    { path: "members.user", select: "name email imageUrl" },
  ]);

/** A template's days laid onto real dates, as Itinerary documents for one trip. */
function itineraryFor(template, tripId, startMs) {
  return template.itinerary.map((day) => {
    const sections = [];
    day.activities.forEach((activity, index) => {
      let section = sections.find((s) => s.section === activity.section);
      if (!section) {
        section = { section: activity.section, activities: [] };
        sections.push(section);
      }
      const place = activity.place?.placeId
        ? {
            placeId: activity.place.placeId,
            name: activity.place.name,
            address: activity.place.address,
            lat: activity.place.lat,
            lng: activity.place.lng,
            types: activity.place.types,
            photoRef: activity.place.photoRef,
          }
        : undefined;
      section.activities.push({
        title: activity.title,
        time: activity.time,
        type: activity.type,
        location: activity.placeQuery ?? activity.place?.name,
        notes: activity.notes,
        place,
        estCost: activity.estCost,
        durationMin: activity.durationMin,
        source: "template",
        // Unique within the new trip, so a retried insert can't double a day.
        clientRef: `template:${template.slug}:${day.day}:${index}`,
      });
    });
    return {
      trip: tripId,
      date: normalizeDayKey(startMs + (day.day - 1) * DAY_MS),
      sections,
    };
  });
}

// POST /api/templates/:slug/clone   { startDate: "YYYY-MM-DD", name?, clientRef? }
export const cloneTemplate = async (req, res, next) => {
  try {
    const { startDate, name, clientRef } = req.body ?? {};
    if (!DATE_PATTERN.test(String(startDate ?? ""))) return fail(res, 400, "startDate must be YYYY-MM-DD");
    const startMs = Date.parse(`${startDate}T00:00:00Z`);
    if (Number.isNaN(startMs)) return fail(res, 400, "startDate is not a real date");
    if (name !== undefined && (typeof name !== "string" || name.trim().length > 80)) {
      return fail(res, 400, "name must be text of at most 80 characters");
    }
    if (clientRef !== undefined && (typeof clientRef !== "string" || clientRef.length > 200)) {
      return fail(res, 400, "clientRef must be a string of at most 200 characters");
    }

    const template = await PlanTemplate.findOne({ slug: req.params.slug, published: true }).lean();
    if (!template) return fail(res, 404, "Template not found");

    // A retried clone (double tap, a timeout that actually succeeded) returns the first trip.
    if (clientRef) {
      const existing = await populateTrip(Trip.findOne({ createdBy: req.user._id, clientRef }));
      if (existing) return res.status(200).json({ success: true, data: existing });
    }

    const { destination } = template;
    let trip;
    try {
      trip = await Trip.create({
        name: name?.trim() || `${destination.name} trip`,
        location:
          destination.region && destination.region !== destination.name
            ? `${destination.name}, ${destination.region}`
            : destination.name,
        description: template.summary,
        image: { url: "" },
        startDate: new Date(startMs),
        endDate: new Date(startMs + (template.days - 1) * DAY_MS),
        createdBy: req.user._id,
        members: [{ user: req.user._id, role: "owner" }],
        place: destination.place?.placeId ? destination.place : undefined,
        theme: template.theme,
        source: "template",
        templateRef: template._id,
        clientRef: clientRef || undefined,
      });
    } catch (error) {
      if (error?.code === 11000 && clientRef) {
        const existing = await populateTrip(Trip.findOne({ createdBy: req.user._id, clientRef }));
        if (existing) return res.status(200).json({ success: true, data: existing });
      }
      throw error;
    }

    try {
      await Itinerary.insertMany(itineraryFor(template, trip._id, startMs));
    } catch (error) {
      // Half a clone is worse than none: the user would see a trip with missing days.
      await Trip.deleteOne({ _id: trip._id });
      throw error;
    }

    await PlanTemplate.updateOne({ _id: template._id }, { $inc: { usageCount: 1 } });

    res.status(201).json({ success: true, data: await populateTrip(Trip.findById(trip._id)) });
  } catch (error) {
    next(error);
  }
};
