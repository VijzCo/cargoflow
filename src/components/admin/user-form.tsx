"use client";

import { useState, useEffect, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Copy, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { createUser, listSuppliersForUserForm } from "@/lib/utils/admin-actions";
import type { Role } from "@/types";

export function UserForm({ onCreated, onCancel }: {
  onCreated?: () => void;
  onCancel?: () => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [supplierId, setSupplierId] = useState("");
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [saving, startSave] = useTransition();

  useEffect(() => {
    listSuppliersForUserForm().then(setSuppliers).catch(() => setSuppliers([]));
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (role === "supplier" && !supplierId) {
      toast.error("Pick a supplier for this user.");
      return;
    }
    startSave(async () => {
      try {
        const res = await createUser({
          email: email.trim(),
          displayName: name.trim(),
          role,
          supplierId: role === "supplier" ? supplierId : undefined,
        });
        toast.success("User created.");
        setResetLink(res.passwordResetLink);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Create failed.");
      }
    });
  }

  function copyLink() {
    if (!resetLink) return;
    navigator.clipboard.writeText(resetLink).then(() => {
      setLinkCopied(true);
      toast.success("Link copied.");
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }

  // Step 2 — show the password reset link after creation
  if (resetLink) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950/40">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div className="flex-1">
              <p className="font-medium text-emerald-900 dark:text-emerald-200">User created</p>
              <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-300">
                Send the password setup link below to <strong>{email}</strong>. It expires in ~24h.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Password setup link</Label>
          <div className="flex gap-2">
            <Input value={resetLink} readOnly className="font-mono text-xs" />
            <Button type="button" variant="outline" onClick={copyLink}>
              {linkCopied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={() => { onCreated?.(); }}>Done</Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="u-email">Email *</Label>
          <Input id="u-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={saving} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="u-name">Display name *</Label>
          <Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} required disabled={saving} />
        </div>
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

      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
        )}
        <Button type="submit" disabled={saving || !email.trim() || !name.trim()}>
          {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating...</> : "Create user"}
        </Button>
      </div>
    </form>
  );
}
