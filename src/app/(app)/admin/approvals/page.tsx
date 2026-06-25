import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/rbac/session";
import { hasPermission } from "@/lib/rbac/permissions";
import { listEditRequests } from "@/lib/utils/edit-request-actions";
import { ApprovalsClient } from "./approvals-client";

export default async function ApprovalsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // Anyone who can either request OR approve sees this page (just shows different lists).
  const canApprove = hasPermission(user.role, "po_items.edit_approve");
  const canRequest = hasPermission(user.role, "po_items.edit_request") || canApprove;
  if (!canRequest) redirect("/dashboard");

  // Pending: for approvers, all pending; for requesters-only, just their own pending
  const pending = await listEditRequests({ status: "pending" });
  // Recently resolved (last 50 across all final states)
  const [approved, rejected, cancelled] = await Promise.all([
    listEditRequests({ status: "approved" }),
    listEditRequests({ status: "rejected" }),
    listEditRequests({ status: "cancelled" }),
  ]);
  const resolved = [...approved, ...rejected, ...cancelled]
    .sort((a, b) => (b.resolvedAt ?? "").localeCompare(a.resolvedAt ?? ""))
    .slice(0, 50);

  return (
    <ApprovalsClient
      pending={pending}
      resolved={resolved}
      canApprove={canApprove}
      currentUserId={user.uid}
    />
  );
}
