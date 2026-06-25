import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/rbac/session";
import { hasPermission } from "@/lib/rbac/permissions";
import { listSuppliersForFilter } from "@/lib/utils/production-actions";
import { ProductionClient } from "./production-client";

export default async function ProductionPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "po_items.view")) redirect("/dashboard");

  const suppliers = await listSuppliersForFilter();
  const canEditDirect = hasPermission(user.role, "po_items.edit_direct");
  const canEditRequest = hasPermission(user.role, "po_items.edit_request");

  return (
    <ProductionClient
      role={user.role}
      supplierId={user.supplierId}
      suppliers={suppliers}
      currentUserId={user.uid}
      canEditDirect={canEditDirect}
      canEditRequest={canEditRequest}
    />
  );
}
