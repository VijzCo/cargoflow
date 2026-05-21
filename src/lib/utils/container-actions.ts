"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { requireSessionUser } from "@/lib/rbac/session";
import { hasPermission } from "@/lib/rbac/permissions";
import { writeActivityLog } from "@/lib/utils/activity-log";
import { CONTAINER_CAPACITY, type ContainerType } from "@/types";

// =============================================================================
// Views — plain JSON shapes safe to ship to client components
// =============================================================================

export type ContainerView = {
  id: string;
  containerNumber: string;
  type: ContainerType;
  capacityCbm: number;
  usableCbm: number;
  loadedCbm: number;
  utilization: number;
  vesselId?: string;
  supplierIds: string[];
  itemIds: string[];
  status: "Open" | "Sealed" | "Shipped";
  createdAt: string | null;
};

export type AllocatableItem = {
  id: string;
  poId: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  style: string;
  color: string;
  size: string;
  quantity: number;
  unit: string;
  category: string;
  cbm: number;
  packageCount: number;
  deliveryDate?: string;
};

function toContainerView(doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot): ContainerView {
  const d = doc.data()!;
  const loadedCbm = d.loadedCbm ?? 0;
  const usableCbm = d.usableCbm ?? d.capacityCbm ?? 0;
  return {
    id: doc.id,
    containerNumber: d.containerNumber,
    type: d.type,
    capacityCbm: d.capacityCbm,
    usableCbm,
    loadedCbm,
    utilization: usableCbm > 0 ? loadedCbm / usableCbm : 0,
    vesselId: d.vesselId,
    supplierIds: d.supplierIds ?? [],
    itemIds: d.itemIds ?? [],
    status: d.status ?? "Open",
    createdAt: d.createdAt?.toDate?.()?.toISOString() ?? null,
  };
}

// =============================================================================
// Settings helper — pull usable-CBM percentage from settings/global
// =============================================================================

async function getUsablePercent(): Promise<number> {
  const snap = await adminDb.collection("settings").doc("global").get();
  if (!snap.exists) return 0.92; // sane default
  const pct = snap.data()?.containerUsablePercent;
  if (typeof pct !== "number" || pct <= 0 || pct > 1) return 0.92;
  return pct;
}

// =============================================================================
// createContainer
// =============================================================================

const CreateContainerSchema = z.object({
  containerNumber: z.string().min(2).max(40),
  type: z.enum(["20FT", "40FT"]),
});

