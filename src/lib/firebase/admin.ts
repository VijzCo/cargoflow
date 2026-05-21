import "server-only";
import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

// Lazy admin singleton. Throws clearly if env vars are missing — better than
// a cryptic "Failed to parse private key" deep in the call stack.

function getPrivateKey(): string {
  const raw = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (!raw) throw new Error("FIREBASE_ADMIN_PRIVATE_KEY is not set.");
  // Vercel and similar platforms store secrets with literal \n. Convert them.
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

function getAdminApp(): App {
  if (getApps().length) return getApps()[0]!;

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  if (!projectId || !clientEmail) {
    throw new Error(
      "Firebase Admin env vars missing. Set FIREBASE_ADMIN_PROJECT_ID, " +
      "FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY.",
    );
  }

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey: getPrivateKey() }),
  });
}

export const adminApp: App = getAdminApp();
export const adminAuth: Auth = getAuth(adminApp);

const _adminDb = getFirestore(adminApp);
// Quietly drop undefined values during writes instead of throwing. Without this,
// any payload with an optional field set to undefined (e.g. PO item without
// `remarks` or `unitPrice`) crashes the batch. Safe to call repeatedly thanks
// to the try/catch — `settings()` throws if called twice on the same instance.
try {
  _adminDb.settings({ ignoreUndefinedProperties: true });
} catch {
  // already set (HMR re-import, etc.) — ignore
}
export const adminDb: Firestore = _adminDb;
