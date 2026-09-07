// Pure types for the split-request workflow.
// Kept separate from split-actions.ts because that file has "use server"
// and Next.js requires all "use server" exports to be async functions.

import type {
  EditRequestStatus, SplitReasonCategory, SplitChildInput,
} from "@/types";

/** Min / max children per split (mirrored on server for validation). */
export const MIN_SPLIT_CHILDREN = 2;
export const MAX_SPLIT_CHILDREN = 3;

/** UI-friendly labels for each reason category. Keep in sync with i18n keys. */
export const SPLIT_REASON_CATEGORIES: { value: SplitReasonCategory; labelKey: string }[] = [
  { value: "supplier_capacity",   labelKey: "splits.reason.supplier_capacity" },
  { value: "customer_early_lot",  labelKey: "splits.reason.customer_early_lot" },
  { value: "logistics_constraint",labelKey: "splits.reason.logistics_constraint" },
  { value: "other",               labelKey: "splits.reason.other" },
];

/** Shape returned by listSplitRequests / getPendingSplitForItem etc. */
export type SplitRequestView = {
  id: string;
  itemId: string;
  poId: string;
  supplierId: string;
  status: EditRequestStatus;

  plan: {
    children: SplitChildInput[];
    reasonCategory: SplitReasonCategory;
    reasonText?: string;
  };
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
  requestedAt: string | null;
  resolvedBy?: string;
  resolvedByEmail?: string;
  resolvedAt?: string | null;
  resolverNote?: string;
  createdChildIds?: string[];

  // Joined item info for convenience (may be missing if parent was deleted)
  itemSupplierName?: string;
  itemPoNumber?: string;
};
