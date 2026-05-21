import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/lib/rbac/session";
import { hasPermission } from "@/lib/rbac/permissions";
import { getVesselDetail } from "@/lib/utils/vessel-actions";
import { Button } from "@/components/ui/button";
import { VesselDetailClient } from "./vessel-detail-client";

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
      />
    </div>
  );
}
