"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Pencil, Boxes, MoreVertical, Send, AlertTriangle, Trash2, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusUpdateDialog } from "./status-update-dialog";
import { CBMUpdateDialog } from "./cbm-update-dialog";
import { EditItemDialog } from "@/components/po/edit-item-dialog";
import {
  deleteItemDirect, submitEditRequest, cancelEditRequest,
} from "@/lib/utils/edit-request-actions";
import type { POItemView } from "@/lib/utils/po-item-view";
import type { POItemStatus } from "@/types";

const SUPPLIER_STATUSES: POItemStatus[] = ["Started", "In Progress", "Completed"];
const MERCHANT_STATUSES: POItemStatus[] = ["Pending", "Started", "In Progress", "Completed", "Loaded", "Shipped"];

interface PendingRequestLite {
  id: string;
  type: "update" | "delete";
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
  currentUserId,
}: {
  item: POItemView;
  canUpdateStatus: boolean;
  canUpdateCBM: boolean;
  isSupplier: boolean;
  canEditDirect?: boolean;
  canEditRequest?: boolean;
  pendingRequest?: PendingRequestLite | null;
  currentUserId?: string;
}) {
  const router = useRouter();
  const t = useTranslations("production");
  const [statusOpen, setStatusOpen] = useState(false);
  const [cbmOpen, setCbmOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [working, startWork] = useTransition();

  const allowedStatuses = isSupplier ? SUPPLIER_STATUSES : MERCHANT_STATUSES;
  const itemLabel = `${item.style} — ${item.color} (${item.size})`;

  // Items in a container can't be edited or deleted through this flow
  const lockedByContainer =
    item.status === "Loaded" || item.status === "Shipped" || !!item.containerId;
  const hasPending = !!pendingRequest;
  const isMyPending = pendingRequest?.requestedBy === currentUserId;

  // Edit button visible only when user has edit perm AND item isn't locked
  const showEditOption = (canEditDirect || canEditRequest) && !lockedByContainer && !hasPending;
  const showDeleteOption = (canEditDirect || canEditRequest) && !lockedByContainer && !hasPending;
  const showCancelOption = hasPending && isMyPending;

  const editMode: "direct" | "request" = canEditDirect ? "direct" : "request";

  const hasAnyAction =
    canUpdateStatus || canUpdateCBM || showEditOption || showDeleteOption || showCancelOption;
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

  function handleCancelPending() {
    if (!pendingRequest) return;
    if (!confirm("Cancel your pending request on this item?")) return;
    startWork(async () => {
      try {
        await cancelEditRequest(pendingRequest.id);
        toast.success("Request cancelled.");
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
          {(showEditOption || showDeleteOption || showCancelOption) && (canUpdateStatus || canUpdateCBM) && (
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
          {showDeleteOption && (
            <DropdownMenuItem onClick={handleDelete} disabled={working}>
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              {canEditDirect ? "Delete item" : "Request delete"}
            </DropdownMenuItem>
          )}
          {showCancelOption && (
            <DropdownMenuItem onClick={handleCancelPending} disabled={working}>
              {working ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <X className="mr-2 h-3.5 w-3.5" />}
              Cancel my pending request
            </DropdownMenuItem>
          )}
          {hasPending && !isMyPending && (
            <DropdownMenuItem disabled>
              <AlertTriangle className="mr-2 h-3.5 w-3.5 text-amber-500" />
              Pending change by another user
            </DropdownMenuItem>
          )}
          {lockedByContainer && (canEditDirect || canEditRequest) && (
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
    </>
  );
}
