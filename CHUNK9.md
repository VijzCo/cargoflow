# CargoFlow — Chunk 9: Item Edit Approval Workflow

A two-tier edit system for PO items: merchants submit edit/delete requests, managers and super admins approve or reject them.

## Highlights

- **New role:** `merchant_manager` — sits between super_admin and merchant, has approval authority
- **Merchants** can submit edit and delete **requests** on items (no direct save)
- **Merchant Managers** and **Super Admins** can edit and delete items **directly** (no approval needed), AND can approve/reject requests from merchants
- **Self-approval is blocked** at all levels — even a super_admin can't approve their own request
- **Items in a container are fully locked** — no edits, no requests. Once an item is `Loaded` or `Shipped`, the menu shows "Locked — in container"
- **In-context badges** — items with pending requests show a "Pending edit" or "Pending delete" badge inline on PO detail and Production pages
- **Dedicated approvals page** at `/admin/approvals` for reviewing all pending requests in one place
- **Bell icon** in the topbar now links to the approvals page with a live count of pending items (polls every 60s)
- **Full audit trail** — every action (request, approve, reject, cancel, direct edit, direct delete) is logged with before/after values

## What can be edited

Twelve fields, all through the same workflow:

| Field | Editable? | Notes |
|---|---|---|
| Style | ✅ | |
| Color | ✅ | |
| Size | ✅ | |
| Quantity | ✅ | Warning shown if item is in production |
| Unit | ✅ | METER, PIECE, ROLL, BOX, CARTON, BAG, PAIR, SET, YARD, KG |
| Unit Price | ✅ | |
| Category | ✅ | Affects auto-detection and CBM dialog wording |
| Description | ✅ | |
| Delivery Date | ✅ | |
| Sales Channel | ✅ | |
| Remarks | ✅ | |
| PO Number | ✅ | Comma-separated allowed |
| **Supplier** | ❌ | Too risky — use delete + re-upload instead |
| **Status / CBM / Container** | ❌ | Use their existing dedicated workflows |
| **Composition / Reference / Shade** | ❌ | Use the fabric details flow from CR1 |

## Role permissions matrix

| Role | Edit directly | Submit request | Approve others | Sees approvals page |
|---|---|---|---|---|
| super_admin | ✅ | ✅ | ✅ | ✅ |
| merchant_manager (NEW) | ✅ | ✅ | ✅ | ✅ |
| merchant | ❌ | ✅ | ❌ | ✅ (only own) |
| supplier | ❌ | ❌ | ❌ | ❌ |
| logistics | ❌ | ❌ | ❌ | ❌ |
| viewer | ❌ | ❌ | ❌ | ❌ |

## What stays the same for suppliers

Suppliers still see exactly what they used to: their items, their statuses, their CBM dialogs. Pending edit requests are **invisible to suppliers** — they continue to see the current item values until a change is approved. There's no scenario where a supplier sees half-applied data.

## Files

### New (5)

```
src/lib/utils/edit-request-actions.ts                       # All approval-flow server actions
src/components/po/edit-item-dialog.tsx                      # Edit form, works in both "direct" and "request" modes
src/app/(app)/admin/approvals/page.tsx                      # Approvals page (server component)
src/app/(app)/admin/approvals/approvals-client.tsx          # Approvals page UI
firestore.indexes.additions.json                            # 4 new composite indexes to deploy
```

### Modified (10)

```
src/types/index.ts                                          # New role, new activity actions, ItemEditRequestDoc
src/lib/rbac/permissions.ts                                 # 3 new perms + merchant_manager role
src/components/production/item-actions.tsx                  # Edit / Request edit / Delete / Cancel menu items
src/components/layout/sidebar.tsx                           # "Approvals" link in admin nav
src/components/layout/topbar.tsx                            # Bell icon → /admin/approvals with live count
src/app/(app)/production/page.tsx                           # Passes uid + edit perms to client
src/app/(app)/production/production-client.tsx              # Fetches pending requests, shows badges
src/app/(app)/purchase-orders/[poId]/page.tsx               # Same — passes edit perms + shows badges
messages/en.json                                            # ~60 new strings
messages/zh.json                                            # ~60 new strings
```

## How to apply

