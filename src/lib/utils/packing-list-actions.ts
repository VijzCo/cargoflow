"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { requireSessionUser } from "@/lib/rbac/session";
import { hasPermission } from "@/lib/rbac/permissions";
import { writeActivityLog } from "@/lib/utils/activity-log";

// =============================================================================
// Views — plain JSON for client components
// =============================================================================

export type PackingListView = {
  id: string;
  packingListNumber: string;
  vesselId: string;
  vesselDisplayId: string;
  containerId: string;
  containerNumber: string;
  supplierId: string;
  supplierName: string;
  itemIds: string[];
  totalQuantity: number;
  totalCartons: number;
  totalCbm: number;
  totalGrossWeight: number;
  totalNetWeight: number;
  destination: string;
  salesChannel?: string;
  generatedBy: string;
  generatedAt: string | null;
};

export type PackingListItemRow = {
  id: string;
  poNumber: string;
  poNumbers: string[];
  style: string;
  color: string;
  size: string;
  quantity: number;
  unit: string;
  packageCount: number;
  cbm: number;
  grossWeight: number;
  netWeight: number;
  category: string;
  description?: string;
};

export type PackingListFullDetail = {
  packingList: PackingListView;
  items: PackingListItemRow[];
  // Company/branding settings to render in the PDF
  branding: {
    companyName: string;
    systemTitle: string;
    logoUrl?: string;
  };
  // Vessel info for header
  vessel: {
    vesselId: string;
    vesselName?: string;
    destination: string;
    etd?: string;
    eta?: string;
  };
  // Supplier info for letterhead
  supplier: {
    name: string;
    address?: string;
    country?: string;
    contactPerson?: string;
    email?: string;
    phone?: string;
  };
};

function toView(doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot): PackingListView {
  const d = doc.data()!;
  return {
    id: doc.id,
    packingListNumber: d.packingListNumber,
    vesselId: d.vesselId,
    vesselDisplayId: d.vesselDisplayId ?? "",
    containerId: d.containerId,
    containerNumber: d.containerNumber,
    supplierId: d.supplierId,
    supplierName: d.supplierName,
    itemIds: d.itemIds ?? [],
    totalQuantity: d.totalQuantity ?? 0,
    totalCartons: d.totalCartons ?? 0,
    totalCbm: d.totalCbm ?? 0,
    totalGrossWeight: d.totalGrossWeight ?? 0,
    totalNetWeight: d.totalNetWeight ?? 0,
    destination: d.destination ?? "",
    salesChannel: d.salesChannel,
    generatedBy: d.generatedBy ?? "",
    generatedAt: d.generatedAt?.toDate?.()?.toISOString() ?? null,
  };
}

// =============================================================================
// previewPackingLists — what we'd generate for a vessel
// =============================================================================

export type PackingListPreviewEntry = {
  containerId: string;
  containerNumber: string;
  supplierId: string;
  supplierName: string;
  itemCount: number;
  totalCbm: number;
  expectedNumber: string;
  alreadyExists: boolean;
  existingId?: string;
};

