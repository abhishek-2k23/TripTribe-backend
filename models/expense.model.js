import mongoose from "mongoose";

const splitMemberSchema = new mongoose.Schema(
{
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  share: {
    type: Number,
    required: true
  },

  isSettled: {
    type: Boolean,
    default: false
  }

},
{ _id: false }
);

const expenseSchema = new mongoose.Schema(
{

  trip: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Trip",
    required: true
  },

  title: {
    type: String,
    required: true
  },

  description: String,

  amount: {
    type: Number,
    required: true
  },

  currency: {
    type: String,
    default: "USD"
  },

  category: {
    type: String,
    enum: [
      "Food",
      "Transport",
      "Activities",
      "Shopping",
      "Hotel",
      "Other"
    ],
    default: "Other"
  },

  paidBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  recordedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  splitType: {
    type: String,
    enum: ["equally", "selected", "none"],
    default: "none"
  },

  participants: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }
  ],

  splitDetails: [splitMemberSchema],

  expenseDate: {
    type: Date,
    default: Date.now
  },

  // Idempotency key from the creating client (design.md D-021). A replayed offline write carrying
  // the same key returns the original expense instead of adding a second one.
  clientRef: {
    type: String,
    default: undefined
  }

},
{ timestamps: true }
);

// Unique per trip, and only for documents that actually carry a key — a plain `sparse` compound
// index would still index every expense that has a `trip`, which is all of them.
expenseSchema.index(
  { trip: 1, clientRef: 1 },
  { unique: true, partialFilterExpression: { clientRef: { $type: "string" } } }
);

export default mongoose.model("Expense", expenseSchema);