1. **Extract `cargoflow-cr9.zip`** into `C:\xampp\htdocs\MAS_projects\locdev\` (parent of cargoflow). It overlays onto your existing folder. Files in the zip will replace your local copies for the modified files, and new files will appear in fresh locations.

2. **No new npm dependencies.** Skip `npm install`.

3. **Deploy 4 new Firestore indexes.** Open your existing `firestore.indexes.json` (in your local Firebase setup, NOT in CargoFlow source) and add the 4 entries from `firestore.indexes.additions.json` under the `indexes` array. Then deploy:

   ```powershell
   firebase deploy --only firestore:indexes --project dfs-cargoflow
   ```

   The indexes are:
   - `item_edit_requests` (status, requestedAt DESC)
   - `item_edit_requests` (requestedBy, requestedAt DESC)
   - `item_edit_requests` (status, requestedBy, requestedAt DESC)
   - `item_edit_requests` (itemId, status)

   Without these, the approvals page will throw "missing index" errors. Firebase will give you a clickable link in the error message that builds the index for you if you forget.

4. **Restart `npm run dev`.**

5. **Promote one user to `merchant_manager`** so you can test the full flow:
   - Sign in as super_admin
   - Admin → Users → pick a merchant → change role to "Merchant Manager"
   - Save

6. **`npm run build`** before pushing to Vercel. This is a large surface change — almost certainly something needs a small TS-strict fix. Paste any error you see.

## Test path

### As a regular merchant
1. Sign in as a merchant user
2. Open any PO with items NOT yet in a container
3. Click the three-dot menu on any item → "Request edit"
4. Change a field (e.g. delivery date) and optionally add a reason
5. Click "Submit for approval"
6. The item now shows a yellow "Pending edit" badge
7. Bell icon won't increment (you're not an approver) but `/admin/approvals` shows your pending request
8. Click your pending request → "Cancel my request" to test cancel flow

### As a merchant_manager (or super_admin)
1. Sign in as merchant_manager
2. Topbar bell shows a red badge with the count
3. Click the bell → `/admin/approvals` opens
4. Click any pending request to open the review dialog
5. Verify the diff is clear (each changed field shows "from" → "to")
6. Click "Approve" with an optional note → request closes, item updates
7. Try to approve YOUR OWN request → blocked with a yellow warning, action buttons hidden
8. Go back to the production page → "Pending edit" badge is gone; the new value is live

### Edit directly (super_admin / merchant_manager)
1. Open the three-dot menu on any item
2. Menu shows "Edit item" (not "Request edit") because direct edit is permitted
3. Change fields → save → item updates immediately
4. Activity log entry shows action `item.direct_edit` with full before/after diff

### Container locking
1. Find an item with status `Loaded` or assigned to a container
2. Open the three-dot menu
3. Menu shows "Locked — in container" with no edit / delete / request options
4. The fabric details edit button on the PO detail page also won't work (it goes through different validation)

### Delete flow (merchant)
1. As a merchant, click three-dot menu → "Request delete"
2. Confirm
3. Item now shows "Pending delete" badge
4. As a manager, open the request → notice the red warning about permanent deletion
5. Approve → item is removed permanently from the database

### Activity log
1. Admin → Activity
2. Filter by action — new actions visible:
   - `item.direct_edit` / `item.direct_delete` (immediate writes by admins/managers)
   - `item.edit_requested` / `item.delete_requested` (merchant submitted)
   - `item.request_approved` / `item.request_rejected` / `item.request_cancelled`

## Architectural notes

- **Pending requests live in a new collection** `item_edit_requests`. Items themselves are untouched until approval.
- **Approval re-validates** — at approval time, the system re-checks the item is still editable (status, container assignment) and that the proposed values are still novel. Concurrent edits are handled gracefully.
- **Duplicate pending requests** on the same item are blocked at submission. Cancel the existing one first.
- **No emails** — notifications are in-app only (bell icon + approvals page). Wire up SendGrid later if you want emails.
- **Pending requests are not visible to suppliers.** Even when a quantity-change request is pending, the supplier still sees the original quantity on their production page.

## Limitations to know

- **Quantity reductions don't auto-cancel container assignment** — if you edit an item that's in a container (shouldn't be possible per our lock, but in edge cases), the container's loadedCbm could drift. The lock prevents this in normal flow.
- **No bulk approval** — each request is reviewed individually. Reasonable for v1.
- **Single approver model** — first approver wins. No N-of-M approvals.
- **Old in-flight requests on deleted items** — handled: the approve flow auto-rejects them with a system note.

## What's still in English on the admin UI

The approvals page itself uses i18n strings I added in both en.json and zh.json. If a merchant manager is using 中文, the entire approvals page renders in Chinese. Tested keys all present.
