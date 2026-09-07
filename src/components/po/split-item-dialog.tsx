"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Split, Send, Plus, Trash2, AlertTriangle } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { submitSplitRequest, splitItemDirect } from "@/lib/utils/split-actions";
import {
  MIN_SPLIT_CHILDREN, MAX_SPLIT_CHILDREN, SPLIT_REASON_CATEGORIES,
} from "@/lib/utils/split-request-types";
import type { SplitReasonCategory } from "@/types";

type Mode = "direct" | "request";

interface Props {
  /** "direct" = apply immediately (super_admin / merchant_manager).
   *  "request" = submit for approval (merchant).  */
  mode: Mode;
  open: boolean;
  onOpenChange: (o: boolean) => void;

  item: {
    id: string;
    poId: string;
    style: string;
    color: string;
    size: string;
    quantity: number;
    unit: string;
    deliveryDate?: string;
    status: string;
  };
}

interface ChildRow {
  key: string;                    // stable react key
  quantity: string;               // string for the input
  deliveryDate: string;           // yyyy-mm-dd or ""
  label: string;                  // optional short label
}

function makeChild(): ChildRow {
  return {
    key: Math.random().toString(36).slice(2),
    quantity: "",
    deliveryDate: "",
    label: "",
  };
}

// Human-readable labels for reason categories.
// These would ideally be i18n keys read at render time; keeping short strings
// here so the dialog is self-contained. Add to messages/*.json if you localize.
const REASON_LABELS: Record<SplitReasonCategory, string> = {
  supplier_capacity:    "Supplier capacity limit",
  customer_early_lot:   "Customer needs early lot",
  logistics_constraint: "Logistics / shipping constraint",
  other:                "Other (specify below)",
};

