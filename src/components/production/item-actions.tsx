"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Pencil, Boxes, MoreVertical, Send, AlertTriangle, Trash2, X, Loader2, Split } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusUpdateDialog } from "./status-update-dialog";
import { CBMUpdateDialog } from "./cbm-update-dialog";
import { EditItemDialog } from "@/components/po/edit-item-dialog";
import { SplitItemDialog } from "@/components/po/split-item-dialog";
import {
  deleteItemDirect, submitEditRequest, cancelEditRequest,
} from "@/lib/utils/edit-request-actions";
import { cancelSplitRequest } from "@/lib/utils/split-actions";
import type { POItemView } from "@/lib/utils/po-item-view";
import type { POItemStatus } from "@/types";

const SUPPLIER_STATUSES: POItemStatus[] = ["Started", "In Progress", "Completed"];
const MERCHANT_STATUSES: POItemStatus[] = ["Pending", "Started", "In Progress", "Completed", "Loaded", "Shipped"];

interface PendingRequestLite {
  id: string;
  type: "update" | "delete";
  requestedBy: string;
}

interface PendingSplitLite {
  id: string;
  requestedBy: string;
}

export function ItemActions({
  item,
  canUpdateStatus,
  canUpdateCBM,
  isSupplier,
  // CR9 — approval workflow
  canEditDirect = false,
  canEditRequest = false,
  pendingRequest = null,
  // CR10 — split workflow
  canSplitDirect = false,
  canSplitRequest = false,
  pendingSplit = null,
  currentUserId,
}: {
  item: POItemView;
  canUpdateStatus: boolean;
  canUpdateCBM: boolean;
  isSupplier: boolean;
  canEditDirect?: boolean;
  canEditRequest?: boolean;
  pendingRequest?: PendingRequestLite | null;
  canSplitDirect?: boolean;
  canSplitRequest?: boolean;
  pendingSplit?: PendingSplitLite | null;
  currentUserId?: string;
}) {
  const router = useRouter();
  const t = useTranslations("production");
  const [statusOpen, setStatusOpen] = useState(false);
  const [cbmOpen, setCbmOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [working, startWork] = useTransition();

  const allowedStatuses = isSupplier ? SUPPLIER_STATUSES : MERCHANT_STATUSES;
  const itemLabel = `${item.style} — ${item.color} (${item.size})`;

  // Items in a container can't be edited/split through this flow
  const lockedByContainer =
    item.status === "Loaded" || item.status === "Shipped" || !!item.containerId;
  // A parent that's been split is history — no further actions
  const isSplitParent = item.status === "Split";
  // Children of a split cannot be split further (one level only for v1)
  const isSplitChild = !!(item as unknown as { splitFromItemId?: string }).splitFromItemId;

  const hasPendingEdit = !!pendingRequest;
  const isMyPendingEdit = pendingRequest?.requestedBy === currentUserId;
  const hasPendingSplit = !!pendingSplit;
  const isMyPendingSplit = pendingSplit?.requestedBy === currentUserId;

  // Edit visibility — same logic as CR9, plus no pending split, plus not a split parent
  const canDoEditWorkflow = canEditDirect || canEditRequest;
  const showEditOption = canDoEditWorkflow && !lockedByContainer && !hasPendingEdit && !hasPendingSplit && !isSplitParent;
  const showDeleteOption = canDoEditWorkflow && !lockedByContainer && !hasPendingEdit && !hasPendingSplit && !isSplitParent;
  const showCancelEdit = hasPendingEdit && isMyPendingEdit;

  // Split visibility — split perms, item is splittable, no other pending workflow
  const canDoSplitWorkflow = canSplitDirect || canSplitRequest;
  const showSplitOption = canDoSplitWorkflow && !lockedByContainer && !hasPendingEdit && !hasPendingSplit && !isSplitParent && !isSplitChild;
  const showCancelSplit = hasPendingSplit && isMyPendingSplit;

  const editMode: "direct" | "request" = canEditDirect ? "direct" : "request";
  const splitMode: "direct" | "request" = canSplitDirect ? "direct" : "request";

  const hasAnyAction =
    canUpdateStatus || canUpdateCBM ||
    showEditOption || showDeleteOption || showCancelEdit ||
    showSplitOption || showCancelSplit ||
    (hasPendingEdit && !isMyPendingEdit) ||
    (hasPendingSplit && !isMyPendingSplit) ||
    (lockedByContainer && canDoEditWorkflow) ||
    isSplitParent || isSplitChild;
  if (!hasAnyAction) return null;

  function handleDelete() {
    if (lockedByContainer) return;
    const confirmText = canEditDirect
      ? `Delete this item? This is permanent: ${itemLabel}`
      : `Submit a delete request for: ${itemLabel}?`;
    if (!confirm(confirmText)) return;
    startWork(async () => {
      try {
        if (canEditDirect) {
          await deleteItemDirect(item.id);
          toast.success("Item deleted.");
        } else {
          await submitEditRequest({ itemId: item.id, type: "delete" });
          toast.success("Delete request submitted for approval.");
        }
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed.");
      }
    });
  }

  function handleCancelEdit() {
    if (!pendingRequest) return;
    if (!confirm("Cancel your pending edit request on this item?")) return;
    startWork(async () => {
      try {
        await cancelEditRequest(pendingRequest.id);
        toast.success("Edit request cancelled.");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed.");
      }
    });
  }

  function handleCancelSplit() {
    if (!pendingSplit) return;
    if (!confirm("Cancel your pending split request on this item?")) return;
    startWork(async () => {
      try {
        await cancelSplitRequest(pendingSplit.id);
        toast.success("Split request cancelled.");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed.");
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canUpdateStatus && (
            <DropdownMenuItem onClick={() => setStatusOpen(true)}>
              <Pencil className="mr-2 h-3.5 w-3.5" /> {t("updateStatus")}
            </DropdownMenuItem>
          )}
          {canUpdateCBM && (
            <DropdownMenuItem onClick={() => setCbmOpen(true)}>
              <Boxes className="mr-2 h-3.5 w-3.5" /> {t("updateCBM")}
            </DropdownMenuItem>
          )}

          {/* Separator between supplier-y actions and merchant-y actions */}
          {(showEditOption || showDeleteOption || showSplitOption ||
            showCancelEdit || showCancelSplit) && (canUpdateStatus || canUpdateCBM) && (
            <DropdownMenuSeparator />
          )}

          {showEditOption && (
            <DropdownMenuItem onClick={() => setEditOpen(true)} disabled={working}>
              {editMode === "direct" ? (
                <><Pencil className="mr-2 h-3.5 w-3.5" /> Edit item</>
              ) : (
                <><Send className="mr-2 h-3.5 w-3.5" /> Request edit</>
              )}
            </DropdownMenuItem>
          )}
          {showSplitOption && (
            <DropdownMenuItem onClick={() => setSplitOpen(true)} disabled={working}>
              {splitMode === "direct" ? (
                <><Split className="mr-2 h-3.5 w-3.5" /> Split item</>
              ) : (
                <><Split className="mr-2 h-3.5 w-3.5" /> Request split</>
              )}
            </DropdownMenuItem>
          )}
          {showDeleteOption && (
            <DropdownMenuItem onClick={handleDelete} disabled={working}>
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              {canEditDirect ? "Delete item" : "Request delete"}
            </DropdownMenuItem>
          )}

          {showCancelEdit && (
            <DropdownMenuItem onClick={handleCancelEdit} disabled={working}>
              {working ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <X className="mr-2 h-3.5 w-3.5" />}
              Cancel my pending edit
            </DropdownMenuItem>
          )}
          {showCancelSplit && (
            <DropdownMenuItem onClick={handleCancelSplit} disabled={working}>
              {working ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <X className="mr-2 h-3.5 w-3.5" />}
              Cancel my pending split
            </DropdownMenuItem>
          )}

          {/* Informational disabled entries */}
          {hasPendingEdit && !isMyPendingEdit && (
            <DropdownMenuItem disabled>
              <AlertTriangle className="mr-2 h-3.5 w-3.5 text-amber-500" />
              Pending edit by another user
            </DropdownMenuItem>
          )}
          {hasPendingSplit && !isMyPendingSplit && (
            <DropdownMenuItem disabled>
              <AlertTriangle className="mr-2 h-3.5 w-3.5 text-amber-500" />
              Pending split by another user
            </DropdownMenuItem>
          )}
          {isSplitParent && (
            <DropdownMenuItem disabled>
              <Split className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
              Already split — see child items
            </DropdownMenuItem>
          )}
          {isSplitChild && canDoSplitWorkflow && !isSplitParent && (
            <DropdownMenuItem disabled>
              <AlertTriangle className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
              Split child — cannot split again
            </DropdownMenuItem>
          )}
          {lockedByContainer && canDoEditWorkflow && (
            <DropdownMenuItem disabled>
              <AlertTriangle className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
              Locked — in container
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {canUpdateStatus && (
        <StatusUpdateDialog
          itemId={item.id}
          itemLabel={itemLabel}
          currentStatus={item.status}
          allowedStatuses={allowedStatuses}
          open={statusOpen}
          onOpenChange={setStatusOpen}
        />
      )}

      {canUpdateCBM && (
        <CBMUpdateDialog
          item={item}
          open={cbmOpen}
          onOpenChange={setCbmOpen}
        />
      )}

      {showEditOption && (
        <EditItemDialog
          mode={editMode}
          open={editOpen}
          onOpenChange={setEditOpen}
          item={{
            id: item.id,
            poId: item.poId,
            poNumbers: item.poNumbers,
            style: item.style,
            color: item.color,
            size: item.size,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            category: item.category,
            description: item.description,
            deliveryDate: item.deliveryDate,
            salesChannel: item.salesChannel,
            remarks: item.remarks,
            status: item.status,
          }}
        />
      )}

      {showSplitOption && (
        <SplitItemDialog
          mode={splitMode}
          open={splitOpen}
          onOpenChange={setSplitOpen}
          item={{
            id: item.id,
            poId: item.poId,
            style: item.style,
            color: item.color,
            size: item.size,
            quantity: item.quantity,
            unit: item.unit,
            deliveryDate: item.deliveryDate,
            status: item.status,
          }}
        />
      )}
    </>
  );
}
