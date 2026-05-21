import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import type { ActivityAction, Role } from "@/types";

export async function writeActivityLog(args: {
  userId: string;
  userEmail: string;
  userRole: Role;
  action: ActivityAction;
  targetType: string;
  targetId: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    await adminDb.collection("activity_logs").add({
      ...args,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    // Audit log failures should NEVER block the primary operation.
    console.error("[activity_log] write failed:", err);
  }
}
