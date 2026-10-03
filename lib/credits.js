// lib/credits.js
//
// Credits ledger mechanics (design.md D-040): reserve → commit → refund, plus store purchases and
// trip pools (ai-plan §8, Phase 14).
//
//  - Balances are the sum of ledger deltas per bucket. `free` is granted monthly and unused free
//    credits expire when the next month's grant is written; `sub` comes from the monthly
//    subscription and rolls over up to a cap; `paid` (credit packs) never expires.
//  - Starting a job reserves credits in the same transaction that creates the job — from the trip's
//    pool when one covers it, otherwise free first, then subscription, then paid. A succeeded job
//    keeps its hold; a failed or cancelled one is refunded to wherever it came from.
//  - Every entry has a unique idempotency key, so retries can't grant, hold, refund or purchase
//    twice. Purchases are keyed on the store's transaction id.
//  - Every write that depends on a balance first bumps a lock document (CreditAccount) for the user
//    or trip, so concurrent transactions conflict instead of both spending the same credits.

import mongoose from "mongoose";

import CreditAccount from "../models/creditAccount.model.js";
import CreditLedger from "../models/creditLedger.model.js";
import { productFor } from "../config/products.js";
import { FREE_MONTHLY_CREDITS } from "./ai/config.js";

export class InsufficientCreditsError extends Error {
  constructor(needed, available) {
    super(`This needs ${needed} credits and you have ${available}.`);
    this.name = "InsufficientCreditsError";
    this.statusCode = 402;
    this.needed = needed;
    this.available = available;
  }
}

export class CreditRequestError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const monthOf = (date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

export const nextResetAt = (now = new Date()) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

const isDuplicateKey = (error) =>
  error?.code === 11000 || error?.writeErrors?.some?.((e) => e.code === 11000);

const oid = (id) => new mongoose.Types.ObjectId(String(id));

/** Serializes balance-dependent writes for one user or one trip (see creditAccount.model.js). */
const lock = (id, session) =>
  CreditAccount.updateOne({ _id: id }, { $inc: { version: 1 } }, { upsert: true, session });

export async function bucketBalances(userId, session) {
  const pipeline = CreditLedger.aggregate([
    // Pool rows name the user who funded or spent them, but belong to the trip.
    { $match: { user: oid(userId), bucket: { $ne: "pool" } } },
    { $group: { _id: "$bucket", total: { $sum: "$delta" } } },
  ]);
  if (session) pipeline.session(session);
  const rows = await pipeline;
  const of = (bucket) => rows.find((r) => r._id === bucket)?.total ?? 0;
  return { free: of("free"), sub: of("sub"), paid: of("paid") };
}

export async function poolBalance(tripId, session) {
  const pipeline = CreditLedger.aggregate([
    { $match: { trip: oid(tripId), bucket: "pool" } },
    { $group: { _id: null, total: { $sum: "$delta" } } },
  ]);
  if (session) pipeline.session(session);
  const [row] = await pipeline;
  return Math.max(0, row?.total ?? 0);
}

/** Writes this month's free grant (and expires last month's unused free credits) once per user per month. */
export async function ensureMonthlyGrant(userId, now = new Date()) {
  const month = monthOf(now);
  const grantKey = `grant:${userId}:${month}`;
  if (await CreditLedger.exists({ idempotencyKey: grantKey })) return;

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await lock(userId, session);
      if (await CreditLedger.exists({ idempotencyKey: grantKey }).session(session)) return;

      const { free } = await bucketBalances(userId, session);
      const entries = [];
      if (free > 0) {
        entries.push({
          user: userId,
          bucket: "free",
          delta: -free,
          reason: "expire",
          idempotencyKey: `expire:${userId}:${month}`,
          note: "Unused free credits from last month",
        });
      }
      entries.push({
        user: userId,
        bucket: "free",
        delta: FREE_MONTHLY_CREDITS,
        reason: "grant",
        idempotencyKey: grantKey,
        note: `Free credits for ${month}`,
      });
      await CreditLedger.insertMany(entries, { session, ordered: true });
    });
  } catch (error) {
    // Another request wrote the grant first.
    if (!isDuplicateKey(error)) throw error;
  } finally {
    await session.endSession();
  }
}

/**
 * Places a hold for a job. Must run inside the caller's transaction.
 *
 * With `poolTripId` (the requester can spend the trip's pool), the pool pays when it covers the
 * whole cost; a pool is never mixed with personal credits for one job, so a refund is simple and
 * the group always knows which jobs it paid for. Returns `{ fundedBy, fromFree, fromSub, fromPaid }`.
 */
