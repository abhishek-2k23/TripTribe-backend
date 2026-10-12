// models/usageCounter.model.js
//
// One counter per user, quota bucket and UTC day (config/quotas.js). Kept in MongoDB rather than
// memory so a restart or a second instance doesn't hand everyone a fresh allowance. Rows expire two
// days after the day they count.

import mongoose from "mongoose";

const usageCounterSchema = new mongoose.Schema(
  {
    // `${userId}:${bucket}:${YYYY-MM-DD}` — unique, so the conditional upsert in lib/quota.js is atomic.
    key: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    bucket: { type: String, required: true },
    day: { type: String, required: true },
    count: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: false }
);

usageCounterSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("UsageCounter", usageCounterSchema);
