
import mongoose from "mongoose";

const activitySchema = new mongoose.Schema({
  title: { type: String, required: true },
  time: String,
  location: String,
  type: { 
    type: String, 
    enum: ["Flight", "Hotel", "Food", "Sightseeing", "Activity", "Shopping", "Transport", "Other"],
    default: "Activity" 
  },
  notes: String, // Matches your "This is new activity" field
  attachment: { type: String, default: null },
  isDone: { type: Boolean, default: false },
  // Structured place, when the activity came from a place search or an AI plan (ai-plan §3.2).
  place: {
    type: new mongoose.Schema(
      { placeId: String, name: String, address: String, lat: Number, lng: Number },
      { _id: false }
    ),
    default: undefined,
  },
  estCost: Number, // per person, trip currency
  durationMin: Number,
  source: { type: String, enum: ["manual", "ai"], default: "manual" },
  // Idempotency key from the creating client or AI accept; a repeat create returns the original.
  clientRef: { type: String, default: undefined },
  // Internal discussion/comments array
  comments: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    text: String,
    createdAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

const itinerarySchema = new mongoose.Schema({
  trip: { type: mongoose.Schema.Types.ObjectId, ref: "Trip", required: true },
  date: { type: Date, required: true },
  // Each day has multiple "sections" (e.g., "Golden Pavilion Visit")
  sections: [{
    section: { type: String, required: true }, 
    activities: [activitySchema]
  }]
}, { timestamps: true });

// Day lookups match a date window (see lib/itinerary.js), so this index serves them, and it is
// unique so a trip can only ever hold one document per stored day key (design.md D-013).
//
// It only bites once the stored keys are normalized: days written by the web sit at local midnight,
// so two shapes of the same calendar day are still two different values. scripts/dedupe-itinerary-days.js
// merges any forks and moves every day onto UTC midnight; run it before trusting this index.
itinerarySchema.index({ trip: 1, date: 1 }, { unique: true });
itinerarySchema.index({ "sections.activities.clientRef": 1 }, { sparse: true });

export default mongoose.model("Itinerary", itinerarySchema);