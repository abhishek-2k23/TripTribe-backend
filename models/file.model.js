import mongoose from "mongoose";

const fileSchema = new mongoose.Schema({
  tripId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Trip", 
    required: true, 
    index: true 
  },
  uploadedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },
  // User editable fields
  name: { type: String, required: true }, 
  category: { 
    type: String, 
    enum: ["Bookings", "Tickets", "Photos", "Guides", "General"], 
    default: "General" 
  },
  notes: { type: String, default: "" },
  
  // Cloudinary/System fields.
  // `url` is only set for public assets (legacy records and cover images). An authenticated asset
  // has no durable URL by design — clients get a short-lived signed one from lib/files.js.
  url: { type: String },
  public_id: { type: String, required: true },
  // What the signed URL has to be built with: Cloudinary files PDFs under `image`, not `raw`, so
  // these are recorded from the upload response rather than inferred from the mime type.
  resourceType: { type: String, enum: ["image", "video", "raw"], default: "image" },
  deliveryType: { type: String, enum: ["upload", "authenticated", "private"], default: "upload" },
  format: { type: String },
  fileType: { type: String }, // e.g., 'pdf', 'image/png'
  fileExtension: { type: String }, // e.g., 'pdf', 'jpg', 'xlsx'
  size: { type: Number }, // In bytes

  // Idempotency key from the uploading client (design.md D-021). The bytes are already in
  // Cloudinary by the time finalize runs, so a replayed finalize must not write a second record.
  clientRef: { type: String, default: undefined },
}, { timestamps: true });

fileSchema.index(
  { tripId: 1, clientRef: 1 },
  { unique: true, partialFilterExpression: { clientRef: { $type: "string" } } }
);

export default mongoose.model("File", fileSchema);