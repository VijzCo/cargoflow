import type { Timestamp } from "firebase/firestore";

// =============================================================================
// Roles & Permissions
// =============================================================================

export type Role = "super_admin" | "merchant" | "supplier" | "logistics" | "viewer";

export const ROLES: Record<Role, { label: string; description: string }> = {
  super_admin: { label: "Super Admin", description: "Full access to all modules and settings." },
  merchant: { label: "Merchant", description: "Upload POs, manage vessels & packing lists." },
  supplier: { label: "Supplier", description: "View and update only assigned items." },
  logistics: { label: "Logistics", description: "Container loading & packing validation." },
  viewer: { label: "Viewer", description: "Read-only access to dashboards." },
};

// =============================================================================
// Users
// =============================================================================

export interface UserDoc {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  active: boolean;
  supplierId?: string;            // required when role === "supplier"
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  createdBy: string;              // uid of admin who created the user
  lastLoginAt?: Timestamp | null;
}

// =============================================================================
// Suppliers
// =============================================================================

export interface SupplierDoc {
  id: string;
  name: string;                   // company name as it appears on POs
  aliases: string[];              // alternate spellings for fuzzy matching
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  country?: string;
  active: boolean;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

// =============================================================================
// Merchants (customer entities — for filtering / branding)
// =============================================================================

export interface MerchantDoc {
  id: string;
  name: string;
  active: boolean;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

// =============================================================================
// Purchase Orders & PO Items
// =============================================================================

export type Category = "Fabric" | "Trims" | "Accessories" | "Packaging" | "Garments" | "Others";

export type POItemStatus =
  | "Pending"
  | "Started"
  | "In Progress"
  | "Completed"
  | "Loaded"
  | "Shipped";

export interface PurchaseOrderDoc {
  id: string;
  poNumber: string;               // primary PO number (first in poNumbers list)
  poNumbers: string[];            // full list (supports multi-PO comma entries)
  supplierId: string;
  supplierName: string;           // denormalized for read-side display
  orderNo?: string;
  salesChannel?: string;
  totalItems: number;
  totalQuantity: number;
  totalCbm: number;
  uploadedBy: string;
  uploadedAt: Timestamp | null;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface POItemDoc {
  id: string;
  poId: string;                   // parent PurchaseOrderDoc.id
  poNumbers: string[];
  supplierId: string;
  supplierName: string;
  style: string;
  color: string;
  size: string;
  quantity: number;
  unit: string;
  unitPrice?: number;
  category: Category;
  description?: string;
  deliveryDate?: string;          // ISO yyyy-mm-dd
  salesChannel?: string;
  remarks?: string;
  uniqueKey: string;              // PO|STYLE|COLOR|SIZE, uppercased

  // Supplier-updatable fields
  status: POItemStatus;
  cbm: number;                    // CBM declared by supplier
  packageCount: number;           // rolls / boxes
  grossWeight?: number;
  netWeight?: number;
  supplierRemarks?: string;

  // Container & shipping refs (assigned by merchant)
  containerId?: string;
  vesselId?: string;
  packingListId?: string;

  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  updatedBy?: string;
}

// =============================================================================
// Containers & Vessels
// =============================================================================

export type ContainerType = "20FT" | "40FT";

export const CONTAINER_CAPACITY: Record<ContainerType, number> = {
  "20FT": 27,
  "40FT": 65,
};

export interface ContainerDoc {
  id: string;
  containerNumber: string;        // physical container # e.g. MSCU1234567
  type: ContainerType;
  capacityCbm: number;            // nominal capacity
  usableCbm: number;              // capacityCbm * settings.usablePercent
  loadedCbm: number;              // sum of assigned items
  utilization: number;            // loadedCbm / usableCbm (0-1)
  vesselId?: string;
  supplierIds: string[];          // for RBAC reads
  itemIds: string[];              // denormalized item list
  status: "Open" | "Sealed" | "Shipped";
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface VesselDoc {
  id: string;
  vesselId: string;               // human-readable vessel ID
  vesselName?: string;
  shipmentDate?: string;          // ISO
  etd?: string;                   // estimated time of departure
  eta?: string;                   // estimated time of arrival
  destination: string;
  containerIds: string[];
  supplierIds: string[];
  status: "Planned" | "Loading" | "Sailed" | "Delivered";
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

// =============================================================================
// Packing Lists
// =============================================================================

export interface PackingListDoc {
  id: string;
  packingListNumber: string;      // PL-{VesselID}-{ContainerNo}
  vesselId: string;
  containerId: string;
  containerNumber: string;
  supplierId: string;
  supplierName: string;
  itemIds: string[];
  totalQuantity: number;
  totalCartons: number;
  totalCbm: number;
  totalGrossWeight: number;
  totalNetWeight: number;
  destination: string;
  salesChannel?: string;
  generatedBy: string;
  generatedAt: Timestamp | null;
  createdAt: Timestamp | null;
}

// =============================================================================
// Notifications
// =============================================================================

export type NotificationKind =
  | "production_completed"
  | "container_full"
  | "packing_list_generated"
  | "shipment_dispatched"
  | "po_uploaded"
  | "po_assigned";

export interface NotificationDoc {
  id: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  read: boolean;
  link?: string;
  createdAt: Timestamp | null;
}

// =============================================================================
// Sales Channels (admin-editable)
// =============================================================================

export interface SalesChannelDoc {
  id: string;
  name: string;
  active: boolean;
  createdAt: Timestamp | null;
}

// =============================================================================
// Settings (singleton at settings/global)
// =============================================================================

export interface SettingsDoc {
  id: "global";
  companyName: string;
  systemTitle: string;
  logoUrl?: string;
  themePrimary?: string;          // hex
  themeAccent?: string;
  containerUsablePercent: number; // e.g. 0.92 → 92% of nominal CBM is usable
  categoryKeywords: Record<Category, string[]>;
  updatedAt: Timestamp | null;
  updatedBy: string;
}

// =============================================================================
// Activity Log (audit trail)
// =============================================================================

export type ActivityAction =
  | "user.create" | "user.update" | "user.deactivate" | "user.activate"
  | "po.upload" | "po.update" | "po.delete"
  | "item.status_change" | "item.cbm_update"
  | "container.create" | "container.assign" | "container.seal"
  | "vessel.create" | "vessel.dispatch"
  | "packing_list.generate"
  | "settings.update";

export interface ActivityLogDoc {
  id: string;
  userId: string;
  userEmail: string;
  userRole: Role;
  action: ActivityAction;
  targetType: string;
  targetId: string;
  details?: Record<string, unknown>;
  createdAt: Timestamp | null;
}
