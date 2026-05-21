#!/usr/bin/env node
/**
 * scripts/create-supplier-user.mjs
 * ----------------------------------------------------------------------------
 * Creates a supplier-role user linked to a specific supplier. Useful for
 * testing RBAC isolation (suppliers see only their own items).
 *
 *   node --env-file=.env.local scripts/create-supplier-user.mjs \
 *     --email=supplier1@xiamen-syc.com \
 *     --name="Alex (Xiamen SYC)" \
 *     --supplier-name="XIAMEN SYC TEXTILE TECH CO., LTD."
 *
 * The script:
 *  1. Finds the supplier doc by name (must already exist in /admin/suppliers).
 *  2. Creates a Firebase Auth user.
 *  3. Writes a /users/{uid} doc with role=supplier and supplierId=<that doc id>.
 *  4. Generates a password-reset link for the supplier to set their password.
 * ----------------------------------------------------------------------------
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a, true];
  }),
);

const email = args.email;
const name = args.name;
const supplierName = args["supplier-name"];

if (!email || !name || !supplierName) {
  console.error("Usage:");
  console.error("  node --env-file=.env.local scripts/create-supplier-user.mjs \\");
  console.error("    --email=<email> --name=\"<display name>\" --supplier-name=\"<exact supplier name>\"");
  process.exit(1);
}

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

const auth = getAuth();
const db = getFirestore();

async function main() {
  // 1. Find supplier by name
  const supSnap = await db.collection("suppliers").where("name", "==", supplierName).get();
  if (supSnap.empty) {
    console.error(`Supplier "${supplierName}" not found. Create it first in /admin/suppliers.`);
    process.exit(1);
  }
  const supplierDoc = supSnap.docs[0];
  const supplierId = supplierDoc.id;
  console.log(`Matched supplier: ${supplierName} (id: ${supplierId})`);

  // 2. Create Auth user (or reuse)
  let uid;
  try {
    const existing = await auth.getUserByEmail(email);
    uid = existing.uid;
    console.log(`Auth user already exists (uid: ${uid}).`);
  } catch (err) {
    if (err.code === "auth/user-not-found") {
      const created = await auth.createUser({ email, displayName: name, emailVerified: false });
      uid = created.uid;
      console.log(`Created Firebase Auth user (uid: ${uid}).`);
    } else {
      throw err;
    }
  }

  // 3. Write user doc
  await db.collection("users").doc(uid).set(
    {
      uid,
      email,
      displayName: name,
      role: "supplier",
      supplierId,
      active: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: "create-supplier-user-script",
    },
    { merge: true },
  );
  console.log("Firestore user doc written with role=supplier.");

  // 4. Password reset link
  const link = await auth.generatePasswordResetLink(email);
  console.log("\n--- PASSWORD SETUP LINK ---");
  console.log(link);
  console.log("---------------------------\n");
  console.log(`Send this link to ${email} so they can set their password and log in.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