export async function previewPackingLists(vesselId: string): Promise<PackingListPreviewEntry[]> {
  await requireSessionUser();

  const vSnap = await adminDb.collection("vessels").doc(vesselId).get();
  if (!vSnap.exists) throw new Error("Vessel not found.");
  const vessel = vSnap.data()!;
  const containerIds = (vessel.containerIds as string[]) ?? [];
  if (containerIds.length === 0) return [];

  // Load containers
  const containers: { id: string; number: string; itemIds: string[] }[] = [];
  for (let i = 0; i < containerIds.length; i += 30) {
    const chunk = containerIds.slice(i, i + 30);
    const snap = await adminDb.collection("containers").where("id", "in", chunk).get();
    for (const d of snap.docs) {
      const data = d.data();
      containers.push({ id: d.id, number: (data.carrierNumber as string | undefined) || (data.containerNumber as string), itemIds: data.itemIds ?? [] });
    }
  }

  // For each container, group items by supplier
  const entries: PackingListPreviewEntry[] = [];
  for (const c of containers) {
    if (c.itemIds.length === 0) continue;
    // Fetch items
    const items: { supplierId: string; supplierName: string; cbm: number }[] = [];
    for (let i = 0; i < c.itemIds.length; i += 30) {
      const chunk = c.itemIds.slice(i, i + 30);
      const snap = await adminDb.collection("po_items").where("id", "in", chunk).get();
      for (const d of snap.docs) {
        const data = d.data();
        items.push({
          supplierId: data.supplierId,
          supplierName: data.supplierName,
          cbm: data.cbm ?? 0,
        });
      }
    }

    // Group by supplier
    const bySupplier = new Map<string, { supplierName: string; count: number; cbm: number }>();
    for (const it of items) {
      const g = bySupplier.get(it.supplierId) ?? { supplierName: it.supplierName, count: 0, cbm: 0 };
      g.count++;
      g.cbm += it.cbm;
      bySupplier.set(it.supplierId, g);
    }

    for (const [supplierId, g] of bySupplier.entries()) {
      const expectedNumber = `PL-${vessel.vesselId}-${c.number}-${supplierId.slice(0, 6).toUpperCase()}`;
      // Check if already exists
      const dupSnap = await adminDb.collection("packing_lists")
        .where("packingListNumber", "==", expectedNumber)
        .limit(1).get();
      const existing = dupSnap.docs[0];
      entries.push({
        containerId: c.id,
        containerNumber: c.number,
        supplierId,
        supplierName: g.supplierName,
        itemCount: g.count,
        totalCbm: Number(g.cbm.toFixed(2)),
        expectedNumber,
        alreadyExists: !!existing,
        existingId: existing?.id,
      });
    }
  }

  return entries;
}

// =============================================================================
// generatePackingLists — bulk generate for a vessel; idempotent
// =============================================================================

const GenerateSchema = z.object({
  vesselId: z.string().min(1),
  /** If true, regenerate (delete & recreate) packing lists that already exist */
  regenerate: z.boolean().default(false),
});

