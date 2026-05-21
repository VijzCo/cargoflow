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

  return (
    <ProductionClient
      role={user.role}
      supplierId={user.supplierId}
      suppliers={suppliers}
    />
  );
}
