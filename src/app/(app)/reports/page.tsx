import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/rbac/session";
import { hasPermission } from "@/lib/rbac/permissions";
import { getReportData } from "@/lib/utils/reports-actions";
import { ReportsClient } from "./reports-client";

export default async function ReportsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "reports.view")) redirect("/dashboard");

  const data = await getReportData();
  return <ReportsClient data={data} />;
}
