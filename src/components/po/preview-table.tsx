"use client";

import { useState, useEffect, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle, CheckCircle2, AlertCircle, Loader2, Save, ArrowLeft,
  UserPlus, Pencil, Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { SupplierForm } from "@/components/admin/supplier-form";
import type { ParseResult, POItem, Category } from "@/lib/poParser";
import {
  resolveSuppliers, savePO, type SupplierMatch, type POItemInput,
} from "@/lib/utils/upload-actions";

const CATEGORIES: Category[] = ["Fabric", "Trims", "Accessories", "Packaging", "Garments", "Others"];
const SALES_CHANNELS = ["Amazon", "Walmart", "Retail", "Wholesale", "Shopify", "TikTok Shop", "Other"];

interface EditableRow extends POItem {
  rowId: string;            // stable id for React keys
  supplierId?: string;
  supplierMatchStatus: "matched" | "unmatched" | "ambiguous" | "pending";
  candidates?: { id: string; name: string }[];
  deleted?: boolean;
}

export function PreviewTable({
  parseResult,
  filename,
  defaultSalesChannel,
  availableChannels,
}: {
  parseResult: ParseResult;
  filename: string;
  defaultSalesChannel?: string;
  availableChannels: string[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<EditableRow[]>(() =>
    parseResult.items.map((it, i) => ({
      ...it,
      rowId: `${i}-${it.uniqueKey}`,
      supplierMatchStatus: "pending",
      salesChannel: it.salesChannel ?? defaultSalesChannel,
    })),
  );
  const [supplierMatches, setSupplierMatches] = useState<Map<string, SupplierMatch>>(new Map());
  const [resolving, setResolving] = useState(true);
  const [saving, startSave] = useTransition();
  const [createSupplierFor, setCreateSupplierFor] = useState<string | null>(null);
  const [editingRow, setEditingRow] = useState<string | null>(null);

  // ---- Resolve suppliers when component mounts ----
  useEffect(() => {
    const names = Array.from(new Set(rows.map((r) => r.supplier).filter(Boolean)));
    if (names.length === 0) {
      setResolving(false);
      return;
    }
    resolveSuppliers(names)
      .then((matches) => {
        const map = new Map<string, SupplierMatch>();
        for (const m of matches) map.set(m.parsedName, m);
        setSupplierMatches(map);

        setRows((prev) =>
          prev.map((r) => {
            if (!r.supplier) {
              return { ...r, supplierMatchStatus: "unmatched" };
            }
            const m = map.get(r.supplier);
            if (m?.matchedId) {
              return {
                ...r,
                supplier: m.matchedName!,
                supplierId: m.matchedId,
                supplierMatchStatus: "matched",
              };
            }
            return {
              ...r,
              supplierMatchStatus: m?.candidates?.length ? "ambiguous" : "unmatched",
              candidates: m?.candidates,
            };
          }),
        );
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to look up suppliers.");
      })
      .finally(() => setResolving(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Derived state ----
  const activeRows = useMemo(() => rows.filter((r) => !r.deleted), [rows]);
  const hasAnyFabricColumn = useMemo(
    () => activeRows.some((r) => r.category === "Fabric" || r.composition || r.reference || r.shade),
    [activeRows],
  );

  const errorList = useMemo(() => {
    const errs: { row: number; field: string; message: string }[] = [...parseResult.errors];
    for (const r of activeRows) {
      if (!r.supplier) errs.push({ row: r.rawRowIndex, field: "Supplier", message: "Missing supplier name." });
      if (!r.supplierId) errs.push({ row: r.rawRowIndex, field: "Supplier", message: `Supplier "${r.supplier}" not found in system.` });
      if (!r.style) errs.push({ row: r.rawRowIndex, field: "Style", message: "Missing style." });
      if (!r.color) errs.push({ row: r.rawRowIndex, field: "Color", message: "Missing color." });
      if (!r.size) errs.push({ row: r.rawRowIndex, field: "Size", message: "Missing size." });
      if (!r.quantity || r.quantity <= 0) errs.push({ row: r.rawRowIndex, field: "Quantity", message: "Quantity must be > 0." });
      if (!r.poNumbers.length) errs.push({ row: r.rawRowIndex, field: "PO Number", message: "Missing PO number." });
    }
    return errs;
  }, [parseResult.errors, activeRows]);

  const canSave = errorList.length === 0 && activeRows.length > 0 && !resolving;

  // ---- Row mutations ----
  function updateRow(rowId: string, patch: Partial<EditableRow>) {
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));
  }

  function deleteRow(rowId: string) {
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, deleted: true } : r)));
  }

  function applySupplierToAllMatching(parsedName: string, supplierId: string, supplierName: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.supplier === parsedName || (r.supplierMatchStatus !== "matched" && !r.supplier)
          ? { ...r, supplier: supplierName, supplierId, supplierMatchStatus: "matched", candidates: undefined }
          : r,
      ),
    );
  }

  function onSupplierCreated(parsedName: string, created: { id: string; name: string }) {
    setCreateSupplierFor(null);
    applySupplierToAllMatching(parsedName, created.id, created.name);
    toast.success(`Applied "${created.name}" to all matching rows.`);
  }

  // ---- Save ----
  function handleSave() {
    startSave(async () => {
      try {
        const items: POItemInput[] = activeRows.map((r) => ({
          supplierName: r.supplier,
          supplierId: r.supplierId,
          poNumbers: r.poNumbers,
          orderNo: r.orderNo,
          style: r.style,
          color: r.color,
          size: r.size,
          quantity: r.quantity,
          unit: r.unit,
          unitPrice: r.unitPrice,
          category: r.category,
          description: r.description,
          deliveryDate: r.deliveryDate,
          salesChannel: r.salesChannel,
          remarks: r.remarks,
          // Forward fabric fields verbatim — savePO sets initial lock flags.
          composition: r.composition,
          reference: r.reference,
          shade: r.shade,
          uniqueKey: r.uniqueKey,
        }));

        const result = await savePO({ items });
        toast.success(`Saved ${result.itemCount} items across ${result.poIds.length} PO(s).`);
        router.push("/purchase-orders");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Save failed.");
      }
    });
  }

  // ---- Render ----
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Button variant="ghost" size="sm" onClick={() => router.back()} className="-ml-2 mb-2">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Preview & confirm</h1>
          <p className="mt-1 text-muted-foreground">
            <span className="font-mono text-xs">{filename}</span> · {parseResult.layout} layout · {activeRows.length} item{activeRows.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.back()} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave || saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" /> Save {activeRows.length} item{activeRows.length === 1 ? "" : "s"}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Status banner */}
      <Card>
        <CardContent className="p-4">
          {resolving ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Looking up suppliers...
            </div>
          ) : canSave ? (
            <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
              All items validated. Ready to save.
            </div>
          ) : (
            <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">{errorList.length} issue{errorList.length === 1 ? "" : "s"} need{errorList.length === 1 ? "s" : ""} fixing before save.</p>
                <p className="mt-1 text-xs">Fix the highlighted rows below or delete them.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {parseResult.warnings.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="h-4 w-4 text-amber-500" /> Parser warnings ({parseResult.warnings.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="space-y-1 text-xs text-muted-foreground">
              {parseResult.warnings.slice(0, 6).map((w, i) => (
                <li key={i}>• {w}</li>
              ))}
              {parseResult.warnings.length > 6 && (
                <li className="italic">... +{parseResult.warnings.length - 6} more</li>
              )}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Items table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead>PO</TableHead>
                <TableHead>Style</TableHead>
                <TableHead>Color</TableHead>
                <TableHead>Size</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Category</TableHead>
                {hasAnyFabricColumn && <TableHead>Fabric</TableHead>}
                <TableHead>Delivery</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeRows.map((r) => {
                const hasIssue =
                  !r.supplierId ||
                  !r.style || !r.color || !r.size ||
                  !r.quantity || r.quantity <= 0 ||
                  r.poNumbers.length === 0;
                const isEditing = editingRow === r.rowId;
                return (
                  <TableRow key={r.rowId} className={hasIssue ? "bg-amber-50/40 dark:bg-amber-950/20" : undefined}>
                    <TableCell className="max-w-[200px]">
                      {r.supplierId ? (
                        <div>
                          <div className="text-sm font-medium">{r.supplier}</div>
                          <Badge variant="success" className="mt-1">Matched</Badge>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="text-sm">{r.supplier || <span className="italic text-muted-foreground">(missing)</span>}</div>
                          {r.candidates && r.candidates.length > 0 ? (
                            <div className="space-y-1">
                              <Badge variant="warning">Multiple matches</Badge>
                              <div className="space-y-1">
                                {r.candidates.map((c) => (
                                  <Button
                                    key={c.id}
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs"
                                    onClick={() => applySupplierToAllMatching(r.supplier, c.id, c.name)}
                                  >
                                    Use "{c.name}"
                                  </Button>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <Badge variant="destructive">Not found</Badge>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 w-full text-xs"
                            onClick={() => setCreateSupplierFor(r.supplier)}
                          >
                            <UserPlus className="h-3 w-3" />
                            Create supplier
                          </Button>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {r.poNumbers.slice(0, 2).join(", ")}
                      {r.poNumbers.length > 2 && (
                        <span className="text-muted-foreground"> +{r.poNumbers.length - 2}</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[180px]">
                      {isEditing ? (
                        <Input
                          value={r.style}
                          onChange={(e) => updateRow(r.rowId, { style: e.target.value })}
                          className="h-8 text-sm"
                        />
                      ) : (
                        <div className="truncate text-sm">{r.style}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          value={r.color}
                          onChange={(e) => updateRow(r.rowId, { color: e.target.value })}
                          className="h-8 w-32 text-sm"
                        />
                      ) : (
                        <span className="text-sm">{r.color}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          value={r.size}
                          onChange={(e) => updateRow(r.rowId, { size: e.target.value })}
                          className="h-8 w-28 text-sm"
                        />
                      ) : (
                        <span className="text-sm">{r.size}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isEditing ? (
                        <Input
                          type="number"
                          value={r.quantity}
                          onChange={(e) => updateRow(r.rowId, { quantity: Number(e.target.value) })}
                          className="h-8 w-24 text-right text-sm"
                        />
                      ) : (
                        <span className="font-mono text-sm">{r.quantity.toLocaleString()}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{r.unit}</TableCell>
                    <TableCell>
                      <Select value={r.category} onValueChange={(v) => updateRow(r.rowId, { category: v as Category })}>
                        <SelectTrigger className="h-8 w-32 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map((c) => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    {hasAnyFabricColumn && (
                      <TableCell className="max-w-[200px] text-xs">
                        {r.category === "Fabric" ? (
                          isEditing ? (
                            <div className="space-y-1">
                              <Input
                                value={r.composition ?? ""}
                                onChange={(e) => updateRow(r.rowId, { composition: e.target.value || undefined })}
                                placeholder="Composition"
                                className="h-7 text-xs"
                              />
                              <Input
                                value={r.reference ?? ""}
                                onChange={(e) => updateRow(r.rowId, { reference: e.target.value || undefined })}
                                placeholder="Reference"
                                className="h-7 text-xs"
                              />
                              <Input
                                value={r.shade ?? ""}
                                onChange={(e) => updateRow(r.rowId, { shade: e.target.value || undefined })}
                                placeholder="Approved shade"
                                className="h-7 text-xs"
                              />
                            </div>
                          ) : (
                            <div className="space-y-0.5 leading-tight">
                              {r.composition && (
                                <div className="truncate"><span className="text-muted-foreground">Comp:</span> {r.composition}</div>
                              )}
                              {r.reference && (
                                <div className="truncate"><span className="text-muted-foreground">Ref:</span> {r.reference}</div>
                              )}
                              {r.shade && (
                                <div className="truncate"><span className="text-muted-foreground">Shade:</span> {r.shade}</div>
                              )}
                              {!r.composition && !r.reference && !r.shade && (
                                <span className="italic text-muted-foreground">not set</span>
                              )}
                            </div>
                          )
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      {isEditing ? (
                        <Input
                          type="date"
                          value={r.deliveryDate || ""}
                          onChange={(e) => updateRow(r.rowId, { deliveryDate: e.target.value || undefined })}
                          className="h-8 text-sm"
                        />
                      ) : (
                        <span className="text-xs">{r.deliveryDate || "—"}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={r.salesChannel || ""}
                        onValueChange={(v) => updateRow(r.rowId, { salesChannel: v })}
                      >
                        <SelectTrigger className="h-8 w-32 text-xs">
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          {(availableChannels.length ? availableChannels : SALES_CHANNELS).map((c) => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => setEditingRow(isEditing ? null : r.rowId)}
                          title={isEditing ? "Done" : "Edit"}
                        >
                          {isEditing ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => deleteRow(r.rowId)}
                          title="Delete row"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create supplier modal */}
      <Dialog open={createSupplierFor !== null} onOpenChange={(o) => !o && setCreateSupplierFor(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add supplier</DialogTitle>
            <DialogDescription>
              Adding a new supplier will apply it to all rows with this name in the current upload.
            </DialogDescription>
          </DialogHeader>
          {createSupplierFor !== null && (
            <SupplierForm
              initialName={createSupplierFor}
              onCreated={(s) => onSupplierCreated(createSupplierFor, s)}
              onCancel={() => setCreateSupplierFor(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
