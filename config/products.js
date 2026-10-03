// config/products.js
//
// What each store product grants (ai-plan §8.2). The ids must match the products created in App
// Store Connect and Google Play Console, and attached to the RevenueCat offering the app shows.
//
// Prices live in the stores, not here — the paywall reads them from RevenueCat — and are
// provisional until real job costs are measured (design.md D-042).

export const CREDIT_PRODUCTS = {
  triptribe_credits_100: { credits: 100, kind: "pack" },
  triptribe_credits_350: { credits: 350, kind: "pack" },
  triptribe_credits_1000: { credits: 1000, kind: "pack" },
  // Monthly: 300 credits each renewal. Unused ones roll over, but the subscription bucket is
  // capped at twice the monthly amount, so a renewal tops up to the cap rather than past it.
  triptribe_monthly_300: { credits: 300, kind: "subscription", rolloverCap: 600 },
};

export const productFor = (productId) => CREDIT_PRODUCTS[productId] ?? null;
