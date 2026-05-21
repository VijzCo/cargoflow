"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, Calendar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatDate, formatNumber } from "@/lib/utils/format";

const ALL = "_all";

export interface POListRow {
  id: string;
  poNumber: string;
  poNumbers: string[];
  supplierId: string;
  supplierName: string;
  orderNo?: string;
  salesChannel?: string;
  totalItems: number;
  totalQuantity: number;
  totalCbm: number;
  uploadedAt: string | null;
}

export function POListClient({
  pos,
  channels,
}: {
  pos: POListRow[];
  channels: string[];
}) {
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState(ALL);
  const [channelFilter, setChannelFilter] = useState(ALL);

  const uniqueSuppliers = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of pos) map.set(p.supplierId, p.supplierName);
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [pos]);

  const filtered = useMemo(() => {
    return pos.filter((p) => {
      if (supplierFilter !== ALL && p.supplierId !== supplierFilter) return false;
      if (channelFilter !== ALL && p.salesChannel !== channelFilter) return false;
      if (search.trim()) {
        const s = search.toLowerCase();
        if (!(p.poNumber.toLowerCase().includes(s) ||
              p.poNumbers.some((n) => n.toLowerCase().includes(s)) ||
              p.supplierName.toLowerCase().includes(s) ||
              (p.orderNo?.toLowerCase().includes(s) ?? false))) {
          return false;
        }
      }
      return true;
    });
  }, [pos, search, supplierFilter, channelFilter]);

  return (
    <>
      <Card>
        <CardContent className="grid gap-2 p-3 sm:grid-cols-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search PO #, supplier, order..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={supplierFilter} onValueChange={setSupplierFilter}>
            <SelectTrigger><SelectValue placeholder="All suppliers" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All suppliers</SelectItem>
              {uniqueSuppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger><SelectValue placeholder="All channels" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All channels</SelectItem>
              {channels.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              {pos.length === 0 ? "No POs yet." : "No POs match your filters."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO #</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Uploaded</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((po) => (
                  <TableRow key={po.id} className="cursor-pointer">
                    <TableCell>
                      <Link href={`/purchase-orders/${po.id}`} className="block">
                        <div className="font-medium hover:underline">{po.poNumber}</div>
                        {po.poNumbers.length > 1 && (
                          <div className="text-xs text-muted-foreground">+{po.poNumbers.length - 1} more</div>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[260px] truncate">
                      <Link href={`/purchase-orders/${po.id}`} className="block">{po.supplierName}</Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <Link href={`/purchase-orders/${po.id}`} className="block">{po.orderNo ?? "—"}</Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/purchase-orders/${po.id}`} className="block">
                        {po.salesChannel ? <Badge variant="info">{po.salesChannel}</Badge> : <span className="text-xs text-muted-foreground">—</span>}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      <Link href={`/purchase-orders/${po.id}`} className="block">{formatNumber(po.totalItems)}</Link>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      <Link href={`/purchase-orders/${po.id}`} className="block">{formatNumber(po.totalQuantity)}</Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/purchase-orders/${po.id}`} className="block">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {formatDate(po.uploadedAt)}
                        </div>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
