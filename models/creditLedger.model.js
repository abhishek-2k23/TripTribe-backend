import mongoose from "mongoose";

/**
 * Append-only credits ledger (design.md D-040). A balance is the sum of `delta` per bucket.
 * `idempotencyKey` is unique, so a retried grant, hold or refund can never apply twice.
 *
 * Buckets: `free` is the monthly grant and expires at the start of each month; `paid` is for
 * store purchases (Phase 14) and never expires.
 */
const creditLedgerSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    bucket: { type: String, enum: ["free", "paid"], required: true },
    delta: { type: Number, required: true },
    reason: {
      type: String,
      enum: ["grant", "expire", "hold", "refund", "purchase", "adjustment"],
      required: true,
    },
    job: { type: mongoose.Schema.Types.ObjectId, ref: "AiJob", default: null },
    idempotencyKey: { type: String, required: true, unique: true },
    note: { type: String },
  },
  { timestamps: true }
);

creditLedgerSchema.index({ user: 1, createdAt: -1 });
creditLedgerSchema.index({ job: 1, reason: 1 });

export default mongoose.model("CreditLedger", creditLedgerSchema);
