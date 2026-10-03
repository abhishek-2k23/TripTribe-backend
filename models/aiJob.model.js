import mongoose from "mongoose";

/**
 * One AI action — a chat reply, a packing list, a receipt scan or a trip plan — run as a background
 * job. `steps` drives the progress UI; `usage` and `apiCalls` are the cost record (ai-plan §11).
 */
const stepSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String },
    status: { type: String, enum: ["pending", "running", "done", "skipped", "failed"], default: "pending" },
    startedAt: Date,
    finishedAt: Date,
  },
  { _id: false }
);

const usageSchema = new mongoose.Schema(
  {
    step: String,
    model: String,
    input_tokens: Number,
    output_tokens: Number,
    cache_creation_input_tokens: Number,
    cache_read_input_tokens: Number,
    stop_reason: String,
    at: Date,
  },
  { _id: false }
);

const aiJobSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    kind: { type: String, enum: ["chat", "packing", "receipt", "plan"], required: true },
    status: {
      type: String,
      enum: ["queued", "running", "succeeded", "failed", "cancelled"],
      default: "queued",
    },
    trip: { type: mongoose.Schema.Types.ObjectId, ref: "Trip", default: null },
    thread: { type: mongoose.Schema.Types.ObjectId, ref: "AiThread", default: null },
    input: { type: mongoose.Schema.Types.Mixed, default: {} },
    cost: { type: Number, required: true },
    // Whose credits paid: the requester's own, or the trip's shared pool (ai-plan §8.3).
    fundedBy: { type: String, enum: ["user", "pool"], default: "user" },
    steps: [stepSchema],
    result: { type: mongoose.Schema.Types.Mixed, default: null },
    proposal: { type: mongoose.Schema.Types.ObjectId, ref: "ItineraryProposal", default: null },
    usage: [usageSchema],
    apiCalls: {
      places: { type: Number, default: 0 },
      routes: { type: Number, default: 0 },
      weather: { type: Number, default: 0 },
    },
    error: {
      code: String,
      message: String,
    },
    cancelRequested: { type: Boolean, default: false },
    startedAt: Date,
    finishedAt: Date,
  },
  { timestamps: true }
);

aiJobSchema.index({ user: 1, createdAt: -1 });
aiJobSchema.index({ status: 1, updatedAt: 1 });
aiJobSchema.index({ trip: 1, kind: 1, status: 1 });

export default mongoose.model("AiJob", aiJobSchema);
