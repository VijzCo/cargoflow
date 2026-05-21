import type { Category, POItemStatus } from "@/types";

/**
 * Plain JSON shape of a PO item — used by both server (return value of
 * production-actions) and client components. Kept separate from
 * production-actions.ts because that file is "use server", which can be
 * fussy about type re-exports across bundles in some Next.js setups.
 */
export type POItemView = {
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
  status: POItemStatus;
  cbm: number;
  packageCount: number;
  grossWeight?: number;
  netWeight?: number;
  supplierRemarks?: string;
  containerId?: string;
  vesselId?: string;
  updatedAt: string | null;
};
