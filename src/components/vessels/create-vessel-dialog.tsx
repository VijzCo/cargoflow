"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Ship } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { createVessel } from "@/lib/utils/vessel-actions";

export function CreateVesselDialog({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [vesselId, setVesselId] = useState("");
  const [vesselName, setVesselName] = useState("");
  const [etd, setEtd] = useState("");
  const [eta, setEta] = useState("");
  const [destination, setDestination] = useState("");
  const [saving, startSave] = useTransition();

  function submit() {
    startSave(async () => {
      try {
        await createVessel({
          vesselId: vesselId.trim(),
          vesselName: vesselName.trim() || undefined,
          etd: etd || undefined,
          eta: eta || undefined,
          destination: destination.trim(),
        });
        toast.success(`Vessel ${vesselId} created.`);
        setVesselId(""); setVesselName(""); setEtd(""); setEta(""); setDestination("");
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to create vessel.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ship className="h-5 w-5" /> Create vessel
          </DialogTitle>
          <DialogDescription>
            Register a vessel to attach containers to.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="vid">Vessel ID *</Label>
              <Input id="vid" value={vesselId} onChange={(e) => setVesselId(e.target.value)} disabled={saving} placeholder="e.g. CG-2026-04" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vname">Vessel name</Label>
              <Input id="vname" value={vesselName} onChange={(e) => setVesselName(e.target.value)} disabled={saving} placeholder="e.g. MSC AURORA" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dest">Destination *</Label>
            <Input id="dest" value={destination} onChange={(e) => setDestination(e.target.value)} disabled={saving} placeholder="e.g. Maseru, Lesotho" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="etd">ETD</Label>
              <Input id="etd" type="date" value={etd} onChange={(e) => setEtd(e.target.value)} disabled={saving} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="eta">ETA</Label>
              <Input id="eta" type="date" value={eta} onChange={(e) => setEta(e.target.value)} disabled={saving} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !vesselId.trim() || !destination.trim()}>
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating...</> : "Create vessel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
