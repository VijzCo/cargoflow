"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Pencil, AlertTriangle, Send } from "lucide-react";
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
import { editItemDirect, submitEditRequest } from "@/lib/utils/edit-request-actions";
import type { Category } from "@/types";

type Mode = "direct" | "request";

interface Props {
  /** "direct" = save immediately (super_admin / merchant_manager).
   *  "request" = submit for approval (merchant).  */
  mode: Mode;
  open: boolean;
  onOpenChange: (o: boolean) => void;

  item: {
    id: string;
    poId: string;
    poNumbers: string[];
    style: string;
    color: string;
    size: string;
    quantity: number;
    unit: string;
    unitPrice?: number;
    category: Category;
    description?: string;
    deliveryDate?: string;
    salesChannel?: string;
    remarks?: string;
    status: string;
  };
}

const CATEGORIES: Category[] = ["Fabric", "Trims", "Accessories", "Packaging", "Garments", "Others"];
const UNITS = ["METER", "PIECE", "ROLL", "BOX", "CARTON", "BAG", "PAIR", "SET", "YARD", "KG"];

export function EditItemDialog({ mode, open, onOpenChange, item }: Props) {
  const router = useRouter();
  const [poNumbers, setPoNumbers] = useState(item.poNumbers.join(", "));
  const [style, setStyle] = useState(item.style);
  const [color, setColor] = useState(item.color);
  const [size, setSize] = useState(item.size);
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [unit, setUnit] = useState(item.unit);
  const [unitPrice, setUnitPrice] = useState(item.unitPrice != null ? String(item.unitPrice) : "");
  const [category, setCategory] = useState<Category>(item.category);
  const [description, setDescription] = useState(item.description ?? "");
  const [deliveryDate, setDeliveryDate] = useState(item.deliveryDate ?? "");
  const [salesChannel, setSalesChannel] = useState(item.salesChannel ?? "");
  const [remarks, setRemarks] = useState(item.remarks ?? "");
  const [reason, setReason] = useState("");
  const [saving, startSave] = useTransition();

  // Reset state when dialog re-opens
  useEffect(() => {
    if (!open) return;
    setPoNumbers(item.poNumbers.join(", "));
    setStyle(item.style);
    setColor(item.color);
    setSize(item.size);
    setQuantity(String(item.quantity));
    setUnit(item.unit);
    setUnitPrice(item.unitPrice != null ? String(item.unitPrice) : "");
    setCategory(item.category);
    setDescription(item.description ?? "");
    setDeliveryDate(item.deliveryDate ?? "");
    setSalesChannel(item.salesChannel ?? "");
    setRemarks(item.remarks ?? "");
    setReason("");
  }, [open, item]);

  const showRiskWarning =
    item.status !== "Pending" && item.status !== "Started" && item.status !== "In Progress" && item.status !== "Completed";
  // Quantity change while in production warning
  const qtyNum = Number(quantity);
  const qtyChanged = Number.isFinite(qtyNum) && qtyNum !== item.quantity;
  const qtyRiskInProduction = qtyChanged &&
    (item.status === "Started" || item.status === "In Progress");

  function buildPayload() {
    const poList = poNumbers
      .split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);
    if (poList.length === 0) {
      toast.error("PO number is required.");
      return null;
    }
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      toast.error("Quantity must be a positive number.");
      return null;
    }
    return {
      poNumbers: poList,
      style: style.trim(),
      color: color.trim(),
      size: size.trim(),
      quantity: qtyNum,
      unit: unit.trim(),
      unitPrice: unitPrice.trim() === "" ? null : Number(unitPrice),
      category,
      description: description.trim() === "" ? null : description.trim(),
      deliveryDate: deliveryDate.trim() === "" ? null : deliveryDate.trim(),
      salesChannel: salesChannel.trim() === "" ? null : salesChannel.trim(),
      remarks: remarks.trim() === "" ? null : remarks.trim(),
    } as const;
  }

  function submit() {
    const proposed = buildPayload();
    if (!proposed) return;
    startSave(async () => {
      try {
        if (mode === "direct") {
          const res = await editItemDirect({ itemId: item.id, changes: proposed });
          if (res.changed === 0) {
            toast.info("No changes detected.");
          } else {
            toast.success(`Saved — ${res.changed} field${res.changed === 1 ? "" : "s"} updated.`);
          }
        } else {
          await submitEditRequest({
            itemId: item.id,
            type: "update",
            proposedChanges: proposed,
            reason: reason.trim() || undefined,
          });
          toast.success("Edit request submitted for approval.");
        }
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "direct" ? <Pencil className="h-5 w-5" /> : <Send className="h-5 w-5" />}
            {mode === "direct" ? "Edit item" : "Request item edit"}
          </DialogTitle>
          <DialogDescription>
            {mode === "direct"
              ? "Changes save immediately and are added to the activity log."
              : "Your proposed changes need approval from a merchant manager or super admin before they take effect."}
          </DialogDescription>
        </DialogHeader>

        {showRiskWarning && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs dark:border-amber-800 dark:bg-amber-950/40">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-amber-900 dark:text-amber-200">
              This item has status <strong>{item.status}</strong>. Editing it now may not reach the supplier in time.
            </p>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ef-po">PO Number(s)</Label>
            <Input id="ef-po" value={poNumbers} onChange={(e) => setPoNumbers(e.target.value)} placeholder="e.g. DFSKEW01 or 1292509, 1311916" disabled={saving} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ef-style">Style</Label>
            <Input id="ef-style" value={style} onChange={(e) => setStyle(e.target.value)} disabled={saving} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ef-color">Color</Label>
            <Input id="ef-color" value={color} onChange={(e) => setColor(e.target.value)} disabled={saving} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ef-size">Size</Label>
            <Input id="ef-size" value={size} onChange={(e) => setSize(e.target.value)} disabled={saving} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ef-qty">
              Quantity
              {qtyRiskInProduction && (
                <Badge variant="warning" className="ml-2 text-[10px]">Item is in production</Badge>
              )}
            </Label>
            <Input id="ef-qty" type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} disabled={saving} />
          </div>
          <div className="space-y-1.5">
            <Label>Unit</Label>
            <Select value={unit} onValueChange={setUnit} disabled={saving}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ef-price">Unit price</Label>
            <Input id="ef-price" type="number" step="0.01" min="0" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} disabled={saving} placeholder="(blank to clear)" />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as Category)} disabled={saving}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ef-delivery">Delivery date</Label>
            <Input id="ef-delivery" type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} disabled={saving} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ef-channel">Sales channel</Label>
            <Input id="ef-channel" value={salesChannel} onChange={(e) => setSalesChannel(e.target.value)} disabled={saving} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ef-desc">Description</Label>
            <Input id="ef-desc" value={description} onChange={(e) => setDescription(e.target.value)} disabled={saving} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ef-remarks">Remarks</Label>
            <Input id="ef-remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} disabled={saving} />
          </div>
        </div>

        {mode === "request" && (
          <div className="space-y-1.5">
            <Label htmlFor="ef-reason">Reason for change (optional)</Label>
            <Input
              id="ef-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Helps the approver understand context"
              disabled={saving}
              maxLength={500}
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
            ) : mode === "direct" ? (
              <>Save</>
            ) : (
              <><Send className="h-4 w-4" /> Submit for approval</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
