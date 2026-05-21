import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/rbac/session";
import { hasPermission } from "@/lib/rbac/permissions";
import { listContainers } from "@/lib/utils/container-actions";
import { ContainersClient } from "./containers-client";

export default async function ContainersPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "containers.view")) redirect("/dashboard");

  const containers = await listContainers();
  const canCreate = hasPermission(user.role, "containers.create");
  const canAssign = hasPermission(user.role, "containers.assign");

  // Add denormalized counts for the card view (cheap, container.itemIds is in the doc)
  const data = containers.map((c) => ({
    ...c,
    itemCount: c.itemIds.length,
    supplierCount: c.supplierIds.length,
  }));

  return (
    <ContainersClient
      containers={data}
      canCreate={canCreate}
      canAssign={canAssign}
    />
  );
}
