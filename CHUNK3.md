# CargoFlow — Chunk 3: Production Tracking & CBM

## What's new

- **PO detail page** at `/purchase-orders/[poId]` — drill into a saved PO, see header stats + every item.
- **Real-time Production page** at `/production` — Firestore listener for live updates across suppliers.
- **Status updates** (Pending → Started → In Progress → Completed → Loaded → Shipped) with optional remarks.
- **CBM entry dialog** — supplier enters CBM, package count (rolls / boxes), gross + net weight; can optionally mark item as Completed in the same action.
- **KPI tiles** on the Production page: Total / Pending / In progress / Completed / Overdue.
- **Overdue highlighting** — items past their delivery date that aren't yet Completed/Loaded/Shipped get a red badge and row tint.
- **Filters** on Production: supplier (admin/merchant only), status, search by style/color/PO.
- **PO list rows are now clickable** → opens the detail page.
- **Activity log** entries for every status change and CBM update.
- **Supplier user creation script** (`scripts/create-supplier-user.mjs`) to make a supplier-role user for testing.

## New files

```
src/lib/utils/
├── production-actions.ts     # Server Actions: getPODetail, listPOItems, updateItemStatus, updateItemCBM, listSuppliersForFilter
└── po-item-view.ts           # Shared type for PO item (safe for client imports)

src/components/production/
├── status-pill.tsx           # Colored status badge with icon
├── status-update-dialog.tsx  # Change status modal
├── cbm-update-dialog.tsx     # Enter CBM / packages / weights modal
└── item-actions.tsx          # Per-row dropdown that opens the two dialogs

src/components/po/
└── po-filter-bar.tsx         # (Built but not yet wired — saved for a future chunk)

src/app/(app)/purchase-orders/[poId]/page.tsx   # PO detail page (NEW)
src/app/(app)/production/page.tsx               # Production page (replaces placeholder)
src/app/(app)/production/production-client.tsx  # Real-time client component

scripts/create-supplier-user.mjs                # Create a supplier-role user
```

## How to apply

1. Unzip `cargoflow-chunk3.zip` over your existing folder.
2. No new dependencies — restart `npm run dev`.
3. Sign in as super_admin / merchant — you should see the new pages working.

## Testing the supplier flow

To verify role isolation works end-to-end:

```bash
node --env-file=.env.local scripts/create-supplier-user.mjs \
  --email=supplier-test@example.com \
  --name="Test Supplier" \
  --supplier-name="XIAMEN SYC TEXTILE TECH CO., LTD."
```

The script:
1. Looks up the supplier by exact name (must already exist in /admin/suppliers).
2. Creates a Firebase Auth user.
3. Writes the user doc with `role: "supplier"` and `supplierId` linked to the supplier.
4. Prints a password-setup link.

Open the link, set a password, then:
- Sign out of your admin account.
- Sign in with the supplier email.
- Notice the sidebar is shorter (only Dashboard, Purchase Orders, Production, Containers, Vessels, Packing Lists are visible — no admin sections).
- Visit `/production` — you should see ONLY items from Xiamen SYC.
- Visit `/purchase-orders` — same: only their POs.
- Try the row actions — you can update status (Started / In Progress / Completed only — not Loaded/Shipped) and CBM.

## Real-time behavior

The Production page uses Firestore's `onSnapshot` listener. If you have two browser windows open (one as supplier, one as merchant) and update an item in one, the other updates within ~1 second without any refresh.

The PO detail page is server-rendered (not real-time) because POs change less often and it saves Firestore reads. Status/CBM updates from that page still trigger a `router.refresh()` to pull the latest data.

## Status flow rules

| Role | Can set status to |
|---|---|
| Supplier | Started, In Progress, Completed |
| Merchant / Logistics / Admin | Any status (Pending → Shipped) |

This is enforced **server-side** in `updateItemStatus()` — the UI hides the disallowed options, but even if a supplier bypassed the UI, the Server Action would reject the write.

## CBM validation

- CBM must be `≥ 0`.
- Package count must be a whole number `≥ 0`.
- If both gross and net weight are entered, net cannot exceed gross.
- Updating an item's CBM auto-recalculates the parent PO's `totalCbm` (sum of all child items).

## Filters

| Page | Filters |
|---|---|
| Production | Supplier (admin only), Status, Search (style/color/PO) |
| PO list | None yet — coming with the report module |

Suppliers never see the supplier filter — they're already locked to their own data.

## Known gaps (deliberate, addressed later)

- **PO list filters** — the `po-filter-bar.tsx` component is built but not yet wired into the PO list page. It'll be wired in Chunk 6 with reports.
- **Container assignment from production page** — the `containerId` and `vesselId` fields exist on each item, but you can't assign them yet. That's all of Chunk 4.
- **Notifications** — status changes don't yet trigger notifications. Coming with Chunk 6.

## Cost notes

The Production page has a live Firestore listener that pulls up to 300 items. Every time an item updates, every connected client sees one read per affected doc. For a small team (5-10 users) and a few hundred active items, this is well within the Spark (free) tier. If you hit limits, the listener can be downgraded to a one-time read + manual refresh.

## Common issues

- **"Not authorized to update this item"** — you're signed in as a supplier and trying to update an item that doesn't belong to your supplier. This is expected; suppliers see only their own items.
- **CBM updates don't show until I refresh** — should not happen with the real-time listener. If it does, check the browser console for Firestore connection errors (often a Firestore Rules misconfiguration).
- **The Production page shows "Loading items..." forever** — usually means the Firestore listener can't read the collection. Most likely cause: the supplier user doc is missing the `supplierId` field, or `active: true`. Check the user doc in Firestore.
