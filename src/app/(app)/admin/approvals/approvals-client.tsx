"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Check, X, Clock, ChevronRight, Loader2, Send, Trash2, AlertCircle, Split,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { resolveEditRequest, cancelEditRequest } from "@/lib/utils/edit-request-actions";
import { resolveSplitRequest, cancelSplitRequest } from "@/lib/utils/split-actions";
import type { EditRequestView } from "@/lib/utils/edit-request-types";
import type { SplitRequestView } from "@/lib/utils/split-request-types";
import { formatDate } from "@/lib/utils/format";

const REASON_LABELS: Record<string, string> = {
  supplier_capacity:    "Supplier capacity limit",
  customer_early_lot:   "Customer needs early lot",
  logistics_constraint: "Logistics / shipping constraint",
  other:                "Other",
};

export function ApprovalsClient({
  editsPending, editsResolved,
  splitsPending, splitsResolved,
  canApproveEdit, canApproveSplit,
  currentUserId,
}: {
  editsPending: EditRequestView[];
  editsResolved: EditRequestView[];
  splitsPending: SplitRequestView[];
  splitsResolved: SplitRequestView[];
  canApproveEdit: boolean;
  canApproveSplit: boolean;
  currentUserId: string;
}) {
  const [reviewingEdit, setReviewingEdit] = useState<EditRequestView | null>(null);
  const [reviewingSplit, setReviewingSplit] = useState<SplitRequestView | null>(null);

  const totalPending = editsPending.length + splitsPending.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Approvals</h1>
          <p className="mt-1 text-muted-foreground">
            {canApproveEdit || canApproveSplit
              ? `Review pending requests and approve or reject them. ${totalPending} pending in total.`
              : "Your pending requests. Locked here until a manager reviews them."}
          </p>
        </div>
      </div>

      <Tabs defaultValue={splitsPending.length > editsPending.length ? "splits" : "edits"}>
        <TabsList>
          <TabsTrigger value="edits">
            Edit requests
            {editsPending.length > 0 && (
              <Badge variant="warning" className="ml-2">{editsPending.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="splits">
            Split requests
            {splitsPending.length > 0 && (
              <Badge variant="warning" className="ml-2">{splitsPending.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ---- Edit requests tab ---- */}
        <TabsContent value="edits" className="mt-4 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4 text-amber-600" />
                Pending edits ({editsPending.length})
              </CardTitle>
              <CardDescription>
                {canApproveEdit
                  ? "Each entry needs an approve or reject decision. Self-approval is blocked."
                  : "Waiting for a manager or super admin to review."}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {editsPending.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">No pending edit requests.</div>
              ) : (
                <div className="divide-y">
                  {editsPending.map((r) => (
                    <EditRequestRow
                      key={r.id}
                      req={r}
                      isOwn={r.requestedBy === currentUserId}
                      onReview={() => setReviewingEdit(r)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {editsResolved.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recently resolved edits</CardTitle>
                <CardDescription>The last 50 closed edit requests.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {editsResolved.map((r) => (
                    <EditRequestRow
                      key={r.id}
                      req={r}
                      isOwn={r.requestedBy === currentUserId}
                      onReview={() => setReviewingEdit(r)}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ---- Split requests tab ---- */}
        <TabsContent value="splits" className="mt-4 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4 text-amber-600" />
                Pending splits ({splitsPending.length})
              </CardTitle>
              <CardDescription>
                {canApproveSplit
                  ? "Approving a split immediately creates the child items. Self-approval is blocked."
                  : "Waiting for a manager or super admin to review."}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {splitsPending.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">No pending split requests.</div>
              ) : (
                <div className="divide-y">
                  {splitsPending.map((r) => (
                    <SplitRequestRow
                      key={r.id}
                      req={r}
                      isOwn={r.requestedBy === currentUserId}
                      onReview={() => setReviewingSplit(r)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {splitsResolved.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recently resolved splits</CardTitle>
                <CardDescription>The last 50 closed split requests.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {splitsResolved.map((r) => (
                    <SplitRequestRow
                      key={r.id}
                      req={r}
                      isOwn={r.requestedBy === currentUserId}
                      onReview={() => setReviewingSplit(r)}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <EditReviewDialog
        request={reviewingEdit}
        onClose={() => setReviewingEdit(null)}
        canApprove={canApproveEdit}
        isOwn={!!reviewingEdit && reviewingEdit.requestedBy === currentUserId}
      />

      <SplitReviewDialog
        request={reviewingSplit}
        onClose={() => setReviewingSplit(null)}
        canApprove={canApproveSplit}
        isOwn={!!reviewingSplit && reviewingSplit.requestedBy === currentUserId}
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

// =====================================================================
// Edit request row + review dialog (unchanged from CR9 aside from names)
// =====================================================================

function EditRequestRow({
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
        {isUpdate ? <Send className="h-4 w-4 text-muted-foreground" /> : <Trash2 className="h-4 w-4 text-destructive" />}
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

function EditReviewDialog({
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
  const req = request;
  const isPending = req.status === "pending";
  const isUpdate = req.type === "update";
  const blockSelfApproval = canApprove && isOwn;
  const canTakeAction = isPending && canApprove && !blockSelfApproval;
  const canCancel = isPending && isOwn;

  function resolve(approve: boolean) {
    startWork(async () => {
      try {
        await resolveEditRequest({ requestId: req.id, approve, note: note.trim() || undefined });
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
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Resolution</div>
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

// =====================================================================
// Split request row + review dialog (CR10)
// =====================================================================

function SplitRequestRow({
  req, isOwn, onReview,
}: {
  req: SplitRequestView;
  isOwn: boolean;
  onReview: () => void;
}) {
  const childCount = req.plan.children.length;
  return (
    <button
      type="button"
      onClick={onReview}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
    >
      <div className="shrink-0">
        <Split className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant(req.status)} className="capitalize">{req.status}</Badge>
          <Badge variant="outline" className="text-[10px]">
            Split into {childCount}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {REASON_LABELS[req.plan.reasonCategory] ?? req.plan.reasonCategory}
          </Badge>
          {isOwn && <Badge variant="outline" className="text-[10px]">Yours</Badge>}
        </div>
        <div className="mt-1 text-sm">
          <span className="font-medium">{req.parentSnapshot.style}</span>
          <span className="text-muted-foreground"> · {req.parentSnapshot.color}</span>
          <span className="text-muted-foreground"> · {req.parentSnapshot.size}</span>
          <span className="ml-2 font-mono text-xs text-muted-foreground">
            {req.parentSnapshot.quantity.toLocaleString()} {req.parentSnapshot.unit}
          </span>
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

function SplitReviewDialog({
  request, onClose, canApprove, isOwn,
}: {
  request: SplitRequestView | null;
  onClose: () => void;
  canApprove: boolean;
  isOwn: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [working, startWork] = useTransition();

  if (!request) return null;
  const req = request;
  const isPending = req.status === "pending";
  const blockSelfApproval = canApprove && isOwn;
  const canTakeAction = isPending && canApprove && !blockSelfApproval;
  const canCancel = isPending && isOwn;

  const sum = req.plan.children.reduce((acc, c) => acc + c.quantity, 0);

  function resolve(approve: boolean) {
    startWork(async () => {
      try {
        await resolveSplitRequest({ requestId: req.id, approve, note: note.trim() || undefined });
        toast.success(approve ? "Split approved and applied." : "Split rejected.");
        setNote("");
        onClose();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed.");
      }
    });
  }

  function cancel() {
    if (!confirm("Cancel this pending split request?")) return;
    startWork(async () => {
      try {
        await cancelSplitRequest(req.id);
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
            <Split className="h-5 w-5" />
            Split request
            <Badge variant={statusVariant(request.status)} className="ml-2 capitalize">{request.status}</Badge>
          </DialogTitle>
          <DialogDescription>
            Item: <span className="font-medium">{req.parentSnapshot.style}</span>
            {" · "}{req.parentSnapshot.color}
            {" · "}{req.parentSnapshot.size}
            {" · "}{req.parentSnapshot.quantity.toLocaleString()} {req.parentSnapshot.unit}
            {req.itemSupplierName && <> · {req.itemSupplierName}</>}
            {req.itemPoNumber && <> · PO {req.itemPoNumber}</>}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="text-xs text-muted-foreground">
            Requested by <span className="font-medium">{req.requestedByEmail}</span> on {formatDate(req.requestedAt)}.
          </div>

          <div className="rounded-md border bg-muted/40 p-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Reason</div>
            <div className="mt-0.5">
              <Badge variant="outline">{REASON_LABELS[req.plan.reasonCategory] ?? req.plan.reasonCategory}</Badge>
              {req.plan.reasonText && <span className="ml-2">{req.plan.reasonText}</span>}
            </div>
          </div>

          <div className="space-y-1 rounded-md border p-2">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Proposed split ({req.plan.children.length} lots)
              </div>
              <div className="text-xs font-mono">
                Total: {sum.toLocaleString()} / {req.parentSnapshot.quantity.toLocaleString()} {req.parentSnapshot.unit}
              </div>
            </div>
            <div className="mt-2 space-y-1">
              {req.plan.children.map((c, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 rounded-sm bg-muted/30 px-2 py-1.5 text-xs">
                  <div className="col-span-1"><Badge variant="outline" className="font-mono text-[10px]">Lot {i + 1}</Badge></div>
                  <div className="col-span-3 font-mono">{c.quantity.toLocaleString()} {req.parentSnapshot.unit}</div>
                  <div className="col-span-3 text-muted-foreground">
                    {c.deliveryDate ? `Delivery: ${c.deliveryDate}` : "Delivery: (same as parent)"}
                  </div>
                  <div className="col-span-5 truncate">
                    {c.label ? <span className="italic">{c.label}</span> : <span className="text-muted-foreground">(no label)</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {req.status === "approved" && req.createdChildIds && (
            <div className="rounded-md border border-emerald-300 bg-emerald-50 p-2 text-xs dark:border-emerald-800 dark:bg-emerald-950/40">
              <div className="font-semibold text-emerald-900 dark:text-emerald-200">
                {req.createdChildIds.length} child items created
              </div>
            </div>
          )}

          {!isPending && (
            <div className="rounded-md border bg-muted/40 p-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Resolution</div>
              <div className="mt-0.5 text-xs">
                {req.status.toUpperCase()} by {req.resolvedByEmail} on {formatDate(req.resolvedAt)}
              </div>
              {req.resolverNote && <div className="mt-1 text-xs italic">"{req.resolverNote}"</div>}
            </div>
          )}

          {blockSelfApproval && isPending && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs dark:border-amber-800 dark:bg-amber-950/40">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-amber-900 dark:text-amber-200">
                You can't approve your own split request. Another approver needs to review it.
              </p>
            </div>
          )}

          {canTakeAction && (
            <div className="space-y-1.5">
              <Label htmlFor="s-note">Note (optional)</Label>
              <Input
                id="s-note"
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
                {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve & apply
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
