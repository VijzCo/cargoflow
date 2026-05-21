import type { Role } from "@/types";

// =============================================================================
// CargoFlow Permission Map
// =============================================================================
// One place defines what every role can do. Both UI (menu visibility) and
// server-side checks read from here.
//
// Permission naming: <module>.<action>
//   modules:  users, suppliers, purchase_orders, po_items, containers,
//             vessels, packing_lists, reports, settings, activity_logs
//   actions:  view, create, update, delete, export
// =============================================================================

export type Permission =
  // Users
  | "users.view" | "users.create" | "users.update" | "users.deactivate"
  // Suppliers
  | "suppliers.view" | "suppliers.create" | "suppliers.update" | "suppliers.delete"
  // Purchase orders
  | "purchase_orders.view" | "purchase_orders.upload" | "purchase_orders.update" | "purchase_orders.delete"
  // PO items
  | "po_items.view" | "po_items.update_status" | "po_items.update_cbm" | "po_items.assign_container"
  // Containers
  | "containers.view" | "containers.create" | "containers.assign" | "containers.seal"
  // Vessels
  | "vessels.view" | "vessels.create" | "vessels.update" | "vessels.dispatch"
  // Packing lists
  | "packing_lists.view" | "packing_lists.generate" | "packing_lists.export"
  // Reports
  | "reports.view" | "reports.export"
  // Settings
  | "settings.view" | "settings.update"
  // Audit
  | "activity_logs.view";

const ALL: Permission[] = [
  "users.view", "users.create", "users.update", "users.deactivate",
  "suppliers.view", "suppliers.create", "suppliers.update", "suppliers.delete",
  "purchase_orders.view", "purchase_orders.upload", "purchase_orders.update", "purchase_orders.delete",
  "po_items.view", "po_items.update_status", "po_items.update_cbm", "po_items.assign_container",
  "containers.view", "containers.create", "containers.assign", "containers.seal",
  "vessels.view", "vessels.create", "vessels.update", "vessels.dispatch",
  "packing_lists.view", "packing_lists.generate", "packing_lists.export",
  "reports.view", "reports.export",
  "settings.view", "settings.update",
  "activity_logs.view",
];

export const PERMISSIONS_BY_ROLE: Record<Role, Permission[]> = {
  super_admin: ALL,

  merchant: [
    "users.view",
    "suppliers.view", "suppliers.create", "suppliers.update",
    "purchase_orders.view", "purchase_orders.upload", "purchase_orders.update",
    "po_items.view", "po_items.assign_container",
    "containers.view", "containers.create", "containers.assign", "containers.seal",
    "vessels.view", "vessels.create", "vessels.update", "vessels.dispatch",
    "packing_lists.view", "packing_lists.generate", "packing_lists.export",
    "reports.view", "reports.export",
    "settings.view",
  ],

  supplier: [
    "purchase_orders.view",     // limited to their own items via Firestore rules
    "po_items.view",
    "po_items.update_status",
    "po_items.update_cbm",
    "containers.view",
    "vessels.view",
    "packing_lists.view",
  ],

  logistics: [
    "suppliers.view",
    "purchase_orders.view",
    "po_items.view", "po_items.assign_container",
    "containers.view", "containers.create", "containers.assign", "containers.seal",
    "vessels.view", "vessels.update",
    "packing_lists.view", "packing_lists.generate", "packing_lists.export",
    "reports.view",
  ],

  viewer: [
    "suppliers.view",
    "purchase_orders.view",
    "po_items.view",
    "containers.view",
    "vessels.view",
    "packing_lists.view",
    "reports.view",
  ],
};

export function hasPermission(role: Role | undefined, perm: Permission): boolean {
  if (!role) return false;
  return PERMISSIONS_BY_ROLE[role]?.includes(perm) ?? false;
}

export function hasAnyPermission(role: Role | undefined, perms: Permission[]): boolean {
  return perms.some((p) => hasPermission(role, p));
}
