# CHUNK11 — ETD / ETA revision + revision history

**CR:** CR11
**Date:** 22-Oct-2026

## Scope
- Logistics, merchant_manager and super_admin can revise ETD and ETA on a vessel directly (no approval flow).
- ETD locked once vessel status = Sailed; both ETD and ETA locked once Delivered.
- Every revision is appended to a `revisions[]` array on the vessel doc AND written to the Activity Log.
- An inline "Revision history" card on the vessel detail page shows every entry (user, timestamp, old → new, optional reason).

## Files

### Modified
| Path | Change |
|------|--------|
| `src/types/index.ts` | Added `VesselStatus`, `VesselDateRevision`, `revisions?` on `VesselDoc`, `vessel.dates_revised` ActivityAction |
| `src/lib/rbac/permissions.ts` | Added `vessels.revise_dates` perm; granted to super_admin, merchant_manager, logistics |
| `src/app/(app)/vessels/[vesselId]/page.tsx` | **MANUAL** — see `VESSEL_DETAIL_WIRING.md` (3 imports, 1 perm, 2 JSX blocks) |
| `messages/en.json` | Add `vessels.revise.*` + `vessels.history.*` keys from `messages/vessels-additions.en.json` |
| `messages/zh.json` | Add `vessels.revise.*` + `vessels.history.*` keys from `messages/vessels-additions.zh.json` |

### New
| Path | Purpose |
|------|---------|
| `src/lib/utils/vessel-dates-actions.ts` | `reviseVesselDates` server action — validates status gates, writes revision + activity log |
| `src/components/vessels/revise-dates-dialog.tsx` | Dialog with two date pickers + optional reason |
| `src/components/vessels/revise-dates-button.tsx` | Button shown on vessel detail header; hidden entirely when vessel is Delivered |
| `src/components/vessels/revision-history-card.tsx` | Collapsible card listing all revisions with user + diff + reason |

## Behaviour

- **Validation:** both client-side and server-side block ETA earlier than ETD, and block edits to locked fields.
- **Diffing:** server detects which fields actually changed; a no-op (same value) is rejected with a toast.
- **Audit:** revisions are stored on the vessel doc for direct display, AND an Activity Log entry is written for cross-system traceability.
- **Clearing a date:** passing an empty string clears that date; the revision records "previous → (nothing)".
- **Status gates:**
  | Status | ETD editable | ETA editable |
  |--------|--------------|--------------|
  | Planned   | ✓ | ✓ |
  | Loading   | ✓ | ✓ |
  | Sailed    | ✗ | ✓ |
  | Delivered | ✗ | ✗ |

## No Firestore index changes needed
Revisions are stored inline on the vessel doc (array field). No new collection, no new indexes.

## Firestore rules
The vessel doc update happens via Admin SDK, so no rule changes required. If your rules explicitly restrict writes to specific fields, add `revisions` to the allowed-fields list for vessels.

## Deploy

```powershell
cd C:\xampp\htdocs\MAS_projects\locdev\cargoflow

# 1. Copy new/modified files from this patch
# 2. Merge messages/vessels-additions.en.json keys into messages/en.json (inside the vessels namespace)
# 3. Merge messages/vessels-additions.zh.json keys into messages/zh.json (inside the vessels namespace)
# 4. Apply the vessel detail page wiring (VESSEL_DETAIL_WIRING.md) — ~2 minutes
# 5. Build
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm run build

# 6. Push
git add .
git commit -m "feat: CR11 vessel ETD/ETA revision with history"
git push
```

Vercel auto-deploys. No Firebase indexes needed.

## Test checklist
- [ ] Super_admin, merchant_manager, logistics all see "Revise ETD / ETA" on a Planned vessel
- [ ] Merchant and viewer do NOT see the button
- [ ] On a Sailed vessel, ETD field is disabled; ETA still editable
- [ ] On a Delivered vessel, button is hidden entirely
- [ ] ETA before ETD → client blocks save; server also blocks if bypassed
- [ ] Submitting with same values → "No changes to apply"
- [ ] After revising, history card shows the entry with correct user email + name
- [ ] Activity Log shows a `vessel.dates_revised` entry

## Follow-ups (not in CR11)
- Add bell-icon count for recent revisions (currently none)
- Email supplier of attached containers when ETD slips > N days (future)
- Export revision history to PDF or Excel (deferred)
