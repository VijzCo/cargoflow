import "server-only";
import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import type { Role, UserDoc } from "@/types";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  type SessionUser,
} from "./session-shared";

// Re-export so existing imports of these from "@/lib/rbac/session" still work
// on the server. Client and edge code should import from session-shared.
export { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS };
export type { SessionUser };

/**
 * Verifies the session cookie and loads the user's role from Firestore.
 * Returns null when no valid session is present.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = cookies();
  const cookie = store.get(SESSION_COOKIE_NAME)?.value;
  if (!cookie) return null;

  try {
    const decoded = await adminAuth.verifySessionCookie(cookie, true);
    const snap = await adminDb.collection("users").doc(decoded.uid).get();
    if (!snap.exists) return null;
    const data = snap.data() as UserDoc;
    if (!data.active) return null;

    return {
      uid: decoded.uid,
      email: data.email,
      role: data.role,
      active: data.active,
      supplierId: data.supplierId,
      displayName: data.displayName,
    };
  } catch {
    return null;
  }
}

export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    const err = new Error("Not authenticated") as Error & { status?: number };
    err.status = 401;
    throw err;
  }
  return user;
}

export async function requireRole(roles: Role[]): Promise<SessionUser> {
  const user = await requireSessionUser();
  if (!roles.includes(user.role)) {
    const err = new Error("Insufficient permissions") as Error & { status?: number };
    err.status = 403;
    throw err;
  }
  return user;
}
