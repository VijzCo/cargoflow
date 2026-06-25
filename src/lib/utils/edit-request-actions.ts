"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { requireSessionUser } from "@/lib/rbac/session";
import { hasPermission } from "@/lib/rbac/permissions";
import { writeActivityLog } from "@/lib/utils/activity-log";
import { EDITABLE_FIELDS, type EditRequestView } from "@/lib/utils/edit-request-types";
import type {
  EditRequestStatus, EditRequestType, Role,
} from "@/types";

// =============================================================================
// Editable fields & validation
// =============================================================================
// (EDITABLE_FIELDS lives in edit-request-types.ts so it can be shared without
//  violating the "use server" exports-must-be-functions constraint.)

const CategoryEnum = z.enum(["Fabric", "Trims", "Accessories", "Packaging", "Garments", "Others"]);

/** Each editable field can also be cleared by sending null/empty. */
const ProposedChangesSchema = z.object({
  poNumbers: z.array(z.string().min(1)).min(1).optional(),
  style: z.string().min(1).max(200).optional(),
  color: z.string().min(1).max(100).optional(),
  size: z.string().min(1).max(60).optional(),
  quantity: z.number().positive().optional(),
  unit: z.string().min(1).max(20).optional(),
  unitPrice: z.number().nonnegative().nullable().optional(),
  category: CategoryEnum.optional(),
  description: z.string().max(500).nullable().optional(),
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  salesChannel: z.string().max(60).nullable().optional(),
  remarks: z.string().max(500).nullable().optional(),
}).strict();

// =============================================================================
// Internal helpers
// =============================================================================

/** Diff two values for the "fields actually changed" check. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  if (typeof a === "object" && typeof b === "object") return JSON.stringify(a) === JSON.stringify(b);
  return false;
}

function assertItemEditable(item: FirebaseFirestore.DocumentData) {
  // Locked once it's in a container — Loaded or Shipped means hands-off.
  if (item.status === "Loaded" || item.status === "Shipped") {
    throw new Error("This item is already assigned to a container and can't be edited.");
  }
  if (item.containerId) {
    throw new Error("This item is already assigned to a container and can't be edited.");
  }
}

/** Pull only-changed fields by comparing proposed to current item snapshot. */
function changedFieldsOnly(
  current: Record<string, unknown>,
  proposed: Record<string, unknown>,
): { changes: Record<string, unknown>; previous: Record<string, unknown> } {
  const changes: Record<string, unknown> = {};
  const previous: Record<string, unknown> = {};
  for (const k of Object.keys(proposed)) {
    if (!deepEqual(current[k], proposed[k])) {
      changes[k] = proposed[k];
      previous[k] = current[k] ?? null;
    }
  }
  return { changes, previous };
}

/** Apply changes to the item doc + write audit log. Shared by direct edit + approval-apply. */
async function applyChangesToItem({
  itemId,
  changes,
  previous,
  actor,
  source,                       // "direct" | "approved"
  requestId,
}: {
  itemId: string;
  changes: Record<string, unknown>;
  previous: Record<string, unknown>;
  actor: { uid: string; email: string; role: Role };
  source: "direct" | "approved";
  requestId?: string;
}) {
  const ref = adminDb.collection("po_items").doc(itemId);
  // Convert nulls to FieldValue.delete() so undefined/null clears the field.
  const updates: Record<string, unknown> = {};
  for (const k of Object.keys(changes)) {
    const v = changes[k];
    updates[k] = v === null ? FieldValue.delete() : v;
  }
  updates.updatedAt = FieldValue.serverTimestamp();
  updates.updatedBy = actor.uid;

  await ref.update(updates);

  // Audit
  await writeActivityLog({
    userId: actor.uid,
    userEmail: actor.email,
    userRole: actor.role,
    action: source === "direct" ? "item.direct_edit" : "item.request_approved",
    targetType: "po_item",
    targetId: itemId,
    details: {
      changes,
      previous,
      ...(requestId ? { requestId } : {}),
    },
  });
}

// =============================================================================
// Public: submit an edit / delete request (merchants & up)
// =============================================================================

const SubmitRequestSchema = z.object({
  itemId: z.string().min(1),
  type: z.enum(["update", "delete"]),
  proposedChanges: ProposedChangesSchema.optional(),
  reason: z.string().max(500).optional(),
});

