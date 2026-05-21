"use client";

import { useState, useMemo } from "react";
import { Search, Clock, User, Activity } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { RoleBadge } from "@/components/admin/role-badge";
import { formatDate } from "@/lib/utils/format";
import type { ActivityLogView } from "@/lib/utils/activity-log-actions";

const ALL = "_all";

const ACTION_LABELS: Record<string, { label: string; variant: "secondary" | "info" | "warning" | "success" | "destructive" | "outline" | "default" }> = {
  "po.upload":              { label: "PO upload",            variant: "info" },
  "po.update":              { label: "PO update",            variant: "default" },
  "item.status_change":     { label: "Status change",        variant: "info" },
  "item.cbm_update":        { label: "CBM update",           variant: "info" },
  "container.create":       { label: "Container created",    variant: "default" },
  "container.assign":       { label: "Container assigned",   variant: "default" },
  "container.seal":         { label: "Container sealed",     variant: "warning" },
  "vessel.create":          { label: "Vessel created",       variant: "default" },
  "vessel.dispatch":        { label: "Vessel dispatched",    variant: "success" },
  "packing_list.generate":  { label: "Packing list",         variant: "info" },
  "user.create":            { label: "User created",         variant: "success" },
  "user.update":            { label: "User updated",         variant: "default" },
  "user.deactivate":        { label: "User deactivated",     variant: "destructive" },
  "settings.update":        { label: "Settings updated",     variant: "warning" },
};

export function ActivityClient({ initial }: { initial: ActivityLogView[] }) {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState(ALL);
  const [targetFilter, setTargetFilter] = useState(ALL);

  const uniqueActions = useMemo(() => Array.from(new Set(initial.map((l) => l.action))).sort(), [initial]);
  const uniqueTargets = useMemo(() => Array.from(new Set(initial.map((l) => l.targetType))).sort(), [initial]);

  const filtered = useMemo(() => {
    return initial.filter((l) => {
      if (actionFilter !== ALL && l.action !== actionFilter) return false;
      if (targetFilter !== ALL && l.targetType !== targetFilter) return false;
      if (search.trim()) {
        const s = search.toLowerCase();
        if (!(l.userEmail.toLowerCase().includes(s) ||
              l.action.toLowerCase().includes(s) ||
              l.targetType.toLowerCase().includes(s) ||
              l.targetId.toLowerCase().includes(s) ||
              JSON.stringify(l.details ?? {}).toLowerCase().includes(s))) {
          return false;
        }
      }
      return true;
    });
  }, [initial, actionFilter, targetFilter, search]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Activity log</h1>
        <p className="mt-1 text-muted-foreground">
          {initial.length} most recent activit{initial.length === 1 ? "y" : "ies"}.
        </p>
      </div>

      <Card>
        <CardContent className="grid gap-2 p-3 sm:grid-cols-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search user, action, details..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger><SelectValue placeholder="All actions" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All actions</SelectItem>
              {uniqueActions.map((a) => (
                <SelectItem key={a} value={a}>{ACTION_LABELS[a]?.label ?? a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={targetFilter} onValueChange={setTargetFilter}>
            <SelectTrigger><SelectValue placeholder="All targets" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All targets</SelectItem>
              {uniqueTargets.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-sm text-muted-foreground">
              <Activity className="mb-2 h-7 w-7" />
              {initial.length === 0 ? "No activity yet." : "No entries match your filters."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((l) => {
                  const cfg = ACTION_LABELS[l.action] ?? { label: l.action, variant: "outline" as const };
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(l.createdAt)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-3 w-3 text-muted-foreground" />
                          <div>
                            <div className="text-sm">{l.userEmail}</div>
                            <RoleBadge role={l.userRole} />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell><Badge variant={cfg.variant}>{cfg.label}</Badge></TableCell>
                      <TableCell className="text-xs">
                        <span className="text-muted-foreground">{l.targetType}</span>{" "}
                        <span className="font-mono">{l.targetId.slice(0, 12)}</span>
                      </TableCell>
                      <TableCell className="text-xs">
                        {l.details && Object.keys(l.details).length > 0 ? (
                          <details>
                            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                              {summarize(l.details)}
                            </summary>
                            <pre className="mt-1 overflow-x-auto rounded-md bg-muted p-2 text-[10px]">
                              {JSON.stringify(l.details, null, 2)}
                            </pre>
                          </details>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
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

function summarize(details: Record<string, unknown>): string {
  // Short human-readable summary of the most useful fields
  const interesting = ["pos", "items", "containers", "from", "to", "email", "role", "name", "containerNumber", "vesselId", "created", "skipped"];
  const parts: string[] = [];
  for (const k of interesting) {
    if (details[k] !== undefined) {
      const v = details[k];
      parts.push(`${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
      if (parts.length >= 3) break;
    }
  }
  return parts.length > 0 ? parts.join(" · ") : "Expand";
}
