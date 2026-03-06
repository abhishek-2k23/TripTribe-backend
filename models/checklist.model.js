import mongoose from "mongoose";

const checklistItemSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  isCompleted: { type: Boolean, default: false },
  // Reference to the user for the avatar display in your UI
  completedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User",
    default: null 
  }
});

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true }, // e.g., "Packing List"
  items: [checklistItemSchema]
});

const checklistSchema = new mongoose.Schema({
  tripId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Trip", 
    required: true,
    index: true 
  },
  categories: [categorySchema]
}, { timestamps: true });

export default mongoose.model("Checklist", checklistSchema);