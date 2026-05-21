"use server";

import { adminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/rbac/session";

export type DashboardData = {
  totalPOs: number;
  inProductionCount: number;
  pendingCount: number;
  completedCount: number;
  overdueCount: number;
  containerUtilization: number; // 0-1
  openContainers: number;
  sealedContainers: number;
  vesselsInTransit: number;
  vesselsPlanned: number;
  recentItems: {
    id: string;
    poId: string;
    poNumber: string;
    style: string;
    color: string;
    size: string;
    supplierName: string;
    status: string;
    updatedAt: string | null;
  }[];
  upcomingDeliveries: {
    id: string;
    poId: string;
    poNumber: string;
    style: string;
    supplierName: string;
    deliveryDate: string;
    status: string;
    daysUntil: number;
  }[];
};

export async function getDashboardData(): Promise<DashboardData> {
  const user = await requireSessionUser();

  // Supplier isolation
  const isSupplier = user.role === "supplier";
  const supplierId = user.supplierId;

  // Items query — scope to supplier when applicable
  let itemsQ: FirebaseFirestore.Query = adminDb.collection("po_items");
  if (isSupplier && supplierId) itemsQ = itemsQ.where("supplierId", "==", supplierId);

  let posQ: FirebaseFirestore.Query = adminDb.collection("purchase_orders");
  if (isSupplier && supplierId) posQ = posQ.where("supplierId", "==", supplierId);

  const [itemsSnap, posSnap, containersSnap, vesselsSnap] = await Promise.all([
    itemsQ.limit(2000).get(),
    posQ.limit(1000).get(),
    adminDb.collection("containers").get(),
    adminDb.collection("vessels").get(),
  ]);

  // Item counters
  const today = new Date().toISOString().slice(0, 10);
  let pendingCount = 0;
  let inProductionCount = 0;
  let completedCount = 0;
  let overdueCount = 0;

  for (const doc of itemsSnap.docs) {
    const d = doc.data();
    const status = d.status ?? "Pending";
    if (status === "Pending") pendingCount++;
    else if (status === "Started" || status === "In Progress") inProductionCount++;
    else if (status === "Completed" || status === "Loaded" || status === "Shipped") completedCount++;

    if (d.deliveryDate && d.deliveryDate < today && status !== "Completed" && status !== "Loaded" && status !== "Shipped") {
      overdueCount++;
    }
  }

  // Container utilization (avg across non-shipped containers)
  let totalLoaded = 0;
  let totalUsable = 0;
  let openContainers = 0;
  let sealedContainers = 0;
  for (const doc of containersSnap.docs) {
    const d = doc.data();
    const status = d.status ?? "Open";
    if (status === "Shipped") continue;
    if (status === "Open") openContainers++;
    if (status === "Sealed") sealedContainers++;
    totalLoaded += d.loadedCbm ?? 0;
    totalUsable += d.usableCbm ?? 0;
  }
  const containerUtilization = totalUsable > 0 ? totalLoaded / totalUsable : 0;

  // Vessels
  let vesselsInTransit = 0;
  let vesselsPlanned = 0;
  for (const doc of vesselsSnap.docs) {
    const status = doc.data().status ?? "Planned";
    if (status === "Sailed") vesselsInTransit++;
    if (status === "Planned" || status === "Loading") vesselsPlanned++;
  }

  // Recent items — top 5 by updatedAt
  type ItemAgg = {
    id: string; poId: string; style: string; color: string; size: string;
    supplierName: string; status: string; updatedAt: string | null; updatedAtMs: number;
  };
  const recentRaw: ItemAgg[] = itemsSnap.docs.map((d) => {
    const data = d.data();
    const ts = data.updatedAt?.toDate?.() as Date | undefined;
    return {
      id: d.id,
      poId: data.poId,
      style: data.style,
      color: data.color,
      size: data.size,
      supplierName: data.supplierName,
      status: data.status ?? "Pending",
      updatedAt: ts?.toISOString() ?? null,
      updatedAtMs: ts?.getTime() ?? 0,
    };
  });
  recentRaw.sort((a, b) => b.updatedAtMs - a.updatedAtMs);

  // PO number lookup for the top 5 + top 5 upcoming
  const itemsToShow = recentRaw.slice(0, 5);

  // Upcoming deliveries — items with future deliveryDate, not yet Completed
  const upcomingRaw = itemsSnap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        poId: data.poId as string,
        style: data.style as string,
        supplierName: data.supplierName as string,
        deliveryDate: data.deliveryDate as string | undefined,
        status: (data.status ?? "Pending") as string,
      };
    })
    .filter((i) => i.deliveryDate && i.deliveryDate >= today &&
      i.status !== "Completed" && i.status !== "Loaded" && i.status !== "Shipped");
  upcomingRaw.sort((a, b) => (a.deliveryDate ?? "").localeCompare(b.deliveryDate ?? ""));
  const upcomingToShow = upcomingRaw.slice(0, 5);

  // Fetch PO numbers for both sets in one batch
  const poIds = Array.from(new Set([
    ...itemsToShow.map((i) => i.poId),
    ...upcomingToShow.map((i) => i.poId),
  ])).filter(Boolean);
  const poNumberMap = new Map<string, string>();
  for (let i = 0; i < poIds.length; i += 30) {
    const chunk = poIds.slice(i, i + 30);
    if (chunk.length === 0) continue;
    const snap = await adminDb.collection("purchase_orders").where("id", "in", chunk).get();
    for (const d of snap.docs) poNumberMap.set(d.id, d.data().poNumber as string);
  }

  const recentItems = itemsToShow.map((it) => ({
    id: it.id,
    poId: it.poId,
    poNumber: poNumberMap.get(it.poId) ?? "—",
    style: it.style,
    color: it.color,
    size: it.size,
    supplierName: it.supplierName,
    status: it.status,
    updatedAt: it.updatedAt,
  }));

  const upcomingDeliveries = upcomingToShow.map((it) => {
    const dueDate = new Date(it.deliveryDate!);
    const todayDate = new Date(today);
    const daysUntil = Math.round((dueDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
    return {
      id: it.id,
      poId: it.poId,
      poNumber: poNumberMap.get(it.poId) ?? "—",
      style: it.style,
      supplierName: it.supplierName,
      deliveryDate: it.deliveryDate!,
      status: it.status,
      daysUntil,
    };
  });

  return {
    totalPOs: posSnap.size,
    inProductionCount,
    pendingCount,
    completedCount,
    overdueCount,
    containerUtilization,
    openContainers,
    sealedContainers,
    vesselsInTransit,
    vesselsPlanned,
    recentItems,
    upcomingDeliveries,
  };
}
