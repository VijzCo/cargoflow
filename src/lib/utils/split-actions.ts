"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { requireSessionUser } from "@/lib/rbac/session";
import { hasPermission } from "@/lib/rbac/permissions";
import { writeActivityLog } from "@/lib/utils/activity-log";
import { MIN_SPLIT_CHILDREN, MAX_SPLIT_CHILDREN, type SplitRequestView } from "@/lib/utils/split-request-types";
import type {
  EditRequestStatus, Role, SplitReasonCategory,
} from "@/types";

// =============================================================================
// Schemas
// =============================================================================

const ReasonCategoryEnum = z.enum([
  "supplier_capacity", "customer_early_lot", "logistics_constraint", "other",
]);

const SplitChildSchema = z.object({
  quantity: z.number().positive(),
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  label: z.string().max(120).optional(),
}).strict();

const SplitPlanSchema = z.object({
  children: z.array(SplitChildSchema)
    .min(MIN_SPLIT_CHILDREN, `A split must have at least ${MIN_SPLIT_CHILDREN} children.`)
    .max(MAX_SPLIT_CHILDREN, `A split can have at most ${MAX_SPLIT_CHILDREN} children.`),
  reasonCategory: ReasonCategoryEnum,
  reasonText: z.string().max(500).optional(),
}).strict();

const SubmitSchema = z.object({
  itemId: z.string().min(1),
  plan: SplitPlanSchema,
});

const ResolveSchema = z.object({
  requestId: z.string().min(1),
  approve: z.boolean(),
  note: z.string().max(500).optional(),
});

const DirectSplitSchema = z.object({
  itemId: z.string().min(1),
  plan: SplitPlanSchema,
});

// =============================================================================
// Internal helpers
// =============================================================================

/** Item must be in a state that permits splitting. */
function assertItemSplittable(item: FirebaseFirestore.DocumentData) {
  if (item.status === "Loaded" || item.status === "Shipped") {
    throw new Error("This item is already assigned to a container and can't be split.");
  }
  if (item.containerId) {
    throw new Error("This item is already assigned to a container and can't be split.");
  }
  if (item.status === "Split") {
    throw new Error("This item has already been split.");
  }
  if (item.splitFromItemId) {
    throw new Error("This item is itself a child of a previous split and can't be split further.");
  }
}

/** Validate that child quantities sum exactly to the parent quantity. */
function assertQuantitiesMatch(children: { quantity: number }[], parentQty: number) {
  const sum = children.reduce((acc, c) => acc + c.quantity, 0);
  // Use a small tolerance for floating-point rounding on non-integer quantities
  if (Math.abs(sum - parentQty) > 0.001) {
    throw new Error(
      `Split quantities must sum to the parent quantity (${parentQty}). ` +
      `Currently they sum to ${sum}.`,
    );
  }
}

/** Ensure there isn't a competing pending workflow on this item. */
async function assertNoPendingWorkflowsOnItem(itemId: string) {
  const editSnap = await adminDb
    .collection("item_edit_requests")
    .where("itemId", "==", itemId)
    .where("status", "==", "pending")
    .limit(1)
    .get();
  if (!editSnap.empty) {
    throw new Error("This item has a pending edit request. Resolve it before splitting.");
  }

  const splitSnap = await adminDb
    .collection("item_split_requests")
    .where("itemId", "==", itemId)
    .where("status", "==", "pending")
    .limit(1)
    .get();
  if (!splitSnap.empty) {
    throw new Error("This item already has a pending split request. Cancel it before submitting a new one.");
  }
}

/**
 * The critical apply operation. Creates N child items, marks the parent
 * as "Split", and writes an activity log entry. Runs inside a batch so
 * either all writes land or none do.
 */