export async function createContainer(input: z.infer<typeof CreateContainerSchema>) {
  const user = await requireSessionUser();
  if (!hasPermission(user.role, "containers.create")) {
    throw new Error("You don't have permission to create containers.");
  }
  const { containerNumber, type } = CreateContainerSchema.parse(input);

  // Reject duplicate numbers
  const dupSnap = await adminDb.collection("containers")
    .where("containerNumber", "==", containerNumber)
    .limit(1)
    .get();
  if (!dupSnap.empty) {
    throw new Error(`Container "${containerNumber}" already exists.`);
  }

  const capacityCbm = CONTAINER_CAPACITY[type];
  const usablePct = await getUsablePercent();
  const usableCbm = Number((capacityCbm * usablePct).toFixed(2));

  const ref = adminDb.collection("containers").doc();
  await ref.set({
    id: ref.id,
    containerNumber,
    type,
    capacityCbm,
    usableCbm,
    loadedCbm: 0,
    utilization: 0,
    supplierIds: [],
    itemIds: [],
    status: "Open",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await writeActivityLog({
    userId: user.uid,
    userEmail: user.email,
    userRole: user.role,
    action: "container.create",
    targetType: "container",
    targetId: ref.id,
    details: { containerNumber, type, capacityCbm, usableCbm },
  });

  revalidatePath("/containers");
  return { id: ref.id };
}

// =============================================================================
// listContainers — with optional vessel filter
// =============================================================================

export async function listContainers(opts: { vesselId?: string; status?: "Open" | "Sealed" | "Shipped" } = {}) {
  await requireSessionUser();
  let q: FirebaseFirestore.Query = adminDb.collection("containers");
  if (opts.vesselId) q = q.where("vesselId", "==", opts.vesselId);
  if (opts.status) q = q.where("status", "==", opts.status);
  q = q.orderBy("createdAt", "desc").limit(200);
  const snap = await q.get();
  return snap.docs.map(toContainerView);
}

// =============================================================================
// getContainerDetail — header + assigned items
// =============================================================================

export async function getContainerDetail(containerId: string) {
  const user = await requireSessionUser();
  const snap = await adminDb.collection("containers").doc(containerId).get();
  if (!snap.exists) throw new Error("Container not found.");
  const container = toContainerView(snap);

  // Supplier isolation: a supplier may only view containers that include their items
  if (user.role === "supplier" && user.supplierId && !container.supplierIds.includes(user.supplierId)) {
    throw new Error("Not authorized to view this container.");
  }

  // Fetch the items belonging to this container
  const items: AllocatableItem[] = [];
  if (container.itemIds.length > 0) {
    // Firestore "in" queries are limited to 30 items; chunk if needed
    const chunks: string[][] = [];
    for (let i = 0; i < container.itemIds.length; i += 30) {
      chunks.push(container.itemIds.slice(i, i + 30));
    }
    for (const chunk of chunks) {
      const itemSnap = await adminDb.collection("po_items").where("id", "in", chunk).get();
      // Need PO numbers — denormalize via a join on poId
      const poIds = Array.from(new Set(itemSnap.docs.map((d) => d.data().poId as string)));
      const poMap = new Map<string, string>();
      for (let i = 0; i < poIds.length; i += 30) {
        const poChunk = poIds.slice(i, i + 30);
        if (poChunk.length === 0) continue;
        const poSnap = await adminDb.collection("purchase_orders").where("id", "in", poChunk).get();
        for (const pd of poSnap.docs) {
          poMap.set(pd.id, (pd.data().poNumber as string) ?? "—");
        }
      }
      for (const d of itemSnap.docs) {
        const data = d.data();
        items.push({
          id: d.id,
          poId: data.poId,
          poNumber: poMap.get(data.poId) ?? "—",
          supplierId: data.supplierId,
          supplierName: data.supplierName,
          style: data.style,
          color: data.color,
          size: data.size,
          quantity: data.quantity,
          unit: data.unit,
          category: data.category,
          cbm: data.cbm ?? 0,
          packageCount: data.packageCount ?? 0,
          deliveryDate: data.deliveryDate,
        });
      }
    }
  }

  return { container, items };
}

// =============================================================================
// listAllocatableItems — Completed items not yet in a container
// =============================================================================

const AllocatableFilterSchema = z.object({
  supplierId: z.string().optional(),
  deliveryBefore: z.string().optional(),
});

export async function listAllocatableItems(filters: z.infer<typeof AllocatableFilterSchema> = {}) {
  const user = await requireSessionUser();
  if (user.role === "supplier") return [] as AllocatableItem[];

  let q: FirebaseFirestore.Query = adminDb.collection("po_items")
    .where("status", "==", "Completed");

  if (filters.supplierId) q = q.where("supplierId", "==", filters.supplierId);

  q = q.limit(500);
  const snap = await q.get();

  // Filter out items that already have a containerId (defense in depth — should
  // never happen because status would be Loaded, but cheap to check)
  const candidates = snap.docs.filter((d) => !d.data().containerId);

  // Fetch PO numbers in bulk
  const poIds = Array.from(new Set(candidates.map((d) => d.data().poId as string)));
  const poMap = new Map<string, string>();
  for (let i = 0; i < poIds.length; i += 30) {
    const chunk = poIds.slice(i, i + 30);
    if (chunk.length === 0) continue;
    const poSnap = await adminDb.collection("purchase_orders").where("id", "in", chunk).get();
    for (const pd of poSnap.docs) {
      poMap.set(pd.id, (pd.data().poNumber as string) ?? "—");
    }
  }

  let items: AllocatableItem[] = candidates.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      poId: data.poId,
      poNumber: poMap.get(data.poId) ?? "—",
      supplierId: data.supplierId,
      supplierName: data.supplierName,
      style: data.style,
      color: data.color,
      size: data.size,
      quantity: data.quantity,
      unit: data.unit,
      category: data.category,
      cbm: data.cbm ?? 0,
      packageCount: data.packageCount ?? 0,
      deliveryDate: data.deliveryDate,
    };
  });

  // Filter: require CBM > 0 (you can't ship something with 0 cbm declared)
  items = items.filter((i) => i.cbm > 0);

  // Filter: deliveryBefore
  if (filters.deliveryBefore) {
    items = items.filter((i) => !i.deliveryDate || i.deliveryDate <= filters.deliveryBefore!);
  }

  // Sort by deliveryDate ASC (earliest first), then by CBM DESC (pack bigger items first)
  items.sort((a, b) => {
    const da = a.deliveryDate ?? "9999-12-31";
    const db = b.deliveryDate ?? "9999-12-31";
    if (da !== db) return da.localeCompare(db);
    return b.cbm - a.cbm;
  });

  return items;
}

