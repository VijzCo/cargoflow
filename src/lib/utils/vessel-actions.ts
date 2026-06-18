"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { requireSessionUser } from "@/lib/rbac/session";
import { hasPermission } from "@/lib/rbac/permissions";
import { writeActivityLog } from "@/lib/utils/activity-log";

// =============================================================================
// Views
// =============================================================================

export type VesselView = {
  id: string;
  vesselId: string;
  vesselName?: string;
  shipmentDate?: string;
  etd?: string;
  eta?: string;
  destination: string;
  containerIds: string[];
  supplierIds: string[];
  status: "Planned" | "Loading" | "Sailed" | "Delivered";
  createdAt: string | null;
};

function toVesselView(doc: FirebaseFirestore.DocumentSnapshot | FirebaseFirestore.QueryDocumentSnapshot): VesselView {
  const d = doc.data()!;
  return {
    id: doc.id,
    vesselId: d.vesselId,
    vesselName: d.vesselName,
    shipmentDate: d.shipmentDate,
    etd: d.etd,
    eta: d.eta,
    destination: d.destination,
    containerIds: d.containerIds ?? [],
    supplierIds: d.supplierIds ?? [],
    status: d.status ?? "Planned",
    createdAt: d.createdAt?.toDate?.()?.toISOString() ?? null,
  };
}

// =============================================================================
// createVessel
// =============================================================================

const CreateVesselSchema = z.object({
  vesselId: z.string().min(2).max(40),
  vesselName: z.string().optional(),
  etd: z.string().optional(),
  eta: z.string().optional(),
  destination: z.string().min(2).max(100),
});

