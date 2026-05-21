"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Ship, Calendar, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreateVesselDialog } from "@/components/vessels/create-vessel-dialog";
import { formatDate } from "@/lib/utils/format";
import type { VesselView } from "@/lib/utils/vessel-actions";

export function VesselsClient({
  vessels,
  canCreate,
}: {
  vessels: VesselView[];
  canCreate: boolean;
}) {
  const [createOpen, setCreateOpen] = useState(false);

  const statusVariant = (s: VesselView["status"]) =>
    s === "Planned" ? "secondary" :
    s === "Loading" ? "info" :
    s === "Sailed" ? "warning" :
    "success";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Vessels</h1>
          <p className="mt-1 text-muted-foreground">
            {vessels.length} vessel{vessels.length === 1 ? "" : "s"} tracked.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Create vessel
          </Button>
        )}
      </div>

      {vessels.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              <Ship className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">No vessels yet</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Create a vessel to start attaching sealed containers and tracking shipments.
            </p>
            {canCreate && (
              <Button className="mt-6" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> Create your first vessel
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vessel ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>ETD</TableHead>
                  <TableHead>ETA</TableHead>
                  <TableHead className="text-right">Containers</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vessels.map((v) => (
                  <TableRow key={v.id} className="cursor-pointer">
                    <TableCell>
                      <Link href={`/vessels/${v.id}`} className="font-mono font-medium hover:underline">{v.vesselId}</Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/vessels/${v.id}`} className="block text-sm">{v.vesselName || "—"}</Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/vessels/${v.id}`} className="block">
                        <div className="flex items-center gap-1 text-sm">
                          <MapPin className="h-3 w-3 text-muted-foreground" />
                          {v.destination}
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/vessels/${v.id}`} className="block">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {formatDate(v.etd)}
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/vessels/${v.id}`} className="block">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {formatDate(v.eta)}
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      <Link href={`/vessels/${v.id}`} className="block">{v.containerIds.length}</Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/vessels/${v.id}`} className="block">
                        <Badge variant={statusVariant(v.status)}>{v.status}</Badge>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <CreateVesselDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
