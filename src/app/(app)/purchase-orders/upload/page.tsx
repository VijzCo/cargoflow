"use client";

import { useState, useEffect } from "react";
import { redirect } from "next/navigation";
import { FileUploadCard } from "@/components/po/file-upload";
import { PreviewTable } from "@/components/po/preview-table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/components/auth/auth-provider";
import { hasPermission } from "@/lib/rbac/permissions";
import type { ParseResult } from "@/lib/poParser";

export default function UploadPage() {
  const { role, loading: authLoading } = useAuth();
  const [parsed, setParsed] = useState<{ result: ParseResult; filename: string } | null>(null);
  const [channels, setChannels] = useState<string[]>([]);

  // Load active sales channels (small list, one read)
  useEffect(() => {
    getDocs(query(collection(db, "sales_channels"), where("active", "==", true)))
      .then((snap) => {
        setChannels(snap.docs.map((d) => d.data().name as string).filter(Boolean));
      })
      .catch(() => {
        // Fall back to defaults if read fails
        setChannels(["Amazon", "Walmart", "Retail", "Wholesale", "Shopify", "TikTok Shop"]);
      });
  }, []);

  if (authLoading) return null;
  if (!hasPermission(role, "purchase_orders.upload")) {
    redirect("/dashboard");
  }

  if (!parsed) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Upload purchase order</h1>
          <p className="mt-1 text-muted-foreground">
            Upload an Excel PO file. CargoFlow parses it in your browser — the file never leaves your computer.
          </p>
        </div>

        <FileUploadCard onParsed={(result, filename) => setParsed({ result, filename })} />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Supported formats</CardTitle>
            <CardDescription>
              CargoFlow auto-detects two layouts.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
            <div className="rounded-md border p-4">
              <p className="font-medium">CargoFlow template (recommended)</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Clean column-based layout. Sheet named &quot;PO&quot;. Download the template from the
                file you received with this app.
              </p>
            </div>
            <div className="rounded-md border p-4">
              <p className="font-medium">Legacy letterhead format</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Free-form letterhead with embedded style/PO/color rows. Supplier is auto-detected
                from the letterhead.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <PreviewTable
      parseResult={parsed.result}
      filename={parsed.filename}
      availableChannels={channels}
    />
  );
}