async function applySplitToItem({
  itemId,
  plan,
  actor,
  source,        // "direct" | "approved"
  requestId,
}: {
  itemId: string;
  plan: { children: { quantity: number; deliveryDate?: string; label?: string }[]; reasonCategory: SplitReasonCategory; reasonText?: string };
  actor: { uid: string; email: string; role: Role };
  source: "direct" | "approved";
  requestId?: string;
}): Promise<{ childIds: string[] }> {
  const itemRef = adminDb.collection("po_items").doc(itemId);
  const itemSnap = await itemRef.get();
  if (!itemSnap.exists) throw new Error("Item not found.");
  const item = itemSnap.data()!;

  // Re-check at apply time (state may have changed since request was submitted)
  assertItemSplittable(item);
  assertQuantitiesMatch(plan.children, item.quantity);

  const batch = adminDb.batch();
  const splitGroupId = adminDb.collection("po_items").doc().id;  // unique group id
  const childIds: string[] = [];
  const totalChildren = plan.children.length;
  const now = FieldValue.serverTimestamp();

  // Create children. Each child inherits most of the parent's identity but
  // starts fresh on CBM/packaging/weights (supplier redeclares per lot).
  for (let i = 0; i < plan.children.length; i++) {
    const c = plan.children[i];
    const childRef = adminDb.collection("po_items").doc();
    childIds.push(childRef.id);

    const child: Record<string, unknown> = {
      id: childRef.id,
      poId: item.poId,
      poNumbers: item.poNumbers ?? [],
      supplierId: item.supplierId,
      supplierName: item.supplierName,
      style: item.style,
      color: item.color,
      size: item.size,
      quantity: c.quantity,
      unit: item.unit,
      category: item.category,
      // Note: uniqueKey is intentionally suffixed so children don't clash
      // with the parent's original key or with each other.
      uniqueKey: `${item.uniqueKey}#split-${splitGroupId}-${i + 1}`,

      // Fabric locks carry to all children — same mill spec applies
      composition: item.composition ?? null,
      reference: item.reference ?? null,
      shade: item.shade ?? null,
      fabricLocks: item.fabricLocks ?? null,

      // Reset production state — supplier redeclares as each lot completes
      status: "Pending",
      cbm: 0,
      packageCount: 0,

      // Delivery date: child-specific if given, else fall back to parent
      deliveryDate: c.deliveryDate ?? item.deliveryDate ?? null,

      // Copy through informational fields
      description: item.description ?? null,
      salesChannel: item.salesChannel ?? null,
      remarks: item.remarks ?? null,
      unitPrice: item.unitPrice ?? null,

      // Split lineage
      splitFromItemId: itemId,
      splitGroupId,
      splitIndex: i + 1,
      splitTotal: totalChildren,
      splitLabel: c.label ?? null,

      createdAt: now,
      updatedAt: now,
      updatedBy: actor.uid,
    };

    // Strip explicit-null fields Firestore doesn't like when we intended
    // "not present" (Firestore stores null explicitly which is usually fine;
    // we keep this permissive so reads with `?? undefined` still work).
    batch.set(childRef, child);
  }

  // Mark the parent as Split — kept for history, no longer eligible for containers
  batch.update(itemRef, {
    status: "Split",
    splitChildIds: childIds,
    splitAt: now,
    splitBy: actor.uid,
    updatedAt: now,
    updatedBy: actor.uid,
  });

  await batch.commit();

  await writeActivityLog({
    userId: actor.uid,
    userEmail: actor.email,
    userRole: actor.role,
    action: source === "direct" ? "item.split_applied_direct" : "item.split_approved",
    targetType: "po_item",
    targetId: itemId,
    details: {
      parentStyle: item.style,
      parentColor: item.color,
      parentSize: item.size,
      parentQuantity: item.quantity,
      childCount: plan.children.length,
      childIds,
      splitGroupId,
      reasonCategory: plan.reasonCategory,
      reasonText: plan.reasonText,
      ...(requestId ? { requestId } : {}),
    },
  });

  return { childIds };
}

function parentSnapshotFromItem(item: FirebaseFirestore.DocumentData) {
  return {
    style: item.style,
    color: item.color,
    size: item.size,
    quantity: item.quantity,
    unit: item.unit,
    deliveryDate: item.deliveryDate ?? undefined,
  };
}

// =============================================================================
// Public: submit split request (merchant)
// =============================================================================

export async function submitSplitRequest(input: z.infer<typeof SubmitSchema>) {
  const user = await requireSessionUser();
  if (!hasPermission(user.role, "po_items.split_request") &&
      !hasPermission(user.role, "po_items.split_direct")) {
    throw new Error("You don't have permission to request item splits.");
  }
  const data = SubmitSchema.parse(input);

  const itemRef = adminDb.collection("po_items").doc(data.itemId);
  const itemSnap = await itemRef.get();
  if (!itemSnap.exists) throw new Error("Item not found.");
  const item = itemSnap.data()!;
  assertItemSplittable(item);
  assertQuantitiesMatch(data.plan.children, item.quantity);
  await assertNoPendingWorkflowsOnItem(data.itemId);

  const ref = adminDb.collection("item_split_requests").doc();
  await ref.set({
    id: ref.id,
    itemId: data.itemId,
    poId: item.poId,
    supplierId: item.supplierId,
    status: "pending" as EditRequestStatus,
    plan: data.plan,
    parentSnapshot: parentSnapshotFromItem(item),
    requestedBy: user.uid,
    requestedByEmail: user.email,
    requestedAt: FieldValue.serverTimestamp(),
  });

  await writeActivityLog({
    userId: user.uid,
    userEmail: user.email,
    userRole: user.role,
    action: "item.split_requested",
    targetType: "po_item",
    targetId: data.itemId,
    details: {
      requestId: ref.id,
      childCount: data.plan.children.length,
      reasonCategory: data.plan.reasonCategory,
      reasonText: data.plan.reasonText,
    },
  });

  revalidatePath(`/purchase-orders/${item.poId}`);
  revalidatePath("/production");
  revalidatePath("/admin/approvals");
  return { id: ref.id };
}

