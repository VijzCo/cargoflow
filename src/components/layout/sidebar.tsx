"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  LayoutDashboard, FileSpreadsheet, Factory, Container, Ship,
  Package, BarChart3, Users, Building2, Settings, History, Menu, X, ClipboardCheck,
} from "lucide-react";
import { cn } from "@/lib/utils/format";
import type { Role } from "@/types";
import { hasAnyPermission, type Permission } from "@/lib/rbac/permissions";
import { Button } from "@/components/ui/button";

interface NavItem {
  href: string;
  /** Key into the `nav` translation namespace */
  labelKey: "dashboard" | "purchaseOrders" | "production" | "containers" | "vessels" | "packingLists" | "reports" | "users" | "suppliers" | "activity" | "settings" | "admin" | "approvals";
  icon: React.ComponentType<{ className?: string }>;
  permissions: Permission[];
}

const NAV: NavItem[] = [
  { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard, permissions: [] },
  { href: "/purchase-orders", labelKey: "purchaseOrders", icon: FileSpreadsheet, permissions: ["purchase_orders.view"] },
  { href: "/production", labelKey: "production", icon: Factory, permissions: ["po_items.view"] },
  { href: "/containers", labelKey: "containers", icon: Container, permissions: ["containers.view"] },
  { href: "/vessels", labelKey: "vessels", icon: Ship, permissions: ["vessels.view"] },
  { href: "/packing-lists", labelKey: "packingLists", icon: Package, permissions: ["packing_lists.view"] },
  { href: "/reports", labelKey: "reports", icon: BarChart3, permissions: ["reports.view"] },
];

const ADMIN_NAV: NavItem[] = [
  { href: "/admin/approvals", labelKey: "approvals", icon: ClipboardCheck, permissions: ["po_items.edit_approve", "po_items.edit_request"] },
  { href: "/admin/users", labelKey: "users", icon: Users, permissions: ["users.view"] },
  { href: "/admin/suppliers", labelKey: "suppliers", icon: Building2, permissions: ["suppliers.view"] },
  { href: "/admin/activity", labelKey: "activity", icon: History, permissions: ["activity_logs.view"] },
  { href: "/admin/settings", labelKey: "settings", icon: Settings, permissions: ["settings.view"] },
];

export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const [mobileOpen, setMobileOpen] = useState(false);

  const visible = (items: NavItem[]) =>
    items.filter((i) => i.permissions.length === 0 || hasAnyPermission(role, i.permissions));

  const mainItems = visible(NAV);
  const adminItems = visible(ADMIN_NAV);

  return (
    <>
      {/* Mobile toggle */}
      <div className="fixed left-3 top-3 z-50 lg:hidden">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setMobileOpen((o) => !o)}
          aria-label="Toggle navigation"
        >
          {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </Button>
      </div>

      {/* Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 transform border-r bg-card transition-transform duration-200 ease-out lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center gap-2 border-b px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-navy to-brand-indigo text-white">
            <Ship className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <div className="font-bold tracking-tight">CargoFlow</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Logistics Platform
            </div>
          </div>
        </div>

        <nav className="scrollbar-thin h-[calc(100vh-4rem)] overflow-y-auto px-3 py-4">
          <div className="space-y-0.5">
            {mainItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {t(item.labelKey)}
                </Link>
              );
            })}
          </div>

          {adminItems.length > 0 && (
            <>
              <div className="mt-6 px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t("admin")}
              </div>
              <div className="space-y-0.5">
                {adminItems.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(item.href + "/");
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {t(item.labelKey)}
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </nav>
      </aside>
    </>
  );
}
