import mongoose from "mongoose"
import crypto from "crypto"

const memberSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    role: {
      type: String,
      enum: ["owner", "editor", "viewer"],
      default: "viewer",
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
)

const tripSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    location: {
      type: String,
      required: true,
    },
    description: String,
    image: {
      url: String,
      public_id: String,
    },

    inviteCode: {
      type: String,
      unique: true,
      index: true,
    },

    members: [memberSchema],

    startDate: {
      type: Date,
      required: true,
    },

    endDate: {
      type: Date,
      required: true,
    },
    
    budget: {
      total: { type: Number, default: 6000 },
      currency: { type: String, default: "INR" },
      categories: {
        Food: { type: Number, default: 1000 },
        Transport: { type: Number, default: 1000 },
        Activities: { type: Number, default: 1000 },
        Hotel: { type: Number, default: 1000 },
        Shopping: { type: Number, default: 1000 },
        Other: { type: Number, default: 1000 },
      }
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Structured destination beside the free-text `location` (ai-plan §3.1). `location` stays what
    // people see; `place` is resolved from it lazily (lib/tripPlace.js), or set directly when a trip
    // is created from a template.
    place: {
      type: new mongoose.Schema(
        {
          placeId: String,
          name: String,
          address: String,
          lat: Number,
          lng: Number,
          country: String,
          admin1: String,
          types: [String],
        },
        { _id: false }
      ),
      default: undefined,
    },
    theme: {
      type: String,
      enum: ["monsoon", "mountain", "coast", "desert", "heritage", "wild", "city"],
      default: undefined,
    },
    // When the server last tried to resolve `place` from `location`. A location Google can't match
    // is retried weekly at most, not on every open (lib/tripPlace.js).
    placeLookupAt: { type: Date, default: undefined },
    source: { type: String, enum: ["manual", "ai", "template"], default: undefined },
    templateRef: { type: mongoose.Schema.Types.ObjectId, ref: "PlanTemplate", default: undefined },
    // Idempotency key for a create that can be retried (template clone); unique per creator.
    clientRef: { type: String, default: undefined },
  },
  { timestamps: true },
)

tripSchema.index(
  { createdBy: 1, clientRef: 1 },
  { unique: true, partialFilterExpression: { clientRef: { $type: "string" } } },
)

// Generate invite code automatically
tripSchema.pre("save", function (next) {
  if (!this.inviteCode) {
    this.inviteCode = crypto.randomBytes(4).toString("hex")
  }
  next()
})

tripSchema.pre("validate", function (next) {
  if (this.startDate && this.endDate) {
    if (this.endDate < this.startDate) {
      next(new Error("End date cannot be before start date"))
    }
  }
  next()
})

export default mongoose.model("Trip", tripSchema)
