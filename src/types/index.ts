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
  | "Shipped"
  | "Split";               // CR10 — parent has been split into children; no longer active

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

  // Fabric-only details (only meaningful when category === "Fabric").
  // Once a non-empty value is set (via upload or merchant edit), it is locked.
  composition?: string;
  reference?: string;
  shade?: string;
  // Locked flag per field — once true, the field is read-only forever.
  // We DON'T re-derive lock state from "is value present" because we want
  // upload-from-Excel-with-value behavior (locked) to be the same as
  // "merchant set this via dialog" (locked).
  fabricLocks?: {
    composition?: boolean;
    reference?: boolean;
    shade?: boolean;
  };

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

  // CR10 — split lineage. When present, this item is either a parent that
  // has been split (status === "Split") or a child produced by a split.
  splitFromItemId?: string;       // parent item's id (children only)
  splitGroupId?: string;          // shared across all siblings (children)
  splitIndex?: number;            // 1-based position among siblings (children)
  splitTotal?: number;            // total siblings in the group (children)
  splitLabel?: string;            // optional human-readable label (e.g. "Sampling batch")
  splitChildIds?: string[];       // parent only: ids of the child items produced
  splitAt?: Timestamp | null;     // when the split was applied
  splitBy?: string;               // uid of user who applied the split

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
  containerNumber: string;        // System identifier — used in URLs, audit logs, and as a fallback display name.
                                  // Auto-generated when not supplied at creation (e.g. CTR-2026-04-001).
  carrierNumber?: string;         // The real physical carrier-issued ID (e.g. MSCU1234567).
                                  // Editable while status === "Open", locked once sealed.
                                  // Displayed everywhere if set; falls back to containerNumber when empty.
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
  | "container.create" | "container.assign" | "container.seal" | "container.rename"
  | "vessel.create" | "vessel.dispatch"
  | "packing_list.generate"
  | "settings.update"
  | "item.fabric_update"
  | "item.direct_edit"           // edited directly by super_admin or merchant_manager
  | "item.direct_delete"         // deleted directly
  | "item.edit_requested"        // merchant submitted an edit request
  | "item.delete_requested"      // merchant submitted a delete request
  | "item.request_approved"      // approver approved
  | "item.request_rejected"      // approver rejected
  | "item.request_cancelled"     // merchant cancelled their own pending request
  // CR10 — split workflow
  | "item.split_requested"       // merchant submitted a split request
  | "item.split_approved"        // approver approved a split request (and applied it)
  | "item.split_rejected"        // approver rejected a split request
  | "item.split_cancelled"       // merchant cancelled their own pending split request
  | "item.split_applied_direct"; // manager/admin split directly without approval

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
// Item edit requests (approval workflow)
// =============================================================================

export type EditRequestType = "update" | "delete";
export type EditRequestStatus = "pending" | "approved" | "rejected" | "cancelled";

/** Fields editable through this workflow. Keys map directly onto POItemDoc fields. */
export type ItemEditableField =
  | "poNumbers" | "style" | "color" | "size" | "quantity" | "unit" | "unitPrice"
  | "category" | "description" | "deliveryDate" | "salesChannel" | "remarks";

export interface ItemEditRequestDoc {
  id: string;
  itemId: string;
  poId: string;
  supplierId: string;             // copied at request time for RBAC isolation
  type: EditRequestType;
  status: EditRequestStatus;

  // For "update" requests:
  // proposedChanges holds ONLY the fields the requester wants to change,
  // with their new values. previousValues is the snapshot for diffing.
  proposedChanges?: Partial<Record<ItemEditableField, unknown>>;
  previousValues?: Partial<Record<ItemEditableField, unknown>>;

  reason?: string;                // optional justification from the requester

  requestedBy: string;            // uid
  requestedByEmail: string;
  requestedAt: Timestamp | null;

  // Set when status leaves "pending"
  resolvedBy?: string;            // uid of approver/rejector
  resolvedByEmail?: string;
  resolvedAt?: Timestamp | null;
  resolverNote?: string;          // approver/rejector comment
}

// =============================================================================
// Item split requests (CR10 — partial-shipment splits, approval workflow)
// =============================================================================

/** Predefined reason categories for a split, for reporting / analytics. */
export type SplitReasonCategory =
  | "supplier_capacity"
  | "customer_early_lot"
  | "logistics_constraint"
  | "other";

/** Definition of a single child produced by a split. */
export interface SplitChildInput {
  quantity: number;
  deliveryDate?: string;          // ISO yyyy-mm-dd; defaults to parent's date
  label?: string;                 // optional short label like "Sampling batch"
}

/** Snapshot of a fully-planned split (used inside a request or by direct apply). */
export interface SplitPlan {
  children: SplitChildInput[];
  reasonCategory: SplitReasonCategory;
  reasonText?: string;
}

export interface ItemSplitRequestDoc {
  id: string;
  itemId: string;                 // parent POItemDoc.id
  poId: string;
  supplierId: string;             // copied at request time for RBAC isolation
  status: EditRequestStatus;      // reuse the same lifecycle: pending / approved / rejected / cancelled

  plan: SplitPlan;                // the proposed split
  parentSnapshot: {               // captured at request time for audit / diffing
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

  // Populated after status becomes "approved" — ids of newly-created child items
  createdChildIds?: string[];
}
