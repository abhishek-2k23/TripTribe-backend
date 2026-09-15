import mongoose from "mongoose";

/**
 * One document per user, bumped inside every credit reservation transaction.
 *
 * Two simultaneous reservations would otherwise both read the same balance and both succeed
 * (MongoDB snapshot isolation doesn't prevent that write skew). Writing this document in the same
 * transaction makes them conflict, so one retries and re-reads the balance.
 */
const creditAccountSchema = new mongoose.Schema(
  {
    _id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    version: { type: Number, default: 0 },
  },
  { timestamps: false, versionKey: false }
);

export default mongoose.model("CreditAccount", creditAccountSchema);