export async function submitEditRequest(input: z.infer<typeof SubmitRequestSchema>) {
  const user = await requireSessionUser();
  if (!hasPermission(user.role, "po_items.edit_request") &&
      !hasPermission(user.role, "po_items.edit_direct")) {
    throw new Error("You don't have permission to request item edits.");
  }
  const data = SubmitRequestSchema.parse(input);

  const itemRef = adminDb.collection("po_items").doc(data.itemId);
  const itemSnap = await itemRef.get();
  if (!itemSnap.exists) throw new Error("Item not found.");
  const item = itemSnap.data()!;
  assertItemEditable(item);

  // Reject if user is a supplier somehow (shouldn't reach here, but defense-in-depth)
  if (user.role === "supplier" || user.role === "viewer") {
    throw new Error("Not authorized.");
  }

  // For "update" — derive changes by comparing proposed to current
  let proposedChanges: Record<string, unknown> | undefined;
  let previousValues: Record<string, unknown> | undefined;
  if (data.type === "update") {
    if (!data.proposedChanges) throw new Error("No changes proposed.");
    const diff = changedFieldsOnly(item, data.proposedChanges as Record<string, unknown>);
    if (Object.keys(diff.changes).length === 0) {
      throw new Error("No changes to submit — values match the current item.");
    }
    proposedChanges = diff.changes;
    previousValues = diff.previous;
  }

  // Block duplicate pending requests on the same item
  const existing = await adminDb
    .collection("item_edit_requests")
    .where("itemId", "==", data.itemId)
    .where("status", "==", "pending")
    .limit(1)
    .get();
  if (!existing.empty) {
    throw new Error("There is already a pending request on this item. Cancel it before submitting a new one.");
  }

  const ref = adminDb.collection("item_edit_requests").doc();
  await ref.set({
    id: ref.id,
    itemId: data.itemId,
    poId: item.poId,
    supplierId: item.supplierId,
    type: data.type,
    status: "pending" as EditRequestStatus,
    proposedChanges: proposedChanges,
    previousValues: previousValues,
    reason: data.reason || undefined,
    requestedBy: user.uid,
    requestedByEmail: user.email,
    requestedAt: FieldValue.serverTimestamp(),
  });

  await writeActivityLog({
    userId: user.uid,
    userEmail: user.email,
    userRole: user.role,
    action: data.type === "update" ? "item.edit_requested" : "item.delete_requested",
    targetType: "po_item",
    targetId: data.itemId,
    details: {
      requestId: ref.id,
      type: data.type,
      changes: proposedChanges,
      reason: data.reason,
    },
  });

  revalidatePath(`/purchase-orders/${item.poId}`);
  revalidatePath("/production");
  revalidatePath("/admin/approvals");
  return { id: ref.id };
}

// =============================================================================
// Public: approve / reject (managers & admins only)
// =============================================================================

const ResolveSchema = z.object({
  requestId: z.string().min(1),
  approve: z.boolean(),
  note: z.string().max(500).optional(),
});