export async function createVessel(input: z.infer<typeof CreateVesselSchema>) {
  const user = await requireSessionUser();
  if (!hasPermission(user.role, "vessels.create")) {
    throw new Error("You don't have permission to create vessels.");
  }
  const data = CreateVesselSchema.parse(input);

  // Reject duplicate vessel IDs
  const dup = await adminDb.collection("vessels").where("vesselId", "==", data.vesselId).limit(1).get();
  if (!dup.empty) throw new Error(`Vessel "${data.vesselId}" already exists.`);

  const ref = adminDb.collection("vessels").doc();
  await ref.set({
    id: ref.id,
    vesselId: data.vesselId,
    vesselName: data.vesselName,
    etd: data.etd,
    eta: data.eta,
    destination: data.destination,
    containerIds: [],
    supplierIds: [],
    status: "Planned",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await writeActivityLog({
    userId: user.uid,
    userEmail: user.email,
    userRole: user.role,
    action: "vessel.create",
    targetType: "vessel",
    targetId: ref.id,
    details: { vesselId: data.vesselId, destination: data.destination },
  });

  revalidatePath("/vessels");
  return { id: ref.id };
}

// =============================================================================
// listVessels
// =============================================================================

export async function listVessels() {
  const user = await requireSessionUser();
  let q: FirebaseFirestore.Query = adminDb.collection("vessels");
  if (user.role === "supplier" && user.supplierId) {
    q = q.where("supplierIds", "array-contains", user.supplierId);
  }
  q = q.orderBy("createdAt", "desc").limit(200);
  const snap = await q.get();
  return snap.docs.map(toVesselView);
}

// =============================================================================
// getVesselDetail — vessel + attached containers
// =============================================================================

export async function getVesselDetail(vesselId: string) {
  const user = await requireSessionUser();
  const vSnap = await adminDb.collection("vessels").doc(vesselId).get();
  if (!vSnap.exists) throw new Error("Vessel not found.");
  const vessel = toVesselView(vSnap);

  if (user.role === "supplier" && user.supplierId && !vessel.supplierIds.includes(user.supplierId)) {
    throw new Error("Not authorized to view this vessel.");
  }

  // Pull attached containers
  type ContainerLite = {
    id: string; containerNumber: string; carrierNumber?: string; type: string;
    loadedCbm: number; usableCbm: number; status: string;
  };
  const containers: ContainerLite[] = [];
  if (vessel.containerIds.length > 0) {
    for (let i = 0; i < vessel.containerIds.length; i += 30) {
      const chunk = vessel.containerIds.slice(i, i + 30);
      const cSnap = await adminDb.collection("containers").where("id", "in", chunk).get();
      for (const d of cSnap.docs) {
        const data = d.data();
        containers.push({
          id: d.id,
          containerNumber: data.containerNumber,
          carrierNumber: (data.carrierNumber as string | undefined) || undefined,
          type: data.type,
          loadedCbm: data.loadedCbm ?? 0,
          usableCbm: data.usableCbm ?? 0,
          status: data.status ?? "Open",
        });
      }
    }
  }
  return { vessel, containers };
}

// =============================================================================
// attachContainerToVessel — link an Open or Sealed container to a vessel
// =============================================================================

const AttachSchema = z.object({
  vesselId: z.string().min(1),
  containerId: z.string().min(1),
});

export async function attachContainerToVessel(input: z.infer<typeof AttachSchema>) {
  const user = await requireSessionUser();
  if (!hasPermission(user.role, "vessels.update")) {
    throw new Error("You don't have permission to update vessels.");
  }
  const { vesselId, containerId } = AttachSchema.parse(input);

  const vRef = adminDb.collection("vessels").doc(vesselId);
  const cRef = adminDb.collection("containers").doc(containerId);

  const [vSnap, cSnap] = await Promise.all([vRef.get(), cRef.get()]);
  if (!vSnap.exists) throw new Error("Vessel not found.");
  if (!cSnap.exists) throw new Error("Container not found.");
  const vessel = vSnap.data()!;
  const container = cSnap.data()!;

  if (vessel.status === "Sailed" || vessel.status === "Delivered") {
    throw new Error("Vessel has already sailed.");
  }
  if (container.status === "Shipped") {
    throw new Error("Container has already shipped.");
  }
  if (container.vesselId && container.vesselId !== vesselId) {
    throw new Error("Container is already attached to another vessel.");
  }

  const batch = adminDb.batch();
  const supplierIds = Array.from(new Set([...(vessel.supplierIds ?? []), ...(container.supplierIds ?? [])]));
  batch.update(vRef, {
    containerIds: FieldValue.arrayUnion(containerId),
    supplierIds,
    status: vessel.status === "Planned" ? "Loading" : vessel.status,
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.update(cRef, {
    vesselId,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  revalidatePath(`/vessels/${vesselId}`);
  revalidatePath("/vessels");
  revalidatePath("/containers");
  return { ok: true };
}

export async function detachContainerFromVessel(input: z.infer<typeof AttachSchema>) {
  const user = await requireSessionUser();
  if (!hasPermission(user.role, "vessels.update")) {
    throw new Error("You don't have permission to update vessels.");
  }
  const { vesselId, containerId } = AttachSchema.parse(input);

  const vRef = adminDb.collection("vessels").doc(vesselId);
  const cRef = adminDb.collection("containers").doc(containerId);
  const [vSnap, cSnap] = await Promise.all([vRef.get(), cRef.get()]);
  if (!vSnap.exists || !cSnap.exists) throw new Error("Vessel or container not found.");
  const vessel = vSnap.data()!;
  if (vessel.status === "Sailed" || vessel.status === "Delivered") {
    throw new Error("Cannot detach: vessel has already sailed.");
  }

  const batch = adminDb.batch();
  batch.update(vRef, {
    containerIds: FieldValue.arrayRemove(containerId),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.update(cRef, {
    vesselId: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  revalidatePath(`/vessels/${vesselId}`);
  revalidatePath("/vessels");
  revalidatePath("/containers");
  return { ok: true };
}

// =============================================================================
// dispatchVessel — mark vessel as Sailed, all containers as Shipped, all items as Shipped
// =============================================================================

export async function dispatchVessel(vesselId: string) {
  const user = await requireSessionUser();
  if (!hasPermission(user.role, "vessels.dispatch")) {
    throw new Error("You don't have permission to dispatch vessels.");
  }

  const vRef = adminDb.collection("vessels").doc(vesselId);
  const vSnap = await vRef.get();
  if (!vSnap.exists) throw new Error("Vessel not found.");
  const vessel = vSnap.data()!;
  if (vessel.status === "Sailed" || vessel.status === "Delivered") {
    throw new Error("Vessel has already sailed.");
  }
  if (!vessel.containerIds?.length) {
    throw new Error("Cannot dispatch a vessel with no containers.");
  }

  // Load all containers and verify they are Sealed
  const containerIds = vessel.containerIds as string[];
  const containers: { id: string; itemIds: string[] }[] = [];
  for (let i = 0; i < containerIds.length; i += 30) {
    const chunk = containerIds.slice(i, i + 30);
    const cSnap = await adminDb.collection("containers").where("id", "in", chunk).get();
    for (const c of cSnap.docs) {
      const data = c.data();
      if (data.status !== "Sealed") {
        throw new Error(`Container "${data.containerNumber}" is not sealed. Seal all containers before dispatching.`);
      }
      containers.push({ id: c.id, itemIds: data.itemIds ?? [] });
    }
  }

  // Collect all item IDs
  const allItemIds = containers.flatMap((c) => c.itemIds);

  // Batch updates — Firestore batch limit is 500 operations
  // Compute writes: 1 vessel + N containers + M items = manageable for typical vessel
  const allBatchOps = 1 + containers.length + allItemIds.length;
  if (allBatchOps > 500) {
    // Split into multiple batches
    const batches: FirebaseFirestore.WriteBatch[] = [];
    let current = adminDb.batch();
    let opCount = 0;
    const push = (fn: (b: FirebaseFirestore.WriteBatch) => void) => {
      if (opCount >= 480) {
        batches.push(current);
        current = adminDb.batch();
        opCount = 0;
      }
      fn(current);
      opCount++;
    };
    push((b) => b.update(vRef, { status: "Sailed", updatedAt: FieldValue.serverTimestamp() }));
    for (const c of containers) {
      push((b) => b.update(adminDb.collection("containers").doc(c.id), { status: "Shipped", updatedAt: FieldValue.serverTimestamp() }));
    }
    for (const itemId of allItemIds) {
      push((b) => b.update(adminDb.collection("po_items").doc(itemId), { status: "Shipped", vesselId, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid }));
    }
    batches.push(current);
    for (const b of batches) await b.commit();
  } else {
    const batch = adminDb.batch();
    batch.update(vRef, { status: "Sailed", updatedAt: FieldValue.serverTimestamp() });
    for (const c of containers) {
      batch.update(adminDb.collection("containers").doc(c.id), { status: "Shipped", updatedAt: FieldValue.serverTimestamp() });
    }
    for (const itemId of allItemIds) {
      batch.update(adminDb.collection("po_items").doc(itemId), {
        status: "Shipped", vesselId, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid,
      });
    }
    await batch.commit();
  }

  await writeActivityLog({
    userId: user.uid,
    userEmail: user.email,
    userRole: user.role,
    action: "vessel.dispatch",
    targetType: "vessel",
    targetId: vesselId,
    details: { vesselId: vessel.vesselId, containers: containers.length, items: allItemIds.length },
  });

  revalidatePath(`/vessels/${vesselId}`);
  revalidatePath("/vessels");
  revalidatePath("/containers");
  revalidatePath("/production");
  return { ok: true, containers: containers.length, items: allItemIds.length };
}

// =============================================================================
// listOpenSealedContainers — for the "attach to vessel" picker
// =============================================================================

export async function listAttachableContainers() {
  await requireSessionUser();
  const snap = await adminDb.collection("containers")
    .where("status", "in", ["Open", "Sealed"])
    .limit(200)
    .get();
  return snap.docs.filter((d) => !d.data().vesselId).map((d) => {
    const data = d.data();
    return {
      id: d.id,
      containerNumber: data.containerNumber as string,
      carrierNumber: (data.carrierNumber as string | undefined) || undefined,
      type: data.type as string,
      loadedCbm: (data.loadedCbm ?? 0) as number,
      usableCbm: (data.usableCbm ?? 0) as number,
      status: (data.status ?? "Open") as "Open" | "Sealed",
    };
  });
}
