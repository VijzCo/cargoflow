"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPackingListDetail } from "@/lib/utils/packing-list-actions";
import { downloadPackingListPDF } from "@/lib/utils/pdf-generator";

export function PDFDownloadButton({
  packingListId,
  size = "default",
  variant = "outline",
  label = "Download PDF",
}: {
  packingListId: string;
  size?: "default" | "sm" | "icon";
  variant?: "default" | "outline" | "ghost";
  label?: string;
}) {
  const [working, startWork] = useTransition();

  function handleDownload(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    startWork(async () => {
      try {
        const detail = await getPackingListDetail(packingListId);
        downloadPackingListPDF(detail);
        toast.success("PDF downloaded.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to generate PDF.");
      }
    });
  }

  return (
    <Button size={size} variant={variant} onClick={handleDownload} disabled={working}>
      {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      {size !== "icon" && label}
    </Button>
  );
}
