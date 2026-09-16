// middleware/rateLimit.js
//
// Rate limiting, keyed per user rather than per IP (design.md D-011).
//
// The old limiter was 100 requests per 5 minutes per IP. Indian carriers put many subscribers
// behind one CGNAT address, so strangers shared a budget and exhausted each other's. Authenticated
// requests are now keyed on the Clerk user id — read straight off the request, since
// clerkMiddleware() has already run and no database lookup is needed — and only unauthenticated
// routes fall back to the IP.
//
// Endpoints whose normal use is a burst get their own bucket: the revision check that runs on every
// reconnect, and AI job polling, which spends about 30 requests on a two-minute plan (D-063).
// Limits themselves live in config/rateLimits.js, one environment variable each.

import { getAuth } from "@clerk/express";
import rateLimit from "express-rate-limit";

import { rateLimits } from "../config/rateLimits.js";

const passThrough = (req, res, next) => next();

/** The signed-in Clerk user, or null. A malformed token is a 401 elsewhere, not a 500 here. */
function clerkUserId(req) {
  try {
    return getAuth(req)?.userId ?? null;
  } catch {
    return null;
  }
}

/**
 * IPv6 clients are handed a whole /64 and can pick any address in it at will, so the /64 is the
 * smallest thing worth counting. IPv4 is used as-is.
 */
function ipKey(req) {
  const ip = req.ip ?? "unknown";
  return ip.includes(":") ? `${ip.split(":", 4).join(":")}::/64` : ip;
}

function tooMany(message) {
  return (req, res) => {
    const resetAt = req.rateLimit?.resetTime?.getTime();
    const retryAfterSeconds = resetAt
      ? Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))
      : Math.ceil(rateLimits.windowMs / 1000);

    res.status(429).json({ success: false, message, retryAfterSeconds });
  };
}

/**
 * @param limit    requests allowed per window
 * @param keyBy    "user" falls back to the IP when signed out; "ip" always counts the IP
 * @param skip     paths (relative to the mount point) that have their own bucket
 * @param message  what the client is told on a 429
 */
function createLimiter({ limit, keyBy = "user", skip = [], message }) {
  if (rateLimits.disabled) return passThrough;

  return rateLimit({
    windowMs: rateLimits.windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: (req) => {
      if (keyBy === "ip") return `ip:${ipKey(req)}`;
      const userId = clerkUserId(req);
      return userId ? `user:${userId}` : `ip:${ipKey(req)}`;
    },
    skip: skip.length ? (req) => skip.some((prefix) => req.path.startsWith(prefix)) : undefined,
    handler: tooMany(message),
  });
}

/** Paths mounted under /api that carry their own limiter, so the general one leaves them alone. */
const OWN_BUCKET = ["/sync", "/ai/jobs", "/users/sync", "/health", "/inngest"];

/** Everything under /api that isn't listed above: counted per signed-in user. */
export const apiLimiter = createLimiter({
  limit: rateLimits.api,
  skip: OWN_BUCKET,
  message: "You're doing that too often. Give it a minute and try again.",
});

/** Routes reachable without a session (sign-in sync, health): per IP, and much tighter. */
export const publicLimiter = createLimiter({
  limit: rateLimits.public,
  keyBy: "ip",
  message: "Too many requests from this network. Try again shortly.",
});

/** The reconnect/foreground revision check (D-010): one per open trip per reconnect. */
export const syncLimiter = createLimiter({
  limit: rateLimits.sync,
  message: "Syncing too often. Try again shortly.",
});

/** AI job polling (D-063): a running plan is polled every 4s until it finishes. */
export const jobLimiter = createLimiter({
  limit: rateLimits.job,
  message: "Checking on that job too often. Try again shortly.",
});
