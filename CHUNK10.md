# CHUNK10 — Partial-Shipment Split Workflow

**CR:** CR10 — Merchandiser-initiated item splits for partial shipments, with
approval flow.
**Date:** 26-Jul-2026
**Author:** Vijan B.

## What ships in this chunk

A new workflow that lets a merchandiser split a PO item into 2–3 partial
shipments (e.g. supplier can only ship 1000m of a 3000m fabric order in
August; balance ships in September). Splits are:

- **Requested** by merchants → approved by merchant_manager / super_admin
- **Applied directly** by merchant_manager / super_admin (no approval needed)
- **Cancellable** by the requester (or super_admin override) while pending

Approval flow mirrors CR9's edit-request workflow — same page (`/admin/approvals`),
same UX patterns, same audit-log approach.

## Rules enforced

- Cannot split items in status `Loaded`, `Shipped`, or already `Split`
- Cannot split a child of a previous split (one level only for v1)
- Cannot split items with a pending edit request (and vice versa — edits blocked when a split is pending)
- Cannot self-approve your own split request
- Split quantities must sum EXACTLY to the parent quantity (0.001 tolerance for floats)
- Min 2, max 3 children per split
- Fabric details (composition, reference, shade) carry to all children
- CBM and package counts start blank on children — supplier redeclares per lot

## Files changed

### Modified

| File | Change |
|------|--------|
| `src/types/index.ts` | Added `"Split"` status; added split-lineage fields to `POItemDoc`; added 5 new `ActivityAction` values; added `SplitReasonCategory`, `SplitChildInput`, `SplitPlan`, `ItemSplitRequestDoc` interfaces |
| `src/lib/rbac/permissions.ts` | Added `po_items.split_direct`, `po_items.split_request`, `po_items.split_approve` to `Permission` type + `ALL`; added split perms to `merchant_manager` (all 3) and `merchant` (`split_request` only) |
| `src/lib/utils/edit-request-actions.ts` | Added `assertNoPendingSplitOnItem` helper called from `submitEditRequest`, `editItemDirect`, `deleteItemDirect`; updated `assertItemEditable` to reject items in `Split` status |
| `src/components/production/item-actions.tsx` | Added `canSplitDirect`, `canSplitRequest`, `pendingSplit` props; rendered new split-related menu items and disabled-info entries; wired `SplitItemDialog` |
| `src/app/(app)/admin/approvals/page.tsx` | Now also fetches split requests and passes them to the client |
| `src/app/(app)/admin/approvals/approvals-client.tsx` | Added tabs to switch between Edit requests and Split requests; added `SplitReviewDialog` |
| `messages/en.json` | Added `splits.*` namespace (35 keys) |
| `messages/zh.json` | Added `splits.*` namespace (35 keys, Simplified Chinese) |

### New

| File | Purpose |
|------|---------|
| `src/lib/utils/split-request-types.ts` | Pure types + constants shared between client + server (kept out of the "use server" file per Next.js rules) |
| `src/lib/utils/split-actions.ts` | Server actions: `submitSplitRequest`, `resolveSplitRequest`, `cancelSplitRequest`, `splitItemDirect`, `listSplitRequests`, `getPendingSplitForItem`, `listPendingSplitsForItems` |
| `src/components/po/split-item-dialog.tsx` | The split dialog (2–3 lots, running total, reason category, submit/split-now button) |

### Deploy artifacts

| File | Purpose |
|------|---------|
| `firestore.indexes.cr10.snippet.json` | 3 new composite indexes — merge into your existing `firestore.indexes.json` |

## Server actions API (new)

All in `@/lib/utils/split-actions`:

```typescript
submitSplitRequest({ itemId, plan })          // merchant
resolveSplitRequest({ requestId, approve, note? })  // manager/admin
cancelSplitRequest(requestId)                 // owner or super_admin
splitItemDirect({ itemId, plan })             // manager/admin — no approval
listSplitRequests({ status? })                // for approvals page
getPendingSplitForItem(itemId)                // for inline badges
listPendingSplitsForItems(itemIds[])          // for Production page (bulk)
```

Where `plan` is:
```typescript
{
  children: [
    { quantity: number, deliveryDate?: string, label?: string },
    ...
  ],
  reasonCategory: "supplier_capacity" | "customer_early_lot" | "logistics_constraint" | "other",
  reasonText?: string
}
```

## New collection

`item_split_requests` — one document per pending/resolved split request.

Shape mirrors `ItemSplitRequestDoc` in `types/index.ts`. Same lifecycle as
`item_edit_requests` (`pending` → `approved` / `rejected` / `cancelled`).

## Firestore indexes — MUST DEPLOY

Merge the contents of `firestore.indexes.cr10.snippet.json` into your existing
`firestore.indexes.json` `indexes` array, then:

```bash
firebase deploy --only firestore:indexes
```

Index build takes 2–5 minutes. Approvals page will 500 with a "query requires
an index" error until this completes.

## Firestore rules — REVIEW NEEDED

If your rules explicitly enumerate collections (rather than deny-by-default),
add rules for `item_split_requests`. Suggested pattern:

```javascript
match /item_split_requests/{id} {
  // Anyone signed in with view perms can read (server enforces per-user filtering)
  allow read: if request.auth != null;
  // All writes go through server actions (Admin SDK bypasses rules)
  allow write: if false;
}
```

## Deploy steps

Standard drill, from your project root:

