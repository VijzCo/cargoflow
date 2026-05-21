import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, Building2, Calendar, Hash, ShoppingBag, Box } from "lucide-react";
import { getSessionUser } from "@/lib/rbac/session";
import { hasPermission } from "@/lib/rbac/permissions";
import { getPODetail } from "@/lib/utils/production-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatNumber, formatCBM } from "@/lib/utils/format";
import { ItemActions } from "@/components/production/item-actions";

export default async function PODetailPage({ params }: { params: { poId: string } }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "purchase_orders.view")) redirect("/dashboard");

  let detail;
  try {
    detail = await getPODetail(params.poId);
  } catch {
    notFound();
  }
  const { po, items } = detail;

  const isSupplier = user.role === "supplier";
  const canUpdateCBM = hasPermission(user.role, "po_items.update_cbm");
  const canUpdateStatus = hasPermission(user.role, "po_items.update_status") || isSupplier;

  // Sort items: by category then style then color then size
  const sortedItems = [...items].sort((a, b) =>
    a.category.localeCompare(b.category) ||
    a.style.localeCompare(b.style) ||
    a.color.localeCompare(b.color) ||
    a.size.localeCompare(b.size),
  );

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link href="/purchase-orders"><ArrowLeft className="h-4 w-4" /> Back to POs</Link>
        </Button>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{po.poNumber}</h1>
            {po.poNumbers.length > 1 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Combined with: {po.poNumbers.slice(1).join(", ")}
              </p>
            )}
          </div>
          {po.salesChannel && <Badge variant="info">{po.salesChannel}</Badge>}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Building2} label="Supplier" value={po.supplierName} />
        <Stat icon={Hash} label="Order #" value={po.orderNo ?? "—"} />
        <Stat icon={ShoppingBag} label="Total quantity" value={formatNumber(po.totalQuantity)} />
        <Stat icon={Box} label="Total CBM" value={formatCBM(po.totalCbm)} />
      </div>

      {po.uploadedAt && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3" />
          Uploaded {formatDate(po.uploadedAt)}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Style</TableHead>
                <TableHead>Color</TableHead>
                <TableHead>Size</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="text-right">CBM</TableHead>
                <TableHead className="text-right">Packages</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell><Badge variant="outline">{item.category}</Badge></TableCell>
                  <TableCell className="max-w-[200px] truncate text-sm">{item.style}</TableCell>
                  <TableCell className="text-sm">{item.color}</TableCell>
                  <TableCell className="text-sm">{item.size}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{formatNumber(item.quantity)}</TableCell>
                  <TableCell className="text-xs">{item.unit}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{item.cbm.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{item.packageCount || "—"}</TableCell>
                  <TableCell>
                    <StatusCell status={item.status} />
                  </TableCell>
                  <TableCell>
                    <ItemActions
                      item={item}
                      canUpdateStatus={canUpdateStatus}
                      canUpdateCBM={canUpdateCBM}
                      isSupplier={isSupplier}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-1 truncate text-sm font-semibold">{value}</p>
          </div>
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}

// Lightweight server-renderable status cell (avoids importing client StatusPill at the server boundary)
function StatusCell({ status }: { status: string }) {
  const map: Record<string, "secondary" | "info" | "warning" | "success" | "default"> = {
    "Pending": "secondary", "Started": "info", "In Progress": "warning",
    "Completed": "success", "Loaded": "default", "Shipped": "default",
  };
  return <Badge variant={map[status] ?? "default"}>{status}</Badge>;
}
