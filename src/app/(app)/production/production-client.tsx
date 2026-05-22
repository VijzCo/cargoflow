"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  collection, query, where, onSnapshot, orderBy, limit,
  type QueryConstraint,
} from "firebase/firestore";
import {
  Loader2, Factory, Clock, CheckCircle2, AlertTriangle, ExternalLink, Search,
} from "lucide-react";
import { db } from "@/lib/firebase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { StatusPill } from "@/components/production/status-pill";
import { ItemActions } from "@/components/production/item-actions";
import { formatNumber, formatDate, formatCBM } from "@/lib/utils/format";
import { hasPermission } from "@/lib/rbac/permissions";
import type { Role, POItemStatus } from "@/types";
import type { POItemView } from "@/lib/utils/po-item-view";

const STATUSES: POItemStatus[] = ["Pending", "Started", "In Progress", "Completed", "Loaded", "Shipped"];
const ALL = "_all";

export function ProductionClient({
  role,
  supplierId,
  suppliers,
}: {
  role: Role;
  supplierId?: string;
  suppliers: { id: string; name: string }[];
}) {
  const isSupplier = role === "supplier";

  const [items, setItems] = useState<POItemView[]>([]);
  const [loading, setLoading] = useState(true);
  const [supplierFilter, setSupplierFilter] = useState<string>(isSupplier ? supplierId ?? ALL : ALL);
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [search, setSearch] = useState("");

  // ---- Real-time subscription ----
  useEffect(() => {
    setLoading(true);
    const constraints: QueryConstraint[] = [];

    if (isSupplier && supplierId) {
      constraints.push(where("supplierId", "==", supplierId));
    } else if (supplierFilter !== ALL) {
      constraints.push(where("supplierId", "==", supplierFilter));
    }
    if (statusFilter !== ALL) {
      constraints.push(where("status", "==", statusFilter));
    }
    constraints.push(orderBy("updatedAt", "desc"));
    constraints.push(limit(300));

    const q = query(collection(db, "po_items"), ...constraints);
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: POItemView[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            poId: data.poId,
            poNumbers: data.poNumbers ?? [],
            supplierId: data.supplierId,
            supplierName: data.supplierName,
            style: data.style,
            color: data.color,
            size: data.size,
            quantity: data.quantity,
            unit: data.unit,
            unitPrice: data.unitPrice,
            category: data.category,
            description: data.description,
            deliveryDate: data.deliveryDate,
            salesChannel: data.salesChannel,
            remarks: data.remarks,
            status: data.status ?? "Pending",
            cbm: data.cbm ?? 0,
            packageCount: data.packageCount ?? 0,
            grossWeight: data.grossWeight,
            netWeight: data.netWeight,
            supplierRemarks: data.supplierRemarks,
            containerId: data.containerId,
            vesselId: data.vesselId,
            updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? null,
          };
        });
        setItems(next);
        setLoading(false);
      },
      (err) => {
        console.error("[production] listener error:", err);
        setLoading(false);
      },
    );

    return unsub;
  }, [isSupplier, supplierId, supplierFilter, statusFilter]);

  // ---- Client-side text search filter ----
  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const s = search.toLowerCase();
    return items.filter(
      (i) =>
        i.style.toLowerCase().includes(s) ||
        i.color.toLowerCase().includes(s) ||
        i.size.toLowerCase().includes(s) ||
        i.poNumbers.some((p) => p.toLowerCase().includes(s)) ||
        i.supplierName.toLowerCase().includes(s),
    );
  }, [items, search]);

  // ---- KPIs ----
  const kpi = useMemo(() => {
    const total = items.length;
    const pending = items.filter((i) => i.status === "Pending").length;
    const inProgress = items.filter((i) => i.status === "Started" || i.status === "In Progress").length;
    const completed = items.filter((i) => i.status === "Completed").length;
    const today = new Date().toISOString().slice(0, 10);
    const overdue = items.filter(
      (i) => i.deliveryDate && i.deliveryDate < today &&
            i.status !== "Completed" && i.status !== "Loaded" && i.status !== "Shipped",
    ).length;
    const noCbm = items.filter(
      (i) => (i.status === "Completed" || i.status === "In Progress") && i.cbm === 0,
    ).length;
    return { total, pending, inProgress, completed, overdue, noCbm };
  }, [items]);

  const canUpdateStatus = hasPermission(role, "po_items.update_status") || isSupplier;
  const canUpdateCBM = hasPermission(role, "po_items.update_cbm");
  const t = useTranslations("production");
  const tStatus = useTranslations("status");

  // ---- Render ----
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">
          {isSupplier ? t("subtitleSupplier") : t("subtitleAdmin")}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
        <KPI label={t("kpiTotal")} value={kpi.total} icon={Factory} />
        <KPI label={t("kpiPending")} value={kpi.pending} icon={Clock} accent="amber" />
        <KPI label={t("kpiInProgress")} value={kpi.inProgress} icon={Factory} accent="indigo" />
        <KPI label={t("kpiCompleted")} value={kpi.completed} icon={CheckCircle2} accent="emerald" />
        <KPI label={t("kpiOverdue")} value={kpi.overdue} icon={AlertTriangle} accent="rose" />
      </div>

      {kpi.noCbm > 0 && !isSupplier && (
        <Card>
          <CardContent className="flex items-center gap-2 p-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <span>{t("noCBMWarning", { count: kpi.noCbm })}</span>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-3 p-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("searchPlaceholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {!isSupplier && (
              <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t("allStatuses")}</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("allStatuses")}</SelectItem>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{tStatus(s)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("loading")}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              {items.length === 0 ? t("noItemsAssigned") : t("title")}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colPO")}</TableHead>
                  {!isSupplier && <TableHead>{t("colSupplier")}</TableHead>}
                  <TableHead>{t("colStyle")}</TableHead>
                  <TableHead>{t("colColor")}</TableHead>
                  <TableHead>{t("colSize")}</TableHead>
                  <TableHead className="text-right">{t("colQty")}</TableHead>
                  <TableHead className="text-right">{t("colCBM")}</TableHead>
                  <TableHead>{t("colDelivery")}</TableHead>
                  <TableHead>{t("colStatus")}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((item) => {
                  const today = new Date().toISOString().slice(0, 10);
                  const overdue = item.deliveryDate && item.deliveryDate < today &&
                    item.status !== "Completed" && item.status !== "Loaded" && item.status !== "Shipped";
                  return (
                    <TableRow key={item.id} className={overdue ? "bg-rose-50/40 dark:bg-rose-950/20" : undefined}>
                      <TableCell>
                        <Link href={`/purchase-orders/${item.poId}`} className="flex items-center gap-1 text-xs font-mono hover:underline">
                          {item.poNumbers[0]}
                          <ExternalLink className="h-3 w-3 opacity-50" />
                        </Link>
                      </TableCell>
                      {!isSupplier && (
                        <TableCell className="max-w-[180px] truncate text-sm">{item.supplierName}</TableCell>
                      )}
                      <TableCell className="max-w-[180px] truncate text-sm">{item.style}</TableCell>
                      <TableCell className="text-sm">{item.color}</TableCell>
                      <TableCell className="text-sm">{item.size}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatNumber(item.quantity)} <span className="text-xs text-muted-foreground">{item.unit}</span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {item.cbm > 0 ? formatCBM(item.cbm) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs ${overdue ? "font-medium text-rose-600 dark:text-rose-400" : ""}`}>
                          {formatDate(item.deliveryDate)}
                          {overdue && <Badge variant="destructive" className="ml-1">{t("overdue")}</Badge>}
                        </span>
                      </TableCell>
                      <TableCell><StatusPill status={item.status} /></TableCell>
                      <TableCell>
                        <ItemActions
                          item={item}
                          canUpdateStatus={canUpdateStatus}
                          canUpdateCBM={canUpdateCBM}
                          isSupplier={isSupplier}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KPI({
  label, value, icon: Icon, accent,
}: {
  label: string; value: number; icon: React.ComponentType<{ className?: string }>;
  accent?: "amber" | "indigo" | "emerald" | "rose";
}) {
  const tint =
    accent === "amber" ? "text-amber-600 dark:text-amber-400" :
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
          </div>
          <Icon className={`h-5 w-5 shrink-0 ${tint}`} />
        </div>
      </CardContent>
    </Card>
  );
}
