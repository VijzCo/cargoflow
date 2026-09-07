# CR10 Wiring Patch — makes the Split option actually appear

## What this patch fixes

The main CR10 zip added `<ItemActions>` with new props for split, but those
props defaulted to `false`/`null` unless the pages rendering `<ItemActions>`
pass them in. This patch does that wiring.

Plus fixes two TypeScript errors that CR10 introduces (Split status is a new
enum value, and one strict `Record<POItemStatus, ...>` map didn't cover it).

## Files in this patch

| File | Type | Notes |
|------|------|-------|
| `src/app/(app)/purchase-orders/[poId]/page.tsx` | REPLACE | Wires split perms + pending-split fetch into the PO detail page. Also adds "Lot N/M · label" badge on split-child rows and "Pending split" badge on rows awaiting approval. Handles new "Split" status in `StatusCell`. |
| `src/app/(app)/production/page.tsx` | REPLACE | Adds `canSplitDirect`/`canSplitRequest` perms and passes them to `ProductionClient`. |
| `src/components/production/status-pill.tsx` | REPLACE | Adds `Split` status to the strict CONFIG map (else TypeScript build fails). |
| `MESSAGES_TWO_LINE_EDIT.txt` | ACTION | Just add one line to `messages/en.json` and one line to `messages/zh.json` — see file for exact text. |

## What you still need to do MANUALLY

### 1. Update `ProductionClient` (the client-side file next to the production page)

I didn't touch `src/app/(app)/production/production-client.tsx` — I don't have that file. You need to add two props to its signature and pass them down to `<ItemActions>`.

Open it, find the current props interface:
```typescript
export function ProductionClient({
  role,
  supplierId,
  suppliers,
  currentUserId,
  canEditDirect,
  canEditRequest,
}: { ... })
```

Add these two props (both in the type and the destructuring):
```typescript
canSplitDirect: boolean;
canSplitRequest: boolean;
```

Then find the `<ItemActions ... />` call inside the component's JSX (near where it renders each item row). Currently it looks something like:
```tsx
<ItemActions
  item={item}
  canUpdateStatus={canUpdateStatus}
  canUpdateCBM={canUpdateCBM}
  isSupplier={isSupplier}
  canEditDirect={canEditDirect}
  canEditRequest={canEditRequest}
  pendingRequest={pendingMap.get(item.id) ?? null}
  currentUserId={currentUserId}
/>
```

Add three lines:
```tsx
<ItemActions
  item={item}
  canUpdateStatus={canUpdateStatus}
  canUpdateCBM={canUpdateCBM}
  isSupplier={isSupplier}
  canEditDirect={canEditDirect}
  canEditRequest={canEditRequest}
  pendingRequest={pendingMap.get(item.id) ?? null}
  canSplitDirect={canSplitDirect}          // NEW
  canSplitRequest={canSplitRequest}        // NEW
  pendingSplit={pendingSplitMap.get(item.id) ?? null}   // NEW
  currentUserId={currentUserId}
/>
```

You will ALSO need a `pendingSplitMap` in `ProductionClient` similar to your existing `pendingMap`. If you're using `listPendingForItems` from `edit-request-actions`, add a parallel call to `listPendingSplitsForItems` from `split-actions`:

```typescript
import { listPendingSplitsForItems } from "@/lib/utils/split-actions";

// wherever pending edits are fetched:
const [pendingEdits, pendingSplits] = await Promise.all([
  listPendingForItems(itemIds),
  listPendingSplitsForItems(itemIds),
]);
// build both maps and pass into rows
```

If ProductionClient is fully client-side and does the fetch differently, follow
whatever pattern it uses for `pendingMap` — just add the parallel one.

**Send me `production-client.tsx` if you want me to patch it precisely.** I did
not have that file. Same approach as PO detail — two indexed queries in parallel,
build maps, pass into ItemActions.

### 2. Add the two message keys

See `MESSAGES_TWO_LINE_EDIT.txt` — one line each in `en.json` and `zh.json`
under the existing `"status"` object.

### 3. Deploy

Standard drill:

```powershell
cd C:\xampp\htdocs\MAS_projects\locdev\cargoflow
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm run build
```

If build passes → push. If build fails → paste the TS errors and I'll patch.

## Testing after deploy

Log in as different roles and open a PO detail page with items that have
status `Pending`, `Started`, `In Progress`, or `Completed`:

- **super_admin** — three-dot menu shows "Split item" (applies immediately)
- **merchant_manager** — three-dot menu shows "Split item" (applies immediately)
- **merchant** — three-dot menu shows "Request split" (goes for approval)
- **supplier** — no split option (as designed)
- **logistics / viewer** — no split option (as designed)

Then try items with status `Loaded` or `Shipped` — split option should be
hidden entirely (item is locked). And items already with status `Split` should
show only the informational "Already split — see child items" line.
