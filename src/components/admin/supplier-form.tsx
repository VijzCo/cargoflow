"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSupplier } from "@/lib/utils/upload-actions";

export interface SupplierFormProps {
  /** Pre-fill the name (e.g. when called from preview with a parsed name) */
  initialName?: string;
  /** Called with the newly created supplier { id, name } on success */
  onCreated?: (s: { id: string; name: string }) => void;
  /** Called when the user clicks cancel (in modal contexts) */
  onCancel?: () => void;
}

export function SupplierForm({ initialName = "", onCreated, onCancel }: SupplierFormProps) {
  const [name, setName] = useState(initialName);
  const [aliases, setAliases] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [address, setAddress] = useState("");
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const result = await createSupplier({
          name: name.trim(),
          aliases: aliases.split(",").map((a) => a.trim()).filter(Boolean),
          contactPerson: contactPerson.trim() || undefined,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          country: country.trim() || undefined,
          address: address.trim() || undefined,
        });
        toast.success(`Supplier "${result.name}" added.`);
        onCreated?.(result);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to create supplier.");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="sup-name">Company name *</Label>
        <Input
          id="sup-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          disabled={isPending}
          placeholder="XIAMEN SYC TEXTILE TECH CO., LTD."
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="sup-aliases">Alternate names / aliases</Label>
        <Input
          id="sup-aliases"
          value={aliases}
          onChange={(e) => setAliases(e.target.value)}
          disabled={isPending}
          placeholder="Comma-separated. E.g. XIAMEN SYC, SYC TEXTILE"
        />
        <p className="text-xs text-muted-foreground">
          Helps match this supplier when names vary across PO files.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="sup-contact">Contact person</Label>
          <Input id="sup-contact" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} disabled={isPending} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sup-country">Country</Label>
          <Input id="sup-country" value={country} onChange={(e) => setCountry(e.target.value)} disabled={isPending} placeholder="China" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sup-email">Email</Label>
          <Input id="sup-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={isPending} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sup-phone">Phone</Label>
          <Input id="sup-phone" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={isPending} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="sup-address">Address</Label>
        <Input id="sup-address" value={address} onChange={(e) => setAddress(e.target.value)} disabled={isPending} />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isPending || !name.trim()}>
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Creating...
            </>
          ) : (
            "Create supplier"
          )}
        </Button>
      </div>
    </form>
  );
}
