import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, Building2, Calendar, Hash, ShoppingBag, Box, Clock, Split } from "lucide-react";
import { getSessionUser } from "@/lib/rbac/session";
import { hasPermission } from "@/lib/rbac/permissions";
import { getPODetail } from "@/lib/utils/production-actions";
import { adminDb } from "@/lib/firebase/admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatNumber, formatCBM } from "@/lib/utils/format";
import { ItemActions } from "@/components/production/item-actions";
import { FabricDetailsCell } from "@/components/po/fabric-details-cell";

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
  const canEditFabric = hasPermission(user.role, "purchase_orders.update");

  // CR9 — edit approval workflow
  const canEditDirect = hasPermission(user.role, "po_items.edit_direct");
  const canEditRequest = hasPermission(user.role, "po_items.edit_request");

  // CR10 — split approval workflow
  const canSplitDirect = hasPermission(user.role, "po_items.split_direct");
  const canSplitRequest = hasPermission(user.role, "po_items.split_request");

  // Fetch pending edit requests + pending split requests for THIS PO's items,
  // both scoped by poId so we do two indexed queries (not one per item).
  const pendingEditMap = new Map<string, { id: string; type: "update" | "delete"; requestedBy: string; requestedByEmail: string }>();
  const pendingSplitMap = new Map<string, { id: string; requestedBy: string; requestedByEmail: string }>();
  if (!isSupplier) {
    const [pendingEditsSnap, pendingSplitsSnap] = await Promise.all([
      adminDb
        .collection("item_edit_requests")
        .where("poId", "==", params.poId)
        .where("status", "==", "pending")
        .get(),
      adminDb
        .collection("item_split_requests")
        .where("poId", "==", params.poId)
        .where("status", "==", "pending")
        .get(),
    ]);
    for (const d of pendingEditsSnap.docs) {
      const data = d.data();
      pendingEditMap.set(data.itemId as string, {
        id: d.id,
        type: data.type,
        requestedBy: data.requestedBy,
        requestedByEmail: data.requestedByEmail,
      });
    }
    for (const d of pendingSplitsSnap.docs) {
      const data = d.data();
      pendingSplitMap.set(data.itemId as string, {
        id: d.id,
        requestedBy: data.requestedBy,
        requestedByEmail: data.requestedByEmail,
      });
    }
  }

  // Sort items: by category then style then color then size
  const sortedItems = [...items].sort((a, b) =>
    a.category.localeCompare(b.category) ||
    a.style.localeCompare(b.style) ||
    a.color.localeCompare(b.color) ||
    a.size.localeCompare(b.size),
  );

  const hasAnyFabric = sortedItems.some((i) => i.category === "Fabric");

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
                {hasAnyFabric && <TableHead>Fabric details</TableHead>}
                <TableHead className="text-right">CBM</TableHead>
                <TableHead className="text-right">Packages</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedItems.map((item) => {
                const pendingEdit = pendingEditMap.get(item.id) ?? null;
                const pendingSplit = pendingSplitMap.get(item.id) ?? null;
                // Cast to read CR10 lineage fields off the item view without changing its interface
                const asItem = item as unknown as {
                  splitFromItemId?: string;
                  splitIndex?: number;
                  splitTotal?: number;
                  splitLabel?: string;
                };
                const isSplitChild = !!asItem.splitFromItemId;
                return (
                  <TableRow key={item.id}>
                    <TableCell><Badge variant="outline">{item.category}</Badge></TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm">
                      {item.style}
                      {isSplitChild && asItem.splitIndex && asItem.splitTotal && (
                        <div className="mt-0.5 flex items-center gap-1">
                          <Badge variant="outline" className="text-[10px]">
                            <Split className="mr-0.5 h-2.5 w-2.5" />
                            Lot {asItem.splitIndex}/{asItem.splitTotal}
                          </Badge>
                          {asItem.splitLabel && (
                            <span className="text-[10px] text-muted-foreground">· {asItem.splitLabel}</span>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{item.color}</TableCell>
                    <TableCell className="text-sm">{item.size}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatNumber(item.quantity)}</TableCell>
                    <TableCell className="text-xs">{item.unit}</TableCell>
                    {hasAnyFabric && (
                      <TableCell className="max-w-[260px] text-xs">
                        {item.category === "Fabric" ? (
                          <FabricDetailsCell
                            itemId={item.id}
                            composition={item.composition}
                            reference={item.reference}
                            shade={item.shade}
                            locks={item.fabricLocks}
                            canEdit={canEditFabric}
                          />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell className="text-right font-mono text-sm">{item.cbm.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{item.packageCount || "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <StatusCell status={item.status} />
                        {pendingEdit && (
                          <Badge variant="warning" className="gap-1 text-[10px]">
                            <Clock className="h-2.5 w-2.5" />
                            {pendingEdit.type === "delete" ? "Pending delete" : "Pending edit"}
                          </Badge>
                        )}
                        {pendingSplit && (
                          <Badge variant="warning" className="gap-1 text-[10px]">
                            <Clock className="h-2.5 w-2.5" />
                            Pending split
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <ItemActions
                        item={item}
                        canUpdateStatus={canUpdateStatus}
                        canUpdateCBM={canUpdateCBM}
                        isSupplier={isSupplier}
                        canEditDirect={canEditDirect}
                        canEditRequest={canEditRequest}
                        pendingRequest={pendingEdit}
                        canSplitDirect={canSplitDirect}
                        canSplitRequest={canSplitRequest}
                        pendingSplit={pendingSplit}
                        currentUserId={user.uid}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
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
    "Split": "secondary",   // CR10 — parent has been split, kept for history
  };
  return <Badge variant={map[status] ?? "default"}>{status}</Badge>;
}
