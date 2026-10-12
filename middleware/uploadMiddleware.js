import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary.js";
import { isPublicScope } from "../lib/files.js";

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    // Trip documents are uploaded as `authenticated`, so they are never served from a permanent
    // public URL (design.md D-012). Images rendered straight from a URL stay public — see
    // lib/files.js for why — and say so with `?scope=public`.
    //
    // The scope is read from the query string, not the body: with multipart, a body field is only
    // parsed if it appears before the file part, and clients can't be relied on to order it.
    const cover = isPublicScope(req.query?.scope ?? req.body?.scope);

    return {
      folder: "TripTribe",
      resource_type: "auto", // IMPORTANT → allows image, pdf, docs
      type: cover ? "upload" : "authenticated",
      public_id: Date.now() + "-" + file.originalname,
    };
  },
});

/**
 * Cloudinary's own ceiling is the real limit here — 10MB for images and raw files on the free
 * plan, more for video — and it is enforced remotely, after the whole body has been streamed
 * up. Declaring a limit locally lets an oversized file be rejected before that round trip,
 * with an error the client can actually act on.
 *
 * multer's default is Infinity, so before this there was no local limit at all; a too-large
 * file failed inside Cloudinary and surfaced as an opaque 500.
 */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const upload = multer({ storage, limits: { fileSize: MAX_UPLOAD_BYTES } });

/**
 * Turns upload failures into statuses a client can branch on.
 *
 * Mounted after the route's `upload.single`, so it catches both multer's own errors and
 * anything CloudinaryStorage throws while streaming. Without it every one of these became a
 * generic 500 "Server Error" from the global handler, which is indistinguishable from the
 * backend being down.
 */
export const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        success: false,
        message: `File is too large. The limit is ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB.`,
      });
    }
    return res.status(400).json({ success: false, message: err.message });
  }

  // Cloudinary reports its own cap as an http_code 400 with this message shape.
  const message = err.message || "Upload failed";
  if (/file size too large|maximum is/i.test(message)) {
    return res.status(413).json({ success: false, message });
  }

  return res.status(502).json({ success: false, message: `Upload failed: ${message}` });
};

export default upload;