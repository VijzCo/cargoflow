# CargoFlow — Chunk 4: Container & Vessel Management

## What's new

**Containers** (`/containers`):
- Grid view of all containers with CBM utilization bars
- Filters: search, status (Open/Sealed/Shipped), type (20FT/40FT)
- **Create container** dialog — auto-calculates usable CBM using the settings' `containerUsablePercent` (default 92%)
- **Auto-allocate** — packs Completed items into existing Open containers + creates new ones as needed
- Container detail page with assigned items, manual assign dialog, seal action
- **Remove from container** — pops an item back to Completed and frees CBM

**Vessels** (`/vessels`):
- List of all vessels with status, ETD, ETA, destination
- Create vessel with vessel ID, name, dates, destination
- Vessel detail page with attached containers
- **Attach container** dialog — pick from unassigned Open/Sealed containers
- **Detach container** — only allowed before sailing
- **Dispatch vessel** — flips all containers to Shipped, all items to Shipped, vessel to Sailed (atomic)

**Item status transitions** (now fully wired):
- Assigning to container: `Completed` → `Loaded`
- Removing from container: `Loaded` → `Completed`
- Vessel dispatch: `Loaded` → `Shipped`

## New files

```
src/lib/utils/
├── container-actions.ts    # Server Actions: createContainer, listContainers,
│                           # getContainerDetail, listAllocatableItems,
│                           # manualAssign, removeFromContainer, sealContainer,
│                           # autoAllocatePreview, autoAllocateCommit
└── vessel-actions.ts        # Server Actions: createVessel, listVessels,
                             # getVesselDetail, attachContainerToVessel,
                             # detachContainerFromVessel, dispatchVessel,
                             # listAttachableContainers

src/components/containers/
├── container-card.tsx        # Grid card with CBM bar
├── create-container-dialog.tsx
├── manual-allocate-dialog.tsx  # Pick items + assign with CBM math preview
└── auto-allocate-dialog.tsx    # Preview plan + commit

src/components/vessels/
├── create-vessel-dialog.tsx
└── attach-container-dialog.tsx

src/app/(app)/containers/
├── page.tsx                  # Replaces placeholder
├── containers-client.tsx
└── [containerId]/
    ├── page.tsx              # Container detail
    └── container-detail-client.tsx

src/app/(app)/vessels/
├── page.tsx                  # Replaces placeholder
├── vessels-client.tsx
└── [vesselId]/
    ├── page.tsx              # Vessel detail
    └── vessel-detail-client.tsx
```

## How to apply

**Step 1.** Unzip `cargoflow-chunk4.zip` over your `cargoflow` folder. New files added, four placeholder pages replaced.

**Step 2.** Deploy the rules + indexes. Even though I didn't add new indexes in this chunk, doing this is a safe habit when any actions change:

```powershell
npm run deploy:rules
```

**Step 3.** Restart the dev server:

```powershell
# Ctrl+C in the npm run dev terminal, then:
npm run dev
```

## End-to-end test flow (the whole shipment workflow)

This walks through a full PO-to-vessel cycle to confirm everything works.

### Prerequisites
You should already have:
- At least one PO uploaded with items
- Some items moved through to **Completed** status with CBM declared (use the production page from Chunk 3)

If you don't have Completed items with CBM yet:
1. Go to `/production`
2. Click "..." on an item → "Update CBM & packages"
3. Enter CBM (e.g. `5.30`), package count (e.g. `68`), check "Also mark as Completed"
4. Save

### The flow

1. **Create a container manually**
   - Sidebar → Containers → "Add container"
   - Container number: `MSCU1234567` (or any string)
   - Type: 40FT
   - Save → appears in the grid with 0% utilization

2. **Assign items manually**
   - Click the card → opens detail page
   - "Assign items" → modal opens with all Completed items that have CBM
   - Tick some items → see the CBM math update at the top (current load + selected + after assign)
   - Click "Assign" → items become Loaded, container's CBM bar updates

3. **Try auto-allocate**
   - Back to /containers → "Auto-allocate" button
   - Pick container type (40FT)
   - "Generate plan" → see preview: how many items, how many new containers, total CBM, any skipped items
   - "Apply" → new containers are created, items are loaded into them

