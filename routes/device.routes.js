import express from "express";

import { registerDevice, unregisterDevice } from "../controllers/device.controller.js";
import { protect } from "../middleware/auth.js";

const deviceRouter = express.Router();

deviceRouter.post("/register", protect, registerDevice);
deviceRouter.delete("/:deviceId", protect, unregisterDevice);

export default deviceRouter;
