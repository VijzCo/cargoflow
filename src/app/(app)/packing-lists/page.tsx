import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/rbac/session";
import { hasPermission } from "@/lib/rbac/permissions";
import { listPackingLists } from "@/lib/utils/packing-list-actions";
import { PackingListsClient } from "./packing-lists-client";

export default async function PackingListsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "packing_lists.view")) redirect("/dashboard");

  const lists = await listPackingLists();
  const canDelete = hasPermission(user.role, "packing_lists.generate");

  return <PackingListsClient lists={lists} canDelete={canDelete} />;
}
