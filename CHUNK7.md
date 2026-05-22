# CargoFlow — Chunk 7: i18n (English + Simplified Chinese)

## What's new

- **Language toggle** in the top-right of the topbar — switches between English and 中文 instantly
- **Cookie-persisted preference** — once set, every page in the app shows in the chosen language
- **Supplier-facing UI fully translated** to Simplified Chinese: sidebar, dashboard, production page, status & CBM dialogs, status pills, role labels, common buttons
- **Admin-facing UI** can also use either language — the toggle is universal
- **Powered by `next-intl`** — the standard Next.js i18n library

## What gets translated

✅ **Translated:**
- Sidebar nav labels (Dashboard, Production, Containers, Vessels, etc.)
- Topbar dropdown items (Sign out, Profile)
- Dashboard greeting, KPI tile labels, table headers, panel titles, alerts
- Production page title, subtitle, KPI labels, filters, search placeholder, column headers, action menu, overdue badge
- Status pills (Pending → 待处理, In Progress → 进行中, etc.)
- Status update dialog (every label, button, toast)
- CBM update dialog (every label, button, toast, validation message)
- Role labels (Supplier → 供应商, Merchant → 商家, etc.)
- Common buttons (Cancel, Save, Update)
- Item-actions dropdown (Update status, Update CBM & packages)

❌ **Not translated (intentional):**
- Data entered by users: PO numbers, container numbers, vessel IDs, supplier names, product styles, colors, sizes
- The packing list PDF (per your requirement)
- Admin-only pages (Users, Settings, Activity) — left in English since merchants/admins are the primary users
- Less critical pages (PO list/detail, Container list/detail, Vessel list/detail, Packing lists list/detail) — supplier-readable but show mostly data fields rather than UI text. The page titles + headers remain English.

This is the pragmatic scope you asked for. Suppliers will get a fully Chinese experience on the pages they actually use (Production + dialogs). On other pages they'll see English headings with Chinese-translated nav and data labels.

## How language preference works

1. **Initial visit:** defaults to English
2. **User clicks the language toggle** (globe icon in the topbar) → picks 中文
3. The choice is saved in a cookie (`cargoflow-locale`) for 1 year
4. Every subsequent page request renders in Chinese
5. Cookie is per-browser, per-device — switching language on a laptop doesn't affect mobile

There's no DB write. No Firestore impact. Suppliers can switch freely without admin involvement.

## New files

```
messages/
├── en.json                              # 150+ English UI strings
└── zh.json                              # Simplified Chinese translations

src/i18n/
├── request.ts                           # next-intl config + locale cookie reader
└── actions.ts                           # Server Action to set the locale cookie

src/components/layout/
└── language-toggle.tsx                  # Dropdown for switching language

Modified:
- next.config.mjs                         # Wrapped with next-intl plugin
- src/app/layout.tsx                      # NextIntlClientProvider wrapper
- src/components/layout/sidebar.tsx       # nav labels translated
- src/components/layout/topbar.tsx        # role label, sign out translated; language toggle added
- src/components/production/status-pill.tsx
- src/components/production/status-update-dialog.tsx
- src/components/production/cbm-update-dialog.tsx
- src/components/production/item-actions.tsx
- src/app/(app)/dashboard/page.tsx
- src/app/(app)/production/production-client.tsx
- package.json                            # Added next-intl dependency
```

## How to apply

1. **Extract `cargoflow-chunk7.zip`** into `C:\xampp\htdocs\MAS_projects\locdev\` (parent of cargoflow). Let it merge.

2. **Install new dependency:**

```powershell
cd C:\xampp\htdocs\MAS_projects\locdev\cargoflow
npm install
```

This installs `next-intl` (~15KB to the supplier bundle).

3. **Restart the dev server:**

```powershell
npm run dev
```

4. **Test it:**
   - Sign in
   - Click the globe icon at the top right (next to the theme toggle)
   - Pick 中文 → entire UI flips to Chinese
   - Refresh the page → still in Chinese (cookie persists)
   - Sign out and sign in as a supplier user → also shows Chinese (cookie is per-browser)
   - Click globe → English to switch back

## How to translate more

If you find a piece of UI text still in English that should be translated:

1. Open `messages/en.json` and add a new key like `"po.detailMyNewLabel": "My new label"`
2. Open `messages/zh.json` and add the matching key: `"po.detailMyNewLabel": "我的新标签"`
3. In the component, replace the hard-coded text with `{t("detailMyNewLabel")}` (assuming `t = useTranslations("po")`)
4. Restart `npm run dev`

If you find a Chinese phrase that should be tweaked (better wording, more formal, etc.), just edit `messages/zh.json` directly. Save, refresh — done. No code changes needed.

## Build / deployment

The `next-intl` plugin needs to wrap `next.config.mjs` — that's already done in this chunk. Vercel will pick it up automatically on the next deploy.

After pushing this chunk to GitHub:

```powershell
git add .
git commit -m "Add EN/ZH i18n with language toggle"
git push
```

Vercel will auto-rebuild. The translation files (`messages/*.json`) are bundled into the build.

## Vercel env vars

No new env vars needed. The locale is purely a cookie value.

## Limitations to know

- **Untranslated pages fall back to English.** That's expected — suppliers won't see most admin pages anyway.
- **Date formatting stays the same** for now (yyyy-MM-dd). True locale-aware date formatting (like `Jan 15, 2026` ↔ `2026年1月15日`) is a small future tweak if you want it.
- **PDF packing list stays English.** Per your spec.
- **Plurals are simple.** For "1 item" vs "5 items" English uses different word forms; Chinese doesn't. The translation handles this naturally.

## What's still in English (and intentional)

- Login page (suppliers can use it but it's not yet translated; trivial to add later)
- All admin pages (Users, Suppliers, Settings, Activity, Reports)
- PO list/detail page columns and detail page headings
- Container/Vessel/Packing list pages (page title and section headers)

If you want any of these translated too, tell me which and I'll add another mini-chunk.
