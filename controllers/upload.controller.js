import mongoose from "mongoose";

import File from "../models/file.model.js";
import Trip from "../models/trip.model.js";
import { parseDeliveryUrl, signedFileUrl, withDeliveryUrl, SIGNED_URL_TTL_SECONDS } from "../lib/files.js";
import { createIdempotent, readClientRef } from "../lib/idempotency.js";
import { bumpRevisionFor } from "../lib/revisions.js";
import { findMember } from "../middleware/membership.js";

/**
 * Step 1 of a two-step upload: the bytes are already in Cloudinary by the time this runs. No
 * membership check is possible — this same route uploads trip cover images, chosen before the trip
 * exists — so the trip is checked at finalize, where the record is written.
 *
 * Add `?scope=cover` for a cover image; anything else is treated as a trip document and uploaded
 * as an authenticated asset (design.md D-012).
 */
export const uploadFileInitial = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });

    // The storage adapter surfaces only the delivery URL, which is where the rest of it lives.
    const delivery = parseDeliveryUrl(req.file.path);

    res.status(200).json({
      success: true,
      data: {
        // For an authenticated asset this URL will not load on its own; finalize drops it and
        // clients ask for a signed one. It is returned so a cover upload can keep using it.
        url: req.file.path,
        public_id: req.file.filename,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        ...delivery,
      }
    });
  } catch (error) {
    next(error);
  }
};

// requireTripMember has verified the trip, so `req.trip` is authoritative.
export const finalizeFileRecord = async (req, res, next) => {
  try {
    const {
      name,
      category,
      notes,
      url,
      public_id,
      fileType,
      size,
      resourceType,
      deliveryType,
      format,
    } = req.body;

    if (!name || !public_id) {
      return res.status(400).json({ success: false, message: "name and public_id are required" });
    }

    const tripId = req.trip._id;
    // Trust the upload response when it came back, and fall back to reading the URL again.
    const delivery = { resourceType, deliveryType, format, ...(!deliveryType ? parseDeliveryUrl(url) : {}) };
    const authenticated = delivery.deliveryType === "authenticated";

    const fileExtension = name.split('.').pop();

    const { document: newFile, created } = await createIdempotent(File, {
      scope: { tripId },
      clientRef: readClientRef(req.body),
      data: {
        tripId,
        uploadedBy: req.user._id,
        name,
        category,
        notes,
        // An authenticated asset has no durable URL worth keeping.
        url: authenticated ? undefined : url,
        public_id,
        resourceType: delivery.resourceType,
        deliveryType: delivery.deliveryType,
        format: delivery.format,
        fileType,
        fileExtension,
        size
      }
    });

    // Uploading a file emits no socket event, so the revision bump is what tells other members
    // there is something new to fetch (design.md D-010).
    if (created) await bumpRevisionFor(req, tripId, "files");

    // Populate user info (name/image) for the UI cards
    const populatedFile = await newFile.populate("uploadedBy", "name imageUrl");

    res.status(created ? 201 : 200).json({ success: true, data: withDeliveryUrl(populatedFile) });
  } catch (error) {
    next(error);
  }
};

export const getTripFiles = async (req, res, next) => {
  try {
    const tripId = req.trip._id;

    // Find all files for this trip and sort by newest first
    const files = await File.find({ tripId })
      .populate("uploadedBy", "name imageUrl") // Required for the avatars in your design
      .sort({ createdAt: -1 });

    // Each authenticated file carries a freshly signed URL in the same `url` field the stored
    // public URL used to occupy, so listing a trip's files is still one request.
    res.status(200).json({
      success: true,
      count: files.length,
      data: files.map(withDeliveryUrl),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * A fresh signed URL for one file. Clients call this before previewing, downloading or sharing,
 * because the one they were given expires (design.md D-012, D-025).
 *
 * Membership is resolved from the file's own trip rather than a supplied trip id.
 */
export const getFileUrl = async (req, res, next) => {
  try {
    const { fileId } = req.params;
    if (!mongoose.isValidObjectId(fileId)) {
      return res.status(400).json({ success: false, message: "Invalid file id" });
    }

    const file = await File.findById(fileId);
    if (!file) return res.status(404).json({ success: false, message: "File not found" });

    const trip = await Trip.findById(file.tripId).select("members");
    if (!trip || !findMember(trip, req.user._id)) {
      return res.status(403).json({ success: false, message: "You are not part of this trip" });
    }

    const url = signedFileUrl(file) ?? file.url;
    if (!url) return res.status(404).json({ success: false, message: "This file has no stored copy" });

    res.status(200).json({
      success: true,
      data: {
        url,
        // A public legacy asset never expires; only signed URLs do.
        expiresAt: signedFileUrl(file)
          ? new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString()
          : null,
      },
    });
  } catch (error) {
    next(error);
  }
};
