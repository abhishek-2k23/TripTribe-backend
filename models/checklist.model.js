import mongoose from "mongoose";

const checklistItemSchema = new mongoose.Schema({
  title: { 
    type: String, 
    required: true, 
    trim: true 
  },
  completedBy: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User"
  }]
}, { _id: true }); 

const categorySchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true, 
    trim: true 
  }, 
  items: [checklistItemSchema]
});

const checklistSchema = new mongoose.Schema({
  tripId: { 
    type: String, 
    required: true,
    index: true 
  },
  categories: [categorySchema]
}, { timestamps: true });

checklistItemSchema.pre('save', function(next) {
  if (!this.completedBy) {
    this.completedBy = [];
  }
  next();
});

export default mongoose.model("Checklist", checklistSchema);