// =============================================================================
// Public: resolve split request (manager, admin)
// =============================================================================

export async function resolveSplitRequest(input: z.infer<typeof ResolveSchema>) {
  const actor = await requireSessionUser();
  if (!hasPermission(actor.role, "po_items.split_approve")) {
    throw new Error("You don't have permission to approve split requests.");
  }
  const data = ResolveSchema.parse(input);

  const reqRef = adminDb.collection("item_split_requests").doc(data.requestId);
  const reqSnap = await reqRef.get();
  if (!reqSnap.exists) throw new Error("Request not found.");
  const req = reqSnap.data()!;

  if (req.status !== "pending") {
    throw new Error(`Request is already ${req.status}.`);
  }
  if (req.requestedBy === actor.uid) {
    throw new Error("You can't approve your own split request. Another approver must review it.");
  }

  if (data.approve) {
    // Apply the split — this re-validates the item and quantity constraints
    let childIds: string[] = [];
    try {
      const result = await applySplitToItem({
        itemId: req.itemId,
        plan: req.plan,
        actor,
        source: "approved",
        requestId: req.id,
      });
      childIds = result.childIds;
    } catch (err) {
      // If applying failed (item deleted, state changed, etc.), reject with a note
      const msg = err instanceof Error ? err.message : "Failed to apply split.";
      await reqRef.update({
        status: "rejected",
        resolvedBy: actor.uid,
        resolvedByEmail: actor.email,
        resolvedAt: FieldValue.serverTimestamp(),
        resolverNote: `Auto-rejected: ${msg}`,
      });
      throw err;
    }

    await reqRef.update({
      status: "approved",
      resolvedBy: actor.uid,
      resolvedByEmail: actor.email,
      resolvedAt: FieldValue.serverTimestamp(),
      resolverNote: data.note || undefined,
      createdChildIds: childIds,
    });
  } else {
    await reqRef.update({
      status: "rejected",
      resolvedBy: actor.uid,
      resolvedByEmail: actor.email,
      resolvedAt: FieldValue.serverTimestamp(),
      resolverNote: data.note || undefined,
    });
    await writeActivityLog({
      userId: actor.uid,
      userEmail: actor.email,
      userRole: actor.role,
      action: "item.split_rejected",
      targetType: "po_item",
      targetId: req.itemId,
      details: { requestId: req.id, reason: data.note },
    });
  }

  revalidatePath(`/purchase-orders/${req.poId}`);
  revalidatePath("/production");
  revalidatePath("/admin/approvals");
  return { ok: true };
}

// =============================================================================
// Public: cancel a pending split request (owner or super_admin)
// =============================================================================

