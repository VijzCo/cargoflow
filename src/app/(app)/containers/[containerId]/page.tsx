import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/lib/rbac/session";
import { hasPermission } from "@/lib/rbac/permissions";
import { getContainerDetail } from "@/lib/utils/container-actions";
import { Button } from "@/components/ui/button";
import { ContainerDetailClient } from "./container-detail-client";

export default async function ContainerDetailPage({ params }: { params: { containerId: string } }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "containers.view")) redirect("/dashboard");

  let detail;
  try {
    detail = await getContainerDetail(params.containerId);
  } catch {
    notFound();
  }

  const canAssign = hasPermission(user.role, "containers.assign");
  const canSeal = hasPermission(user.role, "containers.seal");

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/containers"><ArrowLeft className="h-4 w-4" /> Back to containers</Link>
      </Button>

      <ContainerDetailClient
        initialContainer={detail.container}
        initialItems={detail.items}
        canAssign={canAssign}
        canSeal={canSeal}
      />
    </div>
  );
}
