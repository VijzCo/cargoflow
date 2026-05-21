import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/rbac/session";
import { hasPermission } from "@/lib/rbac/permissions";
import { listActivityLogs } from "@/lib/utils/activity-log-actions";
import { ActivityClient } from "./activity-client";

export default async function AdminActivityPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "activity_logs.view")) redirect("/dashboard");

  const logs = await listActivityLogs({ limit: 200 });
  return <ActivityClient initial={logs} />;
}
