import mongoose from "mongoose";

/**
 * An AI-drafted plan for a trip. It never changes the itinerary by itself: members review it and
 * accept activities, which are then written through the normal add-activity path (design.md D-037).
 */
const placeSnapshotSchema = new mongoose.Schema(
  {
    placeId: String,
    name: String,
    address: String,
    lat: Number,
    lng: Number,
  },
  { _id: false }
);

const proposedActivitySchema = new mongoose.Schema({
  placeId: { type: String, required: true },
  title: { type: String, required: true },
  section: { type: String },
  time: { type: String },
  type: {
    type: String,
    enum: ["Flight", "Hotel", "Food", "Sightseeing", "Activity", "Shopping", "Transport", "Other"],
    default: "Activity",
  },
  estCostPerPerson: { type: Number, default: 0 },
  durationMin: { type: Number },
  notes: { type: String },
  travelFromPreviousMin: { type: Number, default: null },
  place: { type: placeSnapshotSchema },
});

const proposedDaySchema = new mongoose.Schema(
  {
    date: { type: String, required: true }, // YYYY-MM-DD
    title: { type: String },
    activities: [proposedActivitySchema],
  },
  { _id: false }
);

const warningSchema = new mongoose.Schema(
  {
    date: String,
    messages: [String],
  },
  { _id: false }
);

const decisionSchema = new mongoose.Schema(
  {
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    action: { type: String, enum: ["accept", "reject"], required: true },
    activityIds: [{ type: mongoose.Schema.Types.ObjectId }],
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const itineraryProposalSchema = new mongoose.Schema(
  {
    trip: { type: mongoose.Schema.Types.ObjectId, ref: "Trip", required: true },
    job: { type: mongoose.Schema.Types.ObjectId, ref: "AiJob" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    request: { type: String, default: "" },
    summary: { type: String, default: "" },
    pace: { type: String },
    days: [proposedDaySchema],
    gaps: [String],
    warnings: [warningSchema],
    weather: { type: mongoose.Schema.Types.Mixed, default: [] },
    budgetEstimate: { type: mongoose.Schema.Types.Mixed, default: null },
    status: {
      type: String,
      enum: ["pending", "partially_accepted", "accepted", "rejected"],
      default: "pending",
    },
    acceptedActivityIds: [{ type: mongoose.Schema.Types.ObjectId }],
    decisions: [decisionSchema],
  },
  { timestamps: true }
);

itineraryProposalSchema.index({ trip: 1, createdAt: -1 });

export default mongoose.model("ItineraryProposal", itineraryProposalSchema);
