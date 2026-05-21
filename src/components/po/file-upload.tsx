"use client";

import { useState, useCallback } from "react";
import { Upload, FileSpreadsheet, AlertCircle, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { parsePOFile, type ParseResult } from "@/lib/poParser";
import { cn } from "@/lib/utils/format";

export function FileUploadCard({
  onParsed,
}: {
  onParsed: (result: ParseResult, filename: string) => void;
}) {
  const [dragActive, setDragActive] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      if (!/\.(xlsx|xls)$/i.test(file.name)) {
        setError("Please upload an Excel file (.xlsx or .xls).");
        return;
      }
      setParsing(true);
      try {
        const buffer = await file.arrayBuffer();
        const result = parsePOFile(buffer);
        if (result.items.length === 0 && result.errors.length === 0) {
          setError("No items found in this file. Make sure you're using the CargoFlow template or a supported PO format.");
          return;
        }
        onParsed(result, file.name);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to parse file.");
      } finally {
        setParsing(false);
      }
    },
    [onParsed],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  return (
    <Card>
      <CardContent className="p-0">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={onDrop}
          className={cn(
            "flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors",
            dragActive ? "border-primary bg-primary/5" : "border-muted",
          )}
        >
          {parsing ? (
            <>
              <Loader2 className="mb-4 h-10 w-10 animate-spin text-primary" />
              <p className="text-sm font-medium">Parsing your file...</p>
              <p className="mt-1 text-xs text-muted-foreground">Reading Excel structure, extracting items, detecting categories.</p>
            </>
          ) : (
            <>
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-navy to-brand-indigo text-white shadow-lg">
                <Upload className="h-6 w-6" />
              </div>
              <p className="text-base font-medium">Drop your PO Excel file here</p>
              <p className="mt-1 text-sm text-muted-foreground">or click to browse</p>
              <label className="mt-4 cursor-pointer">
                <Button asChild type="button" variant="outline">
                  <span>
                    <FileSpreadsheet className="h-4 w-4" />
                    Choose file
                  </span>
                </Button>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                    e.target.value = ""; // allow re-upload of same file
                  }}
                />
              </label>
              <p className="mt-4 text-xs text-muted-foreground">
                Supports the CargoFlow template and legacy letterhead PO formats.
              </p>
            </>
          )}
        </div>

        {error && (
          <div className="m-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