export async function resolveEditRequest(input: z.infer<typeof ResolveSchema>) {
  const actor = await requireSessionUser();
  if (!hasPermission(actor.role, "po_items.edit_approve")) {
    throw new Error("You don't have permission to approve edit requests.");
  }
  const data = ResolveSchema.parse(input);

  const reqRef = adminDb.collection("item_edit_requests").doc(data.requestId);
  const reqSnap = await reqRef.get();
  if (!reqSnap.exists) throw new Error("Request not found.");
  const req = reqSnap.data()!;

  if (req.status !== "pending") {
    throw new Error(`Request is already ${req.status}.`);
  }
  // Self-approval blocked
  if (req.requestedBy === actor.uid) {
    throw new Error("You can't approve your own request. Another approver must review it.");
  }

  // Approve flow
  if (data.approve) {
    const itemRef = adminDb.collection("po_items").doc(req.itemId);
    const itemSnap = await itemRef.get();
    if (!itemSnap.exists) {
      // Mark as rejected with note since the underlying item is gone
      await reqRef.update({
        status: "rejected",
        resolvedBy: actor.uid,
        resolvedByEmail: actor.email,
        resolvedAt: FieldValue.serverTimestamp(),
        resolverNote: "Underlying item no longer exists.",
      });
      throw new Error("Underlying item no longer exists; request rejected.");
    }
    const item = itemSnap.data()!;
    // Re-check editability at approval time (state may have changed)
    assertItemEditable(item);

    if (req.type === "delete") {
      await itemRef.delete();
      await writeActivityLog({
        userId: actor.uid,
        userEmail: actor.email,
        userRole: actor.role,
        action: "item.request_approved",
        targetType: "po_item",
        targetId: req.itemId,
        details: { requestId: req.id, type: "delete", style: item.style, color: item.color, size: item.size },
      });
    } else {
      // For "update", re-validate that the proposed values are still novel
      // (someone else may have changed the item in the interim).
      const proposed = (req.proposedChanges ?? {}) as Record<string, unknown>;
      const { changes, previous } = changedFieldsOnly(item, proposed);
      if (Object.keys(changes).length === 0) {
        // Nothing to apply — auto-mark as approved with a note
        await reqRef.update({
          status: "approved",
          resolvedBy: actor.uid,
          resolvedByEmail: actor.email,
          resolvedAt: FieldValue.serverTimestamp(),
          resolverNote: (data.note ?? "") + " (no-op: item already matches proposed values)",
        });
        revalidatePath(`/purchase-orders/${item.poId}`);
        revalidatePath("/production");
        revalidatePath("/admin/approvals");
        return { ok: true, applied: 0 };
      }
      await applyChangesToItem({
        itemId: req.itemId,
        changes,
        previous,
        actor,
        source: "approved",
        requestId: req.id,
      });
    }

    await reqRef.update({
      status: "approved",
      resolvedBy: actor.uid,
      resolvedByEmail: actor.email,
      resolvedAt: FieldValue.serverTimestamp(),
      resolverNote: data.note || undefined,
    });
  } else {
    // Reject flow
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
      action: "item.request_rejected",
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
// Public: cancel my own pending request
// =============================================================================

export async function cancelEditRequest(requestId: string) {
  const user = await requireSessionUser();
  const ref = adminDb.collection("item_edit_requests").doc(requestId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Request not found.");
  const req = snap.data()!;

  if (req.status !== "pending") throw new Error(`Request is already ${req.status}.`);

  // Owner only — but super_admin can also override
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
    action: "item.request_cancelled",
    targetType: "po_item",
    targetId: req.itemId,
    details: { requestId: req.id, type: req.type },
  });

  revalidatePath(`/purchase-orders/${req.poId}`);
  revalidatePath("/production");
  revalidatePath("/admin/approvals");
  return { ok: true };
}

// =============================================================================
// Public: direct edit / delete (super_admin & merchant_manager bypass approval)
// =============================================================================

const DirectEditSchema = z.object({
  itemId: z.string().min(1),
  changes: ProposedChangesSchema,
});

export async function editItemDirect(input: z.infer<typeof DirectEditSchema>) {
  const user = await requireSessionUser();
  if (!hasPermission(user.role, "po_items.edit_direct")) {
    throw new Error("You don't have permission to edit items directly.");
  }
  const data = DirectEditSchema.parse(input);

  const itemRef = adminDb.collection("po_items").doc(data.itemId);
  const itemSnap = await itemRef.get();
  if (!itemSnap.exists) throw new Error("Item not found.");
  const item = itemSnap.data()!;
  assertItemEditable(item);

  const proposed = data.changes as Record<string, unknown>;
  const { changes, previous } = changedFieldsOnly(item, proposed);
  if (Object.keys(changes).length === 0) {
    return { ok: true, changed: 0 };
  }

  await applyChangesToItem({
    itemId: data.itemId,
    changes,
    previous,
    actor: user,
    source: "direct",
  });

  revalidatePath(`/purchase-orders/${item.poId}`);
  revalidatePath("/production");
  return { ok: true, changed: Object.keys(changes).length };
}

export async function deleteItemDirect(itemId: string) {
  const user = await requireSessionUser();
  if (!hasPermission(user.role, "po_items.edit_direct")) {
    throw new Error("You don't have permission to delete items directly.");
  }
  const itemRef = adminDb.collection("po_items").doc(itemId);
  const itemSnap = await itemRef.get();
  if (!itemSnap.exists) throw new Error("Item not found.");
  const item = itemSnap.data()!;
  assertItemEditable(item);

  await itemRef.delete();
  await writeActivityLog({
    userId: user.uid,
    userEmail: user.email,
    userRole: user.role,
    action: "item.direct_delete",
    targetType: "po_item",
    targetId: itemId,
    details: {
      style: item.style, color: item.color, size: item.size,
      quantity: item.quantity, supplierName: item.supplierName,
    },
  });

  revalidatePath(`/purchase-orders/${item.poId}`);
  revalidatePath("/production");
  return { ok: true };
}

// =============================================================================
// Public: list pending requests + counts
// =============================================================================
// EditRequestView type now lives in edit-request-types.ts

function snapToView(d: FirebaseFirestore.QueryDocumentSnapshot): EditRequestView {
  const data = d.data();
  return {
    id: d.id,
    itemId: data.itemId,
    poId: data.poId,
    supplierId: data.supplierId,
    type: data.type,
    status: data.status,
    proposedChanges: data.proposedChanges,
    previousValues: data.previousValues,
    reason: data.reason,
    requestedBy: data.requestedBy,
    requestedByEmail: data.requestedByEmail,
    requestedAt: data.requestedAt?.toDate?.()?.toISOString() ?? null,
    resolvedBy: data.resolvedBy,
    resolvedByEmail: data.resolvedByEmail,
    resolvedAt: data.resolvedAt?.toDate?.()?.toISOString() ?? null,
    resolverNote: data.resolverNote,
  };
}

export async function listEditRequests(filter: { status?: EditRequestStatus; mine?: boolean } = {}) {
  const user = await requireSessionUser();

  // Suppliers + viewers don't see this surface
  if (user.role === "supplier" || user.role === "viewer") return [];

  // If user is a normal merchant (can request but not approve), they see only their own.
  const isApprover = hasPermission(user.role, "po_items.edit_approve");
  const onlyMine = filter.mine === true || !isApprover;

  let q: FirebaseFirestore.Query = adminDb.collection("item_edit_requests");
  if (filter.status) q = q.where("status", "==", filter.status);
  if (onlyMine) q = q.where("requestedBy", "==", user.uid);

  // Always order by requestedAt desc; uses index when status + requestedBy filter present
  q = q.orderBy("requestedAt", "desc").limit(200);

  const snap = await q.get();
  const views = snap.docs.map(snapToView);

  // Best-effort enrich with item info — single batched read
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
      v.itemStyle = it.style;
      v.itemColor = it.color;
      v.itemSize = it.size;
      v.itemSupplierName = it.supplierName;
      v.itemPoNumber = (it.poNumbers && it.poNumbers[0]) || "";
    }
  }

  return views;
}

