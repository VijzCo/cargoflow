"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Pencil, Boxes, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusUpdateDialog } from "./status-update-dialog";
import { CBMUpdateDialog } from "./cbm-update-dialog";
import type { POItemView } from "@/lib/utils/po-item-view";
import type { POItemStatus } from "@/types";

const SUPPLIER_STATUSES: POItemStatus[] = ["Started", "In Progress", "Completed"];
const MERCHANT_STATUSES: POItemStatus[] = ["Pending", "Started", "In Progress", "Completed", "Loaded", "Shipped"];

export function ItemActions({
  item,
  canUpdateStatus,
  canUpdateCBM,
  isSupplier,
}: {
  item: POItemView;
  canUpdateStatus: boolean;
  canUpdateCBM: boolean;
  isSupplier: boolean;
}) {
  const t = useTranslations("production");
  const [statusOpen, setStatusOpen] = useState(false);
  const [cbmOpen, setCbmOpen] = useState(false);

  const allowedStatuses = isSupplier ? SUPPLIER_STATUSES : MERCHANT_STATUSES;
  const itemLabel = `${item.style} — ${item.color} (${item.size})`;
  const hasAnyAction = canUpdateStatus || canUpdateCBM;

  if (!hasAnyAction) return null;

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
    </>
  );
}
