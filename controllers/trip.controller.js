import Trip from "../models/trip.model.js";

export const createTrip = async (req, res, next) => {
  try {
    const {
      name,
      location,
      description,
      imageUrl,
      startDate,
      endDate,
    } = req.body;

    if (!name || !location || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Name, location, start date and end date are required",
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
      imageUrl,
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
    return res.json({
      success: true,
      data: populatedTrip,
    });
  } catch (error) {
    next(error);
  }
};

export const updateTrip = async (req, res, next) => {
  try {
    const trip = req.trip;

    const { name, location, description, imageUrl } = req.body;

    if (name) trip.name = name;
    if (location) trip.location = location;
    if (description) trip.description = description;
    if (imageUrl) trip.imageUrl = imageUrl;

    await trip.save();

    return res.json({
      success: true,
      data: trip,
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