export async function reserveCredits({ userId, jobId, amount, session, poolTripId = null }) {
  if (poolTripId) {
    await lock(poolTripId, session);
    if ((await poolBalance(poolTripId, session)) >= amount) {
      await CreditLedger.create(
        [
          {
            user: userId,
            trip: poolTripId,
            bucket: "pool",
            delta: -amount,
            reason: "hold",
            job: jobId,
            idempotencyKey: `hold:${jobId}:pool`,
          },
        ],
        { session }
      );
      return { fundedBy: "pool", fromFree: 0, fromSub: 0, fromPaid: 0 };
    }
  }

  await lock(userId, session);
  const balances = await bucketBalances(userId, session);
  const available = {
    free: Math.max(0, balances.free),
    sub: Math.max(0, balances.sub),
    paid: Math.max(0, balances.paid),
  };
  const total = available.free + available.sub + available.paid;
  if (total < amount) throw new InsufficientCreditsError(amount, total);

  let remaining = amount;
  const taken = {};
  // Soonest to expire first: this month's free credits, then capped subscription credits, then packs.
  for (const bucket of ["free", "sub", "paid"]) {
    taken[bucket] = Math.min(available[bucket], remaining);
    remaining -= taken[bucket];
  }

  const entries = Object.entries(taken)
    .filter(([, delta]) => delta > 0)
    .map(([bucket, delta]) => ({
      user: userId,
      bucket,
      delta: -delta,
      reason: "hold",
      job: jobId,
      idempotencyKey: `hold:${jobId}:${bucket}`,
    }));
  if (entries.length) await CreditLedger.insertMany(entries, { session, ordered: true });
  return { fundedBy: "user", fromFree: taken.free, fromSub: taken.sub, fromPaid: taken.paid };
}

/** Returns a job's held credits to the buckets (or pool) they came from. Safe to call more than once. */
export async function refundJob(jobId) {
  const holds = await CreditLedger.find({ job: jobId, reason: "hold" }).lean();
  let refunded = 0;
  for (const hold of holds) {
    try {
      await CreditLedger.create({
        user: hold.user,
        bucket: hold.bucket,
        trip: hold.trip,
        delta: -hold.delta,
        reason: "refund",
        job: jobId,
        idempotencyKey: `refund:${jobId}:${hold.bucket}`,
      });
      refunded += -hold.delta;
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
    }
  }
  return refunded;
}

export async function getBalance(userId) {
  await ensureMonthlyGrant(userId);
  const { free, sub, paid } = await bucketBalances(userId);
  const clamp = (n) => Math.max(0, n);
  return {
    free: clamp(free),
    subscription: clamp(sub),
    paid: clamp(paid),
    total: clamp(free) + clamp(sub) + clamp(paid),
    monthlyFreeCredits: FREE_MONTHLY_CREDITS,
    freeResetsAt: nextResetAt(),
  };
}

/* Store purchases -------------------------------------------------------------------------------- */

/**
 * Grants what a store transaction bought (design.md D-041). Keyed on the store's transaction id,
 * so RevenueCat retrying a webhook, or sending the same purchase as two event types, grants once.
 * Returns `{ granted, duplicate }`.
 */
export async function grantPurchase({ userId, productId, transactionId, environment }) {
  const product = productFor(productId);
  if (!product) throw new CreditRequestError(`Unknown product ${productId}`, 422);

  const idempotencyKey = `purchase:${transactionId}`;
  if (await CreditLedger.exists({ idempotencyKey })) return { granted: 0, duplicate: true };

  const session = await mongoose.startSession();
  let granted = 0;
  try {
    await session.withTransaction(async () => {
      await lock(userId, session);
      if (await CreditLedger.exists({ idempotencyKey }).session(session)) return;

      const bucket = product.kind === "subscription" ? "sub" : "paid";
      granted = product.credits;
      if (product.kind === "subscription") {
        // Top up to the rollover cap, never past it. A renewal that finds the bucket full still
        // writes a zero entry, so its transaction id is recorded as handled.
        const { sub } = await bucketBalances(userId, session);
        granted = Math.max(0, Math.min(product.credits, product.rolloverCap - Math.max(0, sub)));
      }

      await CreditLedger.create(
        [
          {
            user: userId,
            bucket,
            delta: granted,
            reason: "purchase",
            transactionId,
            productId,
            idempotencyKey,
            note: `${productId}${environment === "SANDBOX" ? " (sandbox)" : ""}`,
          },
        ],
        { session }
      );
    });
  } catch (error) {
    if (isDuplicateKey(error)) return { granted: 0, duplicate: true };
    throw error;
  } finally {
    await session.endSession();
  }
  return { granted, duplicate: false };
}

