import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  trip: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Trip',
    required: true,
    index: true // Indexed for fast retrieval by tripId
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  text: {
    type: String,
    required: true,
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  // Idempotency key from the sending client (design.md D-021): a replayed send returns the message
  // that already exists rather than posting it twice.
  clientRef: {
    type: String,
    default: undefined
  }
}, { timestamps: true });

messageSchema.index(
  { trip: 1, clientRef: 1 },
  { unique: true, partialFilterExpression: { clientRef: { $type: "string" } } }
);

export default mongoose.model("Message", messageSchema);