"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, Search, Trash2, Loader2, Calendar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PDFDownloadButton } from "@/components/packing-lists/pdf-download-button";
import { formatDate, formatNumber } from "@/lib/utils/format";
import { deletePackingList, type PackingListView } from "@/lib/utils/packing-list-actions";

export function PackingListsClient({
  lists, canDelete,
}: { lists: PackingListView[]; canDelete: boolean }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startDelete] = useTransition();

  const filtered = useMemo(() => {
    if (!search.trim()) return lists;
    const s = search.toLowerCase();
    return lists.filter((p) =>
      p.packingListNumber.toLowerCase().includes(s) ||
      p.vesselDisplayId.toLowerCase().includes(s) ||
      p.containerNumber.toLowerCase().includes(s) ||
      p.supplierName.toLowerCase().includes(s) ||
      p.destination.toLowerCase().includes(s),
    );
  }, [lists, search]);

  function handleDelete(id: string, label: string) {
    if (!confirm(`Delete packing list ${label}? You can re-generate it from the vessel page.`)) return;
    setBusyId(id);
    startDelete(async () => {
      try {
        await deletePackingList(id);
        toast.success("Packing list deleted.");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Delete failed.");
      } finally {
        setBusyId(null);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Packing lists</h1>
        <p className="mt-1 text-muted-foreground">
          {lists.length} packing list{lists.length === 1 ? "" : "s"} generated. Download as PDF anytime.
        </p>
      </div>

      <Card>
        <CardContent className="p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search PL number, vessel, container, supplier, destination..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              <FileText className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">No packing lists yet</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {lists.length === 0
                ? "Open a vessel that has sealed containers and click \"Generate packing lists\" to create them."
                : "No packing lists match your search."}
            </p>
            {lists.length === 0 && (
              <Button asChild className="mt-6">
                <Link href="/vessels">Go to vessels</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PL Number</TableHead>
                  <TableHead>Vessel</TableHead>
                  <TableHead>Container</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">CBM</TableHead>
                  <TableHead>Generated</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link href={`/packing-lists/${p.id}`} className="font-mono text-xs hover:underline">
                        {p.packingListNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{p.vesselDisplayId}</TableCell>
                    <TableCell className="font-mono text-xs">{p.containerNumber}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm">{p.supplierName}</TableCell>
                    <TableCell className="text-sm">{p.destination}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{p.itemIds.length}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{p.totalCbm.toFixed(2)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" /> {formatDate(p.generatedAt)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <PDFDownloadButton packingListId={p.id} size="sm" label="PDF" />
                        {canDelete && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(p.id, p.packingListNumber)}
                            disabled={busyId === p.id}
                          >
                            {busyId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
