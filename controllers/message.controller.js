// controllers/discussion.controller.js
import Message from "../models/message.model.js";
import { createIdempotent, readClientRef } from "../lib/idempotency.js";
import { bumpRevisionFor } from "../lib/revisions.js";

// requireTripMember has already resolved and verified the trip, so `req.trip` is authoritative and
// the body's own tripId is not consulted again.
export const sendMessage = async (req, res, next) => {
  try {
    const { text } = req.body;
    const tripId = req.trip._id;
    const senderId = req.user._id;

    const { document: message, created } = await createIdempotent(Message, {
      scope: { trip: tripId },
      clientRef: readClientRef(req.body),
      data: { trip: tripId, sender: senderId, text },
    });

    const populatedMessage = await message.populate("sender", "name imageUrl");

    // A replayed send changes nothing, so nobody is told about it a second time.
    if (created) {
      const io = req.app.get("socketio");
      io?.to(tripId.toString()).emit("new_discussion_message", populatedMessage);
      await bumpRevisionFor(req, tripId, "discussion");
    }

    res.status(created ? 201 : 200).json({ success: true, data: populatedMessage });
  } catch (error) {
    next(error);
  }
};

export const getTripMessages = async (req, res, next) => {
  try {
    const tripId = req.trip._id;
    const messages = await Message.find({ trip: tripId })
      .sort({ createdAt: 1 }) // Chronological order
      .populate("sender", "name imageUrl");

    res.status(200).json({ success: true, data: messages });
  } catch (error) {
    next(error);
  }
};
