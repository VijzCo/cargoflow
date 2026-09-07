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

  // CR9 — edit approval workflow perms
  const canEditDirect = hasPermission(user.role, "po_items.edit_direct");
  const canEditRequest = hasPermission(user.role, "po_items.edit_request");

  // CR10 — split approval workflow perms
  const canSplitDirect = hasPermission(user.role, "po_items.split_direct");
  const canSplitRequest = hasPermission(user.role, "po_items.split_request");

  return (
    <ProductionClient
      role={user.role}
      supplierId={user.supplierId}
      suppliers={suppliers}
      currentUserId={user.uid}
      canEditDirect={canEditDirect}
      canEditRequest={canEditRequest}
      canSplitDirect={canSplitDirect}
      canSplitRequest={canSplitRequest}
    />
  );
}
