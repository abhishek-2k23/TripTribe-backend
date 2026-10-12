import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import dotenv from 'dotenv';
import { Server } from "socket.io";
import http from "http";

import connectDB from './config/database.js';
import { describeRateLimits, trustProxy } from './config/rateLimits.js';
import { apiLimiter, jobLimiter, publicLimiter, syncLimiter } from './middleware/rateLimit.js';
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
import messageRouter from './routes/message.router.js';
import aiRouter from './routes/ai.routes.js';
import creditsRouter from './routes/credits.routes.js';
import syncRouter from './routes/sync.routes.js';
import deviceRouter from './routes/device.routes.js';
import placesRouter from './routes/places.routes.js';
import weatherRouter from './routes/weather.routes.js';
import templateRouter from './routes/template.routes.js';
import homeRouter from './routes/home.routes.js';
import scalarDocsRouter from './docs/scalar.js';
import { serve as serveInngest } from 'inngest/express';
import { inngest } from './lib/inngest.js';
import { inngestFunctions } from './lib/ai/functions.js';
import { recoverStaleJobs } from './lib/ai/jobs.js';
import { startPlaceSweep } from './lib/placeFreshness.js';

dotenv.config();

/**
 * Browser origins allowed to call this API (ai-plan §10). `cors()` with no options answers every
 * origin with `*`, which is what an attacker's page needs to drive the API from a signed-in user's
 * browser. Native clients send no Origin header at all and are unaffected either way.
 *
 * CLIENT_URL takes a comma-separated list, so preview deployments can be added without a release.
 */
const allowedOrigins = (process.env.CLIENT_URL ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOrigin = (origin, callback) => {
  // No Origin: a mobile app, curl, or a same-origin request. Nothing to check.
  if (!origin) return callback(null, true);
  // Unset CLIENT_URL keeps development open rather than silently breaking a local web client.
  if (!allowedOrigins.length) return callback(null, true);
  return callback(null, allowedOrigins.includes(origin));
};

const app = express();
const PORT = process.env.PORT || 3000;

// Render and most other hosts put a proxy in front of the process, so req.ip is only the client's
// address once Express is told how many hops to trust. Getting this wrong either lumps every
// request behind the proxy into one IP bucket or lets a client forge X-Forwarded-For for a fresh
// one, so the hop count is configuration (TRUST_PROXY), not a guess.
if (trustProxy) app.set('trust proxy', trustProxy);

// 1. Create HTTP Server
const server = http.createServer(app);

// 2. Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    methods: ["GET", "POST"],
    credentials: true
  }
});


app.set("socketio", io);

connectDB();

// Middleware
app.use(helmet());
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(clerkMiddleware());
// Only applies to JSON and form bodies - a multipart upload is parsed by multer, not here,
// so this is not what caps file uploads (see middleware/uploadMiddleware.js for that).
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(compression());

// Interactive OpenAPI reference for frontend and API consumers.
app.use('/api-docs', scalarDocsRouter);

// Inngest calls back into this endpoint to run AI job steps. It is mounted before the /api rate
// limiter — Inngest's own requests would otherwise spend one IP's request budget — and it
// authenticates with Inngest's signing key, not Clerk.
app.use('/api/inngest', serveInngest({ client: inngest, functions: inngestFunctions }));

// Rate limiting (design.md D-011). Authenticated traffic is counted per user, so subscribers sharing
// a carrier's CGNAT address no longer share a budget. The routes listed first each get their own
// bucket and are skipped by the general limiter; limits live in config/rateLimits.js.
app.use('/api/health', publicLimiter);
app.use('/api/users/sync', publicLimiter);
app.use('/api/sync', syncLimiter);
app.use('/api/ai/jobs', jobLimiter);
app.use('/api', apiLimiter);

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

  socket.on("typing_start", ({ tripId, userName }) => {
    // Broadcast to everyone in the trip EXCEPT the sender
    socket.to(tripId).emit("user_typing", { userName, isTyping: true });
  });

  // When a user stops typing
  socket.on("typing_stop", ({ tripId }) => {
    socket.to(tripId).emit("user_typing", { isTyping: false });
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
app.use("/api/discussion", messageRouter)
app.use("/api/ai", aiRouter);
app.use("/api/credits", creditsRouter);
app.use("/api/sync", syncRouter);
app.use("/api/devices", deviceRouter);
app.use("/api/places", placesRouter);
app.use("/api/weather", weatherRouter);
app.use("/api/templates", templateRouter);
app.use("/api", homeRouter);

app.get('/', (req, res) => {
  res.json({
    message: 'Trip Planner Server',
    status: 'running',
    documentation: '/api-docs',
  });
});

app.use(notFound);
app.use(errorHandler);


server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🚦 ${describeRateLimits()}`);
  recoverStaleJobs().catch((error) => console.error('AI job recovery failed:', error));
  startPlaceSweep();
});

export default app;
