"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import {
  onIdTokenChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  type User as FirebaseUser,
} from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import type { Role, UserDoc } from "@/types";

interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  userDoc: UserDoc | null;
  role: Role | undefined;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  sendReset: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [userDoc, setUserDoc] = useState<UserDoc | null>(null);
  const [loading, setLoading] = useState(true);

  // Track Firebase auth state.
  useEffect(() => {
    const unsub = onIdTokenChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (!fbUser) {
        setUserDoc(null);
        setLoading(false);
        return;
      }
      // Pre-load the user doc so children can render with role info immediately.
      try {
        const snap = await getDoc(doc(db, "users", fbUser.uid));
        if (snap.exists()) {
          setUserDoc({ id: snap.id, ...snap.data() } as UserDoc);
        }
      } catch (err) {
        console.error("Failed to load user doc:", err);
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  // Realtime subscription to the user doc (role changes, deactivation).
  useEffect(() => {
    if (!firebaseUser) return;
    const ref = doc(db, "users", firebaseUser.uid);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        setUserDoc({ id: snap.id, ...snap.data() } as UserDoc);
      }
    });
    return unsub;
  }, [firebaseUser]);

  const signIn = useCallback(async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const idToken = await cred.user.getIdToken(true);

    // Exchange ID token for HTTP-only session cookie.
    const res = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    if (!res.ok) {
      // Roll back the Firebase sign-in so we never leave the UI half-authenticated.
      await firebaseSignOut(auth);
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "Failed to create session.");
    }
  }, []);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/session", { method: "DELETE" });
    await firebaseSignOut(auth);
    setUserDoc(null);
  }, []);

  const sendReset = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email, {
      url: `${process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin}/login`,
    });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        userDoc,
        role: userDoc?.role,
        loading,
        signIn,
        signOut,
        sendReset,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>.");
  return ctx;
}
