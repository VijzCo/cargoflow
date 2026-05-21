#!/usr/bin/env node
/**
 * scripts/seed-settings.mjs
 * ----------------------------------------------------------------------------
 * Seeds the settings/global document with sensible defaults so the rest of
 * the app has something to read. Idempotent: run any time to reset defaults
 * (existing custom values WILL be overwritten — use `merge: true` if you'd
 * prefer additive).
 *
 *   node --env-file=.env.local scripts/seed-settings.mjs
 * ----------------------------------------------------------------------------
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.includes("\\n")
  ? process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n")
  : process.env.FIREBASE_ADMIN_PRIVATE_KEY;

initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey,
  }),
});

const db = getFirestore();

const CATEGORY_KEYWORDS = {
  Fabric: ["fabric", "cotton", "poly", "polyester", "spandex", "jersey", "knit", "woven",
           "interlock", "fleece", "yarn", "gsm", "dty", "viscose", "linen", "rayon",
           "denim", "twill", "satin", "chiffon"],
  Trims: ["cord", "draw cord", "drawcord", "button", "zipper", "zip", "label", "tag",
          "thread", "elastic", "hook", "snap", "rivet", "velcro", "binding", "piping", "ribbon"],
  Accessories: ["hanger", "hangtag", "pin", "clip", "lace", "badge", "patch", "embroidery",
                "applique", "bow"],
  Packaging: ["polybag", "poly bag", "carton", "box", "sticker", "tape", "tissue",
              "barcode", "shipping bag", "mailer"],
  Garments: ["shirt", "t-shirt", "tee", "pant", "dress", "hoodie", "jacket", "legging",
             "short", "top", "skirt", "jumpsuit", "blouse", "coat", "sweater", "cardigan"],
  Others: [],
};

const SALES_CHANNELS = ["Amazon", "Walmart", "Retail", "Wholesale", "Shopify", "TikTok Shop"];

async function main() {
  await db.collection("settings").doc("global").set({
    id: "global",
    companyName: "Duty Free Sourcing Inc.",
    systemTitle: "CargoFlow",
    containerUsablePercent: 0.92,
    categoryKeywords: CATEGORY_KEYWORDS,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: "seed-script",
  });
  console.log("Wrote settings/global");

  const batch = db.batch();
  for (const name of SALES_CHANNELS) {
    const ref = db.collection("sales_channels").doc(name.toLowerCase().replace(/\s+/g, "-"));
    batch.set(ref, {
      name,
      active: true,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  console.log(`Wrote ${SALES_CHANNELS.length} sales channels`);

  console.log("\nSeed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
