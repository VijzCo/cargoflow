"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { requireSessionUser, requireRole } from "@/lib/rbac/session";
import { hasPermission } from "@/lib/rbac/permissions";
import { writeActivityLog } from "@/lib/utils/activity-log";
import type { Role } from "@/types";

// =============================================================================
// User management
// =============================================================================

export type UserView = {
  uid: string;
  email: string;
  displayName?: string;
  role: Role;
  supplierId?: string;
  supplierName?: string;
  active: boolean;
  createdAt: string | null;
  lastLoginAt: string | null;
};

export async function listUsers(): Promise<UserView[]> {
  const user = await requireSessionUser();
  if (!hasPermission(user.role, "users.view")) {
    throw new Error("You don't have permission to view users.");
  }

  const snap = await adminDb.collection("users").orderBy("createdAt", "desc").limit(500).get();

  // Pre-fetch supplier names (small set)
  const supplierIds = Array.from(new Set(snap.docs.map((d) => d.data().supplierId).filter(Boolean) as string[]));
  const supplierNames = new Map<string, string>();
  for (let i = 0; i < supplierIds.length; i += 30) {
    const chunk = supplierIds.slice(i, i + 30);
    if (chunk.length === 0) continue;
    const ss = await adminDb.collection("suppliers").where("id", "in", chunk).get();
    for (const s of ss.docs) supplierNames.set(s.id, s.data().name as string);
  }

  return snap.docs.map((d) => {
    const data = d.data();
    return {
      uid: d.id,
      email: data.email,
      displayName: data.displayName,
      role: data.role,
      supplierId: data.supplierId,
      supplierName: data.supplierId ? supplierNames.get(data.supplierId) : undefined,
      active: data.active ?? true,
      createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
      lastLoginAt: data.lastLoginAt?.toDate?.()?.toISOString() ?? null,
    };
  });
}

const CreateUserSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(100),
  role: z.enum(["super_admin", "merchant_manager", "merchant", "supplier", "logistics", "viewer"]),
  supplierId: z.string().optional(),
});

export async function createUser(input: z.infer<typeof CreateUserSchema>) {
  const actor = await requireRole(["super_admin"]);
  const data = CreateUserSchema.parse(input);

  if (data.role === "supplier" && !data.supplierId) {
    throw new Error("Supplier-role users must be linked to a supplier.");
  }

  // Try to find existing Auth user first
  let uid: string;
  try {
    const existing = await adminAuth.getUserByEmail(data.email);
    uid = existing.uid;
  } catch (err: unknown) {
    const code = err instanceof Error && "code" in err ? (err as { code: string }).code : "";
    if (code === "auth/user-not-found") {
      const created = await adminAuth.createUser({
        email: data.email,
        displayName: data.displayName,
        emailVerified: false,
      });
      uid = created.uid;
    } else {
      throw err;
    }
  }

  await adminDb.collection("users").doc(uid).set(
    {
      uid,
      email: data.email,
      displayName: data.displayName,
      role: data.role,
      supplierId: data.supplierId,
      active: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: actor.uid,
    },
    { merge: true },
  );

  // Generate password reset link to send to the user
  const link = await adminAuth.generatePasswordResetLink(data.email);

  await writeActivityLog({
    userId: actor.uid,
    userEmail: actor.email,
    userRole: actor.role,
    action: "user.create",
    targetType: "user",
    targetId: uid,
    details: { email: data.email, role: data.role },
  });

  revalidatePath("/admin/users");
  return { uid, passwordResetLink: link };
}

const UpdateUserRoleSchema = z.object({
  uid: z.string().min(1),
  role: z.enum(["super_admin", "merchant_manager", "merchant", "supplier", "logistics", "viewer"]),
  supplierId: z.string().optional(),
});

