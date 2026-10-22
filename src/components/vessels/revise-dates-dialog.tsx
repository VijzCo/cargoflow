"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, CalendarClock, AlertTriangle } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { reviseVesselDates } from "@/lib/utils/vessel-dates-actions";
import type { VesselStatus } from "@/types";

type Allowed = { etd: boolean; eta: boolean };

function allowed(status: VesselStatus): Allowed {
  switch (status) {
    case "Planned":
    case "Loading":   return { etd: true,  eta: true  };
    case "Sailed":    return { etd: false, eta: true  };
    case "Delivered": return { etd: false, eta: false };
    default:          return { etd: false, eta: false };
  }
}

export function ReviseDatesDialog({
  open, onOpenChange, vessel,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  vessel: {
    id: string;
    vesselId: string;
    vesselName?: string;
    status: VesselStatus;
    etd?: string;
    eta?: string;
  };
}) {
  const router = useRouter();
  const perms = allowed(vessel.status);
  const [etd, setEtd] = useState(vessel.etd ?? "");
  const [eta, setEta] = useState(vessel.eta ?? "");
  const [reason, setReason] = useState("");
  const [saving, startSave] = useTransition();

  useEffect(() => {
    if (open) {
      setEtd(vessel.etd ?? "");
      setEta(vessel.eta ?? "");
      setReason("");
    }
  }, [open, vessel.etd, vessel.eta]);

  const etdChanged = perms.etd && (etd || "") !== (vessel.etd ?? "");
  const etaChanged = perms.eta && (eta || "") !== (vessel.eta ?? "");
  const anyChange = etdChanged || etaChanged;
  const invalidOrder = etd && eta && eta < etd;

  function submit() {
    if (!anyChange) {
      toast.info("No changes to apply.");
      return;
    }
    if (invalidOrder) {
      toast.error("ETA cannot be earlier than ETD.");
      return;
    }
    const payload: { vesselId: string; etd?: string | null; eta?: string | null; reason?: string } = {
      vesselId: vessel.id,
    };
    if (etdChanged) payload.etd = etd || null;
    if (etaChanged) payload.eta = eta || null;
    if (reason.trim()) payload.reason = reason.trim();

    startSave(async () => {
      try {
        await reviseVesselDates(payload);
        toast.success("Dates revised.");
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to revise dates.");
      }
    });
  }

  const bothLocked = !perms.etd && !perms.eta;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5" />
            Revise ETD / ETA
          </DialogTitle>
          <DialogDescription>
            {vessel.vesselId}{vessel.vesselName ? ` — ${vessel.vesselName}` : ""} · status {vessel.status}
          </DialogDescription>
        </DialogHeader>

        {bothLocked && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs dark:border-amber-800 dark:bg-amber-950/40">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-amber-900 dark:text-amber-200">
              This vessel is <strong>{vessel.status}</strong>. ETD and ETA can no longer be revised.
            </p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="rv-etd">ETD</Label>
            <Input
              id="rv-etd"
              type="date"
              value={etd}
              onChange={(e) => setEtd(e.target.value)}
              disabled={!perms.etd || saving}
            />
            {!perms.etd && (
              <p className="text-[11px] text-muted-foreground">Locked — vessel has already sailed.</p>
            )}
            {perms.etd && vessel.etd && (
              <p className="text-[11px] text-muted-foreground">Current: {vessel.etd}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rv-eta">ETA</Label>
            <Input
              id="rv-eta"
              type="date"
              value={eta}
              onChange={(e) => setEta(e.target.value)}
              disabled={!perms.eta || saving}
            />
            {!perms.eta && (
              <p className="text-[11px] text-muted-foreground">Locked — vessel is delivered.</p>
            )}
            {perms.eta && vessel.eta && (
              <p className="text-[11px] text-muted-foreground">Current: {vessel.eta}</p>
            )}
          </div>
        </div>

        {invalidOrder && (
          <p className="text-xs text-destructive">ETA cannot be earlier than ETD.</p>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="rv-reason">Reason (optional)</Label>
          <Input
            id="rv-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Weather delay, port congestion, customer request"
            disabled={saving || bothLocked}
            maxLength={500}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || bothLocked || !anyChange || !!invalidOrder}>
            {saving ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
            ) : (
              <><CalendarClock className="h-4 w-4" /> Save revision</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
