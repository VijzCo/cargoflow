"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { requireSessionUser, requireRole } from "@/lib/rbac/session";
import { writeActivityLog } from "@/lib/utils/activity-log";
import { hasPermission } from "@/lib/rbac/permissions";
import type { Category, POItemStatus } from "@/types";

// =============================================================================
// Schemas — parsed items arrive from the browser, validate strictly
// =============================================================================

const POItemInputSchema = z.object({
  // Supplier is sent as a NAME from the parser; we resolve to ID server-side.
  supplierName: z.string().min(1),
  supplierId: z.string().optional(), // populated after resolveSuppliers

  poNumbers: z.array(z.string().min(1)).min(1),
  orderNo: z.string().optional(),

  style: z.string().min(1),
  color: z.string().min(1),
  size: z.string().min(1),

  quantity: z.number().positive(),
  unit: z.string().min(1),
  unitPrice: z.number().optional(),

  category: z.enum(["Fabric", "Trims", "Accessories", "Packaging", "Garments", "Others"]),
  description: z.string().optional(),
  deliveryDate: z.string().optional(),       // ISO yyyy-mm-dd
  salesChannel: z.string().optional(),
  remarks: z.string().optional(),

  // Fabric-only details (parser fills these for any item that has the columns).
  composition: z.string().optional(),
  reference: z.string().optional(),
  shade: z.string().optional(),

  uniqueKey: z.string().min(1),
});

export type POItemInput = z.infer<typeof POItemInputSchema>;

// =============================================================================
// resolveSuppliers — fuzzy-match parsed supplier names against existing records
// =============================================================================

export type SupplierMatch = {
  parsedName: string;
  matchedId: string | null;
  matchedName: string | null;
  candidates: { id: string; name: string }[];
};

