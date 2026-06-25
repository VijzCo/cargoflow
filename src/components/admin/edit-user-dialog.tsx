"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Pencil, AlertTriangle } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  updateUserRole, listSuppliersForUserForm, type UserView,
} from "@/lib/utils/admin-actions";
import type { Role } from "@/types";

interface Props {
  user: UserView;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  currentUid: string;
}

export function EditUserDialog({ user, open, onOpenChange, currentUid }: Props) {
  const router = useRouter();
  const [name, setName] = useState(user.displayName ?? "");
  const [role, setRole] = useState<Role>(user.role);
  const [supplierId, setSupplierId] = useState(user.supplierId ?? "");
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [saving, startSave] = useTransition();

  useEffect(() => {
    if (!open) return;
    setName(user.displayName ?? "");
    setRole(user.role);
    setSupplierId(user.supplierId ?? "");
  }, [open, user]);

  useEffect(() => {
    listSuppliersForUserForm().then(setSuppliers).catch(() => setSuppliers([]));
  }, []);

  const isSelf = user.uid === currentUid;
  const isDemotingSelf = isSelf && role !== "super_admin" && user.role === "super_admin";

  function submit() {
    if (role === "supplier" && !supplierId) {
      toast.error("Pick a supplier for this user.");
      return;
    }
    if (isDemotingSelf) {
      toast.error("You can't demote yourself from super admin.");
      return;
    }
    startSave(async () => {
      try {
        await updateUserRole({
          uid: user.uid,
          role,
          supplierId: role === "supplier" ? supplierId : undefined,
          displayName: name.trim() || undefined,
        });
        toast.success("User updated.");
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Update failed.");
      }
    });
  }

  const noChanges =
    name === (user.displayName ?? "") &&
    role === user.role &&
    (role !== "supplier" || supplierId === (user.supplierId ?? ""));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5" /> Edit user
          </DialogTitle>
          <DialogDescription>
            {user.email}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="eu-name">Display name</Label>
            <Input
              id="eu-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <Label>Role *</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)} disabled={saving}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="super_admin">Super Admin — full control</SelectItem>
                <SelectItem value="merchant_manager">Merchant Manager — approves merchant edit requests</SelectItem>
                <SelectItem value="merchant">Merchant — uploads POs, manages everything</SelectItem>
                <SelectItem value="logistics">Logistics — containers, vessels, packing lists</SelectItem>
                <SelectItem value="supplier">Supplier — updates own items only</SelectItem>
                <SelectItem value="viewer">Viewer — read-only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {role === "supplier" && (
            <div className="space-y-2">
              <Label>Supplier *</Label>
              <Select value={supplierId} onValueChange={setSupplierId} disabled={saving}>
                <SelectTrigger><SelectValue placeholder="Pick a supplier..." /></SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                This user will only see items belonging to this supplier.
              </p>
            </div>
          )}

          {isDemotingSelf && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs dark:border-amber-800 dark:bg-amber-950/40">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-amber-900 dark:text-amber-200">
                You can't demote yourself from super admin. Ask another super admin to make this change.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || noChanges || isDemotingSelf}>
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
