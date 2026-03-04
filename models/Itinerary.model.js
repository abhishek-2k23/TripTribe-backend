
import mongoose from "mongoose";

const activitySchema = new mongoose.Schema({
  title: { type: String, required: true },
  time: String,
  location: String,
  type: { 
    type: String, 
    enum: ["Flight", "Hotel", "Food", "Sightseeing", "Activity", "Shopping", "Transport", "Other"],
    default: "Activity" 
  },
  notes: String, // Matches your "This is new activity" field
  attachment: { type: String, default: null },
  isDone: { type: Boolean, default: false },
  // Internal discussion/comments array
  comments: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    text: String,
    createdAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

const itinerarySchema = new mongoose.Schema({
  trip: { type: mongoose.Schema.Types.ObjectId, ref: "Trip", required: true },
  date: { type: Date, required: true },
  // Each day has multiple "sections" (e.g., "Golden Pavilion Visit")
  sections: [{
    section: { type: String, required: true }, 
    activities: [activitySchema]
  }]
}, { timestamps: true });

export default mongoose.model("Itinerary", itinerarySchema);