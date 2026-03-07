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
  
  // Cloudinary/System fields
  url: { type: String, required: true },
  public_id: { type: String, required: true },
  fileType: { type: String }, // e.g., 'pdf', 'image/png'
  fileExtension: { type: String }, // e.g., 'pdf', 'jpg', 'xlsx'
  size: { type: Number }, // In bytes
}, { timestamps: true });

export default mongoose.model("File", fileSchema);