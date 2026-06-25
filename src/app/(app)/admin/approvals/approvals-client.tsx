"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Check, X, Clock, ChevronRight, Loader2, Send, Trash2, AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { resolveEditRequest, cancelEditRequest } from "@/lib/utils/edit-request-actions";
import type { EditRequestView } from "@/lib/utils/edit-request-types";
import { formatDate } from "@/lib/utils/format";

export function ApprovalsClient({
  pending, resolved, canApprove, currentUserId,
}: {
  pending: EditRequestView[];
  resolved: EditRequestView[];
  canApprove: boolean;
  currentUserId: string;
}) {
  const [reviewing, setReviewing] = useState<EditRequestView | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Edit requests</h1>
          <p className="mt-1 text-muted-foreground">
            {canApprove
              ? "Review pending merchant edit requests and approve or reject them."
              : "Your pending edit requests. They're locked here until a manager reviews them."}
          </p>
        </div>
      </div>

      {/* Pending */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4 text-amber-600" />
            Pending ({pending.length})
          </CardTitle>
          <CardDescription>
            {canApprove
              ? "Each entry needs an approve or reject decision. Self-approval is blocked."
              : "Waiting for a manager or super admin to review."}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {pending.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No pending requests.</div>
          ) : (
            <div className="divide-y">
              {pending.map((r) => (
                <RequestRow
                  key={r.id}
                  req={r}
                  isOwn={r.requestedBy === currentUserId}
                  onReview={() => setReviewing(r)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recently resolved */}
      {resolved.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recently resolved</CardTitle>
            <CardDescription>The last 50 closed requests.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {resolved.map((r) => (
                <RequestRow
                  key={r.id}
                  req={r}
                  isOwn={r.requestedBy === currentUserId}
                  onReview={() => setReviewing(r)}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <ReviewDialog
        request={reviewing}
        onClose={() => setReviewing(null)}
        canApprove={canApprove}
        isOwn={!!reviewing && reviewing.requestedBy === currentUserId}
      />
    </div>
  );
}

function statusVariant(s: string): "secondary" | "info" | "warning" | "success" | "destructive" | "outline" | "default" {
  switch (s) {
    case "pending":   return "warning";
    case "approved":  return "success";
    case "rejected":  return "destructive";
    case "cancelled": return "secondary";
    default:          return "outline";
  }
}

function RequestRow({
  req, isOwn, onReview,
}: {
  req: EditRequestView;
  isOwn: boolean;
  onReview: () => void;
}) {
  const isUpdate = req.type === "update";
  const changeCount = req.proposedChanges ? Object.keys(req.proposedChanges).length : 0;

  return (
    <button
      type="button"
      onClick={onReview}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
    >
      <div className="shrink-0">
        {isUpdate ? (
          <Send className="h-4 w-4 text-muted-foreground" />
        ) : (
          <Trash2 className="h-4 w-4 text-destructive" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant(req.status)} className="capitalize">{req.status}</Badge>
          <Badge variant="outline" className="text-[10px]">
            {isUpdate ? `${changeCount} field${changeCount === 1 ? "" : "s"}` : "Delete"}
          </Badge>
          {isOwn && <Badge variant="outline" className="text-[10px]">Yours</Badge>}
        </div>
        <div className="mt-1 text-sm">
          <span className="font-medium">{req.itemStyle || "Item"}</span>
          {req.itemColor && <span className="text-muted-foreground"> · {req.itemColor}</span>}
          {req.itemSize && <span className="text-muted-foreground"> · {req.itemSize}</span>}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {req.itemSupplierName && <>{req.itemSupplierName}</>}
          {req.itemPoNumber && <> · PO {req.itemPoNumber}</>}
          {" · "}requested by <span className="font-medium">{req.requestedByEmail}</span>
          {" · "}{formatDate(req.requestedAt)}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

function ReviewDialog({
  request, onClose, canApprove, isOwn,
}: {
  request: EditRequestView | null;
  onClose: () => void;
  canApprove: boolean;
  isOwn: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [working, startWork] = useTransition();

  if (!request) return null;
  const req = request;  // captured non-null binding for use inside closures
  const isPending = req.status === "pending";
  const isUpdate = req.type === "update";
  // Self-approval guard — approvers can't approve their own request
  const blockSelfApproval = canApprove && isOwn;
  const canTakeAction = isPending && canApprove && !blockSelfApproval;
  const canCancel = isPending && isOwn;

  function resolve(approve: boolean) {
    startWork(async () => {
      try {
        await resolveEditRequest({
          requestId: req.id,
          approve,
          note: note.trim() || undefined,
        });
        toast.success(approve ? "Approved." : "Rejected.");
        setNote("");
        onClose();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed.");
      }
    });
  }

  function cancel() {
    if (!confirm("Cancel this pending request?")) return;
    startWork(async () => {
      try {
        await cancelEditRequest(req.id);
        toast.success("Cancelled.");
        onClose();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed.");
      }
    });
  }

  return (
    <Dialog open={!!request} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isUpdate ? <Send className="h-5 w-5" /> : <Trash2 className="h-5 w-5 text-destructive" />}
            {isUpdate ? "Edit request" : "Delete request"}
            <Badge variant={statusVariant(request.status)} className="ml-2 capitalize">{request.status}</Badge>
          </DialogTitle>
          <DialogDescription>
            Item: <span className="font-medium">{request.itemStyle}</span>
            {request.itemColor && <> · {request.itemColor}</>}
            {request.itemSize && <> · {request.itemSize}</>}
            {request.itemSupplierName && <> · {request.itemSupplierName}</>}
            {request.itemPoNumber && <> · PO {request.itemPoNumber}</>}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="text-xs text-muted-foreground">
            Requested by <span className="font-medium">{request.requestedByEmail}</span> on {formatDate(request.requestedAt)}.
          </div>

          {request.reason && (
            <div className="rounded-md border bg-muted/40 p-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Reason</div>
              <div className="mt-0.5">{request.reason}</div>
            </div>
          )}

          {isUpdate && request.proposedChanges && (
            <div className="space-y-1 rounded-md border p-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Proposed changes</div>
              {Object.entries(request.proposedChanges).map(([field, newVal]) => {
                const oldVal = request.previousValues?.[field];
                return (
                  <div key={field} className="grid grid-cols-3 gap-2 text-xs">
                    <div className="font-medium">{field}</div>
                    <div className="text-muted-foreground">
                      <span className="text-[10px] text-muted-foreground">from:</span>{" "}
                      {oldVal == null || oldVal === "" ? <em>(empty)</em> : String(oldVal)}
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground">to:</span>{" "}
                      <span className="font-medium">
                        {newVal == null || newVal === "" ? <em>(empty)</em> : String(newVal)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!isUpdate && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
              This request deletes the item entirely. If approved, the item is removed permanently.
            </div>
          )}

          {!isPending && (
            <div className="rounded-md border bg-muted/40 p-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Resolution
              </div>
              <div className="mt-0.5 text-xs">
                {request.status.toUpperCase()} by {request.resolvedByEmail} on {formatDate(request.resolvedAt)}
              </div>
              {request.resolverNote && <div className="mt-1 text-xs italic">"{request.resolverNote}"</div>}
            </div>
          )}

          {blockSelfApproval && isPending && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs dark:border-amber-800 dark:bg-amber-950/40">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-amber-900 dark:text-amber-200">
                You can't approve your own request. Another approver needs to review it.
              </p>
            </div>
          )}

          {canTakeAction && (
            <div className="space-y-1.5">
              <Label htmlFor="r-note">Note (optional)</Label>
              <Input
                id="r-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Why approving/rejecting — visible to the requester"
                disabled={working}
                maxLength={500}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          {canCancel && (
            <Button variant="outline" onClick={cancel} disabled={working}>
              {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} Cancel my request
            </Button>
          )}
          {canTakeAction && (
            <>
              <Button variant="destructive" onClick={() => resolve(false)} disabled={working}>
                {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} Reject
              </Button>
              <Button onClick={() => resolve(true)} disabled={working}>
                {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve
              </Button>
            </>
          )}
          {!canTakeAction && !canCancel && (
            <Button onClick={onClose}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
