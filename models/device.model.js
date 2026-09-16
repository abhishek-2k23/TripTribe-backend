// models/device.model.js
//
// A push target: one installation of the app on one device (design.md D-010).
//
// Keyed on the Expo push token rather than a client-generated id, because that is the thing Expo
// actually addresses and the thing that goes stale. A reinstall issues a new token; the old one
// starts returning DeviceNotRegistered and is pruned by lib/push.js.

import mongoose from "mongoose";

const deviceSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Expo push token, e.g. ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx].
    token: {
      type: String,
      required: true,
      unique: true,
    },
    platform: {
      type: String,
      enum: ["ios", "android", "web"],
      required: true,
    },
    // Reassigned when the same device is handed to another account, so a signed-out user stops
    // receiving another person's trip updates.
    deviceName: String,
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model("Device", deviceSchema);
