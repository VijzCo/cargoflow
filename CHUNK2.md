# CargoFlow — Chunk 2: PO Upload Module

## What's new in this chunk

**Working end-to-end PO upload:**

- `/admin/suppliers` — list, search, add, activate/deactivate suppliers
- `/purchase-orders` — list of all uploaded POs (filtered to own POs for suppliers)
- `/purchase-orders/upload` — drag/drop or click to upload Excel
- **Browser-side parsing** via the validated `poParser.ts` — files never leave the user's computer permanently
- **Preview screen** with full inline editing: fix supplier matches, edit style/color/size/qty/date, change category & sales channel, delete bad rows
- **Supplier matching** with three states:
  - ✅ **Matched** — exact name/alias match found
  - ⚠️ **Multiple matches** — pick one with one click; applies to all rows with same parsed name
  - ❌ **Not found** — "Create supplier" button opens an inline modal; once created, applies to all matching rows
- **Atomic save** — purchase_orders + po_items written in a single Firestore batch
- **Multi-PO support** — rows with comma-separated POs are stored as one item with the full list
- **Activity log entries** for supplier creation and PO upload

## New files

```
src/components/ui/
├── dialog.tsx              # Radix Dialog
├── select.tsx              # Radix Select
├── table.tsx               # Table primitives
└── badge.tsx               # Status pills

src/components/po/
├── file-upload.tsx         # Drag/drop file picker
└── preview-table.tsx       # Editable preview grid (the big one)

src/components/admin/
└── supplier-form.tsx       # Reusable form (used in admin + modal)

src/lib/utils/
├── upload-actions.ts       # Server Actions (resolveSuppliers, createSupplier, savePO, listPOs, listSuppliers, updateSupplierActive)
└── activity-log.ts         # Best-effort audit log writer

src/app/(app)/admin/suppliers/
├── page.tsx                # Replaces placeholder
└── suppliers-client.tsx    # List + add modal

src/app/(app)/purchase-orders/
├── page.tsx                # Replaces placeholder — now real list
└── upload/page.tsx         # Upload + preview flow
```

## How to apply

1. **Unzip cargoflow-chunk2.zip OVER your existing cargoflow folder.** All new files will be added, and the four placeholder files (`purchase-orders/page.tsx`, `admin/suppliers/page.tsx`) will be replaced with real implementations.

2. **No new dependencies needed** — everything uses packages already in `package.json` from the Foundation.

3. **Restart the dev server:**
   ```bash
   npm run dev
   ```

4. **First-run workflow:**
   - Sign in as your super_admin.
   - Go to **Admin → Suppliers** → add at least one supplier with a name matching what's in your test Excel file. For your sample files, that's `XIAMEN SYC TEXTILE TECH CO., LTD.` — add it once.
   - Go to **Purchase Orders → Upload PO** → drop one of the sample files (the cord PO or the fabric PO).
   - You should see the preview screen with all items parsed, supplier matched (✅ green badge).
   - Edit anything that needs fixing (truncated colors in file 2, blank delivery dates in file 1).
   - Click **Save** → you'll be redirected to the PO list showing your saved PO.

## Things to know

**The preview screen never blocks you for too-strict reasons.** If the parser produces warnings, they're displayed in a yellow card but don't prevent save. The only blocking errors are: missing supplier match, missing required fields, zero/negative quantity.

**Supplier matching is fuzzy.** Names like "Xiamen SYC Textile Tech Co Ltd" and "XIAMEN SYC TEXTILE TECH CO., LTD." normalize to the same key (uppercase, punctuation stripped, "CO/LTD/INC" suffixes removed). You can also add aliases when creating a supplier ("XIAMEN SYC, SYC TEXTILE") for cases that don't normalize cleanly.

**Multi-PO splitting.** A row with `["DFSKEIN01", "1307989", "1312288"]` becomes ONE po_item document with all three numbers in `poNumbers`. The first one (`DFSKEIN01`) is the "primary" used for grouping into a `purchase_orders` header doc.

**The Excel file is gone after parsing.** It's read into an ArrayBuffer in the browser, parsed, then discarded. Nothing is uploaded to Firebase Storage. This satisfies your "Files are temporary only" rule from the spec.

## Known gaps (intentional, addressed in later chunks)

- **PO detail view** (`/purchase-orders/[poId]`) — clicking a PO row doesn't drill in yet. Coming in Chunk 3 with production tracking.
- **No filters yet on the PO list** — supplier/status/date filters come with Chunk 3 too.
- **Activity log uses `user.create` as the action for supplier creation** — I'll add a proper `supplier.create` action in Chunk 6 when we build the activity log UI.

## If you hit errors

**`Cannot find module 'xlsx'`** when uploading a file → unlikely since `xlsx` is in package.json, but if so: `npm install`.

**Save button is disabled even though everything looks fine** → check the yellow warning banner at the top. Common cause: at least one row still has unmatched supplier. The "Create supplier" button on the supplier column fixes this in seconds.

**"You don't have permission to upload POs"** → your user's role in Firestore isn't `super_admin` or `merchant`. Check the `users/{uid}.role` field.

**Activity log writes failing in the console** → cosmetic, doesn't block the save. Check that `activity_logs` collection allows writes by the user role (it does in the security rules).
