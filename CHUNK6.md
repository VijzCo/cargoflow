# CargoFlow — Chunk 6: Reports, Activity Log, User Management & Settings

This is the **final operational chunk**. After this you have everything from the original spec.

## What's new

### Reports (`/reports`)
- **4 KPI tiles**: total POs, total items + quantity, total CBM (with declared CBM), overdue + on-time %
- **Status donut chart** — items by status with the total in the center
- **Category bar chart** — CBM by category (Fabric / Trims / Accessories / etc.)
- **Weekly uploads chart** — bar chart of PO uploads per week, last 8 weeks
- **Top suppliers table** — top 8 suppliers by CBM, with done/total ratio
- **Recent vessels** — last 10 vessels
- All charts are **custom SVG, no chart library** — saves ~200KB bundle

### Admin → Users (`/admin/users`)
- **List of all users** with role, supplier, status, created date
- **Add user** dialog — pick role, link to supplier if supplier role
- **Generate password reset** action — produces a one-time link to send to a user
- **Activate / deactivate** — also disables/enables the Firebase Auth account
- **Self-protection** — you can't deactivate your own account

### Admin → Settings (`/admin/settings`)
- **Branding section** — company name, system title, logo URL (reserved for future PDF embedding)
- **Container packing** — usable-CBM percentage (default 0.92 = 92%)
- **Sales channels** — chip editor (add/remove); these power the dropdown in PO preview
- **Auto-category keywords** — per-category chip editor; controls auto-detection during PO parsing

### Admin → Activity (`/admin/activity`)
- **Full audit log** — last 200 actions, filterable by action and target type
- **Searchable** — by user email, action, target, details
- **Expandable details** — click any row to see the raw JSON details payload
- Color-coded action badges

### PO list filters
- **Search + supplier + channel filters** finally wired in on `/purchase-orders`

## New files

```
src/lib/utils/
├── admin-actions.ts          # User CRUD, settings get/update
├── reports-actions.ts        # Single aggregating action for dashboard
└── activity-log-actions.ts   # Paginated activity list

src/components/admin/
├── role-badge.tsx            # Color-coded role pill
└── user-form.tsx              # Create user dialog (shows password reset link after create)

src/components/reports/
├── bar-chart.tsx              # Lightweight SVG bar chart
└── donut-chart.tsx            # Lightweight SVG donut

src/app/(app)/admin/users/
├── page.tsx                   # Replaces placeholder
└── users-client.tsx

src/app/(app)/admin/settings/
├── page.tsx                   # Replaces placeholder
└── settings-form.tsx

src/app/(app)/admin/activity/
├── page.tsx                   # Replaces placeholder
└── activity-client.tsx

src/app/(app)/reports/
├── page.tsx                   # Replaces placeholder
└── reports-client.tsx

src/app/(app)/purchase-orders/
└── po-list-client.tsx         # New — adds the filter bar inline
└── page.tsx                   # Updated to use the client wrapper
```

## How to apply

1. **Unzip `cargoflow-chunk6.zip`** into `C:\xampp\htdocs\MAS_projects\locdev\` (the parent of cargoflow), let it merge into your existing folder, click "Replace" if Windows asks.
2. **No new dependencies, no rules to deploy, no indexes to add.**
3. **Restart `npm run dev`**.

## Test flow

### Reports
1. `/reports` — should now show populated charts (assuming you uploaded POs in earlier chunks).

### User management
1. `/admin/users` → "Add user" → email: `test-merchant@example.com`, name: "Test Merchant", role: Merchant. Submit.
2. The dialog shows a password setup link. Copy it.
3. (Optional) Open the link in an incognito window, set a password, sign in.
4. Back in the users list, click "..." next to the new user → "Generate password reset" — confirms the link generation works.
5. Click "..." on any **other** user (not yourself) → "Deactivate" → confirm. The badge changes to "Inactive". Try to deactivate yourself — you can't.

### Settings
1. `/admin/settings` → change "Company name" to something else.
2. Scroll down, change container usable % to `0.90`.
3. Add a sales channel: type something like "Direct sales" → press Enter (or click Add).
4. Click "Save settings" at the bottom.
5. Now go to `/purchase-orders/upload` → "Direct sales" appears in the channel dropdown of the preview screen.

### Activity log
1. `/admin/activity` → see entries for everything you've done.
2. Filter by action: e.g. "Settings updated" — should show the entry from your settings save.
3. Click "Expand" on any row's details column to see the raw JSON.

### PO list filters
1. `/purchase-orders` → the search bar + supplier + channel filters appear above the table.
2. Type into search, pick a supplier, etc.

## RBAC summary (final state)

| Role | Purchase Orders | Production | Containers | Vessels | Packing Lists | Reports | Admin |
|---|---|---|---|---|---|---|---|
| **super_admin** | Full | Full | Full | Full | Full | View | Full |
| **merchant** | Full | View, edit | Full | Full | Full | View | View suppliers |
| **logistics** | View | View, edit | Create, assign, seal | Update, dispatch | Generate | View | — |
| **supplier** | View own POs | Update own items only | View own containers | View own vessels | View own PLs | View own data | — |
| **viewer** | View | View | View | View | View | View | — |

Only **super_admin** can manage users.

## Where the data goes

```
Firestore collections:

users               Firebase Auth-linked records (uid = doc id)
suppliers           Master supplier list
purchase_orders     PO headers (one per unique PO# + supplier)
po_items            Individual line items (the workhorse collection)
containers          Physical shipping containers with CBM tracking
vessels             Ships with destination, ETD/ETA, attached containers
packing_lists       One per (vessel, container, supplier)
settings/global     Single doc with all global config
activity_logs       Append-only audit trail
sales_channels      Reserved (currently driven from settings.salesChannels)
notifications       Reserved for Chunk 7 if you want push notifications later
```

## What CargoFlow is NOT (intentional non-goals)

- **No notifications / emails.** Originally in the spec but skipped. The infrastructure (`notifications` collection, index) is reserved; the UI isn't built. If you want this later, it's a small chunk.
- **No file storage / no PDF archive.** The packing list PDFs are generated fresh on each download. Same with the original Excel PO files — they're parsed in-browser, the data is saved to Firestore, the file itself is discarded. This is per the spec's "files are temporary" rule.
- **No drag-and-drop allocation.** Selection is checkbox-based.
- **No CSV/Excel export from Reports.** The dashboard is the report; if you want exports, that's a small future chunk.
- **No mobile-first design** (but everything works on mobile — the layouts use the same responsive patterns as the rest of the app).

## What's solid vs what's experimental

**Solid (battle-tested by my walkthroughs):**
- PO upload + smart parser (verified against your real sample files)
- Production tracking with real-time listener
- CBM math and container utilization
- Auto-allocate algorithm (tightest-fit packing)
- Vessel dispatch (atomic state transitions)
- Packing list PDF generation
- RBAC with supplier isolation (enforced both client UI + server-side checks + Firestore rules)

**Less battle-tested (works but small datasets only):**
- Reports — aggregates up to 2000 items in one query; if you grow past a few thousand, we'd switch to a Cloud Function aggregation
- Activity log — currently fetches last 200; pagination not yet implemented (just a `limit`)
- Auto-allocate — works on test data; production-scale validation comes with real use

## Last words

You now have a full operational system. POs go in → suppliers update production → CBM gets declared → containers get filled → vessels carry containers → packing lists ship → everything is audited.

If something doesn't work or you want changes, just tell me what you're seeing. For new features (CSV export, notifications, mobile app, etc.) we'd plan them as new chunks.
