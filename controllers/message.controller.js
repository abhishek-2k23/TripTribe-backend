// controllers/discussion.controller.js
import Message from "../models/message.model.js";

export const sendMessage = async (req, res, next) => {
  try {
    const { tripId, text } = req.body;
    const senderId = req.user._id;

    const newMessage = await Message.create({
      trip: tripId,
      sender: senderId,
      text
    });

    const populatedMessage = await newMessage.populate("sender", "name imageUrl");

    // Real-time Emission
    const io = req.app.get("socketio");
    io.to(tripId).emit("new_discussion_message", populatedMessage);

    res.status(201).json({ success: true, data: populatedMessage });
  } catch (error) {
    next(error);
  }
};

export const getTripMessages = async (req, res, next) => {
  try {
    const { tripId } = req.params;
    const messages = await Message.find({ trip: tripId })
      .sort({ createdAt: 1 }) // Chronological order
      .populate("sender", "name imageUrl");

    res.status(200).json({ success: true, data: messages });
  } catch (error) {
    next(error);
  }
};