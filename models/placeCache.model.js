import mongoose from "mongoose";

/**
 * Places fetched from Google, so repeat lookups don't bill again. Google's terms allow storing
 * place IDs indefinitely but limit how long other place content may be cached — entries expire
 * after 30 days via the TTL index. Re-check the current Maps Platform terms before changing that.
 */
const placeCacheSchema = new mongoose.Schema(
  {
    placeId: { type: String, required: true, unique: true },
    name: String,
    address: String,
    lat: Number,
    lng: Number,
    types: [String],
    priceLevel: Number,
    rating: Number,
    openingHours: { type: mongoose.Schema.Types.Mixed, default: null },
    fetchedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
  },
  { timestamps: false }
);

placeCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("PlaceCache", placeCacheSchema);
