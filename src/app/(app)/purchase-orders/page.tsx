import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Upload, FileSpreadsheet } from "lucide-react";
import { getSessionUser } from "@/lib/rbac/session";
import { hasPermission } from "@/lib/rbac/permissions";
import { listPOs } from "@/lib/utils/upload-actions";
import { getSettings } from "@/lib/utils/admin-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { POListClient } from "./po-list-client";

export default async function PurchaseOrdersPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "purchase_orders.view")) redirect("/dashboard");

  const [pos, settings] = await Promise.all([listPOs(), getSettings()]);
  const canUpload = hasPermission(user.role, "purchase_orders.upload");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Purchase orders</h1>
          <p className="mt-1 text-muted-foreground">
            {pos.length} PO{pos.length === 1 ? "" : "s"} in the system.
          </p>
        </div>
        {canUpload && (
          <Button asChild>
            <Link href="/purchase-orders/upload">
              <Upload className="h-4 w-4" />
              Upload PO
            </Link>
          </Button>
        )}
      </div>

      {pos.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              <FileSpreadsheet className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">No purchase orders yet</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {canUpload
                ? "Upload your first PO Excel file to get started. CargoFlow will parse it and let you preview before saving."
                : "POs will appear here once a merchant uploads them."}
            </p>
            {canUpload && (
              <Button asChild className="mt-6">
                <Link href="/purchase-orders/upload">
                  <Plus className="h-4 w-4" />
                  Upload your first PO
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <POListClient pos={pos} channels={settings.salesChannels} />
      )}
    </div>
  );
}
