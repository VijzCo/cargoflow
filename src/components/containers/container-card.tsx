import Link from "next/link";
import { Container as ContainerIcon, Ship, Lock, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/format";

export type ContainerCardData = {
  id: string;
  containerNumber: string;
  type: "20FT" | "40FT";
  capacityCbm: number;
  usableCbm: number;
  loadedCbm: number;
  utilization: number;
  status: "Open" | "Sealed" | "Shipped";
  vesselId?: string;
  itemCount: number;
  supplierCount: number;
};

export function ContainerCard({ container }: { container: ContainerCardData }) {
  const pct = Math.min(100, Math.round(container.utilization * 100));
  const remaining = Math.max(0, container.usableCbm - container.loadedCbm);

  const statusVariant =
    container.status === "Open" ? "info" :
    container.status === "Sealed" ? "warning" :
    "secondary";

  const barColor =
    pct >= 95 ? "bg-rose-500" :
    pct >= 80 ? "bg-emerald-500" :
    pct >= 50 ? "bg-cyan-500" :
    "bg-indigo-500";

  return (
    <Link href={`/containers/${container.id}`} className="block transition-transform hover:scale-[1.01]">
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <ContainerIcon className="h-4 w-4 text-muted-foreground" />
                <span className="font-mono font-medium">{container.containerNumber}</span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{container.type}</Badge>
                <span>{container.itemCount} item{container.itemCount === 1 ? "" : "s"}</span>
                {container.supplierCount > 0 && (
                  <span>· {container.supplierCount} supplier{container.supplierCount === 1 ? "" : "s"}</span>
                )}
              </div>
            </div>
            <Badge variant={statusVariant} className="gap-1">
              {container.status === "Open" && <Check className="h-3 w-3" />}
              {container.status === "Sealed" && <Lock className="h-3 w-3" />}
              {container.status === "Shipped" && <Ship className="h-3 w-3" />}
              {container.status}
            </Badge>
          </div>

          <div className="space-y-1">
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-muted-foreground">CBM utilization</span>
              <span className="font-mono">
                <span className="font-medium">{container.loadedCbm.toFixed(2)}</span>
                <span className="text-muted-foreground"> / {container.usableCbm.toFixed(2)}</span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full transition-all", barColor)}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex items-baseline justify-between text-xs text-muted-foreground">
              <span>{pct}% full</span>
              <span>{remaining.toFixed(2)} CBM free</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