export function SplitItemDialog({ mode, open, onOpenChange, item }: Props) {
  const router = useRouter();
  const [children, setChildren] = useState<ChildRow[]>([makeChild(), makeChild()]);
  const [reasonCategory, setReasonCategory] = useState<SplitReasonCategory>("supplier_capacity");
  const [reasonText, setReasonText] = useState("");
  const [saving, startSave] = useTransition();

  // Reset state when dialog re-opens
  useEffect(() => {
    if (!open) return;
    setChildren([makeChild(), makeChild()]);
    setReasonCategory("supplier_capacity");
    setReasonText("");
  }, [open]);

  const parentQty = item.quantity;
  const runningTotal = children.reduce((sum, c) => sum + (Number(c.quantity) || 0), 0);
  const delta = runningTotal - parentQty;
  const matches = Math.abs(delta) < 0.001 && runningTotal > 0;

  function addChild() {
    if (children.length >= MAX_SPLIT_CHILDREN) return;
    setChildren((prev) => [...prev, makeChild()]);
  }

  function removeChild(key: string) {
    if (children.length <= MIN_SPLIT_CHILDREN) return;
    setChildren((prev) => prev.filter((c) => c.key !== key));
  }

  function updateChild(key: string, patch: Partial<ChildRow>) {
    setChildren((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  }

  function submit() {
    // Validate before hitting the server
    if (!matches) {
      toast.error(`Quantities must sum to ${parentQty}. Currently ${runningTotal}.`);
      return;
    }
    if (children.some((c) => !c.quantity || Number(c.quantity) <= 0)) {
      toast.error("Every split must have a positive quantity.");
      return;
    }
    if (reasonCategory === "other" && !reasonText.trim()) {
      toast.error("Please describe the reason when choosing Other.");
      return;
    }

    const plan = {
      children: children.map((c) => ({
        quantity: Number(c.quantity),
        deliveryDate: c.deliveryDate.trim() || undefined,
        label: c.label.trim() || undefined,
      })),
      reasonCategory,
      reasonText: reasonText.trim() || undefined,
    };

    startSave(async () => {
      try {
        if (mode === "direct") {
          const res = await splitItemDirect({ itemId: item.id, plan });
          toast.success(`Split into ${res.childIds.length} items.`);
        } else {
          await submitSplitRequest({ itemId: item.id, plan });
          toast.success("Split request submitted for approval.");
        }
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed.");
      }
    });
  }

  const itemLabel = `${item.style} — ${item.color} (${item.size})`;
  const statusRisky =
    item.status !== "Pending" && item.status !== "Started" && item.status !== "In Progress" && item.status !== "Completed";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Split className="h-5 w-5" />
            {mode === "direct" ? "Split item" : "Request item split"}
          </DialogTitle>
          <DialogDescription>
            {mode === "direct"
              ? "Split this item into partial shipments. Applies immediately."
              : "Propose a partial-shipment split. A merchandising manager or super admin must approve before it takes effect."}
          </DialogDescription>
        </DialogHeader>

        {/* Parent context */}
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Original item</div>
          <div className="mt-1 font-medium">{itemLabel}</div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>Qty: <span className="font-mono font-semibold text-foreground">{parentQty.toLocaleString()} {item.unit}</span></span>
            {item.deliveryDate && <span>Delivery: {item.deliveryDate}</span>}
            <span>Status: {item.status}</span>
          </div>
        </div>

        {statusRisky && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs dark:border-amber-800 dark:bg-amber-950/40">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-amber-900 dark:text-amber-200">
              This item has status <strong>{item.status}</strong>. Splitting it now may not reach the supplier before their work is complete.
            </p>
          </div>
        )}

        {/* Split rows */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Split into {children.length} shipments</Label>
            <div className="text-xs">
              <span className={matches ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}>
                Total: <span className="font-mono font-semibold">{runningTotal.toLocaleString()}</span> / {parentQty.toLocaleString()} {item.unit}
              </span>
              {!matches && runningTotal > 0 && (
                <span className="ml-2 text-muted-foreground">
                  ({delta > 0 ? "over by" : "short by"} {Math.abs(delta).toLocaleString()})
                </span>
              )}
            </div>
          </div>

          {children.map((c, i) => (
            <div key={c.key} className="grid grid-cols-12 items-end gap-2 rounded-md border p-2">
              <div className="col-span-1 pt-2 text-center">
                <Badge variant="outline" className="font-mono text-[10px]">Lot {i + 1}</Badge>
              </div>
              <div className="col-span-3 space-y-1">
                <Label htmlFor={`sq-${c.key}`} className="text-[11px]">Quantity ({item.unit})</Label>
                <Input
                  id={`sq-${c.key}`}
                  type="number"
                  min="1"
                  step="1"
                  value={c.quantity}
                  onChange={(e) => updateChild(c.key, { quantity: e.target.value })}
                  className="h-8 text-sm"
                  disabled={saving}
                />
              </div>
              <div className="col-span-3 space-y-1">
                <Label htmlFor={`sd-${c.key}`} className="text-[11px]">Delivery date</Label>
                <Input
                  id={`sd-${c.key}`}
                  type="date"
                  value={c.deliveryDate}
                  onChange={(e) => updateChild(c.key, { deliveryDate: e.target.value })}
                  className="h-8 text-sm"
                  disabled={saving}
                />
              </div>
              <div className="col-span-4 space-y-1">
                <Label htmlFor={`sl-${c.key}`} className="text-[11px]">Label (optional)</Label>
                <Input
                  id={`sl-${c.key}`}
                  value={c.label}
                  onChange={(e) => updateChild(c.key, { label: e.target.value })}
                  placeholder="e.g. Sampling batch"
                  className="h-8 text-sm"
                  disabled={saving}
                  maxLength={120}
                />
              </div>
              <div className="col-span-1 pt-2 text-right">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => removeChild(c.key)}
                  disabled={children.length <= MIN_SPLIT_CHILDREN || saving}
                  title={children.length <= MIN_SPLIT_CHILDREN ? `Minimum ${MIN_SPLIT_CHILDREN} lots` : "Remove"}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}

          {children.length < MAX_SPLIT_CHILDREN && (
            <Button
              variant="outline"
              size="sm"
              onClick={addChild}
              disabled={saving}
              className="w-full"
            >
              <Plus className="h-3.5 w-3.5" /> Add another lot ({children.length}/{MAX_SPLIT_CHILDREN})
            </Button>
          )}
        </div>

        {/* Reason */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Reason category *</Label>
            <Select value={reasonCategory} onValueChange={(v) => setReasonCategory(v as SplitReasonCategory)} disabled={saving}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SPLIT_REASON_CATEGORIES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{REASON_LABELS[r.value]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sp-reason">
              Details {reasonCategory === "other" && <span className="text-destructive">*</span>}
            </Label>
            <Input
              id="sp-reason"
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              placeholder={reasonCategory === "other" ? "Explain the reason" : "Additional context (optional)"}
              disabled={saving}
              maxLength={500}
            />
          </div>
        </div>

        {/* Info footer */}
        <div className="rounded-md border bg-muted/40 p-2 text-[11px] text-muted-foreground">
          <p>
            <strong className="text-foreground">Note:</strong> Splitting creates {children.length} new items and marks the original as "Split". Each new item's CBM and package count starts blank — the supplier will redeclare as they produce each lot. Fabric details (composition / reference / shade) carry to all children.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !matches}>
            {saving ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
            ) : mode === "direct" ? (
              <><Split className="h-4 w-4" /> Split now</>
            ) : (
              <><Send className="h-4 w-4" /> Submit for approval</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
