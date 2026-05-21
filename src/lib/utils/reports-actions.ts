"use server";

import { adminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/rbac/session";
import { hasPermission } from "@/lib/rbac/permissions";
import type { Category, POItemStatus } from "@/types";

export type ReportData = {
  kpis: {
    totalPOs: number;
    totalItems: number;
    totalQuantity: number;
    totalCbm: number;
    completedCbm: number;
    onTimePercent: number;
    overdueCount: number;
  };
  byStatus: Record<POItemStatus, number>;
  byCategory: Record<Category, { count: number; cbm: number }>;
  bySupplier: { supplierId: string; supplierName: string; items: number; cbm: number; completed: number }[];
  weeklyUploads: { weekStart: string; count: number }[];
  recentVessels: { id: string; vesselId: string; destination: string; status: string; etd?: string }[];
};

const ZERO_STATUS: Record<POItemStatus, number> = {
  "Pending": 0, "Started": 0, "In Progress": 0, "Completed": 0, "Loaded": 0, "Shipped": 0,
};

const ZERO_CATEGORY: Record<Category, { count: number; cbm: number }> = {
  Fabric: { count: 0, cbm: 0 },
  Trims: { count: 0, cbm: 0 },
  Accessories: { count: 0, cbm: 0 },
  Packaging: { count: 0, cbm: 0 },
  Garments: { count: 0, cbm: 0 },
  Others: { count: 0, cbm: 0 },
};

export async function getReportData(): Promise<ReportData> {
  const user = await requireSessionUser();
  if (!hasPermission(user.role, "reports.view")) {
    throw new Error("You don't have permission to view reports.");
  }

  // For supplier users, isolate to their items
  const itemsQuery = user.role === "supplier" && user.supplierId
    ? adminDb.collection("po_items").where("supplierId", "==", user.supplierId)
    : adminDb.collection("po_items");

  const [itemsSnap, posSnap, vesselsSnap] = await Promise.all([
    itemsQuery.limit(2000).get(),
    user.role === "supplier" && user.supplierId
      ? adminDb.collection("purchase_orders").where("supplierId", "==", user.supplierId).get()
      : adminDb.collection("purchase_orders").get(),
    adminDb.collection("vessels").orderBy("createdAt", "desc").limit(10).get(),
  ]);

  const today = new Date().toISOString().slice(0, 10);

  // Aggregate items
  const byStatus = { ...ZERO_STATUS };
  const byCategory: Record<Category, { count: number; cbm: number }> = JSON.parse(JSON.stringify(ZERO_CATEGORY));
  const supplierAgg = new Map<string, { supplierName: string; items: number; cbm: number; completed: number }>();
  let totalCbm = 0;
  let totalQuantity = 0;
  let completedCbm = 0;
  let overdueCount = 0;
  let onTimeCompleted = 0;
  let totalCompleted = 0;

  for (const doc of itemsSnap.docs) {
    const data = doc.data();
    const status = (data.status ?? "Pending") as POItemStatus;
    const category = (data.category ?? "Others") as Category;
    const cbm = data.cbm ?? 0;
    const qty = data.quantity ?? 0;
    const deliveryDate = data.deliveryDate as string | undefined;
    const supplierId = data.supplierId as string;
    const supplierName = data.supplierName as string;

    byStatus[status] = (byStatus[status] ?? 0) + 1;
    byCategory[category].count++;
    byCategory[category].cbm += cbm;

    totalCbm += cbm;
    totalQuantity += qty;
    if (status === "Completed" || status === "Loaded" || status === "Shipped") {
      completedCbm += cbm;
    }

    const sg = supplierAgg.get(supplierId) ?? { supplierName, items: 0, cbm: 0, completed: 0 };
    sg.items++;
    sg.cbm += cbm;
    if (status === "Completed" || status === "Loaded" || status === "Shipped") sg.completed++;
    supplierAgg.set(supplierId, sg);

    if (deliveryDate && deliveryDate < today && status !== "Completed" && status !== "Loaded" && status !== "Shipped") {
      overdueCount++;
    }

    if (status === "Completed" || status === "Loaded" || status === "Shipped") {
      totalCompleted++;
      // "On time" = completed and either no delivery date, or completed by date.
      // We don't have a "completedAt" date so we approximate: if deliveryDate >= today (i.e. not yet overdue)
      // OR there is no deliveryDate, we count as on time.
      if (!deliveryDate || deliveryDate >= today) onTimeCompleted++;
    }
  }

  // Weekly uploads (last 8 weeks)
  const weeklyMap = new Map<string, number>();
  const now = new Date();
  for (let i = 7; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    // Round down to Monday
    const day = d.getUTCDay();
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() - ((day + 6) % 7));
    weeklyMap.set(monday.toISOString().slice(0, 10), 0);
  }
  const oldestWeekStart = Array.from(weeklyMap.keys())[0]!;
  for (const doc of posSnap.docs) {
    const ts = doc.data().uploadedAt ?? doc.data().createdAt;
    const date: Date | null = ts?.toDate?.() ?? null;
    if (!date) continue;
    const day = date.getUTCDay();
    const monday = new Date(date);
    monday.setUTCDate(date.getUTCDate() - ((day + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    if (key < oldestWeekStart) continue;
    weeklyMap.set(key, (weeklyMap.get(key) ?? 0) + 1);
  }
  const weeklyUploads = Array.from(weeklyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, count]) => ({ weekStart, count }));

  // Top suppliers by CBM (descending), limit 8
  const bySupplier = Array.from(supplierAgg.entries())
    .map(([supplierId, v]) => ({ supplierId, ...v }))
    .sort((a, b) => b.cbm - a.cbm)
    .slice(0, 8);

  // Recent vessels
  const recentVessels = vesselsSnap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      vesselId: data.vesselId as string,
      destination: data.destination as string,
      status: data.status as string,
      etd: data.etd as string | undefined,
    };
  });

  return {
    kpis: {
      totalPOs: posSnap.size,
      totalItems: itemsSnap.size,
      totalQuantity,
      totalCbm: Number(totalCbm.toFixed(2)),
      completedCbm: Number(completedCbm.toFixed(2)),
      onTimePercent: totalCompleted > 0 ? Math.round((onTimeCompleted / totalCompleted) * 100) : 0,
      overdueCount,
    },
    byStatus,
    byCategory,
    bySupplier,
    weeklyUploads,
    recentVessels,
  };
}
