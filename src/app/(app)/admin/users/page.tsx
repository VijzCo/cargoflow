import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/rbac/session";
import { hasPermission } from "@/lib/rbac/permissions";
import { listUsers } from "@/lib/utils/admin-actions";
import { UsersClient } from "./users-client";

export default async function AdminUsersPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "users.view")) redirect("/dashboard");

  const users = await listUsers();
  const canManage = user.role === "super_admin";

  return <UsersClient initial={users} canManage={canManage} currentUid={user.uid} />;
}