/** Normalize a supplier name for fuzzy matching: uppercase, strip punctuation. */
function normalizeName(s: string): string {
  return s
    .toUpperCase()
    .replace(/[.,;:'"`()]/g, "")
    .replace(/\bCO\.?\b|\bLTD\.?\b|\bLIMITED\b|\bINC\.?\b|\bCORP\.?\b|\bLLC\.?\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function resolveSuppliers(parsedNames: string[]): Promise<SupplierMatch[]> {
  await requireSessionUser();

  // Fetch ALL active suppliers once (the set is small enough)
  const snap = await adminDb.collection("suppliers").where("active", "==", true).get();
  const all = snap.docs.map((d) => ({
    id: d.id,
    name: d.data().name as string,
    aliases: (d.data().aliases as string[] | undefined) ?? [],
  }));

  // Build a normalized index
  const indexed = all.map((s) => ({
    ...s,
    normalized: [normalizeName(s.name), ...s.aliases.map(normalizeName)],
  }));

  const results: SupplierMatch[] = [];
  const uniqueNames = Array.from(new Set(parsedNames.map((n) => n.trim()).filter(Boolean)));

  for (const parsed of uniqueNames) {
    const norm = normalizeName(parsed);
    let exact: { id: string; name: string } | null = null;
    const partial: { id: string; name: string }[] = [];

    for (const s of indexed) {
      if (s.normalized.includes(norm)) {
        exact = { id: s.id, name: s.name };
        break;
      }
      // Substring / contained match
      if (s.normalized.some((n) => n.includes(norm) || norm.includes(n))) {
        partial.push({ id: s.id, name: s.name });
      }
    }

    results.push({
      parsedName: parsed,
      matchedId: exact?.id ?? null,
      matchedName: exact?.name ?? null,
      candidates: exact ? [] : partial.slice(0, 5),
    });
  }

  return results;
}

// =============================================================================
// createSupplier — inline create from the preview screen
// =============================================================================

const SupplierCreateSchema = z.object({
  name: z.string().min(2).max(200),
  aliases: z.array(z.string()).default([]),
  contactPerson: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  country: z.string().optional(),
});

export async function createSupplier(input: z.infer<typeof SupplierCreateSchema>) {
  const user = await requireSessionUser();
  if (!hasPermission(user.role, "suppliers.create")) {
    throw new Error("You don't have permission to create suppliers.");
  }
  const data = SupplierCreateSchema.parse(input);

  // Reject duplicates (by normalized name)
  const allSnap = await adminDb.collection("suppliers").get();
  const target = normalizeName(data.name);
  for (const doc of allSnap.docs) {
    const existing = doc.data();
    if (normalizeName(existing.name as string) === target) {
      throw new Error(`A supplier named "${existing.name}" already exists.`);
    }
  }

  const ref = adminDb.collection("suppliers").doc();
  const payload = {
    id: ref.id,
    ...data,
    email: data.email || undefined,
    active: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.set(payload);

  await writeActivityLog({
    userId: user.uid,
    userEmail: user.email,
    userRole: user.role,
    action: "user.create", // closest existing action; we'll add supplier.create in chunk 6
    targetType: "supplier",
    targetId: ref.id,
    details: { name: data.name },
  });

  revalidatePath("/admin/suppliers");
  return { id: ref.id, name: data.name };
}

// =============================================================================
// listSuppliers — admin page + preview screen
// =============================================================================

export async function listSuppliers() {
  await requireSessionUser();
  const snap = await adminDb.collection("suppliers").orderBy("name").get();
  return snap.docs.map((d) => ({
    id: d.id,
    name: d.data().name as string,
    aliases: (d.data().aliases as string[] | undefined) ?? [],
    contactPerson: d.data().contactPerson as string | undefined,
    email: d.data().email as string | undefined,
    phone: d.data().phone as string | undefined,
    country: d.data().country as string | undefined,
    active: d.data().active as boolean,
  }));
}

export async function updateSupplierActive(id: string, active: boolean) {
  const user = await requireRole(["super_admin", "merchant"]);
  await adminDb.collection("suppliers").doc(id).update({
    active,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await writeActivityLog({
    userId: user.uid,
    userEmail: user.email,
    userRole: user.role,
    action: "user.update",
    targetType: "supplier",
    targetId: id,
    details: { active },
  });
  revalidatePath("/admin/suppliers");
}

// =============================================================================
// savePO — the main write: 1 purchase_orders doc + N po_items in a batch
// =============================================================================

const SavePOSchema = z.object({
  items: z.array(POItemInputSchema).min(1),
});

export async function savePO(input: z.infer<typeof SavePOSchema>) {
  const user = await requireSessionUser();
  if (!hasPermission(user.role, "purchase_orders.upload")) {
    throw new Error("You don't have permission to upload POs.");
  }
  const { items } = SavePOSchema.parse(input);

  // All items must have resolved supplierId by this point.
  const unresolved = items.filter((i) => !i.supplierId);
  if (unresolved.length > 0) {
    throw new Error(`${unresolved.length} item(s) have an unmatched supplier. Resolve all suppliers before saving.`);
  }

  // Group items by primary PO + supplier to create one purchase_order header per group.
  // The unique key for a header is (supplierId + primary PO number).
  const groups = new Map<string, { supplierId: string; supplierName: string; poNumber: string; items: typeof items }>();
  for (const item of items) {
    const primaryPO = item.poNumbers[0];
    const key = `${item.supplierId}::${primaryPO}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        supplierId: item.supplierId!,
        supplierName: item.supplierName,
        poNumber: primaryPO,
        items: [],
      };
      groups.set(key, g);
    }
    g.items.push(item);
  }

  const batch = adminDb.batch();
  const createdPOIds: string[] = [];
  let totalItemsWritten = 0;

  for (const group of groups.values()) {
    const poRef = adminDb.collection("purchase_orders").doc();
    const allPONumbers = Array.from(new Set(group.items.flatMap((i) => i.poNumbers)));
    const totalQty = group.items.reduce((s, i) => s + i.quantity, 0);

    batch.set(poRef, {
      id: poRef.id,
      poNumber: group.poNumber,
      poNumbers: allPONumbers,
      supplierId: group.supplierId,
      supplierName: group.supplierName,
      orderNo: group.items[0]!.orderNo,
      salesChannel: group.items[0]!.salesChannel,
      totalItems: group.items.length,
      totalQuantity: totalQty,
      totalCbm: 0,
      uploadedBy: user.uid,
      uploadedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    for (const item of group.items) {
      const itemRef = adminDb.collection("po_items").doc();

      // Interpretation A — if a fabric field came in from the Excel,
      // lock it immediately. If it's missing, leave it editable until a
      // merchant sets it via the dialog.
      const composition = item.composition?.trim() || undefined;
      const reference   = item.reference?.trim()   || undefined;
      const shade       = item.shade?.trim()       || undefined;
      const fabricLocks = {
        composition: !!composition,
        reference:   !!reference,
        shade:       !!shade,
      };

      batch.set(itemRef, {
        id: itemRef.id,
        poId: poRef.id,
        poNumbers: item.poNumbers,
        supplierId: group.supplierId,
        supplierName: group.supplierName,
        style: item.style,
        color: item.color,
        size: item.size,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        category: item.category as Category,
        description: item.description,
        deliveryDate: item.deliveryDate,
        salesChannel: item.salesChannel,
        remarks: item.remarks,
        composition,
        reference,
        shade,
        fabricLocks,
        uniqueKey: item.uniqueKey,
        status: "Pending" as POItemStatus,
        cbm: 0,
        packageCount: 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: user.uid,
      });
      totalItemsWritten++;
    }

    createdPOIds.push(poRef.id);
  }

  await batch.commit();

  await writeActivityLog({
    userId: user.uid,
    userEmail: user.email,
    userRole: user.role,
    action: "po.upload",
    targetType: "purchase_order",
    targetId: createdPOIds[0] ?? "",
    details: {
      pos: createdPOIds.length,
      items: totalItemsWritten,
      poIds: createdPOIds,
    },
  });

  revalidatePath("/purchase-orders");
  return { poIds: createdPOIds, itemCount: totalItemsWritten };
}

// =============================================================================
// listPOs — for the purchase orders index page
// =============================================================================

export async function listPOs() {
  const user = await requireSessionUser();
  let query: FirebaseFirestore.Query = adminDb.collection("purchase_orders");

  // Suppliers see only their own POs (defense-in-depth; rules also enforce this)
  if (user.role === "supplier" && user.supplierId) {
    query = query.where("supplierId", "==", user.supplierId);
  }

  const snap = await query.orderBy("createdAt", "desc").limit(200).get();
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      poNumber: data.poNumber as string,
      poNumbers: (data.poNumbers as string[]) ?? [data.poNumber],
      supplierId: data.supplierId as string,
      supplierName: data.supplierName as string,
      orderNo: data.orderNo as string | undefined,
      salesChannel: data.salesChannel as string | undefined,
      totalItems: data.totalItems as number,
      totalQuantity: data.totalQuantity as number,
      totalCbm: (data.totalCbm as number) ?? 0,
      uploadedAt: (data.uploadedAt?.toDate?.() as Date | undefined)?.toISOString() ?? null,
    };
  });
}
