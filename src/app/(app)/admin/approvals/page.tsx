import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/rbac/session";
import { hasPermission } from "@/lib/rbac/permissions";
import { listEditRequests } from "@/lib/utils/edit-request-actions";
import { listSplitRequests } from "@/lib/utils/split-actions";
import { ApprovalsClient } from "./approvals-client";

export default async function ApprovalsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // Anyone who can request or approve either workflow sees this page (with different tabs shown)
  const canApproveEdit  = hasPermission(user.role, "po_items.edit_approve");
  const canApproveSplit = hasPermission(user.role, "po_items.split_approve");
  const canApprove = canApproveEdit || canApproveSplit;
  const canRequestEdit  = hasPermission(user.role, "po_items.edit_request");
  const canRequestSplit = hasPermission(user.role, "po_items.split_request");
  const canRequest = canRequestEdit || canRequestSplit || canApprove;
  if (!canRequest) redirect("/dashboard");

  // ---- Edit requests ----
  const editsPending = await listEditRequests({ status: "pending" });
  const [editsApproved, editsRejected, editsCancelled] = await Promise.all([
    listEditRequests({ status: "approved" }),
    listEditRequests({ status: "rejected" }),
    listEditRequests({ status: "cancelled" }),
  ]);
  const editsResolved = [...editsApproved, ...editsRejected, ...editsCancelled]
    .sort((a, b) => (b.resolvedAt ?? "").localeCompare(a.resolvedAt ?? ""))
    .slice(0, 50);

  // ---- Split requests ----
  const splitsPending = await listSplitRequests({ status: "pending" });
  const [splitsApproved, splitsRejected, splitsCancelled] = await Promise.all([
    listSplitRequests({ status: "approved" }),
    listSplitRequests({ status: "rejected" }),
    listSplitRequests({ status: "cancelled" }),
  ]);
  const splitsResolved = [...splitsApproved, ...splitsRejected, ...splitsCancelled]
    .sort((a, b) => (b.resolvedAt ?? "").localeCompare(a.resolvedAt ?? ""))
    .slice(0, 50);

  return (
    <ApprovalsClient
      editsPending={editsPending}
      editsResolved={editsResolved}
      splitsPending={splitsPending}
      splitsResolved={splitsResolved}
      canApproveEdit={canApproveEdit}
      canApproveSplit={canApproveSplit}
      currentUserId={user.uid}
    />
  );
}
