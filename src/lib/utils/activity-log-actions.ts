"use server";

import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/rbac/session";
import { hasPermission } from "@/lib/rbac/permissions";
import type { ActivityAction, Role } from "@/types";

export type ActivityLogView = {
  id: string;
  userId: string;
  userEmail: string;
  userRole: Role;
  action: ActivityAction;
  targetType: string;
  targetId: string;
  details?: Record<string, unknown>;
  createdAt: string | null;
};

const ListFiltersSchema = z.object({
  action: z.string().optional(),
  targetType: z.string().optional(),
  userId: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  limit: z.number().int().positive().max(500).default(100),
});

export async function listActivityLogs(filters: z.infer<typeof ListFiltersSchema> = { limit: 100 }) {
  const user = await requireSessionUser();
  if (!hasPermission(user.role, "activity_logs.view")) {
    throw new Error("You don't have permission to view activity logs.");
  }
  const f = ListFiltersSchema.parse(filters);

  let q: FirebaseFirestore.Query = adminDb.collection("activity_logs");
  // Order by date DESC and limit. We do NOT chain a "where" for action/targetType
  // here to avoid index-creation friction; we filter client-side after fetch.
  q = q.orderBy("createdAt", "desc").limit(f.limit);
  const snap = await q.get();

  let logs: ActivityLogView[] = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      userId: data.userId,
      userEmail: data.userEmail,
      userRole: data.userRole,
      action: data.action,
      targetType: data.targetType,
      targetId: data.targetId,
      details: data.details,
      createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
    };
  });

  // In-memory filters (small dataset, infrequent reads)
  if (f.action) logs = logs.filter((l) => l.action === f.action);
  if (f.targetType) logs = logs.filter((l) => l.targetType === f.targetType);
  if (f.userId) logs = logs.filter((l) => l.userId === f.userId);
  if (f.fromDate) logs = logs.filter((l) => !l.createdAt || l.createdAt >= f.fromDate!);
  if (f.toDate) {
    const toEnd = `${f.toDate}T23:59:59.999Z`;
    logs = logs.filter((l) => !l.createdAt || l.createdAt <= toEnd);
  }

  return logs;
}
