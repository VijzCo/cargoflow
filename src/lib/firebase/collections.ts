"use client";

import {
  collection,
  doc,
  type CollectionReference,
  type DocumentReference,
  type FirestoreDataConverter,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "./client";
import type {
  UserDoc, SupplierDoc, MerchantDoc, PurchaseOrderDoc, POItemDoc,
  ContainerDoc, VesselDoc, PackingListDoc, NotificationDoc,
  SalesChannelDoc, SettingsDoc, ActivityLogDoc,
} from "@/types";

// Generic converter that preserves the typed shape on the way out and just
// passes objects through on the way in (we'll always write through helpers
// that ensure timestamps & IDs are correct).
function converter<T extends { id: string }>(): FirestoreDataConverter<T> {
  return {
    toFirestore(data: T) {
      // Don't write `id` into the document — it's only a read-side convenience.
      const { id: _omit, ...rest } = data as { id: string } & Record<string, unknown>;
      return rest;
    },
    fromFirestore(snapshot: QueryDocumentSnapshot): T {
      const data = snapshot.data();
      return { id: snapshot.id, ...data } as T;
    },
  };
}

export const usersCol = collection(db, "users").withConverter(converter<UserDoc>()) as CollectionReference<UserDoc>;
export const suppliersCol = collection(db, "suppliers").withConverter(converter<SupplierDoc>()) as CollectionReference<SupplierDoc>;
export const merchantsCol = collection(db, "merchants").withConverter(converter<MerchantDoc>()) as CollectionReference<MerchantDoc>;
export const purchaseOrdersCol = collection(db, "purchase_orders").withConverter(converter<PurchaseOrderDoc>()) as CollectionReference<PurchaseOrderDoc>;
export const poItemsCol = collection(db, "po_items").withConverter(converter<POItemDoc>()) as CollectionReference<POItemDoc>;
export const containersCol = collection(db, "containers").withConverter(converter<ContainerDoc>()) as CollectionReference<ContainerDoc>;
export const vesselsCol = collection(db, "vessels").withConverter(converter<VesselDoc>()) as CollectionReference<VesselDoc>;
export const packingListsCol = collection(db, "packing_lists").withConverter(converter<PackingListDoc>()) as CollectionReference<PackingListDoc>;
export const notificationsCol = collection(db, "notifications").withConverter(converter<NotificationDoc>()) as CollectionReference<NotificationDoc>;
export const salesChannelsCol = collection(db, "sales_channels").withConverter(converter<SalesChannelDoc>()) as CollectionReference<SalesChannelDoc>;
export const activityLogsCol = collection(db, "activity_logs").withConverter(converter<ActivityLogDoc>()) as CollectionReference<ActivityLogDoc>;

// Singleton settings doc
export const settingsDocRef = (): DocumentReference<SettingsDoc> =>
  doc(db, "settings", "global").withConverter(converter<SettingsDoc>()) as DocumentReference<SettingsDoc>;
