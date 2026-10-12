// models/tripRevision.model.js
//
// One counter per trip section (design.md D-010).
//
// Socket events delivered while a client is disconnected are simply gone, and six writes emitted
// nothing at all. Rather than poll — which is dead weight in the background, where iOS suspends the
// timer anyway, and multiplies rate-limit pressure — each write bumps a counter, and a client
// compares counters once on reconnect and once on foreground. Only the sections whose number moved
// are refetched.

import mongoose from "mongoose";

/** The units a client refetches independently. */
export const TRIP_SECTIONS = [
  "trip",
  "members",
  "itinerary",
  "expenses",
  "budget",
  "checklist",
  "discussion",
  "files",
];

const sectionCounters = TRIP_SECTIONS.reduce(
  (fields, section) => ({ ...fields, [section]: { type: Number, default: 0 } }),
  {}
);

const tripRevisionSchema = new mongoose.Schema(
  {
    trip: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Trip",
      required: true,
      unique: true,
      index: true,
    },
    sections: new mongoose.Schema(sectionCounters, { _id: false }),
  },
  { timestamps: true }
);

export default mongoose.model("TripRevision", tripRevisionSchema);
