// controllers/purchases.controller.js
//
// The RevenueCat webhook (design.md D-041): store purchases become ledger grants.
//
// RevenueCat signs nothing. It sends back the Authorization header value configured for the
// webhook in its dashboard, so that value is a shared secret (REVENUECAT_WEBHOOK_AUTH) compared
// in constant time. Grants are keyed on the store transaction id (lib/credits.js), so RevenueCat's
// retries, and the same purchase arriving as two event types, grant once.
//
// Responses: 200 for everything handled or deliberately ignored — anything else makes RevenueCat
// retry, which is right only for our own failures (500) and a misconfigured secret (401/503).

import crypto from "crypto";
import mongoose from "mongoose";

import User from "../models/user.model.js";
import { grantPurchase, revokePurchase } from "../lib/credits.js";
import { productFor } from "../config/products.js";

const GRANT_EVENTS = new Set(["NON_RENEWING_PURCHASE", "INITIAL_PURCHASE", "RENEWAL"]);

function authorized(header) {
  const expected = process.env.REVENUECAT_WEBHOOK_AUTH;
  if (!expected || typeof header !== "string") return false;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * The Mongo user a purchase belongs to. The app logs RevenueCat in with the Mongo id, so it's the
 * app user id — or, for a purchase made before sign-in finished, one of its aliases.
 */
async function resolveUser(event) {
  const candidates = [event.app_user_id, event.original_app_user_id, ...(event.aliases ?? [])].filter(
    (id) => typeof id === "string" && mongoose.isValidObjectId(id)
  );
  for (const id of candidates) {
    if (await User.exists({ _id: id })) return id;
  }
  return null;
}

// POST /api/credits/grant
export const revenueCatWebhook = async (req, res, next) => {
  try {
    if (!process.env.REVENUECAT_WEBHOOK_AUTH) {
      return res.status(503).json({ success: false, message: "Purchases aren't configured" });
    }
    if (!authorized(req.get("authorization"))) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const event = req.body?.event;
    if (!event?.type) return res.status(400).json({ success: false, message: "No event" });

    if (event.type === "TEST") return res.json({ success: true, handled: "test" });

    if (GRANT_EVENTS.has(event.type)) {
      if (!productFor(event.product_id)) {
        console.warn(`[purchases] ignoring unknown product ${event.product_id} (event ${event.id})`);
        return res.json({ success: true, handled: "unknown_product" });
      }
      const userId = await resolveUser(event);
      if (!userId) {
        // Retrying won't make the user appear. Loud, so support can grant by hand.
        console.error(`[purchases] no user for event ${event.id} (app user ${event.app_user_id})`);
        return res.json({ success: true, handled: "unknown_user" });
      }
      const transactionId = event.transaction_id ?? event.id;
      const result = await grantPurchase({
        userId,
        productId: event.product_id,
        transactionId,
        environment: event.environment,
      });
      return res.json({ success: true, handled: result.duplicate ? "duplicate" : "granted", credits: result.granted });
    }

    // A store refund arrives as a cancellation with this reason; an ordinary subscription
    // cancellation only stops future renewals and takes nothing back.
    if (event.type === "CANCELLATION" && event.cancel_reason === "CUSTOMER_SUPPORT" && event.transaction_id) {
      const result = await revokePurchase(event.transaction_id);
      return res.json({ success: true, handled: "revoked", credits: result.revoked });
    }

    return res.json({ success: true, handled: "ignored" });
  } catch (error) {
    next(error);
  }
};
