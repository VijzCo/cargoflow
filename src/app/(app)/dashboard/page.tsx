import { getSessionUser } from "@/lib/rbac/session";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  Package, Factory, Container as ContainerIcon, Ship, AlertTriangle, ArrowRight,
  Clock, CheckCircle2, Upload, Sparkles, BarChart3, FileText,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDashboardData } from "@/lib/utils/dashboard-actions";
import { hasPermission } from "@/lib/rbac/permissions";
import { formatNumber, formatDate, formatPercent } from "@/lib/utils/format";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const data = await getDashboardData();
  const t = await getTranslations("dashboard");
  const tRoles = await getTranslations("roles");
  const tTop = await getTranslations("topbar");

  const greeting = getGreetingKey();
  const greetingText = t(greeting);
  const roleLabel = tRoles(user.role);
  const tCommon = await getTranslations("common");
  const tDashboardViewAll = tCommon("viewAll");
  const tSupplierH = (await getTranslations("po"))("colSupplier");
  const tStatusH = (await getTranslations("production"))("colStatus");
  const tUpdatedH = "";
  const canUpload = hasPermission(user.role, "purchase_orders.upload");
  const canAllocate = hasPermission(user.role, "containers.assign");

  const isEmpty = data.totalPOs === 0;
  const subtitleKey =
    user.role === "supplier" ? "subtitleSupplier" :
    user.role === "viewer"   ? "subtitleViewer" :
    "subtitleAdmin";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          {greetingText}, {user.displayName?.split(" ")[0] || ""}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {tTop("signedInAs")} <span className="font-medium text-foreground">{roleLabel}</span>.
          {" "}{t(subtitleKey)}
        </p>
      </div>

      {/* KPI tiles */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          label={t("kpiTotalPOs")}
          value={isEmpty ? "—" : formatNumber(data.totalPOs)}
          icon={Package}
          accent="navy"
          href="/purchase-orders"
        />
        <KPICard
          label={t("kpiInProduction")}
          value={isEmpty ? "—" : formatNumber(data.inProductionCount)}
          icon={Factory}
          accent="indigo"
          href="/production"
          subtitle={data.pendingCount > 0 ? t("kpiPending", { count: data.pendingCount }) : undefined}
        />
        <KPICard
          label={t("kpiContainerUtil")}
          value={data.openContainers + data.sealedContainers === 0 ? "—" : formatPercent(data.containerUtilization)}
          icon={ContainerIcon}
          accent="cyan"
          href="/containers"
          subtitle={data.openContainers > 0 || data.sealedContainers > 0
            ? t("containerStats", { open: data.openContainers, sealed: data.sealedContainers })
            : undefined}
        />
        <KPICard
          label={t("kpiVesselsInTransit")}
          value={isEmpty ? "—" : formatNumber(data.vesselsInTransit)}
          icon={Ship}
          accent="emerald"
          href="/vessels"
          subtitle={data.vesselsPlanned > 0 ? t("kpiPlanned", { count: data.vesselsPlanned }) : undefined}
        />
      </div>

      {/* Alert: overdue items */}
      {data.overdueCount > 0 && (
        <Card className="border-rose-200 bg-rose-50/40 dark:border-rose-900 dark:bg-rose-950/30">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-rose-600 dark:text-rose-400" />
              <div>
                <p className="font-medium text-rose-900 dark:text-rose-200">
                  {data.overdueCount === 1 ? t("overdueAlertSingle", { count: data.overdueCount }) : t("overdueAlertMany", { count: data.overdueCount })}
                </p>
                <p className="text-xs text-rose-800 dark:text-rose-300">
                  {t("overdueSubtitle")}
                </p>
              </div>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/production?status=Pending">{t("review")}<ArrowRight className="h-3.5 w-3.5" /></Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Empty-state guidance for fresh installs */}
      {isEmpty && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-indigo-500" />
              {t("getStarted")}
            </CardTitle>
            <CardDescription>
              {t("getStartedSubtitle")}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <QuickLink
              href="/purchase-orders/upload"
              icon={Upload}
              title={t("uploadAPO")}
              description={t("uploadAPODesc")}
              disabled={!canUpload}
            />
            <QuickLink
              href="/admin/suppliers"
              icon={Package}
              title={t("addSuppliers")}
              description={t("addSuppliersDesc")}
              disabled={!hasPermission(user.role, "suppliers.create")}
            />
          </CardContent>
        </Card>
      )}

      {/* Two-column: Recent activity + Upcoming deliveries */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div>
              <CardTitle className="text-base">{t("recentUpdates")}</CardTitle>
              <CardDescription>{t("recentUpdatesDesc")}</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/production">{tDashboardViewAll}<ArrowRight className="h-3 w-3" /></Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {data.recentItems.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-sm text-muted-foreground">
                <Clock className="mb-2 h-6 w-6" />
                {t("noItemsYet")}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("recentUpdates")}</TableHead>
                    <TableHead>{tSupplierH}</TableHead>
                    <TableHead>{tStatusH}</TableHead>
                    <TableHead>{tUpdatedH}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentItems.map((it) => (
                    <TableRow key={it.id}>
                      <TableCell>
                        <Link href={`/purchase-orders/${it.poId}`} className="hover:underline">
                          <div className="text-sm font-medium">{it.style}</div>
                          <div className="text-xs text-muted-foreground">{it.color} · {it.size}</div>
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-[160px] truncate text-xs">{it.supplierName}</TableCell>
                      <TableCell><StatusPillSmall status={it.status} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(it.updatedAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div>
              <CardTitle className="text-base">{t("upcomingDeliveries")}</CardTitle>
              <CardDescription>{t("upcomingDeliveriesDesc")}</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/production">{tDashboardViewAll}<ArrowRight className="h-3 w-3" /></Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {data.upcomingDeliveries.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-sm text-muted-foreground">
                <CheckCircle2 className="mb-2 h-6 w-6" />
                {t("nothingDue")}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Due</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.upcomingDeliveries.map((it) => {
                    const urgent = it.daysUntil <= 7;
                    return (
                      <TableRow key={it.id}>
                        <TableCell>
                          <Link href={`/purchase-orders/${it.poId}`} className="hover:underline">
                            <div className="text-sm font-medium">{it.style}</div>
                            <div className="text-xs text-muted-foreground font-mono">{it.poNumber}</div>
                          </Link>
                        </TableCell>
                        <TableCell className="max-w-[160px] truncate text-xs">{it.supplierName}</TableCell>
                        <TableCell>
                          <div className={`text-xs ${urgent ? "font-medium text-rose-600 dark:text-rose-400" : ""}`}>
                            {formatDate(it.deliveryDate)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {t("inDays", { days: it.daysUntil })}
                          </div>
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

      {/* Quick links for power users */}
      {!isEmpty && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("jumpTo")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {canUpload && (
              <QuickLink href="/purchase-orders/upload" icon={Upload} title={t("uploadPO")} description={t("addOrders")} />
            )}
            {canAllocate && (
              <QuickLink href="/containers" icon={ContainerIcon} title={t("containers")} description={t("allocateSeal")} />
            )}
            <QuickLink href="/vessels" icon={Ship} title={t("vessels")} description={t("scheduleShipments")} />
            <QuickLink href="/packing-lists" icon={FileText} title={t("packingLists")} description={t("downloadPDFs")} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function getGreetingKey(): "greetingMorning" | "greetingAfternoon" | "greetingEvening" {
  const h = new Date().getHours();
  if (h < 12) return "greetingMorning";
  if (h < 18) return "greetingAfternoon";
  return "greetingEvening";
}

function KPICard({
  label, value, icon: Icon, accent, href, subtitle,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: "navy" | "indigo" | "cyan" | "emerald";
  href?: string;
  subtitle?: string;
}) {
  const accentClasses = {
    navy: "from-slate-700/10 to-slate-700/5 text-slate-700 dark:text-slate-300",
    indigo: "from-indigo-500/10 to-indigo-500/5 text-indigo-600 dark:text-indigo-400",
    cyan: "from-cyan-500/10 to-cyan-500/5 text-cyan-600 dark:text-cyan-400",
    emerald: "from-emerald-500/10 to-emerald-500/5 text-emerald-600 dark:text-emerald-400",
  };
  const body = (
    <Card className="relative overflow-hidden transition-transform hover:scale-[1.01]">
      <div className={`absolute inset-0 bg-gradient-to-br ${accentClasses[accent]}`} aria-hidden />
      <CardContent className="relative p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
            {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <Icon className="h-8 w-8 opacity-30" />
        </div>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function QuickLink({
  href, icon: Icon, title, description, disabled,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  disabled?: boolean;
}) {
  if (disabled) return null;
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-md border bg-card p-3 transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      <Icon className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-foreground" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}

function StatusPillSmall({ status }: { status: string }) {
  const variant =
    status === "Pending"     ? "secondary" :
    status === "Started"     ? "info" :
    status === "In Progress" ? "warning" :
    status === "Completed"   ? "success" :
    "default";
  return <Badge variant={variant as "secondary" | "info" | "warning" | "success" | "default"}>{status}</Badge>;
}
