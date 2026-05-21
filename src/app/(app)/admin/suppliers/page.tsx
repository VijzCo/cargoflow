import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/rbac/session";
import { hasPermission } from "@/lib/rbac/permissions";
import { listSuppliers } from "@/lib/utils/upload-actions";
import { SuppliersClient } from "./suppliers-client";

export default async function AdminSuppliersPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "suppliers.view")) redirect("/dashboard");

  const suppliers = await listSuppliers();
  const canCreate = hasPermission(user.role, "suppliers.create");
  const canDeactivate = hasPermission(user.role, "suppliers.update");

  return (
    <SuppliersClient
      initial={suppliers}
      canCreate={canCreate}
      canDeactivate={canDeactivate}
    />
  );
}
