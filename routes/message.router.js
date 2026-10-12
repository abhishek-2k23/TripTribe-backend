// routes/discussion.routes.js
import express from 'express';
const messageRouter = express.Router();
import { sendMessage, getTripMessages } from '../controllers/message.controller.js';
import { protect } from '../middleware/auth.js';
import { requireTripMember } from '../middleware/membership.js';

// Reading and posting to a trip's discussion both require membership of that trip (design.md D-012).
// Before this, any signed-in user who knew a trip id could read the whole thread.
messageRouter.get('/:tripId', protect, requireTripMember(), getTripMessages);
messageRouter.post('/send', protect, requireTripMember(), sendMessage);

export default messageRouter;
