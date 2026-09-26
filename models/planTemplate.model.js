// models/planTemplate.model.js
//
// A pre-made itinerary people browse and clone into a real trip (ai-plan §2 row 5, §3.3). Templates
// solve the cold start — a new user with no trips has something to look at on day one — and give
// the AI planner a grounded starting point later.
//
// Days are relative ("day 2"), not dated; a clone lays them onto the dates the user picks. Places
// are resolved to Google place IDs by scripts/seed-templates.js --resolve, never typed in by hand:
// the same grounding rule as the AI planner (design.md D-037).

import mongoose from "mongoose";

import { THEMES } from "../lib/theme.js";

const ACTIVITY_TYPES = ["Flight", "Hotel", "Food", "Sightseeing", "Activity", "Shopping", "Transport", "Other"];

const placeSchema = new mongoose.Schema(
  {
    placeId: String,
    name: String,
    address: String,
    lat: Number,
    lng: Number,
    country: String,
    admin1: String,
    types: { type: [String], default: undefined },
    photoRef: String,
  },
  { _id: false }
);

const templateActivitySchema = new mongoose.Schema(
  {
    section: { type: String, enum: ["Morning", "Afternoon", "Evening", "Night"], required: true },
    time: { type: String, match: /^\d{2}:\d{2}$/ },
    title: { type: String, required: true },
    type: { type: String, enum: ACTIVITY_TYPES, default: "Activity" },
    // What the seed script searches for; kept so a place can be re-resolved after it closes or moves.
    placeQuery: String,
    place: { type: placeSchema, default: undefined },
    durationMin: Number,
    estCost: Number, // per person, INR
    notes: String,
  },
  { _id: false }
);

const templateDaySchema = new mongoose.Schema(
  {
    day: { type: Number, required: true, min: 1 },
    title: String,
    activities: [templateActivitySchema],
  },
  { _id: false }
);

const planTemplateSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ },
    title: { type: String, required: true },
    summary: String,
    destination: {
      name: { type: String, required: true },
      query: String,
      region: String,
      country: { type: String, default: "India" },
      place: { type: placeSchema, default: undefined },
    },
    days: { type: Number, required: true, min: 1, max: 30 },
    nights: { type: Number, min: 0 },
    theme: { type: String, enum: THEMES, required: true },
    // A destination photo from Places, shown through the photo proxy with its attributions.
    heroImage: {
      type: new mongoose.Schema(
        {
          photoRef: String,
          attributions: [{ name: String, uri: String, _id: false }],
        },
        { _id: false }
      ),
      default: undefined,
    },
    budgetBand: { type: String, enum: ["budget", "mid", "premium"], required: true },
    estCostPerPerson: Number, // INR on the ground, excluding travel to the destination
    bestMonths: [{ type: Number, min: 1, max: 12 }],
    tags: [String],
    itinerary: [templateDaySchema],
    featured: { type: Boolean, default: false },
    // Unpublished templates stay out of listings but keep any trips cloned from them working.
    published: { type: Boolean, default: true },
    usageCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

planTemplateSchema.index({ featured: 1, theme: 1 });
planTemplateSchema.index({ published: 1, usageCount: -1 });

export default mongoose.model("PlanTemplate", planTemplateSchema);
