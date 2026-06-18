"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { requireSessionUser } from "@/lib/rbac/session";
import { hasPermission } from "@/lib/rbac/permissions";
import { writeActivityLog } from "@/lib/utils/activity-log";
import type { Category, POItemStatus } from "@/types";
import type { POItemView } from "@/lib/utils/po-item-view";

export type { POItemView };

const VALID_STATUSES: POItemStatus[] = [
  "Pending", "Started", "In Progress", "Completed", "Loaded", "Shipped",
];

// Statuses a supplier may set (cannot mark Loaded/Shipped themselves)
const SUPPLIER_ALLOWED_STATUSES: POItemStatus[] = ["Started", "In Progress", "Completed"];

function toView(doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot): POItemView {
  const data = doc.data()!;
  return {
    id: doc.id,
    poId: data.poId,
    poNumbers: data.poNumbers ?? [],
    supplierId: data.supplierId,
    supplierName: data.supplierName,
    style: data.style,
    color: data.color,
    size: data.size,
    quantity: data.quantity,
    unit: data.unit,
    unitPrice: data.unitPrice,
    category: data.category,
    description: data.description,
    deliveryDate: data.deliveryDate,
    salesChannel: data.salesChannel,
    remarks: data.remarks,
    status: data.status ?? "Pending",
    cbm: data.cbm ?? 0,
    packageCount: data.packageCount ?? 0,
    grossWeight: data.grossWeight,
    netWeight: data.netWeight,
    supplierRemarks: data.supplierRemarks,
    containerId: data.containerId,
    vesselId: data.vesselId,
    composition: data.composition,
    reference: data.reference,
    shade: data.shade,
    fabricLocks: data.fabricLocks,
    updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? null,
  };
}

// =============================================================================
// getPODetail — PO header + all its items (merchant view)
// =============================================================================

export async function getPODetail(poId: string) {
  const user = await requireSessionUser();

  const poSnap = await adminDb.collection("purchase_orders").doc(poId).get();
  if (!poSnap.exists) throw new Error("Purchase order not found.");
  const po = poSnap.data()!;

  // Supplier isolation: a supplier can only fetch their own PO
  if (user.role === "supplier" && po.supplierId !== user.supplierId) {
    throw new Error("Not authorized to view this purchase order.");
  }

  const itemsSnap = await adminDb
    .collection("po_items")
    .where("poId", "==", poId)
    .get();

  const items = itemsSnap.docs.map(toView);

  // Re-compute totalCbm from items (cheap, keeps header in sync)
  const totalCbm = items.reduce((s, i) => s + (i.cbm || 0), 0);

  return {
    po: {
      id: poSnap.id,
      poNumber: po.poNumber as string,
      poNumbers: (po.poNumbers as string[]) ?? [po.poNumber],
      supplierId: po.supplierId as string,
      supplierName: po.supplierName as string,
      orderNo: po.orderNo as string | undefined,
      salesChannel: po.salesChannel as string | undefined,
      totalItems: po.totalItems as number,
      totalQuantity: po.totalQuantity as number,
      totalCbm,
      uploadedAt: (po.uploadedAt?.toDate?.() as Date | undefined)?.toISOString() ?? null,
    },
    items,
  };
}

// =============================================================================
// listPOItems — with filters (for the PO list page + production page)
// =============================================================================

const ListFiltersSchema = z.object({
  supplierId: z.string().optional(),
  status: z.enum(["Pending", "Started", "In Progress", "Completed", "Loaded", "Shipped"]).optional(),
  category: z.enum(["Fabric", "Trims", "Accessories", "Packaging", "Garments", "Others"]).optional(),
  salesChannel: z.string().optional(),
  deliveryDateFrom: z.string().optional(),
  deliveryDateTo: z.string().optional(),
  search: z.string().optional(),
  limit: z.number().int().positive().max(500).default(200),
});

export type ListFilters = z.infer<typeof ListFiltersSchema>;

