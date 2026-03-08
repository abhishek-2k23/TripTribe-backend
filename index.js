import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { Server } from "socket.io";
import http from "http";

import connectDB from './config/database.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { clerkMiddleware } from '@clerk/express';

// Route Imports
import healthRoutes from './routes/health.js';
import userRoutes from './routes/user.routes.js';
import triproute from './routes/trip.routes.js';
import itinerary from './routes/itinerary.routes.js';
import expense from './routes/expense.routes.js';
import checklistRouter from './routes/checklist.router.js';
import fileRouter from './routes/uploadRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Create HTTP Server
const server = http.createServer(app);

// 2. Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "*",
    methods: ["GET", "POST"]
  }
});


app.set("socketio", io);

connectDB();

// Middleware
app.use(helmet());
app.use(cors());
app.use(clerkMiddleware());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: 5 * 60 * 1000, 
  max: 100,
  message: 'Too many requests, please try again later.'
});
app.use('/api', limiter); 

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// 4. Socket Connection Logic
io.on("connection", (socket) => {
  console.log("User Connected:", socket.id);

  socket.on("join_trip", (tripId) => {
    socket.join(tripId);
    console.log(`User joined trip room: ${tripId}`);
  });

  socket.on("disconnect", () => {
    console.log("User Disconnected");
  });
});

// Routes
app.use('/api/health', healthRoutes);
app.use('/api/users', userRoutes);
app.use("/api/trips", triproute);
app.use("/api/itinerary", itinerary);
app.use("/api/expenses", expense);
app.use("/api/checklist", checklistRouter);
app.use("/api/files", fileRouter);

app.get('/', (req, res) => {
  res.json({ message: 'Trip Planner Server', status: 'running' });
});

app.use(notFound);
app.use(errorHandler);


server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;