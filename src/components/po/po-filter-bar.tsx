"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export interface POFilterBarProps {
  suppliers: { id: string; name: string }[];
  channels: string[];
  showSupplier?: boolean; // Hidden for supplier-role users (they only see their own)
}

const STATUSES = ["Pending", "Started", "In Progress", "Completed", "Loaded", "Shipped"] as const;
const CATEGORIES = ["Fabric", "Trims", "Accessories", "Packaging", "Garments", "Others"] as const;

const ALL = "_all";

export function POFilterBar({ suppliers, channels, showSupplier = true }: POFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function setParam(key: string, value: string | undefined) {
    const next = new URLSearchParams(params.toString());
    if (!value || value === ALL) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`);
    });
  }

  function clearAll() {
    startTransition(() => {
      router.replace(pathname);
    });
  }

  const supplierId = params.get("supplierId") ?? ALL;
  const status = params.get("status") ?? ALL;
  const category = params.get("category") ?? ALL;
  const salesChannel = params.get("salesChannel") ?? ALL;
  const search = params.get("search") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";

  const hasAnyFilter =
    supplierId !== ALL || status !== ALL || category !== ALL || salesChannel !== ALL || search || from || to;

  return (
    <div className="space-y-3 rounded-lg border bg-card p-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {showSupplier && (
          <Select value={supplierId} onValueChange={(v) => setParam("supplierId", v)} disabled={pending}>
            <SelectTrigger><SelectValue placeholder="All suppliers" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All suppliers</SelectItem>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={status} onValueChange={(v) => setParam("status", v)} disabled={pending}>
          <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={category} onValueChange={(v) => setParam("category", v)} disabled={pending}>
          <SelectTrigger><SelectValue placeholder="All categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={salesChannel} onValueChange={(v) => setParam("salesChannel", v)} disabled={pending}>
          <SelectTrigger><SelectValue placeholder="All channels" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All channels</SelectItem>
            {channels.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="relative sm:col-span-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search style, color, PO..."
            value={search}
            onChange={(e) => setParam("search", e.target.value)}
            className="pl-9"
            disabled={pending}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:col-span-2">
          <Input type="date" value={from} onChange={(e) => setParam("from", e.target.value)} disabled={pending} placeholder="From" />
          <Input type="date" value={to} onChange={(e) => setParam("to", e.target.value)} disabled={pending} placeholder="To" />
        </div>
      </div>

      {hasAnyFilter && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={clearAll} disabled={pending}>
            <X className="h-3 w-3" /> Clear filters
          </Button>
        </div>
      )}
    </div>
  );
}
