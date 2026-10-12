import Trip from "../models/trip.model.js";
import { bumpRevisionFor } from "../lib/revisions.js";
import { ensureTripPlace } from "../lib/tripPlace.js";

export const createTrip = async (req, res, next) => {
  try {
    const {
      name,
      location,
      description,
      image,
      startDate,
      endDate,
    } = req.body;
    if (!name ) {
      return res.status(400).json({
        success: false,
        message: "Name is required",
      });
    }
    if (!location ) {
      return res.status(400).json({
        success: false,
        message: "location is required",
      });
    }
    if (!startDate ) {
      return res.status(400).json({
        success: false,
        message: "start date is required",
      });
    }
    if (!endDate ) {
      return res.status(400).json({
        success: false,
        message: "end date is required",
      });
    }
    if(!image){
      return res.status(400).json({
        success: false,
        message: " image is required",
      });
    }

    if (new Date(endDate) < new Date(startDate)) {
      return res.status(400).json({
        success: false,
        message: "End date cannot be before start date",
      });
    }

    const trip = await Trip.create({
      name,
      location,
      description,
      image,
      startDate,
      endDate,
      createdBy: req.user._id,
      members: [
        {
          user: req.user._id,
          role: "owner",
        },
      ],
    });
    const populatedTrip = await trip.populate([
      {path: "createdBy", select: "name email imageUrl"},
      {path: "members.user", select: "name email imageUrl"},
    ])
    // Resolve the destination in the background; clients pick it up from the trip revision bump.
    void ensureTripPlace(trip, { io: req.app.get("socketio") });
    res.status(201).json({
      success: true,
      data: trip,
    });
  } catch (error) {
    next(error);
  }
};

export const joinTrip = async (req, res, next) => {
  try {
    const { inviteCode } = req.body;

    const trip = await Trip.findOne({ inviteCode });

    if (!trip) {
      return res.status(404).json({
        success: false,
        message: "Invalid invite code",
      });
    }

    // Prevent duplicate join
    const alreadyMember = trip.members.some(
      (m) => m.user.toString() === req.user._id.toString()
    );
    
    console.log(req.user.name)

    if (alreadyMember) {
      return res.status(400).json({
        success: false,
        message: "Already joined this trip",
      });
    }

    trip.members.push({
      user: req.user._id,
      role: "viewer", // default
    });

    const newTrip = await trip.save();
    const populatedTrip = await newTrip.populate([
      {path: "createdBy", select: "name email imageUrl"},
      {path: "members.user", select: "name email imageUrl"},
    ])

    const io = req.app.get("socketio");

    io.to(trip._id.toString()).emit("member_joined", {populatedTrip, name: req.user.name});
    await bumpRevisionFor(req, trip._id, "members");

    return res.json({
      success: true,
      data: populatedTrip,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * A partial update: only the fields actually present in the body are written (ai-plan §5.4).
 *
 * It used to be a full replace, which had two failure modes. `coverImage.url` threw whenever the
 * body omitted the image, so a rename request 500'd. And the AI flow writes `place` and `theme`
 * without re-sending the members array — under a full replace, a background job racing someone's
 * role change silently reverted it.
 */
export const updateTrip = async (req, res, next) => {
  try {
    // requireTripMember has already loaded and authorised the trip.
    const trip = req.trip;
    const { tripName, name, startDate, endDate, members, coverImage, description, place, theme } = req.body ?? {};

    const update = {};
    const nextName = tripName ?? name;
    if (nextName !== undefined) update.name = nextName;
    if (description !== undefined) update.description = description;
    if (startDate !== undefined) update.startDate = new Date(startDate);
    if (endDate !== undefined) update.endDate = new Date(endDate);
    if (place !== undefined) update.place = place;
    if (theme !== undefined) update.theme = theme;

    // Only touch the members array when the caller actually sent one.
    if (Array.isArray(members) && members.length > 0) {
      update.members = members.map((m) => ({ user: m._id ?? m.user, role: m.role }));
    }

    if (coverImage?.url !== undefined) update["image.url"] = coverImage.url;
    if (coverImage?.public_id !== undefined) update["image.public_id"] = coverImage.public_id;

    const start = update.startDate ?? trip.startDate;
    const end = update.endDate ?? trip.endDate;
    if (start && end && new Date(end) < new Date(start)) {
      return res.status(400).json({ success: false, message: "End date cannot be before start date" });
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ success: false, message: "Nothing to update" });
    }

    const updatedTrip = await Trip.findByIdAndUpdate(
      trip._id,
      { $set: update },
      {
        new: true,
        runValidators: true
      }
    ).populate("members.user", "name email imageUrl");

    await bumpRevisionFor(req, trip._id, "trip");
    if (update.members) await bumpRevisionFor(req, trip._id, "members");

    res.status(200).json({
      success: true,
      message: "Trip updated successfully",
      data: updatedTrip,
    });
  } catch (error) {
    next(error);
  }
};

//change member role 
export const updateMemberRole = async (req, res, next) => {
  try {
    const { tripId } = req.params;
    const { userId, role } = req.body;

    const trip = await Trip.findById(tripId);

    const member = trip.members.find(
      (m) => m.user.toString() === userId
    );

    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Member not found",
      });
    }

    member.role = role;

    await trip.save();
    await bumpRevisionFor(req, trip._id, "members");

    return res.json({
      success: true,
      data: trip,
    });
  } catch (error) {
    next(error);
  }
};

export const getMyTrips = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const trips = await Trip.find({
      "members.user": userId,
    })
      .populate("createdBy", "name email imageUrl")
      .populate({
        path: "members.user",
        select: "name email imageUrl" 
      })
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: trips.length,
      data: trips,
    });
  } catch (error) {
    next(error);
  }
};

export const getSingleTrip = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { tripId } = req.params;

    const trip = await Trip.findOne({
      _id: tripId,
      "members.user": userId  
    })
      .populate("createdBy", "name email imageUrl")
      .populate({
        path: "members.user",
        select: "name email imageUrl"
      });

    if (!trip) {
      return res.status(404).json({
        success: false,
        message: "Trip not found or access denied",
      });
    }

    // Trips from before places existed get one lazily (ai-plan §3.1). Not awaited: the trip opens
    // now, and the "trip" revision bump tells clients to refetch once the place and theme land.
    void ensureTripPlace(trip, { io: req.app.get("socketio") });

    res.status(200).json({
      success: true,
      data: trip,  
    });
  } catch (error) {
    next(error);
  }
};

// trip.controller.js
export const updateTripBudget = async (req, res, next) => {
  try {
    const { tripId } = req.params;
    const { total, categories } = req.body;

    const updatedTrip = await Trip.findByIdAndUpdate(
      tripId,
      {
        $set: {
          "budget.total": total,
          "budget.categories": categories 
        }
      },
      { new: true, runValidators: true }
    );

    if (!updatedTrip) {
      return res.status(404).json({ success: false, message: "Trip not found" });
    }

    await bumpRevisionFor(req, updatedTrip._id, "budget");

    res.status(200).json({
      success: true,
      message: "Budget updated successfully",
      data: updatedTrip.budget
    });
  } catch (error) {
    next(error);
  }
};