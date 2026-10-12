// scripts/secure-cloudinary-files.js
//
// Moves already-uploaded trip documents from Cloudinary's public `upload` delivery to
// `authenticated` (ai-plan §5.1, design.md D-012), and records what each signed URL needs.
//
// New uploads are authenticated from the start; this is for everything uploaded before that.
// Note what it cannot do: a public URL that has already leaked stays leaked, because whoever holds
// it may have kept the file. Rotate anything genuinely sensitive — a passport scan is not a
// password, and the only real fix is a new document.
//
//   node scripts/secure-cloudinary-files.js            # dry run, changes nothing
//   node scripts/secure-cloudinary-files.js --apply    # do it

import mongoose from "mongoose";
import dotenv from "dotenv";

import cloudinary from "../config/cloudinary.js";
import File from "../models/file.model.js";
import { parseDeliveryUrl } from "../lib/files.js";

dotenv.config();

const apply = process.argv.includes("--apply");

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const files = await File.find({ deliveryType: { $ne: "authenticated" } });
  console.log(`${files.length} file(s) not yet authenticated${apply ? "" : " (dry run)"}\n`);

  let moved = 0;
  let recordOnly = 0;
  const failures = [];

  for (const file of files) {
    const fromUrl = parseDeliveryUrl(file.url);
    const resourceType = file.resourceType || fromUrl.resourceType || "image";
    const format = file.format || fromUrl.format;
    const label = `${file._id} ${file.name}`;

    if (!file.public_id) {
      failures.push(`${label}: no public_id, nothing to move`);
      continue;
    }

    if (!apply) {
      console.log(`would move ${label} (${resourceType}/${format ?? "?"})`);
      moved += 1;
      continue;
    }

    try {
      await cloudinary.uploader.rename(file.public_id, file.public_id, {
        resource_type: resourceType,
        type: "upload",
        to_type: "authenticated",
        invalidate: true,
      });
      moved += 1;
    } catch (error) {
      // Already moved by an earlier run: the asset is where we want it, so only the record is stale.
      const notFound = error?.http_code === 404;
      if (!notFound) {
        failures.push(`${label}: ${error?.message ?? error}`);
        continue;
      }
      recordOnly += 1;
    }

    file.deliveryType = "authenticated";
    file.resourceType = resourceType;
    if (format) file.format = format;
    file.url = undefined;
    await file.save();
    console.log(`moved ${label}`);
  }

  console.log(
    `\n${apply ? "moved" : "would move"} ${moved} file(s)` +
      (recordOnly ? `, ${recordOnly} already moved in Cloudinary` : "") +
      (failures.length ? `, ${failures.length} failed` : "")
  );
  for (const failure of failures) console.error(`  ! ${failure}`);

  await mongoose.disconnect();
  process.exit(failures.length ? 1 : 0);
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
