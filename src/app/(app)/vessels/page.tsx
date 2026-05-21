import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/rbac/session";
import { hasPermission } from "@/lib/rbac/permissions";
import { listVessels } from "@/lib/utils/vessel-actions";
import { VesselsClient } from "./vessels-client";

export default async function VesselsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "vessels.view")) redirect("/dashboard");

  const vessels = await listVessels();
  const canCreate = hasPermission(user.role, "vessels.create");

  return <VesselsClient vessels={vessels} canCreate={canCreate} />;
}
