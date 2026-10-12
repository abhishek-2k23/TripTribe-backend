// middleware/quota.js
//
// Puts a user's daily quota in front of a proxied third-party call (design.md D-002).
//
// The middleware refuses a request outright once the allowance is gone, and hands the handler
// `req.spendQuota()` to call right before it actually goes upstream — so a cache hit costs nothing.

import { QuotaExceededError, remainingQuota, secondsUntilReset, spendQuota } from "../lib/quota.js";

export function sendQuotaExceeded(res, error) {
  res.set("Retry-After", String(secondsUntilReset()));
  return res.status(429).json({
    success: false,
    code: "QUOTA_EXCEEDED",
    message: error.message,
    retryAfterSeconds: secondsUntilReset(),
  });
}

export const withQuota = (bucket) => async (req, res, next) => {
  try {
    if ((await remainingQuota(req.user._id, bucket)) <= 0) {
      return sendQuotaExceeded(res, new QuotaExceededError(bucket));
    }
    req.spendQuota = (amount = 1) => spendQuota(req.user._id, bucket, amount);
    next();
  } catch (error) {
    next(error);
  }
};
