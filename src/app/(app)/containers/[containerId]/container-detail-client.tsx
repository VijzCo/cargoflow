"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Container as ContainerIcon, Plus, Lock, Loader2, Ship, AlertTriangle, Trash2, Pencil,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ManualAllocateDialog } from "@/components/containers/manual-allocate-dialog";
import { RenameCarrierDialog } from "@/components/containers/rename-carrier-dialog";
import { sealContainer, removeFromContainer, type ContainerView, type AllocatableItem } from "@/lib/utils/container-actions";
import { formatNumber, formatDate, formatCBM, cn } from "@/lib/utils/format";

export function ContainerDetailClient({
  initialContainer,
  initialItems,
  canAssign,
  canSeal,
}: {
  initialContainer: ContainerView;
  initialItems: AllocatableItem[];
  canAssign: boolean;
  canSeal: boolean;
}) {
  const router = useRouter();
  const [allocateOpen, setAllocateOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [working, startTransition] = useTransition();

  const container = initialContainer;
  const items = initialItems;
  const hasCarrier = !!container.carrierNumber;
  const displayName = container.displayNumber;

  const pct = Math.min(100, Math.round(container.utilization * 100));
  const remaining = Math.max(0, container.usableCbm - container.loadedCbm);
  const barColor =
    pct >= 95 ? "bg-rose-500" :
    pct >= 80 ? "bg-emerald-500" :
    pct >= 50 ? "bg-cyan-500" :
    "bg-indigo-500";

  const statusVariant =
    container.status === "Open" ? "info" :
    container.status === "Sealed" ? "warning" :
    "secondary";

  const canAddItems = container.status === "Open" && canAssign;
  const canSealNow = container.status === "Open" && canSeal && items.length > 0;

  function handleSeal() {
    if (!confirm(`Seal container ${displayName}? You won't be able to add or remove items after this.`)) return;
    startTransition(async () => {
      try {
        await sealContainer(container.id);
        toast.success(`Container ${displayName} sealed.`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Seal failed.");
      }
    });
  }

  function handleRemove(itemId: string, label: string) {
    if (!confirm(`Remove "${label}" from this container? It will return to Completed status.`)) return;
    startTransition(async () => {
      try {
        await removeFromContainer(itemId);
        toast.success("Item removed.");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Remove failed.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <ContainerIcon className="h-6 w-6 text-muted-foreground" />
            <h1 className="font-mono text-2xl font-bold tracking-tight md:text-3xl">{displayName}</h1>
            <Badge variant="outline">{container.type}</Badge>
            <Badge variant={statusVariant}>{container.status}</Badge>
          </div>
          {hasCarrier && container.containerNumber !== container.carrierNumber && (
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              System ID: {container.containerNumber}
            </p>
          )}
          {!hasCarrier && (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
              No carrier container number yet — set it before sealing.
            </p>
          )}
          <p className="mt-1 text-muted-foreground">
            {items.length} item{items.length === 1 ? "" : "s"} from {container.supplierIds.length} supplier{container.supplierIds.length === 1 ? "" : "s"}
            {container.vesselId && <> · attached to a vessel</>}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {container.status === "Open" && canAssign && (
            <Button variant="outline" onClick={() => setRenameOpen(true)} disabled={working}>
              <Pencil className="h-4 w-4" /> {hasCarrier ? "Edit carrier #" : "Set carrier #"}
            </Button>
          )}
          {canAddItems && (
            <Button onClick={() => setAllocateOpen(true)} disabled={working}>
              <Plus className="h-4 w-4" /> Assign items
            </Button>
          )}
          {canSealNow && (
            <Button variant="outline" onClick={handleSeal} disabled={working}>
              {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
              Seal container
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">CBM utilization</p>
              <p className="mt-1 font-mono text-2xl font-bold">
                {container.loadedCbm.toFixed(2)}
                <span className="text-base font-normal text-muted-foreground"> / {container.usableCbm.toFixed(2)} CBM</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold">{pct}%</p>
              <p className="text-xs text-muted-foreground">{remaining.toFixed(2)} CBM free</p>
            </div>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full transition-all duration-500", barColor)}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Capacity: {container.capacityCbm} CBM nominal · {container.usableCbm.toFixed(2)} CBM usable</span>
            {pct >= 95 && (
              <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400">
                <AlertTriangle className="h-3 w-3" /> Near full
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              No items assigned yet.
              {canAddItems && (
                <div className="mt-4">
                  <Button onClick={() => setAllocateOpen(true)}>
                    <Plus className="h-4 w-4" /> Assign items
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Style</TableHead>
                  <TableHead>Color</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">CBM</TableHead>
                  <TableHead>Delivery</TableHead>
                  {container.status === "Open" && canAssign && <TableHead></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-xs font-mono">
                      <Link href={`/purchase-orders/${item.poId}`} className="hover:underline">{item.poNumber}</Link>
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate text-sm">{item.supplierName}</TableCell>
                    <TableCell className="max-w-[180px] truncate text-sm">{item.style}</TableCell>
                    <TableCell className="text-sm">{item.color}</TableCell>
                    <TableCell className="text-sm">{item.size}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatNumber(item.quantity)} <span className="text-xs text-muted-foreground">{item.unit}</span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{item.cbm.toFixed(2)}</TableCell>
                    <TableCell className="text-xs">{formatDate(item.deliveryDate)}</TableCell>
                    {container.status === "Open" && canAssign && (
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => handleRemove(item.id, `${item.style} / ${item.color} / ${item.size}`)}
                          disabled={working}
                          title="Remove from container"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {container.status === "Sealed" && !container.vesselId && (
        <div className="rounded-md border bg-amber-50/40 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          <Ship className="mr-2 inline h-4 w-4" />
          This container is sealed and ready. Attach it to a vessel from the <Link href="/vessels" className="font-medium underline">Vessels page</Link>.
        </div>
      )}

      <ManualAllocateDialog
        containerId={container.id}
        containerNumber={displayName}
        usableCbm={container.usableCbm}
        loadedCbm={container.loadedCbm}
        open={allocateOpen}
        onOpenChange={setAllocateOpen}
      />

      <RenameCarrierDialog
        containerId={container.id}
        currentCarrierNumber={container.carrierNumber}
        systemNumber={container.containerNumber}
        open={renameOpen}
        onOpenChange={setRenameOpen}
      />
    </div>
  );
}
