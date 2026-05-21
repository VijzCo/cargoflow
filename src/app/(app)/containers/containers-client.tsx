"use client";

import { useState, useMemo } from "react";
import { Plus, Sparkles, Container as ContainerIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ContainerCard, type ContainerCardData } from "@/components/containers/container-card";
import { CreateContainerDialog } from "@/components/containers/create-container-dialog";
import { AutoAllocateDialog } from "@/components/containers/auto-allocate-dialog";

const ALL = "_all";

export function ContainersClient({
  containers,
  canCreate,
  canAssign,
}: {
  containers: ContainerCardData[];
  canCreate: boolean;
  canAssign: boolean;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [typeFilter, setTypeFilter] = useState<string>(ALL);

  const filtered = useMemo(() => {
    return containers.filter((c) => {
      if (statusFilter !== ALL && c.status !== statusFilter) return false;
      if (typeFilter !== ALL && c.type !== typeFilter) return false;
      if (search.trim()) {
        const s = search.toLowerCase();
        if (!c.containerNumber.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [containers, statusFilter, typeFilter, search]);

  // Aggregate stats
  const stats = useMemo(() => {
    const open = containers.filter((c) => c.status === "Open").length;
    const sealed = containers.filter((c) => c.status === "Sealed").length;
    const shipped = containers.filter((c) => c.status === "Shipped").length;
    const totalCbm = containers.reduce((s, c) => s + c.loadedCbm, 0);
    const totalCap = containers.reduce((s, c) => s + c.usableCbm, 0);
    const avgUtil = totalCap > 0 ? totalCbm / totalCap : 0;
    return { open, sealed, shipped, avgUtil };
  }, [containers]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Containers</h1>
          <p className="mt-1 text-muted-foreground">
            {containers.length} container{containers.length === 1 ? "" : "s"} · {stats.open} open · {stats.sealed} sealed · {stats.shipped} shipped · avg utilization {(stats.avgUtil * 100).toFixed(0)}%
          </p>
        </div>
        <div className="flex gap-2">
          {canAssign && (
            <Button variant="outline" onClick={() => setAutoOpen(true)}>
              <Sparkles className="h-4 w-4" />
              Auto-allocate
            </Button>
          )}
          {canCreate && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Add container
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-2 p-3 sm:grid-cols-3">
          <Input
            placeholder="Search container #..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              <SelectItem value="Open">Open</SelectItem>
              <SelectItem value="Sealed">Sealed</SelectItem>
              <SelectItem value="Shipped">Shipped</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger><SelectValue placeholder="All types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All types</SelectItem>
              <SelectItem value="20FT">20FT</SelectItem>
              <SelectItem value="40FT">40FT</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              <ContainerIcon className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">No containers</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {containers.length === 0
                ? "Create your first container, or use Auto-allocate to let CargoFlow create them for you based on Completed items."
                : "No containers match your filters."}
            </p>
            {containers.length === 0 && canCreate && (
              <div className="mt-6 flex gap-2">
                <Button variant="outline" onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" /> Add container
                </Button>
                {canAssign && (
                  <Button onClick={() => setAutoOpen(true)}>
                    <Sparkles className="h-4 w-4" /> Auto-allocate
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => <ContainerCard key={c.id} container={c} />)}
        </div>
      )}

      <CreateContainerDialog open={createOpen} onOpenChange={setCreateOpen} />
      <AutoAllocateDialog open={autoOpen} onOpenChange={setAutoOpen} />
    </div>
  );
}
