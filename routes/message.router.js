// routes/discussion.routes.js
import express from 'express';
const messageRouter = express.Router();
import { sendMessage, getTripMessages } from '../controllers/message.controller.js';
import { protect } from '../middleware/auth.js';

messageRouter.get('/:tripId', protect, getTripMessages);
messageRouter.post('/send', protect, sendMessage);

export default messageRouter;