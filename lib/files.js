// lib/files.js
//
// Cloudinary delivery for trip documents (ai-plan §5.1, design.md D-012).
//
// Documents are passports, tickets and booking confirmations. Cloudinary's default `upload` type
// delivers them from a permanent, unguessable-but-public URL: once such a URL leaks — a screenshot,
// a forwarded message, a browser history on a shared laptop — it can never be revoked.
//
// So documents are uploaded with `type: 'authenticated'`, which is not served without a signature,
// and clients are handed a URL that expires. Trip cover images stay public: they are decoration,
// they are rendered by `<img>` tags that can't carry a refresh cycle, and they are written into
// `trip.image.url` once and read for the life of the trip.

import cloudinary from "../config/cloudinary.js";

export const SIGNED_URL_TTL_SECONDS = 10 * 60;

/**
 * Images the app renders straight from a URL — trip covers, activity photos, profile pictures —
 * are uploaded public, because an `<img>` tag has nowhere to put a refresh cycle and these are
 * decoration rather than documents. Everything else defaults to authenticated, so a client that
 * forgets to say anything gets the safe behaviour.
 */
export const isPublicScope = (scope) => ["cover", "public"].includes(String(scope ?? "").toLowerCase());

/**
 * Cloudinary's delivery URL carries the three facts a signed URL needs later, and the multer
 * storage adapter hands back only `secure_url`, so they are read from it rather than guessed.
 * `resource_type: 'auto'` makes guessing wrong in practice — Cloudinary files PDFs under `image`.
 *
 *   https://res.cloudinary.com/<cloud>/image/authenticated/s--sig--/v123/TripTribe/file.pdf
 */
export function parseDeliveryUrl(url) {
  const match = /\/(image|video|raw)\/(upload|authenticated|private)\/(?:s--[^/]+--\/)?(?:v\d+\/)?(.+)$/.exec(
    String(url ?? "")
  );
  if (!match) return {};

  const [, resourceType, deliveryType, tail] = match;
  const lastSegment = tail.split("/").pop() ?? "";
  const dot = lastSegment.lastIndexOf(".");
  return {
    resourceType,
    deliveryType,
    format: dot > 0 ? lastSegment.slice(dot + 1) : undefined,
  };
}

/**
 * A download URL for an authenticated asset, valid for ten minutes.
 *
 * `private_download_url` is used rather than a signed delivery URL because a plain signature never
 * expires — it only proves the URL was built by us, which is the same leak in a different shape.
 */
export function signedFileUrl(file) {
  if (!file?.public_id || file.deliveryType !== "authenticated") return null;

  return cloudinary.utils.private_download_url(file.public_id, file.format ?? "", {
    resource_type: file.resourceType || "image",
    type: "authenticated",
    expires_at: Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SECONDS,
  });
}

/**
 * The file as a client should see it: authenticated assets get a fresh short-lived URL in the same
 * `url` field the stored public URL used to occupy, so a file list stays one request.
 */
export function withDeliveryUrl(file) {
  const plain = typeof file.toObject === "function" ? file.toObject() : { ...file };
  const signed = signedFileUrl(plain);
  if (!signed) return plain;

  return {
    ...plain,
    url: signed,
    urlExpiresAt: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
  };
}
