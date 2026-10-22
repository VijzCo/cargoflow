"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { requireSessionUser } from "@/lib/rbac/session";
import { hasPermission } from "@/lib/rbac/permissions";
import { writeActivityLog } from "@/lib/utils/activity-log";
import type { VesselDateRevision, VesselStatus } from "@/types";

// =============================================================================
// Schema
// =============================================================================

const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD.");

const ReviseSchema = z
  .object({
    vesselId: z.string().min(1),
    etd: IsoDate.nullable().optional(), // undefined = don't change; null = clear; string = set
    eta: IsoDate.nullable().optional(),
    reason: z.string().max(500).optional(),
  })
  .refine((v) => v.etd !== undefined || v.eta !== undefined, {
    message: "At least one of ETD or ETA must be provided.",
  });

// =============================================================================
// Helpers
// =============================================================================

/** Which fields are still editable given the vessel's current status. */
function allowedFieldsForStatus(status: VesselStatus): {
  etd: boolean;
  eta: boolean;
} {
  switch (status) {
    case "Planned":
    case "Loading":
      return { etd: true, eta: true };
    case "Sailed":
      return { etd: false, eta: true }; // vessel has left; ETD is history
    case "Delivered":
      return { etd: false, eta: false };
    default:
      return { etd: false, eta: false };
  }
}

function uuid(): string {
  // crypto.randomUUID is available in Node 19+; this file runs server-side on Vercel which supports it
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

// =============================================================================
// Public: revise ETD / ETA on a vessel
// =============================================================================

export async function reviseVesselDates(input: z.infer<typeof ReviseSchema>) {
  const user = await requireSessionUser();
  if (!hasPermission(user.role, "vessels.revise_dates")) {
    throw new Error("You don't have permission to revise vessel dates.");
  }
  const data = ReviseSchema.parse(input);

  const vesselRef = adminDb.collection("vessels").doc(data.vesselId);
  const snap = await vesselRef.get();
  if (!snap.exists) throw new Error("Vessel not found.");
  const vessel = snap.data()!;

  const allowed = allowedFieldsForStatus(vessel.status as VesselStatus);

  // Determine which fields are actually being changed, and that they are allowed
  const previousEtd: string | undefined = vessel.etd ?? undefined;
  const previousEta: string | undefined = vessel.eta ?? undefined;

  const newEtd = data.etd === undefined ? previousEtd : (data.etd ?? undefined);
  const newEta = data.eta === undefined ? previousEta : (data.eta ?? undefined);

  const etdChanging = data.etd !== undefined && newEtd !== previousEtd;
  const etaChanging = data.eta !== undefined && newEta !== previousEta;

  if (!etdChanging && !etaChanging) {
    throw new Error("No changes to apply — values match current ETD/ETA.");
  }
  if (etdChanging && !allowed.etd) {
    throw new Error(
      `ETD can't be revised when vessel status is "${vessel.status}".`,
    );
  }
  if (etaChanging && !allowed.eta) {
    throw new Error(
      `ETA can't be revised when vessel status is "${vessel.status}".`,
    );
  }

  // ETD/ETA sanity: ETA must not be earlier than ETD when both are known
  if (newEtd && newEta && newEta < newEtd) {
    throw new Error("ETA cannot be earlier than ETD.");
  }

  const field: VesselDateRevision["field"] =
    etdChanging && etaChanging ? "both" : etdChanging ? "etd" : "eta";

  const revision: VesselDateRevision = {
    id: uuid(),
    revisedAt: new Date() as unknown as import("firebase/firestore").Timestamp, // concrete time inside array element; serialized on read
    revisedBy: user.uid,
    revisedByEmail: user.email,
    revisedByName: user.displayName,
    field,
    previousEtd: etdChanging ? (previousEtd ?? undefined) : undefined,
    newEtd: etdChanging ? (newEtd ?? undefined) : undefined,
    previousEta: etaChanging ? (previousEta ?? undefined) : undefined,
    newEta: etaChanging ? (newEta ?? undefined) : undefined,
    reason: data.reason?.trim() || undefined,
  };

  // Build update payload
  const updates: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
    revisions: FieldValue.arrayUnion(cleanUndefined(revision)),
  };
  if (etdChanging) updates.etd = newEtd ?? FieldValue.delete();
  if (etaChanging) updates.eta = newEta ?? FieldValue.delete();

  await vesselRef.update(updates);

  await writeActivityLog({
    userId: user.uid,
    userEmail: user.email,
    userRole: user.role,
    action: "vessel.dates_revised",
    targetType: "vessel",
    targetId: data.vesselId,
    details: {
      field,
      previousEtd: revision.previousEtd,
      newEtd: revision.newEtd,
      previousEta: revision.previousEta,
      newEta: revision.newEta,
      reason: revision.reason,
      vesselStatus: vessel.status,
    },
  });

  revalidatePath(`/vessels/${data.vesselId}`);
  revalidatePath("/vessels");
  return { ok: true, revisionId: revision.id };
}

/** Firestore rejects undefined values inside objects. Strip them before arrayUnion. */
function cleanUndefined(obj: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}
