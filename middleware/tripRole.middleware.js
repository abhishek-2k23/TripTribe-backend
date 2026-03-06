import Trip from "../models/trip.model.js";

export const authorizeTripRole = (allowedRoles) => {
  return async (req, res, next) => {
    const { tripId } = req.params;
    console.log("On authorize")
    const trip = await Trip.findById(tripId);

    if (!trip) {
      return res.status(404).json({
        success: false,
        message: "Trip not found",
      });
    }

    const member = trip.members.find(
      (m) => m.user.toString() === req.user._id.toString()
    );

    if (!member) {
      return res.status(403).json({
        success: false,
        message: "You are not part of this trip",
      });
    }

    if (!allowedRoles.includes(member.role)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission",
      });
    }

    req.trip = trip;
    next();
  };
};