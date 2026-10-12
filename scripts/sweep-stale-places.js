// scripts/sweep-stale-places.js
//
// Runs the place sweep once, on demand (design.md D-087). The server already runs it a minute after
// boot and then daily (lib/placeFreshness.js); this is for a first run against existing data, or to
// check what it does, without waiting for a deploy.
//
// Copies of Google place data older than 30 days are refreshed from PlaceCache or cut back to their
// place ID. Copies written before `fetchedAt` existed count as old. Nothing here calls Google.
//
//   node scripts/sweep-stale-places.js

import mongoose from "mongoose";
import dotenv from "dotenv";

import { sweepStalePlaces } from "../lib/placeFreshness.js";

dotenv.config();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const summary = await sweepStalePlaces();
  console.table(summary);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