export async function generatePackingLists(input: z.infer<typeof GenerateSchema>) {
  const user = await requireSessionUser();
  if (!hasPermission(user.role, "packing_lists.generate")) {
    throw new Error("You don't have permission to generate packing lists.");
  }
  const { vesselId, regenerate } = GenerateSchema.parse(input);

  const vSnap = await adminDb.collection("vessels").doc(vesselId).get();
  if (!vSnap.exists) throw new Error("Vessel not found.");
  const vessel = vSnap.data()!;
  const containerIds = (vessel.containerIds as string[]) ?? [];
  if (containerIds.length === 0) {
    throw new Error("Vessel has no containers attached.");
  }

  // Load containers
  const containers: { id: string; number: string; itemIds: string[] }[] = [];
  for (let i = 0; i < containerIds.length; i += 30) {
    const chunk = containerIds.slice(i, i + 30);
    const snap = await adminDb.collection("containers").where("id", "in", chunk).get();
    for (const d of snap.docs) {
      const data = d.data();
      containers.push({ id: d.id, number: (data.carrierNumber as string | undefined) || (data.containerNumber as string), itemIds: data.itemIds ?? [] });
    }
  }

  let created = 0;
  let skipped = 0;
  let replaced = 0;

  for (const c of containers) {
    if (c.itemIds.length === 0) continue;

    // Load items
    type ItemRow = {
      id: string; supplierId: string; supplierName: string;
      cbm: number; packageCount: number;
      grossWeight: number; netWeight: number;
      quantity: number;
    };
    const items: ItemRow[] = [];
    for (let i = 0; i < c.itemIds.length; i += 30) {
      const chunk = c.itemIds.slice(i, i + 30);
      const snap = await adminDb.collection("po_items").where("id", "in", chunk).get();
      for (const d of snap.docs) {
        const data = d.data();
        items.push({
          id: d.id,
          supplierId: data.supplierId,
          supplierName: data.supplierName,
          cbm: data.cbm ?? 0,
          packageCount: data.packageCount ?? 0,
          grossWeight: data.grossWeight ?? 0,
          netWeight: data.netWeight ?? 0,
          quantity: data.quantity ?? 0,
        });
      }
    }

    // Group by supplier
    const bySupplier = new Map<string, { supplierName: string; items: ItemRow[] }>();
    for (const it of items) {
      const g = bySupplier.get(it.supplierId) ?? { supplierName: it.supplierName, items: [] };
      g.items.push(it);
      bySupplier.set(it.supplierId, g);
    }

    for (const [supplierId, group] of bySupplier.entries()) {
      const number = `PL-${vessel.vesselId}-${c.number}-${supplierId.slice(0, 6).toUpperCase()}`;

      // Check duplicates
      const dupSnap = await adminDb.collection("packing_lists")
        .where("packingListNumber", "==", number)
        .limit(1).get();
      if (!dupSnap.empty) {
        if (!regenerate) { skipped++; continue; }
        // Delete and recreate
        await adminDb.collection("packing_lists").doc(dupSnap.docs[0]!.id).delete();
        replaced++;
      }

      // Totals
      const totalQuantity = group.items.reduce((s, i) => s + i.quantity, 0);
      const totalCartons = group.items.reduce((s, i) => s + i.packageCount, 0);
      const totalCbm = Number(group.items.reduce((s, i) => s + i.cbm, 0).toFixed(2));
      const totalGrossWeight = Number(group.items.reduce((s, i) => s + i.grossWeight, 0).toFixed(2));
      const totalNetWeight = Number(group.items.reduce((s, i) => s + i.netWeight, 0).toFixed(2));

      const ref = adminDb.collection("packing_lists").doc();
      await ref.set({
        id: ref.id,
        packingListNumber: number,
        vesselId: vesselId,
        vesselDisplayId: vessel.vesselId,
        containerId: c.id,
        containerNumber: c.number,
        supplierId,
        supplierName: group.supplierName,
        itemIds: group.items.map((i) => i.id),
        totalQuantity,
        totalCartons,
        totalCbm,
        totalGrossWeight,
        totalNetWeight,
        destination: vessel.destination ?? "",
        salesChannel: vessel.salesChannel,
        generatedBy: user.uid,
        generatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      });

      // Backlink: items get packingListId
      const batch = adminDb.batch();
      for (const it of group.items) {
        batch.update(adminDb.collection("po_items").doc(it.id), {
          packingListId: ref.id,
        });
      }
      await batch.commit();

      created++;
    }
  }

  await writeActivityLog({
    userId: user.uid,
    userEmail: user.email,
    userRole: user.role,
    action: "packing_list.generate",
    targetType: "vessel",
    targetId: vesselId,
    details: { created, skipped, replaced },
  });

  revalidatePath("/packing-lists");
  revalidatePath(`/vessels/${vesselId}`);
  return { created, skipped, replaced };
}

// =============================================================================
// listPackingLists
// =============================================================================

export async function listPackingLists() {
  const user = await requireSessionUser();
  let q: FirebaseFirestore.Query = adminDb.collection("packing_lists");
  if (user.role === "supplier" && user.supplierId) {
    q = q.where("supplierId", "==", user.supplierId);
  }
  q = q.orderBy("generatedAt", "desc").limit(200);
  const snap = await q.get();
  return snap.docs.map(toView);
}

// =============================================================================
// getPackingListDetail — full data including items + branding for PDF generation
// =============================================================================

