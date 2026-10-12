// Receipt photo → a draft expense for the Add Expense sheet (design.md D-036). Never saved as an
// expense here, and the image is deleted as soon as it has been read.

import AiUpload from "../../../models/aiUpload.model.js";
import Trip from "../../../models/trip.model.js";
import { callStructured } from "../client.js";
import { JobFailure } from "../errors.js";
import { RECEIPT_PROMPT_V1 } from "../prompts.js";
import { EXPENSE_CATEGORIES, RECEIPT_SCHEMA } from "../schemas.js";
import { loadJob } from "./shared.js";

const positiveOrNull = (value) => (Number.isFinite(value) && value > 0 ? value : null);

function toExpenseDraft(receipt, tripCurrency) {
  const currency = receipt.currency?.toUpperCase().slice(0, 3) || null;
  const items = receipt.lineItems
    .filter((item) => item.description?.trim())
    .map((item) => (Number.isFinite(item.amount) ? `${item.description.trim()} ${item.amount}` : item.description.trim()));

  return {
    title: receipt.suggestedTitle?.trim() || receipt.merchant?.trim() || "Receipt",
    amount: positiveOrNull(receipt.total),
    currency,
    tripCurrency,
    currencyMismatch: Boolean(currency && tripCurrency && currency !== tripCurrency),
    category: EXPENSE_CATEGORIES.includes(receipt.suggestedCategory) ? receipt.suggestedCategory : "Other",
    description: items.length ? `Items: ${items.join(", ")}`.slice(0, 500) : "",
    merchant: receipt.merchant,
    date: /^\d{4}-\d{2}-\d{2}$/.test(receipt.date ?? "") ? receipt.date : null,
    subtotal: positiveOrNull(receipt.subtotal),
    tax: positiveOrNull(receipt.tax),
    unreadable: receipt.unreadable,
  };
}

export async function receiptHandler({ jobId, step, runStep }) {
  const job = await loadJob(step, jobId);

  const receipt = await runStep("read", async () => {
    const upload = await AiUpload.findOne({ job: jobId });
    if (!upload) {
      throw new JobFailure("RECEIPT_EXPIRED", "The receipt photo is no longer available. Upload it again.");
    }
    const { data, usage } = await callStructured({
      step: "receipt",
      system: RECEIPT_PROMPT_V1,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: upload.mimeType, data: upload.data.toString("base64") },
            },
            { type: "text", text: "Read this receipt." },
          ],
        },
      ],
      schema: RECEIPT_SCHEMA,
    });
    return { value: data, usage: [usage] };
  });

  await step.run("discard-image", async () => {
    await AiUpload.deleteMany({ job: jobId });
    return true;
  });

  const tripCurrency = job.trip
    ? await step.run("trip-currency", async () => {
        const trip = await Trip.findById(job.trip).select("budget.currency").lean();
        return trip?.budget?.currency ?? null;
      })
    : null;

  return { tripId: job.trip, draft: toExpenseDraft(receipt, tripCurrency) };
}
