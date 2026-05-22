"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Boxes } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { updateItemCBM } from "@/lib/utils/production-actions";
import type { POItemView } from "@/lib/utils/po-item-view";

interface Props {
  item: POItemView;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** When true, shows "Mark as completed" checkbox */
  allowMarkCompleted?: boolean;
}

export function CBMUpdateDialog({ item, open, onOpenChange, allowMarkCompleted = true }: Props) {
  const router = useRouter();
  const t = useTranslations("production");
  const tCommon = useTranslations("common");
  const [cbm, setCbm] = useState(String(item.cbm || ""));
  const [packageCount, setPackageCount] = useState(String(item.packageCount || ""));
  const [grossWeight, setGrossWeight] = useState(item.grossWeight != null ? String(item.grossWeight) : "");
  const [netWeight, setNetWeight] = useState(item.netWeight != null ? String(item.netWeight) : "");
  const [remarks, setRemarks] = useState(item.supplierRemarks || "");
  const [markCompleted, setMarkCompleted] = useState(false);
  const [saving, startSave] = useTransition();

  // Vocabulary cues by category
  const packageLabel =
    item.category === "Fabric" ? t("packagesRolls") :
    item.category === "Trims" || item.category === "Packaging" ? t("packagesBoxes") :
    t("packagesGeneric");

  function submit() {
    const cbmNum = Number(cbm);
    const pkgNum = Number(packageCount);
    if (!Number.isFinite(cbmNum) || cbmNum < 0) {
      toast.error(t("cbmMustBeNonNegative"));
      return;
    }
    if (!Number.isInteger(pkgNum) || pkgNum < 0) {
      toast.error(t("packageCountMustBeWholeNonNegative"));
      return;
    }
    const gw = grossWeight ? Number(grossWeight) : undefined;
    const nw = netWeight ? Number(netWeight) : undefined;
    if (gw !== undefined && !Number.isFinite(gw)) {
      toast.error(t("grossMustBeNumber"));
      return;
    }
    if (nw !== undefined && !Number.isFinite(nw)) {
      toast.error(t("netMustBeNumber"));
      return;
    }
    if (gw !== undefined && nw !== undefined && nw > gw) {
      toast.error(t("netCannotExceedGross"));
      return;
    }

    startSave(async () => {
      try {
        await updateItemCBM({
          itemId: item.id,
          cbm: cbmNum,
          packageCount: pkgNum,
          grossWeight: gw,
          netWeight: nw,
          supplierRemarks: remarks.trim() || undefined,
          markCompleted,
        });
        toast.success(markCompleted ? t("savedMarkedCompleted") : t("cbmUpdated"));
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
          <DialogTitle className="flex items-center gap-2">
            <Boxes className="h-5 w-5" /> {t("cbmDialogTitle")}
          </DialogTitle>
          <DialogDescription>
            {item.style} — {item.color} ({item.size}) · {item.quantity} {item.unit}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cbm">{t("cbmField")} *</Label>
              <Input
                id="cbm"
                type="number"
                step="0.01"
                min="0"
                value={cbm}
                onChange={(e) => setCbm(e.target.value)}
                disabled={saving}
                placeholder="e.g. 5.30"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pkg">{packageLabel} *</Label>
              <Input
                id="pkg"
                type="number"
                step="1"
                min="0"
                value={packageCount}
                onChange={(e) => setPackageCount(e.target.value)}
                disabled={saving}
                placeholder="e.g. 68"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gross">{t("grossWeight")}</Label>
              <Input
                id="gross"
                type="number"
                step="0.01"
                min="0"
                value={grossWeight}
                onChange={(e) => setGrossWeight(e.target.value)}
                disabled={saving}
                placeholder="e.g. 1640"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="net">{t("netWeight")}</Label>
              <Input
                id="net"
                type="number"
                step="0.01"
                min="0"
                value={netWeight}
                onChange={(e) => setNetWeight(e.target.value)}
                disabled={saving}
                placeholder="e.g. 1625"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sup-remarks">{t("supplierRemarks")}</Label>
            <Input
              id="sup-remarks"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              disabled={saving}
              placeholder={t("supplierRemarksPlaceholder")}
            />
          </div>

          {allowMarkCompleted && item.status !== "Completed" && item.status !== "Loaded" && item.status !== "Shipped" && (
            <label className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={markCompleted}
                onChange={(e) => setMarkCompleted(e.target.checked)}
                disabled={saving}
                className="h-4 w-4"
              />
              <span>{t("alsoMarkCompleted")}</span>
            </label>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {tCommon("cancel")}
          </Button>
          <Button onClick={submit} disabled={saving || !cbm || !packageCount}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> {t("saving")}
              </>
            ) : (
              tCommon("save")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
