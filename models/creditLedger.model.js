import mongoose from "mongoose";

/**
 * Append-only credits ledger (design.md D-040). A balance is the sum of `delta` per bucket.
 * `idempotencyKey` is unique, so a retried grant, hold or refund can never apply twice.
 *
 * Buckets:
 *  - `free`: the monthly grant; expires at the start of each month.
 *  - `sub`: credits from the monthly subscription; roll over up to a cap (config/products.js).
 *  - `paid`: credit packs; never expire.
 *  - `pool`: a trip's shared pool (ai-plan §8.3). Rows carry `trip`; `user` is who funded or
 *    spent it. A pool's balance is the sum over its trip, and never counts toward any user's own.
 */
const creditLedgerSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    bucket: { type: String, enum: ["free", "sub", "paid", "pool"], required: true },
    delta: { type: Number, required: true },
    reason: {
      type: String,
      enum: ["grant", "expire", "hold", "refund", "purchase", "revoke", "pool_allocate", "pool_withdraw", "adjustment"],
      required: true,
    },
    job: { type: mongoose.Schema.Types.ObjectId, ref: "AiJob", default: null },
    // Pool rows, and the personal side of an allocation or withdrawal.
    trip: { type: mongoose.Schema.Types.ObjectId, ref: "Trip", default: undefined },
    // Store purchases: the store's transaction id and product, for revokes and support.
    transactionId: { type: String, default: undefined },
    productId: { type: String, default: undefined },
    idempotencyKey: { type: String, required: true, unique: true },
    note: { type: String },
  },
  { timestamps: true }
);

creditLedgerSchema.index({ user: 1, createdAt: -1 });
creditLedgerSchema.index({ job: 1, reason: 1 });
creditLedgerSchema.index({ trip: 1, bucket: 1 }, { partialFilterExpression: { trip: { $type: "objectId" } } });
creditLedgerSchema.index({ transactionId: 1 }, { partialFilterExpression: { transactionId: { $type: "string" } } });

export default mongoose.model("CreditLedger", creditLedgerSchema);
