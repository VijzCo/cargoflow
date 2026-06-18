"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Lock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { updateFabricDetails } from "@/lib/utils/production-actions";

interface Props {
  itemId: string;
  composition?: string;
  reference?: string;
  shade?: string;
  locks?: { composition?: boolean; reference?: boolean; shade?: boolean };
  canEdit: boolean;
}

export function FabricDetailsCell({
  itemId, composition, reference, shade, locks, canEdit,
}: Props) {
  const [open, setOpen] = useState(false);

  const compLocked = !!locks?.composition;
  const refLocked = !!locks?.reference;
  const shdLocked = !!locks?.shade;
  const allLocked = compLocked && refLocked && shdLocked;
  const anyEditable = canEdit && !allLocked;

  function Row({ label, value, locked }: { label: string; value?: string; locked: boolean }) {
    return (
      <div className="flex items-baseline gap-1.5 leading-tight">
        <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">{label}:</span>
        {value ? (
          <span className="flex items-baseline gap-1">
            <span className="text-sm">{value}</span>
            {locked && <Lock className="inline h-2.5 w-2.5 shrink-0 text-muted-foreground" />}
          </span>
        ) : (
          <span className="text-sm italic text-muted-foreground">not set</span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      <Row label="Comp." value={composition} locked={compLocked} />
      <Row label="Ref." value={reference} locked={refLocked} />
      <Row label="Shade" value={shade} locked={shdLocked} />
      {anyEditable && (
        <div className="pt-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[11px]"
            onClick={() => setOpen(true)}
          >
            <Pencil className="h-3 w-3" /> Edit
          </Button>
        </div>
      )}

      <FabricEditDialog
        open={open}
        onOpenChange={setOpen}
        itemId={itemId}
        composition={composition}
        reference={reference}
        shade={shade}
        locks={{ composition: compLocked, reference: refLocked, shade: shdLocked }}
      />
    </div>
  );
}

function FabricEditDialog({
  open, onOpenChange, itemId,
  composition: initComp, reference: initRef, shade: initShd,
  locks,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  itemId: string;
  composition?: string;
  reference?: string;
  shade?: string;
  locks: { composition: boolean; reference: boolean; shade: boolean };
}) {
  const router = useRouter();
  const [comp, setComp] = useState(initComp ?? "");
  const [ref, setRef] = useState(initRef ?? "");
  const [shd, setShd] = useState(initShd ?? "");
  const [saving, startSave] = useTransition();

  function submit() {
    startSave(async () => {
      try {
        const res = await updateFabricDetails({
          itemId,
          composition: locks.composition ? undefined : comp.trim() || undefined,
          reference:   locks.reference   ? undefined : ref.trim()  || undefined,
          shade:       locks.shade       ? undefined : shd.trim()  || undefined,
        });
        if (res.changed === 0) {
          toast.info("No changes to save.");
        } else {
          toast.success("Fabric details saved. Locked from further edits.");
        }
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Save failed.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit fabric details</DialogTitle>
          <DialogDescription>
            Fill in any missing values below. Once saved, each field is locked and can&apos;t be edited again.
            Already-locked fields are shown for reference but can&apos;t be changed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="comp">Composition {locks.composition && <Lock className="inline h-3 w-3 text-muted-foreground" />}</Label>
            <Input
              id="comp"
              value={comp}
              onChange={(e) => setComp(e.target.value)}
              disabled={saving || locks.composition}
              placeholder="e.g. 95% Cotton 5% Spandex"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ref">Reference {locks.reference && <Lock className="inline h-3 w-3 text-muted-foreground" />}</Label>
            <Input
              id="ref"
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              disabled={saving || locks.reference}
              placeholder="e.g. FAB-2026-001"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="shade">Approved shade {locks.shade && <Lock className="inline h-3 w-3 text-muted-foreground" />}</Label>
            <Input
              id="shade"
              value={shd}
              onChange={(e) => setShd(e.target.value)}
              disabled={saving || locks.shade}
              placeholder="e.g. Pantone 19-4052 TCX"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : "Save (locks values)"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
