"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { SupplierForm } from "@/components/admin/supplier-form";
import { updateSupplierActive } from "@/lib/utils/upload-actions";

interface Supplier {
  id: string;
  name: string;
  aliases: string[];
  contactPerson?: string;
  email?: string;
  phone?: string;
  country?: string;
  active: boolean;
}

export function SuppliersClient({
  initial,
  canCreate,
  canDeactivate,
}: {
  initial: Supplier[];
  canCreate: boolean;
  canDeactivate: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [toggling, startToggle] = useTransition();

  const filtered = initial.filter((s) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.aliases.some((a) => a.toLowerCase().includes(q)) ||
      (s.country?.toLowerCase().includes(q) ?? false) ||
      (s.contactPerson?.toLowerCase().includes(q) ?? false)
    );
  });

  function toggleActive(id: string, newActive: boolean) {
    startToggle(async () => {
      try {
        await updateSupplierActive(id, newActive);
        toast.success(newActive ? "Supplier activated" : "Supplier deactivated");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Update failed.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Suppliers</h1>
          <p className="mt-1 text-muted-foreground">
            {initial.length} supplier{initial.length === 1 ? "" : "s"} in the system.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            Add supplier
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, alias, country, or contact..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
              {initial.length === 0
                ? "No suppliers yet. Click \"Add supplier\" to get started."
                : "No suppliers match your search."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Aliases</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Status</TableHead>
                  {canDeactivate && <TableHead></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {s.aliases.length ? s.aliases.join(", ") : "—"}
                    </TableCell>
                    <TableCell>{s.country || "—"}</TableCell>
                    <TableCell>
                      <div className="text-sm">{s.contactPerson || "—"}</div>
                      {s.email && <div className="text-xs text-muted-foreground">{s.email}</div>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={s.active ? "success" : "secondary"}>
                        {s.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    {canDeactivate && (
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleActive(s.id, !s.active)}
                          disabled={toggling}
                        >
                          {toggling ? <Loader2 className="h-3 w-3 animate-spin" /> : (s.active ? "Deactivate" : "Activate")}
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add supplier</DialogTitle>
            <DialogDescription>
              Add a new supplier so POs can be matched to them during upload.
            </DialogDescription>
          </DialogHeader>
          <SupplierForm
            onCreated={() => {
              setOpen(false);
              router.refresh();
            }}
            onCancel={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
