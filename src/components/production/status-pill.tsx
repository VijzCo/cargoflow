import { Clock, Play, Loader2, CheckCircle2, Package, Ship } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { POItemStatus } from "@/types";

const CONFIG: Record<POItemStatus, { variant: "secondary" | "info" | "warning" | "success" | "default"; icon: React.ComponentType<{ className?: string }> }> = {
  "Pending":     { variant: "secondary", icon: Clock },
  "Started":     { variant: "info",      icon: Play },
  "In Progress": { variant: "warning",   icon: Loader2 },
  "Completed":   { variant: "success",   icon: CheckCircle2 },
  "Loaded":      { variant: "default",   icon: Package },
  "Shipped":     { variant: "default",   icon: Ship },
};

export function StatusPill({ status }: { status: POItemStatus }) {
  const { variant, icon: Icon } = CONFIG[status];
  return (
    <Badge variant={variant} className="gap-1">
      <Icon className={`h-3 w-3 ${status === "In Progress" ? "animate-spin" : ""}`} />
      {status}
    </Badge>
  );
}