export async function listPOItems(filters: ListFilters = { limit: 200 }) {
  const user = await requireSessionUser();
  const f = ListFiltersSchema.parse(filters);

  let q: FirebaseFirestore.Query = adminDb.collection("po_items");

  // Supplier isolation — non-negotiable
  if (user.role === "supplier" && user.supplierId) {
    q = q.where("supplierId", "==", user.supplierId);
  } else if (f.supplierId) {
    q = q.where("supplierId", "==", f.supplierId);
  }

  if (f.status) q = q.where("status", "==", f.status);
  if (f.category) q = q.where("category", "==", f.category);
  if (f.salesChannel) q = q.where("salesChannel", "==", f.salesChannel);

  // Delivery date range — only one inequality allowed per Firestore query;
  // if both are set we filter in memory after the read.
  if (f.deliveryDateFrom && !f.deliveryDateTo) {
    q = q.where("deliveryDate", ">=", f.deliveryDateFrom);
  } else if (f.deliveryDateTo && !f.deliveryDateFrom) {
    q = q.where("deliveryDate", "<=", f.deliveryDateTo);
  }

  q = q.limit(f.limit);
  const snap = await q.get();
  let items = snap.docs.map(toView);

  // In-memory finishing for filters Firestore can't combine
  if (f.deliveryDateFrom && f.deliveryDateTo) {
    items = items.filter((i) => i.deliveryDate && i.deliveryDate >= f.deliveryDateFrom! && i.deliveryDate <= f.deliveryDateTo!);
  }
  if (f.search?.trim()) {
    const s = f.search.toLowerCase();
    items = items.filter(
      (i) =>
        i.style.toLowerCase().includes(s) ||
        i.color.toLowerCase().includes(s) ||
        i.size.toLowerCase().includes(s) ||
        i.poNumbers.some((p) => p.toLowerCase().includes(s)) ||
        i.supplierName.toLowerCase().includes(s),
    );
  }

  return items;
}

// =============================================================================
// updateItemStatus
// =============================================================================

const StatusUpdateSchema = z.object({
  itemId: z.string().min(1),
  status: z.enum(VALID_STATUSES as [POItemStatus, ...POItemStatus[]]),
  supplierRemarks: z.string().optional(),
});

