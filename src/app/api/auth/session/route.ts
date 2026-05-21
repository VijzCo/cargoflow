import { NextResponse, type NextRequest } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/rbac/session-shared";

// POST /api/auth/session — log in (set cookie from a valid Firebase ID token).
export async function POST(req: NextRequest) {
  try {
    const { idToken } = (await req.json()) as { idToken?: string };
    if (!idToken) {
      return NextResponse.json({ error: "Missing idToken" }, { status: 400 });
    }

    // Verify the ID token first; if it's stale (>5min) reject so the client
    // re-authenticates. This prevents replaying old tokens to mint sessions.
    const decoded = await adminAuth.verifyIdToken(idToken, true);
    const ageSeconds = Math.floor(Date.now() / 1000) - decoded.auth_time;
    if (ageSeconds > 5 * 60) {
      return NextResponse.json({ error: "Token too old" }, { status: 401 });
    }

    const sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn: SESSION_MAX_AGE_SECONDS * 1000,
    });

    const res = NextResponse.json({ ok: true });
    res.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: sessionCookie,
      maxAge: SESSION_MAX_AGE_SECONDS,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
    return res;
  } catch (err) {
    console.error("Session creation failed:", err);
    return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
  }
}

// DELETE /api/auth/session — log out (clear cookie).
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    maxAge: 0,
    path: "/",
  });
  return res;
}
