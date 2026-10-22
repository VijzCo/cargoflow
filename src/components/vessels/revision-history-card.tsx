"use client";

import { useState } from "react";
import { History, ChevronDown, ChevronRight, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface RevisionView {
  id: string;
  revisedAt: string | null;         // ISO string (serialized server-side)
  revisedBy: string;
  revisedByEmail: string;
  revisedByName?: string;
  field: "etd" | "eta" | "both";
  previousEtd?: string;
  newEtd?: string;
  previousEta?: string;
  newEta?: string;
  reason?: string;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: "numeric", month: "short", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function RevisionHistoryCard({ revisions }: { revisions: RevisionView[] }) {
  const [expanded, setExpanded] = useState(true);

  // Newest first
  const sorted = [...revisions].sort((a, b) =>
    (b.revisedAt ?? "").localeCompare(a.revisedAt ?? ""),
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4 text-muted-foreground" />
              Revision history
              <Badge variant="outline" className="ml-1 text-[10px]">
                {sorted.length} {sorted.length === 1 ? "entry" : "entries"}
              </Badge>
            </CardTitle>
            <CardDescription>Every ETD / ETA change on this vessel, newest first.</CardDescription>
          </div>
          <Button
            variant="ghost" size="sm"
            onClick={() => setExpanded((e) => !e)}
            className="shrink-0"
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            {expanded ? "Hide" : "Show"}
          </Button>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0">
          {sorted.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No revisions yet. The first revision will appear here.
            </p>
          ) : (
            <ol className="space-y-3">
              {sorted.map((r) => (
                <li key={r.id} className="rounded-md border bg-muted/30 p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {r.field === "both" ? "ETD + ETA" : r.field.toUpperCase()}
                    </Badge>
                    <span className="font-medium">{r.revisedByName || r.revisedByEmail}</span>
                    <span className="text-muted-foreground">· {formatDateTime(r.revisedAt)}</span>
                  </div>

                  <div className="mt-2 space-y-1 text-xs">
                    {(r.field === "etd" || r.field === "both") && (
                      <DiffLine
                        label="ETD"
                        from={r.previousEtd}
                        to={r.newEtd}
                      />
                    )}
                    {(r.field === "eta" || r.field === "both") && (
                      <DiffLine
                        label="ETA"
                        from={r.previousEta}
                        to={r.newEta}
                      />
                    )}
                  </div>

                  {r.reason && (
                    <div className="mt-2 border-l-2 border-muted-foreground/20 pl-2 text-xs italic text-muted-foreground">
                      “{r.reason}”
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function DiffLine({ label, from, to }: { label: string; from?: string; to?: string }) {
  return (
    <div className="flex items-center gap-2 font-mono">
      <span className="w-10 text-muted-foreground">{label}:</span>
      <span className="text-muted-foreground">{from || "—"}</span>
      <ArrowRight className="h-3 w-3 text-muted-foreground" />
      <span className="font-semibold">{to || "—"}</span>
    </div>
  );
}
