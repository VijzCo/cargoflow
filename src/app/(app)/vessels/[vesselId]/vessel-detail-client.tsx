"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Ship, Plus, Send, Loader2, MapPin, Calendar, Container as ContainerIcon, Lock, X, FileText,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AttachContainerDialog } from "@/components/vessels/attach-container-dialog";
import { GeneratePackingListsDialog } from "@/components/packing-lists/generate-dialog";
import { dispatchVessel, detachContainerFromVessel, type VesselView } from "@/lib/utils/vessel-actions";
import { formatDate } from "@/lib/utils/format";

interface ContainerLite {
  id: string; containerNumber: string; type: string;
  loadedCbm: number; usableCbm: number; status: string;
}

export function VesselDetailClient({
  vessel, containers, canManage, canDispatch,
}: {
  vessel: VesselView;
  containers: ContainerLite[];
  canManage: boolean;
  canDispatch: boolean;
}) {
  const router = useRouter();
  const [attachOpen, setAttachOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [working, startTransition] = useTransition();

  const statusVariant = (s: VesselView["status"]) =>
    s === "Planned" ? "secondary" :
    s === "Loading" ? "info" :
    s === "Sailed" ? "warning" :
    "success";

  const totalCbm = containers.reduce((s, c) => s + c.loadedCbm, 0);
  const allSealed = containers.length > 0 && containers.every((c) => c.status === "Sealed" || c.status === "Shipped");
  const canDispatchNow = canDispatch &&
    (vessel.status === "Planned" || vessel.status === "Loading") &&
    containers.length > 0 &&
    allSealed;

  function detach(containerId: string, label: string) {
    if (!confirm(`Detach container ${label} from this vessel?`)) return;
    startTransition(async () => {
      try {
        await detachContainerFromVessel({ vesselId: vessel.id, containerId });
        toast.success("Detached.");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Detach failed.");
      }
    });
  }

  function dispatch() {
    if (!confirm(`Dispatch vessel ${vessel.vesselId}? All containers will be marked Shipped and all items will move to Shipped status. This cannot be undone.`)) return;
    startTransition(async () => {
      try {
        const res = await dispatchVessel(vessel.id);
        toast.success(`Vessel dispatched. ${res.containers} containers, ${res.items} items shipped.`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Dispatch failed.");
      }
    });
  }

  const canAttach = canManage && vessel.status !== "Sailed" && vessel.status !== "Delivered";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Ship className="h-6 w-6 text-muted-foreground" />
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{vessel.vesselId}</h1>
            <Badge variant={statusVariant(vessel.status)}>{vessel.status}</Badge>
          </div>
          {vessel.vesselName && <p className="mt-1 text-muted-foreground">{vessel.vesselName}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {canAttach && (
            <Button variant="outline" onClick={() => setAttachOpen(true)} disabled={working}>
              <Plus className="h-4 w-4" /> Attach containers
            </Button>
          )}
          {containers.length > 0 && (
            <Button variant="outline" onClick={() => setGenerateOpen(true)} disabled={working}>
              <FileText className="h-4 w-4" /> Generate packing lists
            </Button>
          )}
          {canDispatchNow && (
            <Button onClick={dispatch} disabled={working}>
              {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Dispatch vessel
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={MapPin} label="Destination" value={vessel.destination} />
        <Stat icon={Calendar} label="ETD" value={formatDate(vessel.etd)} />
        <Stat icon={Calendar} label="ETA" value={formatDate(vessel.eta)} />
        <Stat icon={ContainerIcon} label="Total CBM" value={`${totalCbm.toFixed(2)} CBM`} />
      </div>

      {!allSealed && containers.length > 0 && vessel.status !== "Sailed" && (
        <div className="rounded-md border bg-amber-50/40 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          <Lock className="mr-2 inline h-4 w-4" />
          Vessel can be dispatched only when all attached containers are sealed.
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {containers.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              No containers attached.
              {canAttach && (
                <div className="mt-4">
                  <Button onClick={() => setAttachOpen(true)}>
                    <Plus className="h-4 w-4" /> Attach containers
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Container</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Load</TableHead>
                  <TableHead className="text-right">Capacity</TableHead>
                  <TableHead className="text-right">Utilization</TableHead>
                  {canAttach && <TableHead></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {containers.map((c) => {
                  const pct = c.usableCbm > 0 ? (c.loadedCbm / c.usableCbm) * 100 : 0;
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Link href={`/containers/${c.id}`} className="font-mono text-sm hover:underline">
                          {c.containerNumber}
                        </Link>
                      </TableCell>
                      <TableCell><Badge variant="outline">{c.type}</Badge></TableCell>
                      <TableCell>
                        <Badge variant={c.status === "Sealed" ? "warning" : c.status === "Shipped" ? "secondary" : "info"}>
                          {c.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{c.loadedCbm.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{c.usableCbm.toFixed(2)}</TableCell>
                      <TableCell className="text-right text-sm">{pct.toFixed(0)}%</TableCell>
                      {canAttach && (
                        <TableCell>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => detach(c.id, c.containerNumber)}
                            disabled={working}
                            title="Detach"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AttachContainerDialog
        vesselId={vessel.id}
        vesselLabel={vessel.vesselId}
        open={attachOpen}
        onOpenChange={setAttachOpen}
      />

      <GeneratePackingListsDialog
        vesselId={vessel.id}
        vesselLabel={vessel.vesselId}
        open={generateOpen}
        onOpenChange={setGenerateOpen}
      />
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-1 truncate text-sm font-semibold">{value}</p>
          </div>
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}
