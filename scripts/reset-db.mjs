#!/usr/bin/env node
/**
 * scripts/reset-db.mjs
 * ----------------------------------------------------------------------------
 * Wipes the Firestore database for a fresh start. Preserves:
 *   - users with role === "super_admin" (Firestore docs AND Firebase Auth accounts)
 *   - settings/global doc
 *
 * Deletes everything else:
 *   - All other users (Firestore + Auth)
 *   - All suppliers
 *   - All purchase_orders
 *   - All po_items
 *   - All containers
 *   - All vessels
 *   - All packing_lists
 *   - All activity_logs
 *   - All notifications
 *   - All sales_channels (driven from settings anyway)
 *
 * USAGE:
 *   node --env-file=.env.local scripts/reset-db.mjs
 *
 * The script prints a summary of what it will delete, then waits for you to
 * type "DELETE" (in caps) before doing anything.
 * ----------------------------------------------------------------------------
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.includes("\\n")
  ? process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n")
  : process.env.FIREBASE_ADMIN_PRIVATE_KEY;

if (!process.env.FIREBASE_ADMIN_PROJECT_ID || !process.env.FIREBASE_ADMIN_CLIENT_EMAIL || !privateKey) {
  console.error("FIREBASE_ADMIN_* env vars missing. Run with: node --env-file=.env.local scripts/reset-db.mjs");
  process.exit(1);
}

initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey,
  }),
});

const auth = getAuth();
const db = getFirestore();

const COLLECTIONS_TO_WIPE = [
  "suppliers",
  "purchase_orders",
  "po_items",
  "containers",
  "vessels",
  "packing_lists",
  "activity_logs",
  "notifications",
  "sales_channels",
];

/** Delete an entire collection in batches of 400 (under Firestore's 500 limit). */
async function deleteCollection(name) {
  const ref = db.collection(name);
  let total = 0;
  while (true) {
    const snap = await ref.limit(400).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    total += snap.size;
    process.stdout.write(`  ${name}: deleted ${total}...\r`);
  }
  console.log(`  ${name}: ${total} docs deleted${" ".repeat(20)}`);
  return total;
}

async function main() {
  console.log(`\n  Project: ${process.env.FIREBASE_ADMIN_PROJECT_ID}\n`);

  // ---- Plan ----
  console.log("Scanning what will be affected...\n");

  const usersSnap = await db.collection("users").get();
  const superAdmins = usersSnap.docs.filter((d) => d.data().role === "super_admin");
  const nonSuperAdmins = usersSnap.docs.filter((d) => d.data().role !== "super_admin");

  console.log("WILL PRESERVE:");
  console.log(`  ✓ ${superAdmins.length} super_admin user${superAdmins.length === 1 ? "" : "s"}:`);
  for (const d of superAdmins) {
    const data = d.data();
    console.log(`      - ${data.email} (${data.displayName ?? "no name"})`);
  }
  console.log(`  ✓ settings/global doc (if exists)`);
  console.log("");

  console.log("WILL DELETE:");
  console.log(`  ✗ ${nonSuperAdmins.length} non-super_admin user${nonSuperAdmins.length === 1 ? "" : "s"}`);

  const counts = {};
  for (const col of COLLECTIONS_TO_WIPE) {
    const countSnap = await db.collection(col).count().get();
    counts[col] = countSnap.data().count;
    console.log(`  ✗ ${col}: ${counts[col]} docs`);
  }
  console.log("");

  // ---- Confirm ----
  const rl = readline.createInterface({ input, output });
  console.log("This action is PERMANENT. Firestore has no undo.");
  const answer = await rl.question('Type "DELETE" (exactly, in caps) to proceed: ');
  rl.close();

  if (answer.trim() !== "DELETE") {
    console.log("\nAborted. Nothing was changed.");
    process.exit(0);
  }

  // ---- Execute ----
  console.log("\nStarting wipe...\n");

  // 1. Delete each collection
  for (const col of COLLECTIONS_TO_WIPE) {
    await deleteCollection(col);
  }

  // 2. Delete non-super_admin users (Firestore + Auth)
  console.log("\nDeleting non-super_admin users...");
  let userDeletedCount = 0;
  let authDeletedCount = 0;
  let authSkipped = 0;
  for (const d of nonSuperAdmins) {
    // Delete the Firestore doc first
    await d.ref.delete();
    userDeletedCount++;

    // Delete the Firebase Auth account
    try {
      await auth.deleteUser(d.id);
      authDeletedCount++;
    } catch (err) {
      if (err.code === "auth/user-not-found") {
        authSkipped++;
      } else {
        console.warn(`  Could not delete auth user ${d.id}: ${err.message}`);
      }
    }
  }
  console.log(`  users: ${userDeletedCount} Firestore docs, ${authDeletedCount} Auth accounts deleted (${authSkipped} already gone)`);

  console.log("\n✓ Database reset complete.");
  console.log(`  Preserved: ${superAdmins.length} super_admin(s) and settings/global`);
  process.exit(0);
}

main().catch((err) => {
  console.error("\nFailed:", err);
  process.exit(1);
});