```powershell
cd C:\xampp\htdocs\MAS_projects\locdev\cargoflow

# 1. Copy all modified & new files from the CR10 zip into place, overwriting existing files
# 2. Merge firestore.indexes.cr10.snippet.json into firestore.indexes.json

# 3. Deploy indexes FIRST — wait 2-5 min for build
firebase deploy --only firestore:indexes

# 4. Clean build
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm run build

# 5. If build passes, push to your Vercel-linked git branch
git add .
git commit -m "CR10: Partial-shipment split workflow"
git push
```

Vercel auto-deploys.

## What was NOT built (deferred / out of scope)

Per your decisions:
- Bulk approve for split requests (you said splits are rare)
- Auto-approval thresholds (splits are rare)
- Nested splits (splitting a child of a split)
- Split undo / merge back — splits are permanent
- Email/WhatsApp notifications — same in-app-only model as CR9
- Prorated CBM (kept the recommended "clear on children" behaviour)
- Supplier's Production page — small "Lot N of M" prefix on child items.
  I did NOT modify supplier-side page rendering in this CR since I only had the
  9 files you sent. Children will appear as normal items with the `splitLabel`
  field available for you to render however you prefer. **Follow-up:**
  in `src/components/production/production-table.tsx` (or wherever supplier rows
  render), add:
  ```tsx
  {item.splitTotal && (
    <Badge variant="outline" className="text-[10px]">
      Lot {item.splitIndex}/{item.splitTotal}
      {item.splitLabel && <> · {item.splitLabel}</>}
    </Badge>
  )}
  ```

## Wiring the Production page / PO detail — YOU NEED TO CHECK

The `ItemActions` component now accepts new props `canSplitDirect`,
`canSplitRequest`, and `pendingSplit`. Wherever `<ItemActions>` is rendered
from a server component (Production page, PO detail page), you must pass
these props. Example:

```tsx
// In your Production page / PO detail server component:
import { hasPermission } from "@/lib/rbac/permissions";
import { listPendingSplitsForItems } from "@/lib/utils/split-actions";
import { listPendingForItems } from "@/lib/utils/edit-request-actions";

const [pendingEdits, pendingSplits] = await Promise.all([
  listPendingForItems(itemIds),
  listPendingSplitsForItems(itemIds),
]);

const canSplitDirect  = hasPermission(user.role, "po_items.split_direct");
const canSplitRequest = hasPermission(user.role, "po_items.split_request");
const canEditDirect   = hasPermission(user.role, "po_items.edit_direct");
const canEditRequest  = hasPermission(user.role, "po_items.edit_request");

// per item:
<ItemActions
  item={item}
  canUpdateStatus={...}
  canUpdateCBM={...}
  isSupplier={user.role === "supplier"}
  canEditDirect={canEditDirect}
  canEditRequest={canEditRequest}
  pendingRequest={pendingEdits[item.id] || null}
  canSplitDirect={canSplitDirect}
  canSplitRequest={canSplitRequest}
  pendingSplit={pendingSplits[item.id] || null}
  currentUserId={user.uid}
/>
```

If you already had `pendingEdits` wired for CR9, just add the two split lines
next to the existing ones.

## Bell counter — optional follow-up

`countPendingApprovalsForCurrentUser()` in `edit-request-actions.ts` only
counts edit requests. To include splits in the bell badge, either:

**Option A** — Extend the existing count:
Replace its body to also query `item_split_requests`.

**Option B** — Add a separate `countPendingSplitsForCurrentUser()` in
`split-actions.ts` and sum both in the topbar.

**Recommendation:** Option A — one bell showing total pending approvals across
both flows. Update `countPendingApprovalsForCurrentUser` in edit-request-actions.ts
to also count from `item_split_requests` (same predicate: status == "pending",
limit 100).

## Expected fix patches after ship

Based on CR9 experience, expect 3-4 sequential fixes in the first day of use:

1. Wherever `POItemStatus` is used in a `Record<POItemStatus, ...>` — will complain
   about missing `"Split"` key. Add `Split: "..."` entry.
2. Wherever a switch statement handles item statuses — add a `case "Split":` or
   default handler.
3. Status badge colors — `Split` needs a variant. Recommend `secondary` (grey).
4. Any KPI/filter that lists statuses — decide whether to show or hide `Split`
   items (recommend hide from active-work views, show in history views).

Send me the TS errors when they surface and I'll patch precisely.

## Testing checklist

Before rolling out:

- [ ] Merchant user can submit a split request; sees confirmation toast
- [ ] Merchant user CANNOT approve their own request (button hidden)
- [ ] Manager sees pending split in `/admin/approvals` under Split requests tab
- [ ] Manager can approve → parent becomes Split, 2-3 children appear
- [ ] Manager can reject with note → parent unchanged
- [ ] Owner can cancel own pending split
- [ ] Super_admin can cancel someone else's pending split
- [ ] Split with wrong quantities is rejected (client + server both catch)
- [ ] Cannot split item already in a container
- [ ] Cannot split an item with a pending edit request
- [ ] Cannot edit an item with a pending split request
- [ ] After split, parent's children appear on Production page as separate items
- [ ] Children carry the same fabric details as parent
- [ ] Children start with 0 CBM and Pending status
- [ ] Supplier sees children as normal items (though "Lot N/M" prefix requires
  the follow-up shown above)

## Revision history

| Version | Date | Change |
|---------|------|--------|
| 1.0 | 26-Jul-2026 | Initial release of CR10 |
