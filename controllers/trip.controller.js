import Trip from "../models/trip.model.js";

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

    io.to(trip._id.toString()).emit("member_joined", populatedTrip);

    return res.json({
      success: true,
      data: populatedTrip,
    });
  } catch (error) {
    next(error);
  }
};

export const updateTrip = async (req, res) => {
  try {
    const { tripId } = req.params;
    const { tripName, startDate, endDate, members, coverImage, description } = req.body;

    console.log(tripId, req.body);
    // 1. Validate if trip exists
    const trip = await Trip.findById(tripId);
    if (!trip) {
      return res.status(404).json({ success: false, message: "Trip not found" });
    }

    let formattedMembers;
    if(members && members.length > 0){

      formattedMembers = members.map((m) => ({
      user: m._id,
      role: m.role,
    }));
    }

    // 3. Update the trip
    const updatedTrip = await Trip.findByIdAndUpdate(
      tripId,
      {
        $set: {
          name: tripName || trip.name,
          description: description || trip.description,
          startDate: new Date(startDate) || trip.startDate,
          endDate: new Date(endDate) || trip.endDate,
          members: formattedMembers || trip.members,
          "image.url": coverImage.url, 
        },
      },
      { 
        new: true,
        runValidators: true 
      }
    ).populate("members.user", "name email imageUrl");

    res.status(200).json({
      success: true,
      message: "Trip updated successfully",
      data: updatedTrip,
    });
  } catch (error) {
    console.error("Update Trip Error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
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

    res.status(200).json({
      success: true,
      message: "Budget updated successfully",
      data: updatedTrip.budget
    });
  } catch (error) {
    next(error);
  }
};