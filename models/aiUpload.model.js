import mongoose from "mongoose";

/**
 * A receipt image waiting to be read. Deleted as soon as the job reads it, and expired by a TTL
 * index after an hour regardless — receipt images are not kept (design.md D-036).
 */
const aiUploadSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    job: { type: mongoose.Schema.Types.ObjectId, ref: "AiJob", required: true, index: true },
    mimeType: { type: String, required: true },
    data: { type: Buffer, required: true },
    expiresAt: { type: Date, default: () => new Date(Date.now() + 60 * 60 * 1000) },
  },
  { timestamps: true }
);

aiUploadSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("AiUpload", aiUploadSchema);
