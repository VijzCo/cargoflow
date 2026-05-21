import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, FileText, Container as ContainerIcon, Ship, MapPin, Calendar } from "lucide-react";
import { getSessionUser } from "@/lib/rbac/session";
import { hasPermission } from "@/lib/rbac/permissions";
import { getPackingListDetail } from "@/lib/utils/packing-list-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PDFDownloadButton } from "@/components/packing-lists/pdf-download-button";
import { formatDate, formatNumber, formatCBM } from "@/lib/utils/format";

export default async function PackingListDetailPage({ params }: { params: { plId: string } }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "packing_lists.view")) redirect("/dashboard");

  let detail;
  try {
    detail = await getPackingListDetail(params.plId);
  } catch {
    notFound();
  }

  const { packingList: pl, items, vessel, supplier } = detail;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/packing-lists"><ArrowLeft className="h-4 w-4" /> Back to packing lists</Link>
      </Button>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="h-6 w-6 text-muted-foreground" />
            <h1 className="font-mono text-xl font-bold tracking-tight md:text-2xl">{pl.packingListNumber}</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Generated {formatDate(pl.generatedAt)}
          </p>
        </div>
        <PDFDownloadButton packingListId={pl.id} variant="default" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Ship} label="Vessel" value={vessel.vesselId} subtitle={vessel.vesselName} link={`/vessels/${pl.vesselId}`} />
        <Stat icon={ContainerIcon} label="Container" value={pl.containerNumber} link={`/containers/${pl.containerId}`} />
        <Stat icon={MapPin} label="Destination" value={vessel.destination || pl.destination} />
        <Stat icon={Calendar} label="ETD / ETA" value={`${formatDate(vessel.etd)} → ${formatDate(vessel.eta)}`} />
      </div>

      <Card>
        <CardContent className="p-4">
          <h3 className="font-semibold">{supplier.name}</h3>
          <div className="mt-1 text-xs text-muted-foreground">
            {[supplier.address, supplier.country, supplier.email, supplier.phone].filter(Boolean).join(" · ")}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KPI label="Items" value={String(items.length)} />
        <KPI label="Quantity" value={formatNumber(pl.totalQuantity)} />
        <KPI label="Packages" value={formatNumber(pl.totalCartons)} />
        <KPI label="Gross weight" value={`${pl.totalGrossWeight.toFixed(1)} kg`} />
        <KPI label="Total CBM" value={formatCBM(pl.totalCbm)} accent />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO</TableHead>
                <TableHead>Style</TableHead>
                <TableHead>Color</TableHead>
                <TableHead>Size</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="text-right">Pkgs</TableHead>
                <TableHead className="text-right">CBM</TableHead>
                <TableHead className="text-right">Gross (kg)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono text-xs">{item.poNumber}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-sm">{item.style}</TableCell>
                  <TableCell className="text-sm">{item.color}</TableCell>
                  <TableCell className="text-sm">{item.size}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{formatNumber(item.quantity)}</TableCell>
                  <TableCell className="text-xs">{item.unit}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{item.packageCount || "—"}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{item.cbm.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{item.grossWeight ? item.grossWeight.toFixed(1) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ icon: Icon, label, value, subtitle, link }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string; subtitle?: string; link?: string;
}) {
  const body = (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-1 truncate text-sm font-semibold">{value}</p>
            {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
  return link ? <Link href={link}>{body}</Link> : body;
}

function KPI({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`mt-1 text-2xl font-bold ${accent ? "text-primary" : ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