export async function cancelSplitRequest(requestId: string) {
  const user = await requireSessionUser();
  const ref = adminDb.collection("item_split_requests").doc(requestId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Request not found.");
  const req = snap.data()!;

  if (req.status !== "pending") throw new Error(`Request is already ${req.status}.`);

  const canCancel = req.requestedBy === user.uid || user.role === "super_admin";
  if (!canCancel) throw new Error("Only the requester or a super admin can cancel this request.");

  await ref.update({
    status: "cancelled",
    resolvedBy: user.uid,
    resolvedByEmail: user.email,
    resolvedAt: FieldValue.serverTimestamp(),
  });

  await writeActivityLog({
    userId: user.uid,
    userEmail: user.email,
    userRole: user.role,
    action: "item.split_cancelled",
    targetType: "po_item",
    targetId: req.itemId,
    details: { requestId: req.id },
  });

  revalidatePath(`/purchase-orders/${req.poId}`);
  revalidatePath("/production");
  revalidatePath("/admin/approvals");
  return { ok: true };
}

// =============================================================================
// Public: split directly (manager, admin — bypasses approval)
// =============================================================================

export async function splitItemDirect(input: z.infer<typeof DirectSplitSchema>) {
  const user = await requireSessionUser();
  if (!hasPermission(user.role, "po_items.split_direct")) {
    throw new Error("You don't have permission to split items directly.");
  }
  const data = DirectSplitSchema.parse(input);
  await assertNoPendingWorkflowsOnItem(data.itemId);

  const result = await applySplitToItem({
    itemId: data.itemId,
    plan: data.plan,
    actor: user,
    source: "direct",
  });

  const itemSnap = await adminDb.collection("po_items").doc(data.itemId).get();
  const poId = itemSnap.exists ? (itemSnap.data()!.poId as string) : undefined;
  if (poId) revalidatePath(`/purchase-orders/${poId}`);
  revalidatePath("/production");
  return { ok: true, childIds: result.childIds };
}

// =============================================================================
// Public: read helpers
// =============================================================================

function snapToView(d: FirebaseFirestore.QueryDocumentSnapshot): SplitRequestView {
  const data = d.data();
  return {
    id: d.id,
    itemId: data.itemId,
    poId: data.poId,
    supplierId: data.supplierId,
    status: data.status,
    plan: data.plan,
    parentSnapshot: data.parentSnapshot,
    requestedBy: data.requestedBy,
    requestedByEmail: data.requestedByEmail,
    requestedAt: data.requestedAt?.toDate?.()?.toISOString() ?? null,
    resolvedBy: data.resolvedBy,
    resolvedByEmail: data.resolvedByEmail,
    resolvedAt: data.resolvedAt?.toDate?.()?.toISOString() ?? null,
    resolverNote: data.resolverNote,
    createdChildIds: data.createdChildIds,
  };
}

export async function listSplitRequests(filter: { status?: EditRequestStatus } = {}) {
  const user = await requireSessionUser();
  if (user.role === "supplier" || user.role === "viewer") return [];

  const isApprover = hasPermission(user.role, "po_items.split_approve");
  const onlyMine = !isApprover;

  let q: FirebaseFirestore.Query = adminDb.collection("item_split_requests");
  if (filter.status) q = q.where("status", "==", filter.status);
  if (onlyMine) q = q.where("requestedBy", "==", user.uid);
  q = q.orderBy("requestedAt", "desc").limit(200);

  const snap = await q.get();
  const views = snap.docs.map(snapToView);

  // Enrich with supplier + PO info from the parent item
  const itemIds = Array.from(new Set(views.map((v) => v.itemId)));
  const itemMap = new Map<string, FirebaseFirestore.DocumentData>();
  for (let i = 0; i < itemIds.length; i += 30) {
    const chunk = itemIds.slice(i, i + 30);
    if (chunk.length === 0) continue;
    const sn = await adminDb.collection("po_items").where("id", "in", chunk).get();
    for (const d of sn.docs) itemMap.set(d.id, d.data());
  }
  for (const v of views) {
    const it = itemMap.get(v.itemId);
    if (it) {
      v.itemSupplierName = it.supplierName;
      v.itemPoNumber = (it.poNumbers && it.poNumbers[0]) || "";
    }
  }
  return views;
}

/** Get pending split (if any) for a specific item — powers inline badges. */
export async function getPendingSplitForItem(itemId: string): Promise<SplitRequestView | null> {
  const user = await requireSessionUser();
  if (user.role === "supplier" || user.role === "viewer") return null;

  const snap = await adminDb
    .collection("item_split_requests")
    .where("itemId", "==", itemId)
    .where("status", "==", "pending")
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snapToView(snap.docs[0]);
}

/** Bulk lookup for many items at once (Production page). */
export async function listPendingSplitsForItems(itemIds: string[]): Promise<
  Record<string, { id: string; requestedBy: string }>
> {
  const user = await requireSessionUser();
  if (user.role === "supplier" || user.role === "viewer") return {};
  if (itemIds.length === 0) return {};

  const result: Record<string, { id: string; requestedBy: string }> = {};
  for (let i = 0; i < itemIds.length; i += 30) {
    const chunk = itemIds.slice(i, i + 30);
    const snap = await adminDb
      .collection("item_split_requests")
      .where("itemId", "in", chunk)
      .where("status", "==", "pending")
      .get();
    for (const d of snap.docs) {
      const data = d.data();
      result[data.itemId as string] = {
        id: d.id,
        requestedBy: data.requestedBy,
      };
    }
  }
  return result;
}