export async function updateUserRole(input: z.infer<typeof UpdateUserRoleSchema>) {
  const actor = await requireRole(["super_admin"]);
  const data = UpdateUserRoleSchema.parse(input);

  if (data.role === "supplier" && !data.supplierId) {
    throw new Error("Supplier-role users must be linked to a supplier.");
  }

  const ref = adminDb.collection("users").doc(data.uid);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("User not found.");
  const previous = snap.data()!;

  await ref.update({
    role: data.role,
    supplierId: data.role === "supplier" ? data.supplierId : FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actor.uid,
  });

  await writeActivityLog({
    userId: actor.uid,
    userEmail: actor.email,
    userRole: actor.role,
    action: "user.update",
    targetType: "user",
    targetId: data.uid,
    details: { from: previous.role, to: data.role, email: previous.email },
  });

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function setUserActive(uid: string, active: boolean) {
  const actor = await requireRole(["super_admin"]);

  // Prevent self-deactivation
  if (uid === actor.uid && !active) {
    throw new Error("You can't deactivate your own account.");
  }

  const ref = adminDb.collection("users").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("User not found.");
  const data = snap.data()!;

  await ref.update({
    active,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actor.uid,
  });

  // Also disable/enable the Firebase Auth account
  try {
    await adminAuth.updateUser(uid, { disabled: !active });
  } catch (err) {
    console.error("[setUserActive] auth update failed:", err);
  }

  await writeActivityLog({
    userId: actor.uid,
    userEmail: actor.email,
    userRole: actor.role,
    action: active ? "user.update" : "user.deactivate",
    targetType: "user",
    targetId: uid,
    details: { email: data.email, active },
  });

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function sendPasswordResetForUser(uid: string) {
  const actor = await requireRole(["super_admin"]);
  const snap = await adminDb.collection("users").doc(uid).get();
  if (!snap.exists) throw new Error("User not found.");
  const data = snap.data()!;
  const link = await adminAuth.generatePasswordResetLink(data.email);

  await writeActivityLog({
    userId: actor.uid,
    userEmail: actor.email,
    userRole: actor.role,
    action: "user.update",
    targetType: "user",
    targetId: uid,
    details: { action: "password_reset_sent", email: data.email },
  });

  return { link };
}

// =============================================================================
// Settings
// =============================================================================

export type GlobalSettings = {
  companyName: string;
  systemTitle: string;
  logoUrl?: string;
  containerUsablePercent: number;
  categoryKeywords: Record<string, string[]>;
  salesChannels: string[];
};

const DEFAULT_SETTINGS: GlobalSettings = {
  companyName: "Duty Free Sourcing Inc.",
  systemTitle: "CargoFlow",
  logoUrl: "",
  containerUsablePercent: 0.92,
  categoryKeywords: {
    Fabric: ["fabric","cotton","poly","polyester","spandex","jersey","knit","woven","interlock","fleece","yarn","gsm","dty","viscose","linen","rayon","denim","twill","satin","chiffon"],
    Trims: ["cord","draw cord","drawcord","button","zipper","label","tag","thread","elastic","hook","snap","rivet","velcro","binding","piping","ribbon"],
    Accessories: ["bag","strap","buckle","clasp","webbing","patch","badge","clip","ring"],
    Packaging: ["polybag","hangtag","carton","box","tissue","sticker","barcode","pp band"],
    Garments: ["shirt","pants","jacket","hoodie","tee","short","skirt","dress","jumpsuit"],
    Others: [],
  },
  salesChannels: ["Amazon","Walmart","Retail","Wholesale","Shopify","TikTok Shop"],
};

export async function getSettings(): Promise<GlobalSettings> {
  await requireSessionUser();
  const snap = await adminDb.collection("settings").doc("global").get();
  if (!snap.exists) return DEFAULT_SETTINGS;
  const data = snap.data()!;
  return {
    companyName: data.companyName ?? DEFAULT_SETTINGS.companyName,
    systemTitle: data.systemTitle ?? DEFAULT_SETTINGS.systemTitle,
    logoUrl: data.logoUrl ?? "",
    containerUsablePercent: typeof data.containerUsablePercent === "number" ? data.containerUsablePercent : DEFAULT_SETTINGS.containerUsablePercent,
    categoryKeywords: data.categoryKeywords ?? DEFAULT_SETTINGS.categoryKeywords,
    salesChannels: data.salesChannels ?? DEFAULT_SETTINGS.salesChannels,
  };
}

const UpdateSettingsSchema = z.object({
  companyName: z.string().min(1).max(200),
  systemTitle: z.string().min(1).max(100),
  logoUrl: z.string().optional(),
  containerUsablePercent: z.number().min(0.5).max(1),
  categoryKeywords: z.record(z.string(), z.array(z.string())),
  salesChannels: z.array(z.string().min(1)),
});

export async function updateSettings(input: z.infer<typeof UpdateSettingsSchema>) {
  const user = await requireSessionUser();
  if (!hasPermission(user.role, "settings.update")) {
    throw new Error("You don't have permission to update settings.");
  }
  const data = UpdateSettingsSchema.parse(input);

  await adminDb.collection("settings").doc("global").set(
    { ...data, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid },
    { merge: true },
  );

  await writeActivityLog({
    userId: user.uid,
    userEmail: user.email,
    userRole: user.role,
    action: "settings.update",
    targetType: "settings",
    targetId: "global",
    details: { companyName: data.companyName, containerUsablePercent: data.containerUsablePercent },
  });

  revalidatePath("/admin/settings");
  return { ok: true };
}

// =============================================================================
// Supplier list for the user form
// =============================================================================

export async function listSuppliersForUserForm() {
  await requireSessionUser();
  const snap = await adminDb.collection("suppliers").where("active", "==", true).orderBy("name").get();
  return snap.docs.map((d) => ({ id: d.id, name: d.data().name as string }));
}
