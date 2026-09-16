// lib/push.js
//
// Push notifications to backgrounded devices (design.md D-010).
//
// These are data messages, not alerts with a banner: their job is to tell an app that has been
// suspended that a trip changed, so it can catch up on the sections that moved. iOS stops running
// JS in the background, so a socket connection and any timer are both gone; push is the only thing
// that reaches the app there.
//
// Three rules shape the code:
//   - The person who made the change never gets a notification about it.
//   - A burst of writes to one trip collapses into one send, because adding six activities in a row
//     should not buzz five other phones six times.
//   - A token that Expo reports as unregistered is deleted. Expo blocks a whole batch containing
//     stale tokens, so not pruning them degrades delivery for everyone on the trip.

import { Expo } from "expo-server-sdk";

import Device from "../models/device.model.js";
import Trip from "../models/trip.model.js";

const expo = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN });

/** How long writes to one trip are collected before a single send goes out. */
const DEBOUNCE_MS = 10_000;

/** tripId → { timer, sections: Set, actorIds: Set } */
const pending = new Map();

async function deliver(tripId, sections, actorIds) {
  const trip = await Trip.findById(tripId).select("name members").lean();
  if (!trip) return;

  const recipientIds = trip.members
    .map((member) => String(member.user))
    .filter((id) => !actorIds.has(id));
  if (!recipientIds.length) return;

  const devices = await Device.find({ user: { $in: recipientIds } }).select("token").lean();
  const tokens = devices.map((device) => device.token).filter((token) => Expo.isExpoPushToken(token));
  if (!tokens.length) return;

  const messages = tokens.map((to) => ({
    to,
    // No title or body: a data-only message wakes the app to sync rather than interrupting anyone.
    data: { type: "trip_changed", tripId: String(tripId), sections: [...sections] },
    priority: "normal",
    channelId: "sync",
    _contentAvailable: true,
  }));

  const stale = [];
  for (const chunk of expo.chunkPushNotifications(messages)) {
    let tickets;
    try {
      tickets = await expo.sendPushNotificationsAsync(chunk);
    } catch (error) {
      console.error("[push] send failed:", error?.message ?? error);
      continue;
    }

    tickets.forEach((ticket, index) => {
      if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
        stale.push(chunk[index].to);
      }
    });
  }

  if (stale.length) {
    await Device.deleteMany({ token: { $in: stale } });
    console.log(`[push] pruned ${stale.length} unregistered device(s)`);
  }
}

/**
 * Queues a trip-changed notification. Returns immediately: a request should never wait on Expo.
 */
export function notifyTripChanged(tripId, { section, actorId } = {}) {
  const key = String(tripId);
  const entry = pending.get(key) ?? { timer: null, sections: new Set(), actorIds: new Set() };

  if (section) entry.sections.add(section);
  if (actorId) entry.actorIds.add(String(actorId));

  if (!entry.timer) {
    entry.timer = setTimeout(() => {
      pending.delete(key);
      deliver(key, entry.sections, entry.actorIds).catch((error) =>
        console.error(`[push] trip ${key} notification failed:`, error)
      );
    }, DEBOUNCE_MS);
    // A pending notification must never hold the process open on shutdown.
    entry.timer.unref?.();
  }

  pending.set(key, entry);
}

/** Flushes anything queued. Used by tests and by a graceful shutdown. */
export async function flushPendingNotifications() {
  const entries = [...pending.entries()];
  pending.clear();
  for (const [tripId, entry] of entries) {
    clearTimeout(entry.timer);
    await deliver(tripId, entry.sections, entry.actorIds).catch(() => {});
  }
}
