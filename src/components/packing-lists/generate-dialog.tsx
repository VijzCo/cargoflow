"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Loader2, FileText, AlertCircle, CheckCircle2,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  previewPackingLists, generatePackingLists,
  type PackingListPreviewEntry,
} from "@/lib/utils/packing-list-actions";

export function GeneratePackingListsDialog({
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
  const [entries, setEntries] = useState<PackingListPreviewEntry[]>([]);
  const [working, startWork] = useTransition();
  const [regenerate, setRegenerate] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    previewPackingLists(vesselId)
      .then(setEntries)
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to preview."))
      .finally(() => setLoading(false));
  }, [open, vesselId]);

  const newCount = entries.filter((e) => !e.alreadyExists).length;
  const existingCount = entries.filter((e) => e.alreadyExists).length;

  function commit() {
    startWork(async () => {
      try {
        const res = await generatePackingLists({ vesselId, regenerate });
        const parts: string[] = [];
        if (res.created > 0) parts.push(`${res.created} created`);
        if (res.replaced > 0) parts.push(`${res.replaced} replaced`);
        if (res.skipped > 0) parts.push(`${res.skipped} skipped`);
        toast.success(parts.join(", ") || "Done.");
        onOpenChange(false);
        router.refresh();
        // Send user to the packing lists page
        router.push("/packing-lists");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Generation failed.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Generate packing lists
          </DialogTitle>
          <DialogDescription>
            One packing list is created for each (container, supplier) combination on vessel {vesselLabel}.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Computing what will be generated...
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-md border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            <AlertCircle className="mx-auto mb-2 h-5 w-5" />
            This vessel has no containers with items, so there's nothing to generate.
          </div>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-3">
              <Stat label="Total" value={String(entries.length)} />
              <Stat label="New" value={String(newCount)} tint="emerald" />
              <Stat label="Already exist" value={String(existingCount)} tint={existingCount > 0 ? "amber" : undefined} />
            </div>

            <div className="max-h-[300px] overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Container</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">Items</TableHead>
                    <TableHead className="text-right">CBM</TableHead>
                    <TableHead>PL Number</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((e, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{e.containerNumber}</TableCell>
                      <TableCell className="max-w-[180px] truncate text-sm">{e.supplierName}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{e.itemCount}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{e.totalCbm.toFixed(2)}</TableCell>
                      <TableCell className="font-mono text-xs">{e.expectedNumber}</TableCell>
                      <TableCell>
                        {e.alreadyExists ? (
                          <Badge variant="warning">Exists</Badge>
                        ) : (
                          <Badge variant="success" className="gap-1">
                            <CheckCircle2 className="h-3 w-3" /> New
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {existingCount > 0 && (
              <label className="flex items-center gap-2 rounded-md border bg-amber-50/40 px-3 py-2 text-sm dark:bg-amber-950/30">
                <input
                  type="checkbox"
                  checked={regenerate}
                  onChange={(e) => setRegenerate(e.target.checked)}
                  className="h-4 w-4"
                />
                <span>Replace existing packing lists with fresh data ({existingCount})</span>
              </label>
            )}
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={working}>Cancel</Button>
          <Button
            onClick={commit}
            disabled={working || entries.length === 0 || (!regenerate && newCount === 0)}
          >
            {working ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</> : `Generate ${regenerate ? entries.length : newCount}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, tint }: { label: string; value: string; tint?: "emerald" | "amber" }) {
  const cls =
    tint === "emerald" ? "text-emerald-600 dark:text-emerald-400" :
    tint === "amber" ? "text-amber-600 dark:text-amber-400" :
    "";
  return (
    <div className="rounded-md border p-3 text-center">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-bold ${cls}`}>{value}</div>
    </div>
  );
}
