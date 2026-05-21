"use client";

import Link from "next/link";
import {
  Package, ShoppingBag, Box, Calendar, CheckCircle2, AlertTriangle, TrendingUp, Ship,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart } from "@/components/reports/bar-chart";
import { DonutChart } from "@/components/reports/donut-chart";
import { formatNumber, formatCBM, formatDate } from "@/lib/utils/format";
import type { ReportData } from "@/lib/utils/reports-actions";

const STATUS_COLORS: Record<string, string> = {
  "Pending":     "#94a3b8",  // slate
  "Started":     "#06b6d4",  // cyan
  "In Progress": "#f59e0b",  // amber
  "Completed":   "#10b981",  // emerald
  "Loaded":      "#6366f1",  // indigo
  "Shipped":     "#475569",  // slate dark
};

const CATEGORY_COLORS: Record<string, string> = {
  Fabric:      "#4f46e5",
  Trims:       "#06b6d4",
  Accessories: "#f59e0b",
  Packaging:   "#a855f7",
  Garments:    "#10b981",
  Others:      "#64748b",
};

export function ReportsClient({ data }: { data: ReportData }) {
  const k = data.kpis;

  const statusData = Object.entries(data.byStatus)
    .filter(([, v]) => v > 0)
    .map(([label, value]) => ({ label, value, color: STATUS_COLORS[label] ?? "#64748b" }));

  const categoryData = Object.entries(data.byCategory)
    .filter(([, v]) => v.count > 0)
    .map(([label, v]) => ({ label, value: v.cbm, color: CATEGORY_COLORS[label] ?? "#64748b" }));

  const weeklyData = data.weeklyUploads.map((w) => ({
    label: w.weekStart.slice(5),   // MM-DD
    value: w.count,
  }));

  const vesselStatusVariant = (s: string) =>
    s === "Planned" ? "secondary" :
    s === "Loading" ? "info" :
    s === "Sailed" ? "warning" :
    s === "Delivered" ? "success" : "default";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Reports</h1>
        <p className="mt-1 text-muted-foreground">Live operational summary across all data.</p>
      </div>

      {/* KPI tiles */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KPI icon={ShoppingBag} label="Purchase Orders" value={formatNumber(k.totalPOs)} />
        <KPI icon={Package} label="Items" value={formatNumber(k.totalItems)} subtitle={`${formatNumber(k.totalQuantity)} units total`} />
        <KPI icon={Box} label="Total CBM" value={formatCBM(k.totalCbm)} subtitle={`${formatCBM(k.completedCbm)} declared`} accent="indigo" />
        <KPI
          icon={k.overdueCount > 0 ? AlertTriangle : CheckCircle2}
          label="Overdue"
          value={String(k.overdueCount)}
          subtitle={`${k.onTimePercent}% on-time`}
          accent={k.overdueCount > 0 ? "rose" : "emerald"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Items by status</CardTitle>
            <CardDescription>Where every item currently sits in the workflow.</CardDescription>
          </CardHeader>
          <CardContent>
            <DonutChart
              data={statusData}
              centerLabel={{ value: String(k.totalItems), label: "items" }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>CBM by category</CardTitle>
            <CardDescription>Where your container space is going.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarChart data={categoryData} formatValue={(n) => `${n.toFixed(1)} CBM`} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>PO uploads (last 8 weeks)</CardTitle>
          <CardDescription>One bar per week ending the Sunday.</CardDescription>
        </CardHeader>
        <CardContent>
          <BarChart data={weeklyData} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top suppliers by CBM</CardTitle>
            <CardDescription>Highest-volume suppliers for your active items.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {data.bySupplier.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No data yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">Items</TableHead>
                    <TableHead className="text-right">CBM</TableHead>
                    <TableHead className="text-right">Done</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.bySupplier.map((s) => (
                    <TableRow key={s.supplierId}>
                      <TableCell className="max-w-[200px] truncate text-sm">{s.supplierName}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatNumber(s.items)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{s.cbm.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        <span className="text-emerald-600 dark:text-emerald-400">{s.completed}</span>
                        <span className="text-muted-foreground"> / {s.items}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent vessels</CardTitle>
            <CardDescription>Last 10 vessels added.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {data.recentVessels.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No vessels yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vessel</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead>ETD</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentVessels.map((v) => (
                    <TableRow key={v.id} className="cursor-pointer">
                      <TableCell>
                        <Link href={`/vessels/${v.id}`} className="font-mono text-sm hover:underline">{v.vesselId}</Link>
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate text-sm">{v.destination}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(v.etd)}</TableCell>
                      <TableCell><Badge variant={vesselStatusVariant(v.status)}>{v.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KPI({ icon: Icon, label, value, subtitle, accent }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string; subtitle?: string;
  accent?: "indigo" | "emerald" | "rose";
}) {
  const tint =
    accent === "indigo" ? "text-indigo-600 dark:text-indigo-400" :
    accent === "emerald" ? "text-emerald-600 dark:text-emerald-400" :
    accent === "rose" ? "text-rose-600 dark:text-rose-400" :
    "text-muted-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
            {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <Icon className={`h-5 w-5 shrink-0 ${tint}`} />
        </div>
      </CardContent>
    </Card>
  );
}
