import express from "express";
import { protect } from "../middleware/auth.js";
import { finalizeFileRecord, getTripFiles, uploadFileInitial } from "../controllers/upload.controller.js";
import upload from "../middleware/uploadMiddleware.js";

const fileRouter = express.Router();

// Step 1: Physical upload to Cloudinary
fileRouter.post("/upload-raw", protect, upload.single("file"), uploadFileInitial);

// Step 2: Save user-edited metadata (Name, Category, Notes)
fileRouter.post("/finalize", protect, finalizeFileRecord);

// Get files for the trip
fileRouter.get("/:tripId", protect, getTripFiles);

export default fileRouter;