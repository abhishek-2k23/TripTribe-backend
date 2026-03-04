import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

import connectDB from './config/database.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { clerkMiddleware } from '@clerk/express';

// Import routes
import healthRoutes from './routes/health.js';
import userRoutes from './routes/user.routes.js';
import triproute from './routes/trip.routes.js';
import ItineraryModel from './models/Itinerary.model.js';
import itinerary from './routes/itinerary.routes.js';
import expense from './routes/expense.routes.js';


dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
connectDB();

// Security middleware
app.use(helmet());
app.use(cors());
app.use(clerkMiddleware())

// Rate limiting
const limiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression middleware
app.use(compression());

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Routes
app.use('/api/health', healthRoutes);
app.use('/api/users', userRoutes);
app.use("/api/trips", triproute)
app.use("/api/itinerary", itinerary)
app.use("/api/expense", expense)

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'Trip Planner Server',
    version: '1.0.0',
    status: 'running'
  });
});

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
});

export default app;
