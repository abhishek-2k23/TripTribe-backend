// lib/quota.js
//
// Spending a user's daily quota (config/quotas.js). Call `spend` immediately before the outbound
// request it pays for, never after: a quota checked after the call has already been billed.

import { quotas } from "../config/quotas.js";
import UsageCounter from "../models/usageCounter.model.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export class QuotaExceededError extends Error {
  constructor(bucket, limit) {
    super("You've hit today's limit for this. It resets at midnight UTC.");
    this.code = "QUOTA_EXCEEDED";
    this.statusCode = 429;
    this.bucket = bucket;
    this.limit = limit;
  }
}

const today = () => new Date().toISOString().slice(0, 10);

/** Seconds until the counters roll over, for `Retry-After`. */
export const secondsUntilReset = () => {
  const now = Date.now();
  return Math.max(1, Math.ceil((Math.floor(now / DAY_MS) * DAY_MS + DAY_MS - now) / 1000));
};

/**
 * Takes `amount` from the user's allowance for `bucket`, or throws QuotaExceededError.
 *
 * The filter only matches while the count is under the limit, so the check and the increment are one
 * operation: two requests racing for the last unit can't both get it. At the limit the filter
 * matches nothing, the upsert tries to insert a second row with the same unique key, and the
 * duplicate-key error is the refusal.
 */
export async function spendQuota(userId, bucket, amount = 1) {
  if (quotas.disabled) return;
  const limit = quotas[bucket];
  if (!limit) throw new Error(`Unknown quota bucket "${bucket}"`);

  const day = today();
  try {
    await UsageCounter.findOneAndUpdate(
      { key: `${userId}:${bucket}:${day}`, count: { $lte: limit - amount } },
      {
        $inc: { count: amount },
        $setOnInsert: {
          user: userId,
          bucket,
          day,
          expiresAt: new Date(Date.parse(`${day}T00:00:00Z`) + 2 * DAY_MS),
        },
      },
      { upsert: true }
    );
  } catch (error) {
    if (error?.code === 11000) throw new QuotaExceededError(bucket, limit);
    throw error;
  }
}

/** What's left today, for a pre-check that saves work on a request that would be refused anyway. */
export async function remainingQuota(userId, bucket) {
  if (quotas.disabled) return Infinity;
  const row = await UsageCounter.findOne({ key: `${userId}:${bucket}:${today()}` }).select("count").lean();
  return Math.max(0, quotas[bucket] - (row?.count ?? 0));
}
