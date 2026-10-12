// controllers/device.controller.js
//
// Push registration (design.md D-010). Devices are addressed by their Expo push token.

import mongoose from "mongoose";
import { Expo } from "expo-server-sdk";

import Device from "../models/device.model.js";

const PLATFORMS = ["ios", "android", "web"];

/**
 * POST /api/devices/register
 *
 * Upserts on the token, not on the user: the same phone signed into a second account must move to
 * that account rather than keep receiving the first one's trips. Expo reissues a token on
 * reinstall, so this runs on every app start and is deliberately cheap to repeat.
 */
export const registerDevice = async (req, res, next) => {
  try {
    const { token, platform, deviceName } = req.body ?? {};

    if (!Expo.isExpoPushToken(token)) {
      return res.status(400).json({ success: false, message: "A valid Expo push token is required" });
    }
    if (!PLATFORMS.includes(platform)) {
      return res.status(400).json({ success: false, message: `platform must be one of ${PLATFORMS.join(", ")}` });
    }

    const device = await Device.findOneAndUpdate(
      { token },
      { user: req.user._id, token, platform, deviceName, lastSeenAt: new Date() },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.status(200).json({ success: true, data: device });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/devices/:deviceId
 *
 * Called on sign-out. `deviceId` is the id returned by register; the push token is accepted too,
 * since that is what a client is most likely to still have.
 */
export const unregisterDevice = async (req, res, next) => {
  try {
    const { deviceId } = req.params;

    const query = mongoose.isValidObjectId(deviceId) ? { _id: deviceId } : { token: deviceId };
    const device = await Device.findOneAndDelete({ ...query, user: req.user._id });

    if (!device) {
      return res.status(404).json({ success: false, message: "Device not found" });
    }

    res.status(200).json({ success: true, message: "Device unregistered" });
  } catch (error) {
    next(error);
  }
};
