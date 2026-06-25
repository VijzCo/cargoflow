import { Badge } from "@/components/ui/badge";
import type { Role } from "@/types";

const CONFIG: Record<Role, { variant: "default" | "secondary" | "info" | "warning" | "success" | "destructive" | "outline"; label: string }> = {
  super_admin:      { variant: "destructive", label: "Super Admin" },
  merchant_manager: { variant: "default",     label: "Merchant Manager" },
  merchant:         { variant: "info",        label: "Merchant" },
  supplier:         { variant: "success",     label: "Supplier" },
  logistics:        { variant: "warning",     label: "Logistics" },
  viewer:           { variant: "secondary",   label: "Viewer" },
};

export function RoleBadge({ role }: { role: Role }) {
  const cfg = CONFIG[role] ?? { variant: "outline" as const, label: role };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}
