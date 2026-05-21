"use client";

import { useState, useEffect, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Search, AlertTriangle } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listAllocatableItems, manualAssign, type AllocatableItem } from "@/lib/utils/container-actions";
import { formatNumber, formatDate, formatCBM, cn } from "@/lib/utils/format";

export function ManualAllocateDialog({
  containerId,
  containerNumber,
  usableCbm,
  loadedCbm,
  open,
  onOpenChange,
}: {
  containerId: string;
  containerNumber: string;
  usableCbm: number;
  loadedCbm: number;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const [items, setItems] = useState<AllocatableItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, startSave] = useTransition();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSelected(new Set());
    listAllocatableItems({})
      .then(setItems)
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load items."))
      .finally(() => setLoading(false));
  }, [open]);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const s = search.toLowerCase();
    return items.filter((i) =>
      i.style.toLowerCase().includes(s) ||
      i.color.toLowerCase().includes(s) ||
      i.poNumber.toLowerCase().includes(s) ||
      i.supplierName.toLowerCase().includes(s),
    );
  }, [items, search]);

  const selectedItems = useMemo(() => items.filter((i) => selected.has(i.id)), [items, selected]);
  const selectedCbm = selectedItems.reduce((s, i) => s + i.cbm, 0);
  const remaining = usableCbm - loadedCbm - selectedCbm;
  const wouldOverflow = remaining < 0;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit() {
    if (selected.size === 0) {
      toast.info("Select at least one item.");
      return;
    }
    if (wouldOverflow) {
      toast.error("Selection exceeds container capacity. Deselect some items.");
      return;
    }
    startSave(async () => {
      try {
        const res = await manualAssign({ containerId, itemIds: Array.from(selected) });
        toast.success(`Assigned ${res.assigned} item${res.assigned === 1 ? "" : "s"} to ${containerNumber}.`);
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Assignment failed.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Assign items to {containerNumber}</DialogTitle>
          <DialogDescription>
            Pick Completed items with CBM declared. Items move to <strong>Loaded</strong> status when assigned.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 sm:grid-cols-3">
          <Stat label="Current load" value={formatCBM(loadedCbm)} />
          <Stat
            label="Selected CBM"
            value={formatCBM(selectedCbm)}
            tint={selectedCbm > 0 ? "indigo" : undefined}
          />
          <Stat
            label="After assign"
            value={formatCBM(loadedCbm + selectedCbm)}
            tint={wouldOverflow ? "rose" : remaining < 1 ? "amber" : "emerald"}
            subtitle={wouldOverflow ? `Over by ${(-remaining).toFixed(2)}` : `${remaining.toFixed(2)} free`}
          />
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search style, color, PO, supplier..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            disabled={loading || saving}
          />
        </div>

        <div className="max-h-[400px] overflow-auto rounded-md border">
          {loading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading items...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {items.length === 0
                ? "No Completed items with CBM declared. Mark items as Completed and add CBM on the Production page first."
                : "No items match your search."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>PO</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Style</TableHead>
                  <TableHead>Color</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">CBM</TableHead>
                  <TableHead>Delivery</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((item) => {
                  const checked = selected.has(item.id);
                  return (
                    <TableRow
                      key={item.id}
                      onClick={() => toggle(item.id)}
                      className={cn("cursor-pointer", checked && "bg-primary/10")}
                    >
                      <TableCell><input type="checkbox" readOnly checked={checked} className="h-4 w-4" /></TableCell>
                      <TableCell className="text-xs font-mono">{item.poNumber}</TableCell>
                      <TableCell className="max-w-[140px] truncate text-sm">{item.supplierName}</TableCell>
                      <TableCell className="max-w-[140px] truncate text-sm">{item.style}</TableCell>
                      <TableCell className="text-sm">{item.color}</TableCell>
                      <TableCell className="text-sm">{item.size}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatNumber(item.quantity)} <span className="text-xs text-muted-foreground">{item.unit}</span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{item.cbm.toFixed(2)}</TableCell>
                      <TableCell className="text-xs">{formatDate(item.deliveryDate)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        {wouldOverflow && (
          <div className="flex items-center gap-2 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300">
            <AlertTriangle className="h-4 w-4" />
            Selection exceeds capacity by {(-remaining).toFixed(2)} CBM. Deselect items.
          </div>
        )}

        <DialogFooter>
          <div className="mr-auto text-sm text-muted-foreground">
            {selected.size} of {filtered.length} item{filtered.length === 1 ? "" : "s"} selected
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || selected.size === 0 || wouldOverflow}>
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Assigning...</> : `Assign ${selected.size} item${selected.size === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, subtitle, tint }: { label: string; value: string; subtitle?: string; tint?: "indigo" | "rose" | "amber" | "emerald" }) {
  const tintClass =
    tint === "rose" ? "text-rose-600 dark:text-rose-400" :
    tint === "amber" ? "text-amber-600 dark:text-amber-400" :
    tint === "emerald" ? "text-emerald-600 dark:text-emerald-400" :
    tint === "indigo" ? "text-indigo-600 dark:text-indigo-400" :
    "";
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-1 font-mono text-base font-semibold", tintClass)}>{value}</div>
      {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
    </div>
  );
}