export async function updateItemStatus(input: z.infer<typeof StatusUpdateSchema>) {
  const user = await requireSessionUser();
  const { itemId, status, supplierRemarks } = StatusUpdateSchema.parse(input);

  const ref = adminDb.collection("po_items").doc(itemId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Item not found.");
  const item = snap.data()!;

  // Permission check — different rules per role
  if (user.role === "supplier") {
    if (item.supplierId !== user.supplierId) {
      throw new Error("Not authorized to update this item.");
    }
    if (!SUPPLIER_ALLOWED_STATUSES.includes(status)) {
      throw new Error(`Suppliers cannot set status to "${status}".`);
    }
  } else if (!hasPermission(user.role, "po_items.update_status")) {
    throw new Error("You don't have permission to update item status.");
  }

  const previousStatus = item.status as POItemStatus;
  const patch: Record<string, unknown> = {
    status,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: user.uid,
  };
  if (supplierRemarks !== undefined) patch.supplierRemarks = supplierRemarks;

  await ref.update(patch);

  await writeActivityLog({
    userId: user.uid,
    userEmail: user.email,
    userRole: user.role,
    action: "item.status_change",
    targetType: "po_item",
    targetId: itemId,
    details: { from: previousStatus, to: status, style: item.style, color: item.color, size: item.size },
  });

  revalidatePath(`/purchase-orders/${item.poId}`);
  revalidatePath("/production");
  return { ok: true };
}

// =============================================================================
// updateItemCBM — supplier enters CBM, package count, weights
// =============================================================================

const CBMUpdateSchema = z.object({
  itemId: z.string().min(1),
  cbm: z.number().nonnegative(),
  packageCount: z.number().int().nonnegative(),
  grossWeight: z.number().nonnegative().optional(),
  netWeight: z.number().nonnegative().optional(),
  supplierRemarks: z.string().optional(),
  /** If true, also moves the item to "Completed" status. */
  markCompleted: z.boolean().default(false),
});

export async function updateItemCBM(input: z.infer<typeof CBMUpdateSchema>) {
  const user = await requireSessionUser();
  const {
    itemId, cbm, packageCount, grossWeight, netWeight, supplierRemarks, markCompleted,
  } = CBMUpdateSchema.parse(input);

  const ref = adminDb.collection("po_items").doc(itemId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Item not found.");
  const item = snap.data()!;

  if (user.role === "supplier") {
    if (item.supplierId !== user.supplierId) {
      throw new Error("Not authorized to update this item.");
    }
  } else if (!hasPermission(user.role, "po_items.update_cbm")) {
    throw new Error("You don't have permission to update CBM.");
  }

  // Net should not exceed gross when both provided
  if (grossWeight !== undefined && netWeight !== undefined && netWeight > grossWeight) {
    throw new Error("Net weight cannot exceed gross weight.");
  }

  const patch: Record<string, unknown> = {
    cbm,
    packageCount,
    grossWeight,
    netWeight,
    supplierRemarks,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: user.uid,
  };
  if (markCompleted) patch.status = "Completed";

  await ref.update(patch);

  await writeActivityLog({
    userId: user.uid,
    userEmail: user.email,
    userRole: user.role,
    action: "item.cbm_update",
    targetType: "po_item",
    targetId: itemId,
    details: { cbm, packageCount, markCompleted, style: item.style, color: item.color, size: item.size },
  });

  // Best-effort: update parent PO's totalCbm
  try {
    const sibSnap = await adminDb.collection("po_items").where("poId", "==", item.poId).get();
    const totalCbm = sibSnap.docs.reduce((s, d) => s + ((d.id === itemId ? cbm : d.data().cbm) ?? 0), 0);
    await adminDb.collection("purchase_orders").doc(item.poId).update({
      totalCbm,
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error("[updateItemCBM] failed to roll up totalCbm:", err);
  }

  revalidatePath(`/purchase-orders/${item.poId}`);
  revalidatePath("/production");
  return { ok: true };
}

// =============================================================================
// updateFabricDetails — merchant-only. Writes any of composition/reference/shade
// that are currently empty (or unlocked) on the item. Locked fields are
// rejected silently (preserving existing values). Once a value is written,
// the matching lock flag is flipped to true.
// =============================================================================

const FabricDetailsSchema = z.object({
  itemId: z.string().min(1),
  composition: z.string().trim().optional(),
  reference: z.string().trim().optional(),
  shade: z.string().trim().optional(),
});

export async function updateFabricDetails(input: z.infer<typeof FabricDetailsSchema>) {
  const user = await requireSessionUser();
  // Per CR: merchants only (which also includes super_admin and logistics via
  // the same purchase_orders.update permission). Suppliers + viewers are denied.
  if (!hasPermission(user.role, "purchase_orders.update")) {
    throw new Error("You don't have permission to edit fabric details.");
  }
  const data = FabricDetailsSchema.parse(input);

  const ref = adminDb.collection("po_items").doc(data.itemId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Item not found.");
  const item = snap.data()!;

  if (item.category !== "Fabric") {
    throw new Error("Fabric details only apply to items with category = Fabric.");
  }

  const existingLocks = item.fabricLocks ?? {};
  const updates: Record<string, unknown> = {};
  const newLocks = { ...existingLocks };
  const changedFields: string[] = [];

  // Only persist non-empty values for fields that are NOT already locked.
  if (data.composition && data.composition.length > 0 && !existingLocks.composition) {
    updates.composition = data.composition;
    newLocks.composition = true;
    changedFields.push("composition");
  }
  if (data.reference && data.reference.length > 0 && !existingLocks.reference) {
    updates.reference = data.reference;
    newLocks.reference = true;
    changedFields.push("reference");
  }
  if (data.shade && data.shade.length > 0 && !existingLocks.shade) {
    updates.shade = data.shade;
    newLocks.shade = true;
    changedFields.push("shade");
  }

  if (changedFields.length === 0) {
    // Nothing actionable — either everything was empty or all fields were already locked.
    return { ok: true, changed: 0 };
  }

  updates.fabricLocks = newLocks;
  updates.updatedAt = FieldValue.serverTimestamp();
  updates.updatedBy = user.uid;

  await ref.update(updates);

  await writeActivityLog({
    userId: user.uid,
    userEmail: user.email,
    userRole: user.role,
    action: "item.fabric_update",
    targetType: "po_item",
    targetId: data.itemId,
    details: {
      style: item.style,
      color: item.color,
      size: item.size,
      fieldsSet: changedFields,
    },
  });

  revalidatePath(`/purchase-orders/${item.poId}`);
  revalidatePath("/production");
  return { ok: true, changed: changedFields.length };
}

// =============================================================================
// listAllSuppliers — for filter dropdowns (non-supplier roles only)
// =============================================================================

export async function listSuppliersForFilter() {
  const user = await requireSessionUser();
  if (user.role === "supplier") return []; // suppliers don't filter; they see their own

  const snap = await adminDb.collection("suppliers").where("active", "==", true).orderBy("name").get();
  return snap.docs.map((d) => ({ id: d.id, name: d.data().name as string }));
}
