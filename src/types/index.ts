import type { Timestamp } from "firebase/firestore";

// =============================================================================
// Roles & Permissions
// =============================================================================

export type Role = "super_admin" | "merchant_manager" | "merchant" | "supplier" | "logistics" | "viewer";

export const ROLES: Record<Role, { label: string; description: string }> = {
  super_admin: { label: "Super Admin", description: "Full access to all modules and settings." },
  merchant_manager: { label: "Merchant Manager", description: "Manages merchants and approves item edit requests." },
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
  supplierId?: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  createdBy: string;
  lastLoginAt?: Timestamp | null;
}

// =============================================================================
// Suppliers
// =============================================================================

export interface SupplierDoc {
  id: string;
  name: string;
  aliases: string[];
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
// Merchants
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
  | "Shipped"
  | "Split";               // CR10 — parent kept for history

export interface PurchaseOrderDoc {
  id: string;
  poNumber: string;
  poNumbers: string[];
  supplierId: string;
  supplierName: string;
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
  poId: string;
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
  deliveryDate?: string;
  salesChannel?: string;
  remarks?: string;
  uniqueKey: string;

  // Fabric details (locked once set)
  composition?: string;
  reference?: string;
  shade?: string;
  fabricLocks?: {
    composition?: boolean;
    reference?: boolean;
    shade?: boolean;
  };

  // Supplier-updatable fields
  status: POItemStatus;
  cbm: number;
  packageCount: number;
  grossWeight?: number;
  netWeight?: number;
  supplierRemarks?: string;

  // Container & shipping refs
  containerId?: string;
  vesselId?: string;
  packingListId?: string;

  // CR10 — split lineage
  splitFromItemId?: string;
  splitGroupId?: string;
  splitIndex?: number;
  splitTotal?: number;
  splitLabel?: string;
  splitChildIds?: string[];
  splitAt?: Timestamp | null;
  splitBy?: string;

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
  containerNumber: string;
  carrierNumber?: string;
  type: ContainerType;
  capacityCbm: number;
  usableCbm: number;
  loadedCbm: number;
  utilization: number;
  vesselId?: string;
  supplierIds: string[];
  itemIds: string[];
  status: "Open" | "Sealed" | "Shipped";
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export type VesselStatus = "Planned" | "Loading" | "Sailed" | "Delivered";

/** CR11 — one entry per ETD/ETA revision. Immutable; appended to vessel.revisions. */
export interface VesselDateRevision {
  id: string;
  revisedAt: Timestamp | null;
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

export interface VesselDoc {
  id: string;
  vesselId: string;
  vesselName?: string;
  shipmentDate?: string;
  etd?: string;
  eta?: string;
  destination: string;
  containerIds: string[];
  supplierIds: string[];
  status: VesselStatus;

  // CR11 — audit trail of ETD/ETA revisions. Appended, never pruned.
  revisions?: VesselDateRevision[];

  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

// =============================================================================
// Packing Lists
// =============================================================================

export interface PackingListDoc {
  id: string;
  packingListNumber: string;
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
// Sales Channels
// =============================================================================

export interface SalesChannelDoc {
  id: string;
  name: string;
  active: boolean;
  createdAt: Timestamp | null;
}

// =============================================================================
// Settings
// =============================================================================

export interface SettingsDoc {
  id: "global";
  companyName: string;
  systemTitle: string;
  logoUrl?: string;
  themePrimary?: string;
  themeAccent?: string;
  containerUsablePercent: number;
  categoryKeywords: Record<Category, string[]>;
  updatedAt: Timestamp | null;
  updatedBy: string;
}

// =============================================================================
// Activity Log
// =============================================================================

export type ActivityAction =
  | "user.create" | "user.update" | "user.deactivate" | "user.activate"
  | "po.upload" | "po.update" | "po.delete"
  | "item.status_change" | "item.cbm_update"
  | "container.create" | "container.assign" | "container.seal" | "container.rename"
  | "vessel.create" | "vessel.dispatch"
  | "vessel.dates_revised"              // CR11
  | "packing_list.generate"
  | "settings.update"
  | "item.fabric_update"
  | "item.direct_edit"                  // CR9
  | "item.direct_delete"
  | "item.edit_requested"
  | "item.delete_requested"
  | "item.request_approved"
  | "item.request_rejected"
  | "item.request_cancelled"
  // CR10 — split workflow
  | "item.split_requested"
  | "item.split_approved"
  | "item.split_rejected"
  | "item.split_cancelled"
  | "item.split_applied_direct";

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

// =============================================================================
// Item edit requests (CR9)
// =============================================================================

export type EditRequestType = "update" | "delete";
export type EditRequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export type ItemEditableField =
  | "poNumbers" | "style" | "color" | "size" | "quantity" | "unit" | "unitPrice"
  | "category" | "description" | "deliveryDate" | "salesChannel" | "remarks";

export interface ItemEditRequestDoc {
  id: string;
  itemId: string;
  poId: string;
  supplierId: string;
  type: EditRequestType;
  status: EditRequestStatus;

  proposedChanges?: Partial<Record<ItemEditableField, unknown>>;
  previousValues?: Partial<Record<ItemEditableField, unknown>>;

  reason?: string;

  requestedBy: string;
  requestedByEmail: string;
  requestedAt: Timestamp | null;

  resolvedBy?: string;
  resolvedByEmail?: string;
  resolvedAt?: Timestamp | null;
  resolverNote?: string;
}

// =============================================================================
// Item split requests (CR10 — partial-shipment splits)
// =============================================================================

export type SplitReasonCategory =
  | "supplier_capacity"
  | "customer_early_lot"
  | "logistics_constraint"
  | "other";

export interface SplitChildInput {
  quantity: number;
  deliveryDate?: string;
  label?: string;
}

export interface SplitPlan {
  children: SplitChildInput[];
  reasonCategory: SplitReasonCategory;
  reasonText?: string;
}

export interface ItemSplitRequestDoc {
  id: string;
  itemId: string;
  poId: string;
  supplierId: string;
  status: EditRequestStatus;

  plan: SplitPlan;
  parentSnapshot: {
    style: string;
    color: string;
    size: string;
    quantity: number;
    unit: string;
    deliveryDate?: string;
  };

  requestedBy: string;
  requestedByEmail: string;
  requestedAt: Timestamp | null;

  resolvedBy?: string;
  resolvedByEmail?: string;
  resolvedAt?: Timestamp | null;
  resolverNote?: string;

  createdChildIds?: string[];
}