/** Lightweight count for the topbar bell. */
export async function countPendingApprovalsForCurrentUser(): Promise<number> {
  const user = await requireSessionUser();
  if (!hasPermission(user.role, "po_items.edit_approve")) return 0;

  // Count via a small query (limited to 100 to keep cost predictable)
  const snap = await adminDb
    .collection("item_edit_requests")
    .where("status", "==", "pending")
    .limit(100)
    .get();
  return snap.size;
}

/** Pending request (if any) for a specific item — useful for inline badges. */
export async function getPendingRequestForItem(itemId: string): Promise<EditRequestView | null> {
  const user = await requireSessionUser();
  if (user.role === "supplier" || user.role === "viewer") return null;

  const snap = await adminDb
    .collection("item_edit_requests")
    .where("itemId", "==", itemId)
    .where("status", "==", "pending")
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snapToView(snap.docs[0]);
}

/** Bulk lookup — returns a record keyed by itemId for items the user can see. */
export async function listPendingForItems(itemIds: string[]): Promise<
  Record<string, { id: string; type: EditRequestType; requestedBy: string }>
> {
  const user = await requireSessionUser();
  if (user.role === "supplier" || user.role === "viewer") return {};
  if (itemIds.length === 0) return {};

  const result: Record<string, { id: string; type: EditRequestType; requestedBy: string }> = {};
  for (let i = 0; i < itemIds.length; i += 30) {
    const chunk = itemIds.slice(i, i + 30);
    const snap = await adminDb
      .collection("item_edit_requests")
      .where("itemId", "in", chunk)
      .where("status", "==", "pending")
      .get();
    for (const d of snap.docs) {
      const data = d.data();
      result[data.itemId as string] = {
        id: d.id,
        type: data.type,
        requestedBy: data.requestedBy,
      };
    }
  }
  return result;
}
