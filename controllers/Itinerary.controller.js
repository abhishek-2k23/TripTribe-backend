import Itinerary from "../models/Itinerary.model.js";
export const addActivity = async (req, res, next) => {
  try {
    const { tripId, section, date, title, time, location, type, notes, attachment } = req.body;
    const newActivity = { title, time, location, type, notes, attachment };

    // 1. Try to find the day first
    let dayPlan = await Itinerary.findOne({ 
        trip: tripId, 
        date: new Date(date) 
    });

    if (!dayPlan) {
      // CASE 1: Completely new day. Create Day -> Section -> Activity.
      dayPlan = await Itinerary.create({
        trip: tripId,
        date: new Date(date),
        sections: [{ section, activities: [newActivity] }]
      });
    } else {
      // CASE 2: Day exists. Check if the Section (e.g., "Golden Pavilion Visit") exists.
      const existingSection = dayPlan.sections.find(s => s.section === section);

      if (existingSection) {
        // Sub-case A: Section exists, just push the new activity into it.
        existingSection.activities.push(newActivity);
      } else {
        // Sub-case B: It's a new section for an existing day.
        dayPlan.sections.push({ section, activities: [newActivity] });
      }
      
      await dayPlan.save();
    }

    const io = req.app.get("socketio");
      const roomName = tripId.toString(); 

      console.log(`Emitting activity_added to room: ${roomName}`);
      io.to(tripId).emit("activity_added", dayPlan);

    res.status(201).json({
      success: true,
      message: "Activity added successfully",
      data: dayPlan
    });
  } catch (error) {
    next(error);
  }
};

export const toggleActivityStatus = async (req, res, next) => {
  try {
    const { itineraryId, activityId, isDone, tripId } = req.body;

    const updated = await Itinerary.findOneAndUpdate(
      { _id: itineraryId, "sections.activities._id": activityId },
      { $set: { "sections.$[].activities.$[act].isDone": isDone } },
      { 
        arrayFilters: [{ "act._id": activityId }],
        new: true 
      }
    ).populate("sections.activities.comments.user", "name imageUrl");

    // Emit to Socket Room
    const io = req.app.get("socketio");
    io.to(tripId).emit("activity_updated", updated);

    res.status(200).json({ success: true, data: updated });
  } catch (error) { next(error); }
};

export const addActivityComment = async (req, res, next) => {
  try {
    const { itineraryId, activityId, text } = req.body;
    
    const newComment = {
      user: req.user._id,
      text,
      createdAt: new Date()
    };

    const updated = await Itinerary.findOneAndUpdate(
      { _id: itineraryId, "sections.activities._id": activityId },
      { $push: { "sections.$[].activities.$[act].comments": newComment } },
      { 
        arrayFilters: [{ "act._id": activityId }],
        new: true 
      }
    ).populate("sections.activities.comments.user", "name imageUrl");

    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

export const deleteActivity = async (req, res, next) => {
  try {
    const { itineraryId, activityId, tripId } = req.params; // Ensure tripId is passed or fetched

    const result = await Itinerary.findOneAndUpdate(
      { _id: itineraryId },
      { $pull: { "sections.$[].activities": { _id: activityId } } },
      { new: true } // Return the updated day plan
    ).populate("sections.activities.comments.user", "name imageUrl");

    if (!result) return res.status(404).json({ success: false });

    // Emit to Socket Room
    const io = req.app.get("socketio");
    io.to(tripId).emit("activity_deleted", { itineraryId, activityId });

    res.status(200).json({ success: true, data: result });
  } catch (error) { next(error); }
};


export const getTripItinerary = async (req, res, next) => {
  try {
    const { tripId } = req.params;
    console.log(tripId);

    const itinerary = await Itinerary.find({ trip: tripId })
      .sort({ date: 1 }) 
      .populate({
        path: "sections.activities.comments.user",
        select: "name imageUrl"
      });

    if (!itinerary) {
      return res.status(200).json({
        success: true,
        data: [],
        message: "No itinerary found for this trip."
      });
    }

    const sectionTitles = new Set();
    
    itinerary.forEach(day => {
      day.sections.forEach(sec => {
        if (sec.section) {
          sectionTitles.add(sec.section);
        }
      });
    });

    res.status(200).json({
      success: true,
      count: itinerary.length,
      data: {
        itinerary: itinerary,             
        existingSections: Array.from(sectionTitles)} 
      });
  } catch (error) {
    console.error("Error fetching itinerary:", error);
    next(error);
  }
};