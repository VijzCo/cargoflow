"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Container as ContainerIcon } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { createContainer } from "@/lib/utils/container-actions";

export function CreateContainerDialog({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [number, setNumber] = useState("");
  const [type, setType] = useState<"20FT" | "40FT">("40FT");
  const [saving, startSave] = useTransition();

  function submit() {
    startSave(async () => {
      try {
        await createContainer({ containerNumber: number.trim(), type });
        toast.success(`Container ${number} created.`);
        setNumber("");
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to create container.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ContainerIcon className="h-5 w-5" /> Add container
          </DialogTitle>
          <DialogDescription>
            Register a physical container so items can be loaded into it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cnum">Container number *</Label>
            <Input
              id="cnum"
              value={number}
              onChange={(e) => setNumber(e.target.value.toUpperCase())}
              disabled={saving}
              placeholder="e.g. MSCU1234567"
              maxLength={40}
            />
            <p className="text-xs text-muted-foreground">
              The physical container ID from the carrier.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Type *</Label>
            <Select value={type} onValueChange={(v) => setType(v as "20FT" | "40FT")} disabled={saving}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="20FT">20FT (27 CBM nominal)</SelectItem>
                <SelectItem value="40FT">40FT (65 CBM nominal)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Usable CBM is automatically calculated using the global usable-% setting (default 92%).
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !number.trim()}>
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating...</> : "Create container"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
