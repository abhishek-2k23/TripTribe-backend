import express from "express";
import { protect } from "../middleware/auth.js";
import { requireTripMember } from "../middleware/membership.js";
import {
  finalizeFileRecord,
  getFileUrl,
  getTripFiles,
  uploadFileInitial,
} from "../controllers/upload.controller.js";
import upload, { handleUploadError } from "../middleware/uploadMiddleware.js";

const fileRouter = express.Router();

// Step 1: Physical upload to Cloudinary.
// No membership check is possible here: this same route uploads trip cover images, which are
// chosen before the trip exists. The trip is checked at step 2, where the file record is written.
// handleUploadError sits between multer and the controller so a multer or Cloudinary
// failure answers with a real status instead of falling through to the generic 500.
fileRouter.post("/upload-raw", protect, upload.single("file"), handleUploadError, uploadFileInitial);

// Step 2: Save user-edited metadata (Name, Category, Notes)
fileRouter.post("/finalize", protect, requireTripMember(), finalizeFileRecord);

// A fresh short-lived URL for one file (design.md D-012). Stored delivery URLs are no longer
// permanent, so a client asks for one of these before previewing, downloading or sharing.
fileRouter.get("/:fileId/url", protect, getFileUrl);

// Get files for the trip
fileRouter.get("/:tripId", protect, requireTripMember(), getTripFiles);

export default fileRouter;
