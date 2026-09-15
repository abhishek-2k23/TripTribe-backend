// lib/credits.js
//
// Credits ledger mechanics (design.md D-040): reserve → commit → refund.
//
//  - Balances are the sum of ledger deltas per bucket. `free` is granted monthly and unused free
//    credits expire when the next month's grant is written; `paid` (Phase 14 purchases) never expires.
//  - Starting a job reserves credits in the same transaction that creates the job, spending free
//    credits first. A succeeded job keeps its hold; a failed or cancelled one is refunded.
//  - Every entry has a unique idempotency key, so retries can't grant, hold or refund twice.

import mongoose from "mongoose";

import CreditAccount from "../models/creditAccount.model.js";
import CreditLedger from "../models/creditLedger.model.js";
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

const monthOf = (date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

export const nextResetAt = (now = new Date()) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

const isDuplicateKey = (error) =>
  error?.code === 11000 || error?.writeErrors?.some?.((e) => e.code === 11000);

export async function bucketBalances(userId, session) {
  const pipeline = CreditLedger.aggregate([
    { $match: { user: new mongoose.Types.ObjectId(String(userId)) } },
    { $group: { _id: "$bucket", total: { $sum: "$delta" } } },
  ]);
  if (session) pipeline.session(session);
  const rows = await pipeline;
  return {
    free: rows.find((r) => r._id === "free")?.total ?? 0,
    paid: rows.find((r) => r._id === "paid")?.total ?? 0,
  };
}

/** Writes this month's free grant (and expires last month's unused free credits) once per user per month. */
export async function ensureMonthlyGrant(userId, now = new Date()) {
  const month = monthOf(now);
  const grantKey = `grant:${userId}:${month}`;
  if (await CreditLedger.exists({ idempotencyKey: grantKey })) return;

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await CreditAccount.updateOne({ _id: userId }, { $inc: { version: 1 } }, { upsert: true, session });
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

/** Places a hold for a job. Must run inside the caller's transaction. */
export async function reserveCredits({ userId, jobId, amount, session }) {
  // Serializes concurrent reservations for the same user (see creditAccount.model.js).
  await CreditAccount.updateOne({ _id: userId }, { $inc: { version: 1 } }, { upsert: true, session });

  const { free, paid } = await bucketBalances(userId, session);
  const availableFree = Math.max(0, free);
  const availablePaid = Math.max(0, paid);
  const available = availableFree + availablePaid;
  if (available < amount) throw new InsufficientCreditsError(amount, available);

  const fromFree = Math.min(availableFree, amount);
  const fromPaid = amount - fromFree;
  const entries = [];
  if (fromFree > 0) {
    entries.push({ user: userId, bucket: "free", delta: -fromFree, reason: "hold", job: jobId, idempotencyKey: `hold:${jobId}:free` });
  }
  if (fromPaid > 0) {
    entries.push({ user: userId, bucket: "paid", delta: -fromPaid, reason: "hold", job: jobId, idempotencyKey: `hold:${jobId}:paid` });
  }
  if (entries.length) await CreditLedger.insertMany(entries, { session, ordered: true });
  return { fromFree, fromPaid };
}

/** Returns a job's held credits to the buckets they came from. Safe to call more than once. */
export async function refundJob(jobId) {
  const holds = await CreditLedger.find({ job: jobId, reason: "hold" }).lean();
  let refunded = 0;
  for (const hold of holds) {
    try {
      await CreditLedger.create({
        user: hold.user,
        bucket: hold.bucket,
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
  const { free, paid } = await bucketBalances(userId);
  return {
    free: Math.max(0, free),
    paid: Math.max(0, paid),
    total: Math.max(0, free) + Math.max(0, paid),
    monthlyFreeCredits: FREE_MONTHLY_CREDITS,
    freeResetsAt: nextResetAt(),
  };
}
