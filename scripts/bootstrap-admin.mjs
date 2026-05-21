#!/usr/bin/env node
/**
 * scripts/bootstrap-admin.mjs
 * ----------------------------------------------------------------------------
 * One-time bootstrap to create the very first super_admin user. Firestore
 * rules require an existing super_admin to create new users, so this script
 * is the chicken-and-egg breaker. Run ONCE per project, then delete the
 * service-account key it uses.
 *
 *   node scripts/bootstrap-admin.mjs
 *
 * Required env vars (.env.local picked up via --env-file):
 *   FIREBASE_ADMIN_PROJECT_ID
 *   FIREBASE_ADMIN_CLIENT_EMAIL
 *   FIREBASE_ADMIN_PRIVATE_KEY
 *   BOOTSTRAP_ADMIN_EMAIL          (will be the super_admin's email)
 *   BOOTSTRAP_ADMIN_NAME           (e.g. "Ashan Smith")
 * ----------------------------------------------------------------------------
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const required = [
  "FIREBASE_ADMIN_PROJECT_ID",
  "FIREBASE_ADMIN_CLIENT_EMAIL",
  "FIREBASE_ADMIN_PRIVATE_KEY",
  "BOOTSTRAP_ADMIN_EMAIL",
  "BOOTSTRAP_ADMIN_NAME",
];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error("Missing env vars:", missing.join(", "));
  console.error("Run with: node --env-file=.env.local scripts/bootstrap-admin.mjs");
  process.exit(1);
}

const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY.includes("\\n")
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
const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
const displayName = process.env.BOOTSTRAP_ADMIN_NAME;

async function main() {
  let uid;
  try {
    const existing = await auth.getUserByEmail(email);
    uid = existing.uid;
    console.log(`Auth user already exists for ${email} (uid: ${uid}).`);
  } catch (err) {
    if (err.code === "auth/user-not-found") {
      const created = await auth.createUser({ email, displayName, emailVerified: false });
      uid = created.uid;
      console.log(`Created Firebase Auth user (uid: ${uid}).`);
    } else {
      throw err;
    }
  }

  // Write the user doc with super_admin role.
  await db.collection("users").doc(uid).set(
    {
      uid,
      email,
      displayName,
      role: "super_admin",
      active: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: "bootstrap",
    },
    { merge: true },
  );
  console.log("Firestore user doc written with role=super_admin.");

  // Trigger a password-reset email so the admin sets their own password.
  const link = await auth.generatePasswordResetLink(email);
  console.log("\n--- PASSWORD SETUP LINK ---");
  console.log(link);
  console.log("---------------------------\n");
  console.log(`Send the link above to ${email} to set their password.`);
  console.log("\nBootstrap complete. Delete this script's permissions and never run it again on this project.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Bootstrap failed:", err);
  process.exit(1);
});
