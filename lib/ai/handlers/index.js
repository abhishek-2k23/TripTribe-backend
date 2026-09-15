import { chatHandler } from "./chat.js";
import { packingHandler } from "./packing.js";
import { planHandler } from "./plan.js";
import { receiptHandler } from "./receipt.js";

export const handlers = {
  chat: chatHandler,
  packing: packingHandler,
  receipt: receiptHandler,
  plan: planHandler,
};
