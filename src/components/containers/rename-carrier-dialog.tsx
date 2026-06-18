"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Pencil } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { renameCarrierNumber } from "@/lib/utils/container-actions";

interface Props {
  containerId: string;
  systemNumber: string;
  currentCarrierNumber?: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function RenameCarrierDialog({
  containerId, systemNumber, currentCarrierNumber, open, onOpenChange,
}: Props) {
  const router = useRouter();
  const [value, setValue] = useState(currentCarrierNumber ?? "");
  const [saving, startSave] = useTransition();

  // Sync state when dialog re-opens with different container
  useEffect(() => {
    if (open) setValue(currentCarrierNumber ?? "");
  }, [open, currentCarrierNumber]);

  function submit() {
    const trimmed = value.trim();
    if (trimmed.length < 2) {
      toast.error("Enter a valid carrier container number.");
      return;
    }
    startSave(async () => {
      try {
        await renameCarrierNumber({ containerId, carrierNumber: trimmed });
        toast.success(`Carrier number set to ${trimmed.toUpperCase()}.`);
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Rename failed.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5" /> {currentCarrierNumber ? "Edit carrier container number" : "Set carrier container number"}
          </DialogTitle>
          <DialogDescription>
            The carrier-issued container ID (e.g. MSCU1234567). This becomes the
            display name everywhere. The internal system ID (<span className="font-mono">{systemNumber}</span>) stays the same.
            Once the container is sealed, this can no longer be changed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="carrier">Carrier container number *</Label>
          <Input
            id="carrier"
            value={value}
            onChange={(e) => setValue(e.target.value.toUpperCase())}
            disabled={saving}
            placeholder="e.g. MSCU1234567"
            maxLength={40}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            Must be unique. Letters and numbers only is typical.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !value.trim()}>
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
