import Itinerary from "../models/Itinerary.model.js";
import { addActivityToDay, groundActivityPlace, pickActivityFields } from "../lib/itinerary.js";
import { refreshItineraryPlaces } from "../lib/placeFreshness.js";
import { bumpRevisionFor } from "../lib/revisions.js";

// Membership is checked by requireTripMember before this runs, so req.trip is the verified trip.
export const addActivity = async (req, res, next) => {
  try {
    const { section, date, title } = req.body;
    if (!section || !date || !title) {
      return res.status(400).json({ success: false, message: "section, date and title are required" });
    }

    const tripId = req.trip._id;
    const activity = pickActivityFields(req.body);
    // Clients may only create manual activities; "ai" and "template" are set by the server.
    delete activity.source;
    const place = await groundActivityPlace(req.body.place);
    if (place) activity.place = place;
    else delete activity.place;

    const { dayPlan, created } = await addActivityToDay({ tripId, date, section, activity });

    // A repeat of an already-created activity (same clientRef) changes nothing, so nothing is emitted.
    if (created) {
      const io = req.app.get("socketio");
      io?.to(tripId.toString()).emit("activity_added", dayPlan);
      await bumpRevisionFor(req, tripId, "itinerary");
    }

    res.status(created ? 201 : 200).json({
      success: true,
      message: created ? "Activity added successfully" : "Activity was already added",
      data: dayPlan
    });
  } catch (error) {
    next(error);
  }
};

export const toggleActivityStatus = async (req, res, next) => {
  try {
    const { itineraryId, activityId, isDone } = req.body;
    const tripId = req.trip._id.toString();

    // "Make it so", never "flip it" (design.md D-022). A flip replayed twice from an offline queue
    // undoes itself; an explicit value replayed any number of times lands on the same state.
    // It was also previously possible to write `undefined` into the field by omitting it.
    if (typeof isDone !== "boolean") {
      return res.status(400).json({ success: false, message: "isDone must be true or false" });
    }

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
    await bumpRevisionFor(req, tripId, "itinerary");

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

    // A comment emits no socket event of its own, so the revision bump is the only thing that tells
    // a reconnecting client the itinerary moved (design.md D-010).
    await bumpRevisionFor(req, req.trip._id, "itinerary");

    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

export const deleteActivity = async (req, res, next) => {
  try {
    const { itineraryId, activityId } = req.params;
    // The trip comes from the itinerary day (requireTripMember), not the URL's tripId segment.
    const tripId = req.trip._id.toString();

    const result = await Itinerary.findOneAndUpdate(
      { _id: itineraryId },
      { $pull: { "sections.$[].activities": { _id: activityId } } },
      { new: true } // Return the updated day plan
    ).populate("sections.activities.comments.user", "name imageUrl");

    if (!result) return res.status(404).json({ success: false });

    // Emit to Socket Room
    const io = req.app.get("socketio");
    io.to(tripId).emit("activity_deleted", { itineraryId, activityId });
    await bumpRevisionFor(req, req.trip._id, "itinerary");

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

    // Places the 30-day sweep cut back to their ID are looked up again; clients refetch on the bump.
    refreshItineraryPlaces({ tripId, days: itinerary, userId: req.user._id, io: req.app.get("socketio") });
  } catch (error) {
    console.error("Error fetching itinerary:", error);
    next(error);
  }
};