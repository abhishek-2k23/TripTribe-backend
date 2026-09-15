// lib/ai/budget.js
//
// Cost estimate for a proposal (ai-plan §7.2 step 7). Plain arithmetic in code — the model only
// supplies per-activity, per-person estimates (design.md D-039).

const CATEGORY_BY_TYPE = {
  Flight: "Transport",
  Transport: "Transport",
  Hotel: "Hotel",
  Food: "Food",
  Shopping: "Shopping",
  Sightseeing: "Activities",
  Activity: "Activities",
  Other: "Other",
};

const round = (value) => Math.round(value * 100) / 100;

export function estimateBudget({ days, partySize, currency, tripBudget }) {
  const byCategory = { Food: 0, Transport: 0, Activities: 0, Shopping: 0, Hotel: 0, Other: 0 };
  let perPerson = 0;

  for (const day of days) {
    for (const activity of day.activities) {
      const cost = Math.max(0, Number(activity.estCostPerPerson) || 0);
      perPerson += cost;
      byCategory[CATEGORY_BY_TYPE[activity.type] ?? "Other"] += cost * partySize;
    }
  }

  const total = perPerson * partySize;
  const budgetTotal = Number(tripBudget?.total) || 0;

  return {
    currency,
    partySize,
    perPerson: round(perPerson),
    total: round(total),
    byCategory: Object.fromEntries(Object.entries(byCategory).map(([category, amount]) => [category, round(amount)])),
    tripBudgetTotal: budgetTotal,
    overBudget: budgetTotal > 0 && total > budgetTotal,
    note: "Estimated activity, food and local costs only. Stays and travel to the destination aren't included.",
  };
}
