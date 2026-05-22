"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { updateItemStatus } from "@/lib/utils/production-actions";
import type { POItemStatus } from "@/types";

interface Props {
  itemId: string;
  itemLabel: string;
  currentStatus: POItemStatus;
  allowedStatuses: POItemStatus[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function StatusUpdateDialog({
  itemId, itemLabel, currentStatus, allowedStatuses, open, onOpenChange,
}: Props) {
  const router = useRouter();
  const t = useTranslations("production");
  const tStatus = useTranslations("status");
  const tCommon = useTranslations("common");
  const [status, setStatus] = useState<POItemStatus>(currentStatus);
  const [remarks, setRemarks] = useState("");
  const [saving, startSave] = useTransition();

  function submit() {
    if (status === currentStatus && !remarks.trim()) {
      toast.info(t("noChangesToSave"));
      onOpenChange(false);
      return;
    }
    startSave(async () => {
      try {
        await updateItemStatus({
          itemId,
          status,
          supplierRemarks: remarks.trim() || undefined,
        });
        toast.success(t("statusUpdated", { status: tStatus(status) }));
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("updateFailed"));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("statusDialogTitle")}</DialogTitle>
          <DialogDescription>{itemLabel}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("newStatus")}</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as POItemStatus)} disabled={saving}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allowedStatuses.map((s) => (
                  <SelectItem key={s} value={s}>{tStatus(s)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="remarks">{t("remarksOptional")}</Label>
            <Input
              id="remarks"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              disabled={saving}
              placeholder={t("remarksPlaceholder")}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {tCommon("cancel")}
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> {t("saving")}
              </>
            ) : (
              t("update")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
