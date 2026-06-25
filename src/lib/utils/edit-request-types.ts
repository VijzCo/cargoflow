// Pure types & constants for the edit-request workflow.
// Kept separate from edit-request-actions.ts because that file has "use server"
// and Next.js requires all "use server" exports to be async functions.

import type { EditRequestStatus, EditRequestType, ItemEditableField } from "@/types";

export const EDITABLE_FIELDS: readonly ItemEditableField[] = [
  "poNumbers", "style", "color", "size", "quantity", "unit", "unitPrice",
  "category", "description", "deliveryDate", "salesChannel", "remarks",
] as const;

/** Shape returned by listEditRequests / getPendingRequestForItem etc. */
export type EditRequestView = {
  id: string;
  itemId: string;
  poId: string;
  supplierId: string;
  type: EditRequestType;
  status: EditRequestStatus;
  proposedChanges?: Record<string, unknown>;
  previousValues?: Record<string, unknown>;
  reason?: string;
  requestedBy: string;
  requestedByEmail: string;
  requestedAt: string | null;
  resolvedBy?: string;
  resolvedByEmail?: string;
  resolvedAt?: string | null;
  resolverNote?: string;
  // Joined item fields for convenience in approval UI
  itemStyle?: string;
  itemColor?: string;
  itemSize?: string;
  itemSupplierName?: string;
  itemPoNumber?: string;
};
