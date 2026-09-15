import express from "express";
import multer from "multer";

import {
  acceptProposal,
  cancelJob,
  createThread,
  getAiStatus,
  getJob,
  getProposal,
  getThreadMessages,
  listThreads,
  listTripPlans,
  rejectProposal,
  requestPackingList,
  requestPlan,
  requestReceiptScan,
  requireAi,
  sendChatMessage,
} from "../controllers/ai.controller.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

// Receipt images are held in memory and stored only until the job reads them (models/aiUpload.model.js).
const RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => cb(null, RECEIPT_TYPES.includes(file.mimetype)),
});

const handleReceiptUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const tooLarge = err.code === "LIMIT_FILE_SIZE";
    return res.status(tooLarge ? 413 : 400).json({
      success: false,
      message: tooLarge ? "Receipt photos can be up to 5 MB." : err.message,
    });
  }
  next(err);
};

router.get("/status", protect, getAiStatus);

router.post("/threads", protect, requireAi, createThread);
router.get("/threads", protect, listThreads);
router.get("/threads/:threadId/messages", protect, getThreadMessages);

router.post("/chat", protect, requireAi, sendChatMessage);
router.post("/packing-list", protect, requireAi, requestPackingList);
router.post("/receipt", protect, requireAi, receiptUpload.single("image"), handleReceiptUploadError, requestReceiptScan);
router.post("/plan", protect, requireAi, requestPlan);
router.get("/plans", protect, listTripPlans);

router.get("/jobs/:jobId", protect, getJob);
router.post("/jobs/:jobId/cancel", protect, cancelJob);

router.get("/proposals/:proposalId", protect, getProposal);
router.post("/proposals/:proposalId/accept", protect, acceptProposal);
router.post("/proposals/:proposalId/reject", protect, rejectProposal);

export default router;
