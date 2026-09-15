import mongoose from "mongoose";

const aiMessageSchema = new mongoose.Schema(
  {
    thread: { type: mongoose.Schema.Types.ObjectId, ref: "AiThread", required: true },
    // The thread owner, on both sides of the conversation — so export and deletion find everything.
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: { type: String, required: true },
    suggestions: [{ type: String }],
    job: { type: mongoose.Schema.Types.ObjectId, ref: "AiJob", default: null },
  },
  { timestamps: true }
);

aiMessageSchema.index({ thread: 1, createdAt: 1 });

export default mongoose.model("AiMessage", aiMessageSchema);