export async function getPackingListDetail(plId: string): Promise<PackingListFullDetail> {
  const user = await requireSessionUser();
  const plSnap = await adminDb.collection("packing_lists").doc(plId).get();
  if (!plSnap.exists) throw new Error("Packing list not found.");
  const pl = toView(plSnap);

  // Supplier isolation
  if (user.role === "supplier" && user.supplierId !== pl.supplierId) {
    throw new Error("Not authorized to view this packing list.");
  }

  // Items
  const items: PackingListItemRow[] = [];
  if (pl.itemIds.length > 0) {
    const poNumberCache = new Map<string, string>();
    for (let i = 0; i < pl.itemIds.length; i += 30) {
      const chunk = pl.itemIds.slice(i, i + 30);
      const snap = await adminDb.collection("po_items").where("id", "in", chunk).get();
      // Look up PO numbers
      const poIds = Array.from(new Set(snap.docs.map((d) => d.data().poId as string)));
      const toFetch = poIds.filter((id) => !poNumberCache.has(id));
      for (let j = 0; j < toFetch.length; j += 30) {
        const pc = toFetch.slice(j, j + 30);
        if (pc.length === 0) continue;
        const poSnap = await adminDb.collection("purchase_orders").where("id", "in", pc).get();
        for (const pd of poSnap.docs) poNumberCache.set(pd.id, pd.data().poNumber as string);
      }
      for (const d of snap.docs) {
        const data = d.data();
        items.push({
          id: d.id,
          poNumber: poNumberCache.get(data.poId) ?? "—",
          poNumbers: data.poNumbers ?? [],
          style: data.style,
          color: data.color,
          size: data.size,
          quantity: data.quantity,
          unit: data.unit,
          packageCount: data.packageCount ?? 0,
          cbm: data.cbm ?? 0,
          grossWeight: data.grossWeight ?? 0,
          netWeight: data.netWeight ?? 0,
          category: data.category,
          description: data.description,
        });
      }
    }
  }

  // Sort items by PO then style then color
  items.sort((a, b) =>
    a.poNumber.localeCompare(b.poNumber) ||
    a.style.localeCompare(b.style) ||
    a.color.localeCompare(b.color) ||
    a.size.localeCompare(b.size),
  );

  // Vessel
  const vSnap = await adminDb.collection("vessels").doc(pl.vesselId).get();
  const v = vSnap.data() ?? {};
  const vessel = {
    vesselId: (v.vesselId as string) ?? pl.vesselDisplayId,
    vesselName: v.vesselName as string | undefined,
    destination: (v.destination as string) ?? pl.destination,
    etd: v.etd as string | undefined,
    eta: v.eta as string | undefined,
  };

  // Supplier
  const sSnap = await adminDb.collection("suppliers").doc(pl.supplierId).get();
  const s = sSnap.data() ?? {};
  const supplier = {
    name: (s.name as string) ?? pl.supplierName,
    address: s.address as string | undefined,
    country: s.country as string | undefined,
    contactPerson: s.contactPerson as string | undefined,
    email: s.email as string | undefined,
    phone: s.phone as string | undefined,
  };

  // Branding
  const settingsSnap = await adminDb.collection("settings").doc("global").get();
  const settings = settingsSnap.data() ?? {};
  const branding = {
    companyName: (settings.companyName as string) ?? "CargoFlow",
    systemTitle: (settings.systemTitle as string) ?? "CargoFlow",
    logoUrl: settings.logoUrl as string | undefined,
  };

  return { packingList: pl, items, branding, vessel, supplier };
}

// =============================================================================
// deletePackingList
// =============================================================================

export async function deletePackingList(plId: string) {
  const user = await requireSessionUser();
  if (!hasPermission(user.role, "packing_lists.generate")) {
    throw new Error("You don't have permission to delete packing lists.");
  }
  const ref = adminDb.collection("packing_lists").doc(plId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Packing list not found.");
  const data = snap.data()!;

  // Clear backlinks on items
  const itemIds = (data.itemIds as string[]) ?? [];
  for (let i = 0; i < itemIds.length; i += 480) {
    const batch = adminDb.batch();
    for (const id of itemIds.slice(i, i + 480)) {
      batch.update(adminDb.collection("po_items").doc(id), {
        packingListId: FieldValue.delete(),
      });
    }
    await batch.commit();
  }

  await ref.delete();

  await writeActivityLog({
    userId: user.uid,
    userEmail: user.email,
    userRole: user.role,
    action: "packing_list.generate",
    targetType: "packing_list",
    targetId: plId,
    details: { action: "deleted", packingListNumber: data.packingListNumber },
  });

  revalidatePath("/packing-lists");
  return { ok: true };
}
