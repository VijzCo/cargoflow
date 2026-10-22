# Vessel detail page — wiring snippet for CR11

I don't have your current `src/app/(app)/vessels/[vesselId]/page.tsx`, so apply
these minimal changes yourself. 3 imports, 1 perm check, 2 JSX blocks.

## 1. Imports (top of file)

```tsx
import { hasPermission } from "@/lib/rbac/permissions";
import { ReviseDatesButton } from "@/components/vessels/revise-dates-button";
import { RevisionHistoryCard, type RevisionView } from "@/components/vessels/revision-history-card";
```

## 2. Perm check (near the top of the server component, after loading the user)

```tsx
const canReviseDates = hasPermission(user.role, "vessels.revise_dates");
```

## 3. Serialize revisions for the client component

In the vessel-detail server component, after you load the vessel doc, convert
Firestore Timestamps on each revision to ISO strings:

```tsx
const revisions: RevisionView[] = (vessel.revisions ?? []).map((r: any) => ({
  id: r.id,
  revisedAt: r.revisedAt?.toDate?.()?.toISOString?.() ?? null,
  revisedBy: r.revisedBy,
  revisedByEmail: r.revisedByEmail,
  revisedByName: r.revisedByName,
  field: r.field,
  previousEtd: r.previousEtd,
  newEtd: r.newEtd,
  previousEta: r.previousEta,
  newEta: r.newEta,
  reason: r.reason,
}));
```

## 4. The "Revise ETD / ETA" button (header action row)

Add it next to your existing header buttons (Attach containers / Generate packing
lists / Dispatch vessel):

```tsx
{canReviseDates && (
  <ReviseDatesButton
    vessel={{
      id: vessel.id,
      vesselId: vessel.vesselId,
      vesselName: vessel.vesselName,
      status: vessel.status,
      etd: vessel.etd,
      eta: vessel.eta,
    }}
  />
)}
```

## 5. The revision history card (bottom of the detail body)

Drop in anywhere below the main stats — recommended just above the containers
table:

```tsx
<RevisionHistoryCard revisions={revisions} />
```

That's the full wiring. No other files on the vessel page need touching.
