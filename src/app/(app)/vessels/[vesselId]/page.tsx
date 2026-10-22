import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/lib/rbac/session";
import { hasPermission } from "@/lib/rbac/permissions";
import { getVesselDetail } from "@/lib/utils/vessel-actions";
import { Button } from "@/components/ui/button";
import { VesselDetailClient } from "./vessel-detail-client";
import type { RevisionView } from "@/components/vessels/revision-history-card";

export default async function VesselDetailPage({ params }: { params: { vesselId: string } }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "vessels.view")) redirect("/dashboard");

  let detail;
  try {
    detail = await getVesselDetail(params.vesselId);
  } catch {
    notFound();
  }

  // CR11 — serialize ETD/ETA revision history for the client component.
  // Firestore Timestamps aren't serializable across the server/client boundary.
  const vesselAny = detail.vessel as unknown as {
    revisions?: Array<{
      id: string;
      revisedAt?: { toDate?: () => Date } | null;
      revisedBy: string;
      revisedByEmail: string;
      revisedByName?: string;
      field: "etd" | "eta" | "both";
      previousEtd?: string;
      newEtd?: string;
      previousEta?: string;
      newEta?: string;
      reason?: string;
    }>;
  };
  const revisions: RevisionView[] = (vesselAny.revisions ?? []).map((r) => ({
    id: r.id,
    revisedAt: r.revisedAt?.toDate?.()?.toISOString?.() ?? null,
    revisedBy: r.revisedBy,
    revisedByEmail: r.revisedByEmail,
    revisedByName: r.revisedByName,
    field: r.field,
    previousEtd: r.previousEtd,
    newEtd: r.newEtd,
    previousEta: r.previousEta,
    newEta: r.newEta,
    reason: r.reason,
  }));

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/vessels"><ArrowLeft className="h-4 w-4" /> Back to vessels</Link>
      </Button>

      <VesselDetailClient
        vessel={detail.vessel}
        containers={detail.containers}
        canManage={hasPermission(user.role, "vessels.update")}
        canDispatch={hasPermission(user.role, "vessels.dispatch")}
        canReviseDates={hasPermission(user.role, "vessels.revise_dates")}
        revisions={revisions}
      />
    </div>
  );
}