import express from "express";
import { protect } from "../middleware/auth.js";
import { finalizeFileRecord, getTripFiles, uploadFileInitial } from "../controllers/upload.controller.js";
import upload, { handleUploadError } from "../middleware/uploadMiddleware.js";

const fileRouter = express.Router();

// Step 1: Physical upload to Cloudinary
// handleUploadError sits between multer and the controller so a multer or Cloudinary
// failure answers with a real status instead of falling through to the generic 500.
fileRouter.post("/upload-raw", protect, upload.single("file"), handleUploadError, uploadFileInitial);

// Step 2: Save user-edited metadata (Name, Category, Notes)
fileRouter.post("/finalize", protect, finalizeFileRecord);

// Get files for the trip
fileRouter.get("/:tripId", protect, getTripFiles);

export default fileRouter;