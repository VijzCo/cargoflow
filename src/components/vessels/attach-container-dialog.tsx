"use client";

import { useState, useEffect, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Container as ContainerIcon, Lock } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listAttachableContainers, attachContainerToVessel } from "@/lib/utils/vessel-actions";
import { cn } from "@/lib/utils/format";

export function AttachContainerDialog({
  vesselId,
  vesselLabel,
  open,
  onOpenChange,
}: {
  vesselId: string;
  vesselLabel: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [containers, setContainers] = useState<{
    id: string; containerNumber: string; carrierNumber?: string; type: string;
    loadedCbm: number; usableCbm: number; status: "Open" | "Sealed";
  }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [working, startWork] = useTransition();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSelected(new Set());
    listAttachableContainers()
      .then((rows) => setContainers(rows as typeof containers))
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load."))
      .finally(() => setLoading(false));
  }, [open]);

  const totalCbm = useMemo(
    () => containers.filter((c) => selected.has(c.id)).reduce((s, c) => s + c.loadedCbm, 0),
    [containers, selected],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function attach() {
    if (selected.size === 0) {
      toast.info("Select at least one container.");
      return;
    }
    startWork(async () => {
      let ok = 0;
      let failed = 0;
      for (const id of selected) {
        try {
          await attachContainerToVessel({ vesselId, containerId: id });
          ok++;
        } catch (err) {
          failed++;
          console.error(err);
        }
      }
      if (ok > 0) toast.success(`Attached ${ok} container${ok === 1 ? "" : "s"}.`);
      if (failed > 0) toast.error(`${failed} attachment${failed === 1 ? "" : "s"} failed.`);
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Attach containers to {vesselLabel}</DialogTitle>
          <DialogDescription>
            Only unassigned Open or Sealed containers are shown. Sealed containers are ready to ship.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[400px] overflow-auto rounded-md border">
          {loading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading containers...
            </div>
          ) : containers.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No unassigned containers found. Create or load containers first.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Container</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Load</TableHead>
                  <TableHead className="text-right">Capacity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {containers.map((c) => {
                  const checked = selected.has(c.id);
                  return (
                    <TableRow key={c.id} onClick={() => toggle(c.id)} className={cn("cursor-pointer", checked && "bg-primary/10")}>
                      <TableCell><input type="checkbox" readOnly checked={checked} className="h-4 w-4" /></TableCell>
                      <TableCell className="font-mono text-sm">
                        <div className="flex items-center gap-2">
                          <ContainerIcon className="h-3.5 w-3.5 text-muted-foreground" />
                          {c.carrierNumber || c.containerNumber}
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="outline">{c.type}</Badge></TableCell>
                      <TableCell>
                        <Badge variant={c.status === "Sealed" ? "warning" : "info"} className="gap-1">
                          {c.status === "Sealed" && <Lock className="h-3 w-3" />}
                          {c.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{c.loadedCbm.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{c.usableCbm.toFixed(2)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        <DialogFooter>
          <div className="mr-auto text-sm text-muted-foreground">
            {selected.size} selected · {totalCbm.toFixed(2)} CBM
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={working}>Cancel</Button>
          <Button onClick={attach} disabled={working || selected.size === 0}>
            {working ? <><Loader2 className="h-4 w-4 animate-spin" /> Attaching...</> : `Attach ${selected.size}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
