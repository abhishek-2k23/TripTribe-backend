import mongoose from "mongoose";

/** A conversation with the AI assistant. Optionally linked to a trip, whose details give it context. */
const aiThreadSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    trip: { type: mongoose.Schema.Types.ObjectId, ref: "Trip", default: null },
    title: { type: String, trim: true, default: "New conversation" },
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

aiThreadSchema.index({ user: 1, lastMessageAt: -1 });

export default mongoose.model("AiThread", aiThreadSchema);
