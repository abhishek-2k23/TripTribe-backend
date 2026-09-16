// config/rateLimits.js
//
// Every rate limit in one place, each one a single environment variable (design.md D-011).
//
// Development defaults are deliberately loose: a phone replaying an offline queue, a plan job being
// polled every 2s and a hot-reloading client together burn through a production-sized budget in
// seconds, and a 429 while building looks exactly like a broken endpoint. Production defaults are
// the real numbers. Both sides are overridable, so tightening dev or loosening prod is an env
// change and a restart, never a code change.
//
//   RATE_LIMIT_DISABLED=1        turn the limiter off entirely
//   RATE_LIMIT_WINDOW_MS         window all buckets share
//   RATE_LIMIT_MAX               authenticated routes, per user
//   RATE_LIMIT_PUBLIC_MAX        unauthenticated routes, per IP
//   RATE_LIMIT_SYNC_MAX          GET /api/sync/:tripId/rev, per user
//   RATE_LIMIT_JOB_MAX           AI job polling, per user
//   TRUST_PROXY                  proxy hops in front of this server (Render/Nginx = 1)

import dotenv from "dotenv";

// This module is read while the import graph is still being evaluated, before index.js runs its
// own dotenv.config(), so it loads the file itself. dotenv never overwrites an already-set value.
dotenv.config();

const isProduction = process.env.NODE_ENV === "production";

/** A positive number from the environment, or the default when unset or unparseable. */
const fromEnv = (value, fallback) => {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const truthy = (value) => ["1", "true", "yes", "on"].includes(String(value ?? "").toLowerCase());

export const rateLimits = {
  disabled: truthy(process.env.RATE_LIMIT_DISABLED),

  // RATE_LIMIT_WINDOW is the older name and still works, so an existing .env keeps its meaning.
  windowMs: fromEnv(process.env.RATE_LIMIT_WINDOW_MS ?? process.env.RATE_LIMIT_WINDOW, 5 * 60 * 1000),

  api: fromEnv(process.env.RATE_LIMIT_MAX, isProduction ? 300 : 10_000),
  public: fromEnv(process.env.RATE_LIMIT_PUBLIC_MAX, isProduction ? 60 : 2_000),
  sync: fromEnv(process.env.RATE_LIMIT_SYNC_MAX, isProduction ? 600 : 5_000),
  job: fromEnv(process.env.RATE_LIMIT_JOB_MAX, isProduction ? 900 : 5_000),
};

/**
 * How many proxies sit in front of the server. It has to be right: too low and every request behind
 * a load balancer shares one IP bucket, too high and a client can forge `X-Forwarded-For` to get a
 * fresh bucket per request.
 */
export const trustProxy = fromEnv(process.env.TRUST_PROXY, isProduction ? 1 : 0);

/** One line at boot, so a surprising 429 in a log has something to check against. */
export const describeRateLimits = () =>
  rateLimits.disabled
    ? "rate limiting: disabled (RATE_LIMIT_DISABLED)"
    : `rate limiting: ${rateLimits.api}/user, ${rateLimits.public}/ip public, ` +
      `${rateLimits.sync} sync, ${rateLimits.job} job polling — per ${Math.round(rateLimits.windowMs / 1000)}s`;