/**
 * Takes back a refunded purchase. When the credits were already spent, that bucket goes negative
 * and the next purchase into it makes up the difference first. Free monthly credits stay usable:
 * each bucket is spent only down to zero (reserveCredits).
 */
export async function revokePurchase(transactionId) {
  const purchase = await CreditLedger.findOne({ idempotencyKey: `purchase:${transactionId}` }).lean();
  if (!purchase || purchase.delta <= 0) return { revoked: 0 };
  try {
    await CreditLedger.create({
      user: purchase.user,
      bucket: purchase.bucket,
      delta: -purchase.delta,
      reason: "revoke",
      transactionId,
      productId: purchase.productId,
      idempotencyKey: `revoke:${transactionId}`,
      note: "Refunded by the store",
    });
    return { revoked: purchase.delta };
  } catch (error) {
    if (isDuplicateKey(error)) return { revoked: 0 };
    throw error;
  }
}

/* Trip pools ------------------------------------------------------------------------------------- */

/**
 * Moves purchased credits (subscription first, then packs) from the owner into a trip's pool.
 * Free monthly credits can't be pooled: they'd outlive their month inside the pool.
 * `requestId` makes a retried request move the credits once.
 */
export async function allocateToPool({ userId, tripId, amount, requestId }) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await lock(userId, session);
      await lock(tripId, session);
      if (await CreditLedger.exists({ idempotencyKey: `pool:${requestId}:in` }).session(session)) return;

      const { sub, paid } = await bucketBalances(userId, session);
      const fromSub = Math.min(Math.max(0, sub), amount);
      const fromPaid = Math.min(Math.max(0, paid), amount - fromSub);
      if (fromSub + fromPaid < amount) {
        throw new CreditRequestError(
          `You have ${Math.max(0, sub) + Math.max(0, paid)} purchased credits to share. Free monthly credits can't go into a pool.`,
          402
        );
      }

      const entries = [];
      if (fromSub > 0) entries.push({ user: userId, trip: tripId, bucket: "sub", delta: -fromSub, reason: "pool_allocate", idempotencyKey: `pool:${requestId}:sub` });
      if (fromPaid > 0) entries.push({ user: userId, trip: tripId, bucket: "paid", delta: -fromPaid, reason: "pool_allocate", idempotencyKey: `pool:${requestId}:paid` });
      entries.push({ user: userId, trip: tripId, bucket: "pool", delta: amount, reason: "pool_allocate", idempotencyKey: `pool:${requestId}:in` });
      await CreditLedger.insertMany(entries, { session, ordered: true });
    });
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
  } finally {
    await session.endSession();
  }
  return poolBalance(tripId);
}

/** Moves unspent pool credits back to the owner, as pack credits (they never expire). */
export async function withdrawFromPool({ userId, tripId, amount, requestId }) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await lock(tripId, session);
      if (await CreditLedger.exists({ idempotencyKey: `pool:${requestId}:out` }).session(session)) return;
      const balance = await poolBalance(tripId, session);
      if (balance < amount) throw new CreditRequestError(`The pool has ${balance} credits.`, 400);
      await CreditLedger.insertMany(
        [
          { user: userId, trip: tripId, bucket: "pool", delta: -amount, reason: "pool_withdraw", idempotencyKey: `pool:${requestId}:out` },
          { user: userId, trip: tripId, bucket: "paid", delta: amount, reason: "pool_withdraw", idempotencyKey: `pool:${requestId}:back` },
        ],
        { session, ordered: true }
      );
    });
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
  } finally {
    await session.endSession();
  }
  return poolBalance(tripId);
}

/** The pool's balance and its latest movements, for the trip settings card. */
export async function poolSummary(tripId) {
  const [balance, entries] = await Promise.all([
    poolBalance(tripId),
    CreditLedger.find({ trip: tripId, bucket: "pool" })
      .sort({ createdAt: -1 })
      .limit(30)
      .select("user delta reason job createdAt")
      .populate("user", "name imageUrl")
      .lean(),
  ]);
  return { balance, entries };
}