// =============================================================================
// manualAssign — assign specific items to a specific container (atomic)
// =============================================================================

const ManualAssignSchema = z.object({
  containerId: z.string().min(1),
  itemIds: z.array(z.string().min(1)).min(1),
});

export async function manualAssign(input: z.infer<typeof ManualAssignSchema>) {
  const user = await requireSessionUser();
  if (!hasPermission(user.role, "containers.assign")) {
    throw new Error("You don't have permission to assign items to containers.");
  }
  const { containerId, itemIds } = ManualAssignSchema.parse(input);

  const cRef = adminDb.collection("containers").doc(containerId);
  const cSnap = await cRef.get();
  if (!cSnap.exists) throw new Error("Container not found.");
  const container = cSnap.data()!;
  if (container.status !== "Open") {
    throw new Error("Cannot add items: container is sealed or shipped.");
  }

  // Load each item, validate, accumulate cbm
  const items: { id: string; cbm: number; supplierId: string; ref: FirebaseFirestore.DocumentReference; data: FirebaseFirestore.DocumentData }[] = [];
  for (const id of itemIds) {
    const ref = adminDb.collection("po_items").doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new Error(`Item ${id} not found.`);
    const data = snap.data()!;
    if (data.status !== "Completed") {
      throw new Error(`Item "${data.style} / ${data.color} / ${data.size}" is not in Completed status — cannot load.`);
    }
    if (data.containerId) {
      throw new Error(`Item "${data.style} / ${data.color} / ${data.size}" is already assigned to another container.`);
    }
    if (!data.cbm || data.cbm <= 0) {
      throw new Error(`Item "${data.style} / ${data.color} / ${data.size}" has no CBM declared.`);
    }
    items.push({ id, cbm: data.cbm, supplierId: data.supplierId, ref, data });
  }

  const totalAddCbm = items.reduce((s, i) => s + i.cbm, 0);
  const newLoaded = (container.loadedCbm ?? 0) + totalAddCbm;
  if (newLoaded > container.usableCbm + 0.0001) {
    const overBy = (newLoaded - container.usableCbm).toFixed(2);
    throw new Error(`Adding these items would exceed container capacity by ${overBy} CBM.`);
  }

  // Single atomic batch
  const batch = adminDb.batch();
  const supplierIds = new Set<string>(container.supplierIds ?? []);
  for (const it of items) {
    batch.update(it.ref, {
      containerId,
      status: "Loaded",
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: user.uid,
    });
    supplierIds.add(it.supplierId);
  }
  batch.update(cRef, {
    loadedCbm: newLoaded,
    utilization: newLoaded / container.usableCbm,
    itemIds: FieldValue.arrayUnion(...itemIds),
    supplierIds: Array.from(supplierIds),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await batch.commit();

  await writeActivityLog({
    userId: user.uid,
    userEmail: user.email,
    userRole: user.role,
    action: "container.assign",
    targetType: "container",
    targetId: containerId,
    details: { itemCount: itemIds.length, addedCbm: totalAddCbm },
  });

  revalidatePath(`/containers/${containerId}`);
  revalidatePath("/containers");
  revalidatePath("/production");
  return { assigned: itemIds.length, newLoadedCbm: newLoaded };
}

// =============================================================================
// removeFromContainer — pop an item back to Completed status
// =============================================================================

export async function removeFromContainer(itemId: string) {
  const user = await requireSessionUser();
  if (!hasPermission(user.role, "containers.assign")) {
    throw new Error("You don't have permission to modify container assignments.");
  }

  const iRef = adminDb.collection("po_items").doc(itemId);
  const iSnap = await iRef.get();
  if (!iSnap.exists) throw new Error("Item not found.");
  const item = iSnap.data()!;
  if (!item.containerId) throw new Error("Item is not assigned to any container.");

  const cRef = adminDb.collection("containers").doc(item.containerId);
  const cSnap = await cRef.get();
  if (!cSnap.exists) throw new Error("Container not found.");
  const container = cSnap.data()!;
  if (container.status !== "Open") {
    throw new Error("Cannot modify a sealed or shipped container.");
  }

  const newLoaded = Math.max(0, (container.loadedCbm ?? 0) - (item.cbm ?? 0));

  const batch = adminDb.batch();
  batch.update(iRef, {
    containerId: FieldValue.delete(),
    status: "Completed",
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: user.uid,
  });
  batch.update(cRef, {
    loadedCbm: newLoaded,
    utilization: container.usableCbm > 0 ? newLoaded / container.usableCbm : 0,
    itemIds: FieldValue.arrayRemove(itemId),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  revalidatePath(`/containers/${item.containerId}`);
  revalidatePath("/containers");
  return { ok: true };
}

// =============================================================================
// sealContainer — mark Open container as Sealed (no more changes)
// =============================================================================

export async function sealContainer(containerId: string) {
  const user = await requireSessionUser();
  if (!hasPermission(user.role, "containers.seal")) {
    throw new Error("You don't have permission to seal containers.");
  }

  const ref = adminDb.collection("containers").doc(containerId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Container not found.");
  const data = snap.data()!;
  if (data.status !== "Open") throw new Error("Container is already sealed or shipped.");
  if (!data.itemIds?.length) throw new Error("Cannot seal an empty container.");

  await ref.update({
    status: "Sealed",
    updatedAt: FieldValue.serverTimestamp(),
  });

  await writeActivityLog({
    userId: user.uid,
    userEmail: user.email,
    userRole: user.role,
    action: "container.seal",
    targetType: "container",
    targetId: containerId,
    details: { containerNumber: data.containerNumber },
  });

  revalidatePath(`/containers/${containerId}`);
  revalidatePath("/containers");
  return { ok: true };
}

// =============================================================================
// autoAllocate — pack Completed items into existing Open containers + create
// new ones as needed. Returns an "allocation plan" the caller previews,
// then commits.
// =============================================================================

export type AllocationPlanEntry =
  | { kind: "assign"; itemId: string; containerId: string; containerNumber: string; addedCbm: number }
  | { kind: "create-and-assign"; itemId: string; tempContainerKey: string; containerType: ContainerType; addedCbm: number }
  | { kind: "skip"; itemId: string; reason: string };

export type AllocationPlan = {
  entries: AllocationPlanEntry[];
  newContainers: { tempKey: string; type: ContainerType }[];
  totals: { items: number; assigned: number; createdContainers: number; skipped: number; cbm: number };
};

const AutoAllocateInputSchema = z.object({
  newContainerType: z.enum(["20FT", "40FT"]).default("40FT"),
  itemIds: z.array(z.string()).optional(), // if provided, only these; else all Completed
});

export async function autoAllocatePreview(input: z.infer<typeof AutoAllocateInputSchema>): Promise<AllocationPlan> {
  const user = await requireSessionUser();
  if (!hasPermission(user.role, "containers.assign")) {
    throw new Error("You don't have permission to allocate containers.");
  }
  const { newContainerType, itemIds } = AutoAllocateInputSchema.parse(input);

  // 1. Pick items: either the explicit list or all allocatable (Completed + cbm>0 + no container)
  let items = await listAllocatableItems({});
  if (itemIds?.length) {
    const set = new Set(itemIds);
    items = items.filter((i) => set.has(i.id));
  }

  // 2. Load all OPEN containers that aren't sealed/shipped
  const cSnap = await adminDb.collection("containers").where("status", "==", "Open").get();
  const containers = cSnap.docs.map(toContainerView);

  // 3. Plan
  const entries: AllocationPlanEntry[] = [];
  const newContainers: { tempKey: string; type: ContainerType }[] = [];
  // Track in-memory remaining capacity per container (existing + new)
  type Slot = { id?: string; tempKey?: string; number?: string; type: ContainerType; capacity: number; remaining: number };
  const slots: Slot[] = containers.map((c) => ({
    id: c.id,
    number: c.containerNumber,
    type: c.type,
    capacity: c.usableCbm,
    remaining: c.usableCbm - c.loadedCbm,
  }));

  let totalAssigned = 0;
  let totalSkipped = 0;
  let totalCbm = 0;
  let tempCounter = 1;
  const usablePct = await getUsablePercent();
  const newCapacity = Number((CONTAINER_CAPACITY[newContainerType] * usablePct).toFixed(2));

  for (const item of items) {
    if (item.cbm > newCapacity) {
      // Too big for any new container — flag to merchant
      entries.push({
        kind: "skip",
        itemId: item.id,
        reason: `Item CBM (${item.cbm}) exceeds a new ${newContainerType} container's usable capacity (${newCapacity}).`,
      });
      totalSkipped++;
      continue;
    }

    // Find first slot that fits (best-fit decreasing-like — fill smallest gap that still fits)
    const fits = slots.filter((s) => s.remaining >= item.cbm);
    if (fits.length > 0) {
      // pick the one with the SMALLEST remaining (tightest pack)
      fits.sort((a, b) => a.remaining - b.remaining);
      const slot = fits[0]!;
      slot.remaining -= item.cbm;
      if (slot.id) {
        entries.push({
          kind: "assign",
          itemId: item.id,
          containerId: slot.id,
          containerNumber: slot.number!,
          addedCbm: item.cbm,
        });
      } else {
        entries.push({
          kind: "create-and-assign",
          itemId: item.id,
          tempContainerKey: slot.tempKey!,
          containerType: slot.type,
          addedCbm: item.cbm,
        });
      }
      totalAssigned++;
      totalCbm += item.cbm;
    } else {
      // Need a new container
      const tempKey = `NEW-${tempCounter++}`;
      newContainers.push({ tempKey, type: newContainerType });
      slots.push({
        tempKey,
        type: newContainerType,
        capacity: newCapacity,
        remaining: newCapacity - item.cbm,
      });
      entries.push({
        kind: "create-and-assign",
        itemId: item.id,
        tempContainerKey: tempKey,
        containerType: newContainerType,
        addedCbm: item.cbm,
      });
      totalAssigned++;
      totalCbm += item.cbm;
    }
  }

  return {
    entries,
    newContainers,
    totals: {
      items: items.length,
      assigned: totalAssigned,
      createdContainers: newContainers.length,
      skipped: totalSkipped,
      cbm: Number(totalCbm.toFixed(2)),
    },
  };
}

const CommitAllocateInputSchema = z.object({
  plan: z.object({
    entries: z.array(z.any()),
    newContainers: z.array(z.object({ tempKey: z.string(), type: z.enum(["20FT", "40FT"]) })),
  }),
  containerNumberPrefix: z.string().min(1).default("CTR"),
});

export async function autoAllocateCommit(input: z.infer<typeof CommitAllocateInputSchema>) {
  const user = await requireSessionUser();
  if (!hasPermission(user.role, "containers.assign")) {
    throw new Error("You don't have permission to allocate containers.");
  }
  const { plan, containerNumberPrefix } = CommitAllocateInputSchema.parse(input);

  // 1. Create any new containers and map tempKey → real id
  const usablePct = await getUsablePercent();
  const tempToReal = new Map<string, { id: string; number: string }>();
  for (const nc of plan.newContainers) {
    const capacityCbm = CONTAINER_CAPACITY[nc.type];
    const usableCbm = Number((capacityCbm * usablePct).toFixed(2));
    const ref = adminDb.collection("containers").doc();
    // Generate sequential number using count-based suffix
    const countSnap = await adminDb.collection("containers").count().get();
    const number = `${containerNumberPrefix}-${String(countSnap.data().count + 1).padStart(4, "0")}`;
    await ref.set({
      id: ref.id,
      containerNumber: number,
      type: nc.type,
      capacityCbm,
      usableCbm,
      loadedCbm: 0,
      utilization: 0,
      supplierIds: [],
      itemIds: [],
      status: "Open",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tempToReal.set(nc.tempKey, { id: ref.id, number });
  }

  // 2. Group entries by container so we can use manualAssign for atomic per-container batches
  const byContainer = new Map<string, string[]>(); // containerId -> itemIds
  for (const e of plan.entries as AllocationPlanEntry[]) {
    if (e.kind === "skip") continue;
    let containerId: string;
    if (e.kind === "assign") {
      containerId = e.containerId;
    } else {
      const real = tempToReal.get(e.tempContainerKey);
      if (!real) throw new Error(`Missing container for temp key ${e.tempContainerKey}`);
      containerId = real.id;
    }
    const arr = byContainer.get(containerId) ?? [];
    arr.push(e.itemId);
    byContainer.set(containerId, arr);
  }

  // 3. Reuse manualAssign for each container's batch
  let totalAssigned = 0;
  for (const [containerId, ids] of byContainer.entries()) {
    const res = await manualAssign({ containerId, itemIds: ids });
    totalAssigned += res.assigned;
  }

  await writeActivityLog({
    userId: user.uid,
    userEmail: user.email,
    userRole: user.role,
    action: "container.assign",
    targetType: "container",
    targetId: "auto",
    details: { mode: "auto-allocate", assigned: totalAssigned, newContainers: plan.newContainers.length },
  });

  revalidatePath("/containers");
  revalidatePath("/production");

  return { assigned: totalAssigned, newContainers: plan.newContainers.length };
}