4. **Seal a container**
   - On a container's detail page, click "Seal container"
   - Confirm → container status becomes Sealed. You can no longer add/remove items.

5. **Create a vessel**
   - Sidebar → Vessels → "Create vessel"
   - Vessel ID: `CG-2026-04`
   - Name: `MSC AURORA` (optional)
   - Destination: `Maseru, Lesotho`
   - ETD/ETA: set future dates
   - Save

6. **Attach containers**
   - Click the vessel → detail page → "Attach containers"
   - Pick your sealed container(s) → Attach
   - Container is now linked. Vessel status changes from Planned to Loading.

7. **Dispatch**
   - On vessel detail page → "Dispatch vessel" (only enabled when all attached containers are Sealed)
   - Confirm → all containers become Shipped, all items inside become Shipped, vessel becomes Sailed

8. **Verify on the production page**
   - Sidebar → Production → filter by status "Shipped"
   - You should see all the items you just dispatched, with status pill = Shipped

## Auto-allocate algorithm details

The packing strategy:

1. **Sort items** by `deliveryDate` ascending (earliest first), then by `cbm` descending (bigger items first within a date)
2. **For each item**:
   - Find all Open containers that could fit it
   - Pick the one with the **smallest remaining space** that still fits (tightest pack = better utilization)
   - If nothing fits, **create a new container** of the chosen type
   - If the item is bigger than a whole empty container, **skip it** with a reason

The "tightest fit" approach packs small items into nearly-full containers first, leaving big empty containers for big items. This is closer to optimal than first-fit and works well in practice for sourcing items.

**Items larger than a container** are flagged in the preview. The merchant sees them in the "skipped" list with reasons. They stay in Completed status — the merchant has to split them manually (e.g. break a 70 CBM line item into multiple smaller items) before retrying.

## Vessel dispatch is atomic

The `dispatchVessel` action commits the vessel + all containers + all items in one batch (or multiple batches if >500 ops). Either all changes commit or none. If the dispatch fails halfway, no data is left in an inconsistent state.

## RBAC summary for Chunk 4

| Role | Containers | Vessels |
|---|---|---|
| Super admin | Full (create, assign, seal, dispatch) | Full |
| Merchant | Full | Full |
| Logistics | Create, assign, seal | View, update, dispatch |
| Supplier | View own (containers carrying their items) | View own (vessels carrying their items) |
| Viewer | Read-only | Read-only |

Suppliers see only containers/vessels that include items belonging to their supplierId. Enforced server-side in `getContainerDetail` and `getVesselDetail`.

## Known limitations

- **No PO-level CBM split**. If a line item is 70 CBM (bigger than a 40FT), auto-allocate skips it. You'd need to split the PO item into multiple smaller items manually. Real-world scenario: a fabric order that needs to ship across two containers should be entered as two separate PO items, e.g. "5000m / Roll batch A" and "5000m / Roll batch B".
- **Container number prefix is hardcoded** in auto-allocate as "CTR-XXXX". You can rename containers manually if you'd prefer different numbering — happy to make that configurable in a later pass.
- **No drag-and-drop allocation**. Selection is checkbox-based. Drag-drop is on the wish list for a polish pass.
- **No printable container manifest yet** — that comes in Chunk 5 (Packing Lists), since the packing list IS the container manifest.

## What's next

**Chunk 5 — Packing Lists & PDF Export** is the natural next step. It builds:
- Generate professional packing list per container per supplier
- PDF export matching the format of your sample packing list
- Print-friendly A4 layout with header, items grouped by PO, totals row, signature blocks
- Packing list number format `PL-{VesselID}-{ContainerNo}`
- One-click "Generate packing lists for vessel" — creates all of them at once
- Activity log entries for generation
- A "Packing Lists" page to list and re-download

After Chunk 5 you'll have a fully working shipment workflow: PO → Production → CBM → Container → Vessel → Packing List PDF → Dispatch. The remaining Chunk 6 is reports, audit log UI, admin user management, and the settings page.
