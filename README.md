# CargoFlow

Smart consignment & container tracking platform for global sourcing operations.

Built with **Next.js 15 (App Router) + TypeScript + Tailwind + Firebase**.

---

## What's in this Foundation (Chunk 1)

This release ships the production-grade shell of the app. It runs, authenticates, gates routes by role, and renders a branded UI in both light and dark modes. Business modules (PO upload, container allocation, packing lists, reports) build on top of it in Chunks 2-6.

**Included:**

- Next.js 15 App Router with route groups and middleware
- Firebase Auth (email + password, password reset email, HTTP-only session cookies)
- Firestore client SDK + Admin SDK wiring
- Five-role RBAC: `super_admin`, `merchant`, `supplier`, `logistics`, `viewer`
- Permission map in `src/lib/rbac/permissions.ts` — single source of truth for what each role can do
- Firestore security rules enforcing role-based access AND supplier isolation
- Composite Firestore indexes for the queries we'll run
- Branded login + password-reset screens (Framer Motion, gradient blob backgrounds)
- App shell: collapsible sidebar (role-aware menu), topbar with user menu, dark mode toggle
- TypeScript types for all Firestore collections in `src/types/index.ts`
- Bootstrap script to create the first super_admin user
- Settings seed script (sales channels + category keywords)

**Not included yet (next chunks):**

- Chunk 2: PO upload module (parser is already done — `poParser.ts`)
- Chunk 3: Production tracking + supplier CBM entry
- Chunk 4: Container allocation (auto + manual) + vessel management
- Chunk 5: Packing list generator + PDF export
- Chunk 6: Reports, audit log UI, admin pages (users / suppliers / settings)

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Firebase project

1. Go to <https://console.firebase.google.com> and create a new project.
2. Enable **Authentication** → **Email/Password** provider.
3. Enable **Firestore Database** (in production mode).
4. Project Settings → General → **Your apps** → add a Web app. Copy the config values.
5. Project Settings → **Service accounts** → **Generate new private key**. A JSON file downloads — keep it safe.

### 3. Environment variables

Copy `.env.example` to `.env.local` and fill in:

- The 6 `NEXT_PUBLIC_FIREBASE_*` values from the web-app config.
- `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY` from the service-account JSON (`project_id`, `client_email`, `private_key`).

### 4. Deploy Firestore rules + indexes

Install Firebase CLI once: `npm install -g firebase-tools`, then:

```bash
firebase login
firebase use --add        # select your project
npm run deploy:rules      # deploys firestore.rules + indexes
```

### 5. Bootstrap the first super_admin

This solves the chicken-and-egg problem (rules require an admin to create users, but there's no admin yet).

Add these to `.env.local`:

```env
BOOTSTRAP_ADMIN_EMAIL=you@yourcompany.com
BOOTSTRAP_ADMIN_NAME="Your Name"
```

Then run:

```bash
node --env-file=.env.local scripts/bootstrap-admin.mjs
```

The script:
1. Creates a Firebase Auth user with that email.
2. Writes a Firestore user doc with `role: "super_admin"`, `active: true`.
3. Generates a password-reset link and prints it to the console.

**Open the printed link in a browser to set your password.** Now you can sign in.

### 6. Seed defaults

```bash
node --env-file=.env.local scripts/seed-settings.mjs
```

Writes:
- `settings/global` doc with brand defaults, 92% usable CBM, and category keyword lists.
- Six default `sales_channels` (Amazon, Walmart, Retail, Wholesale, Shopify, TikTok Shop).

### 7. Run

```bash
npm run dev
```

Visit `http://localhost:3000`, sign in with the email and password from steps 5-6.

---

## Deploying to production

### Option A: Vercel (recommended for Next.js)

```bash
npm install -g vercel
vercel
```

Set the same env vars in the Vercel dashboard. For `FIREBASE_ADMIN_PRIVATE_KEY`, paste the whole multi-line value — Vercel will escape it correctly.

### Option B: Firebase Hosting + Cloud Functions

Firebase Hosting alone can't run Next.js App Router with server actions. You need Cloud Functions for SSR. Vercel is simpler unless you have a hard requirement to keep everything in Firebase.

---

## Project structure

```
src/
├── app/
│   ├── (app)/                    # Authenticated route group
│   │   ├── layout.tsx            # Sidebar + topbar shell
│   │   ├── dashboard/
│   │   ├── purchase-orders/      # placeholder — Chunk 2
│   │   ├── production/           # placeholder — Chunk 3
│   │   ├── containers/           # placeholder — Chunk 4
│   │   ├── vessels/              # placeholder — Chunk 4
│   │   ├── packing-lists/        # placeholder — Chunk 5
│   │   ├── reports/              # placeholder — Chunk 6
│   │   └── admin/
│   │       ├── users/            # placeholder — Chunk 6
│   │       ├── suppliers/        # placeholder — Chunk 2
│   │       ├── settings/         # placeholder — Chunk 6
│   │       └── activity/         # placeholder — Chunk 6
│   ├── login/page.tsx
│   ├── reset-password/page.tsx
│   ├── api/auth/session/route.ts # session cookie endpoint
│   └── layout.tsx                # root layout (providers)
├── components/
│   ├── auth/                     # AuthProvider, <Can> gate
│   ├── layout/                   # Sidebar, Topbar, ModulePlaceholder
│   └── ui/                       # ShadCN-style primitives
├── lib/
│   ├── firebase/                 # client.ts, admin.ts, collections.ts
│   ├── rbac/                     # permissions.ts, session.ts
│   └── utils/                    # cn, formatters
├── types/                        # Domain types (UserDoc, POItemDoc, etc.)
└── middleware.ts                 # Edge-level cookie gate
scripts/
├── bootstrap-admin.mjs           # one-time: create first super_admin
└── seed-settings.mjs             # idempotent: defaults + sales channels
firestore.rules                   # RBAC + supplier isolation
firestore.indexes.json
```

---

## How RBAC works (read this once)

There are three layers of access control:

1. **Middleware (`src/middleware.ts`)** — fast edge-level check: is there a session cookie? If not, redirect to `/login`. Doesn't validate the cookie deeply — that's expensive and the next layers catch it anyway.

2. **Server-side page guards** — every page (or layout) that needs auth calls `getSessionUser()` from `src/lib/rbac/session.ts`. This verifies the session cookie, loads the user doc, and checks `active === true`. If not authenticated, redirect to login.

3. **Firestore security rules (`firestore.rules`)** — the actual data shield. Even if someone bypasses the UI, Firestore enforces role + supplier isolation at the database level. Suppliers can only read their own `po_items` (filtered by `supplierId`), can only update specific fields (status/CBM/remarks), and so on.

The client-side `<Can permission="...">` component is for UX (hiding buttons users can't use), NOT for security. Real enforcement is in layers 2 and 3.

---

## Adding the PO parser (already built)

`poParser.ts` (delivered separately) goes into `src/lib/poParser.ts`. It's already TypeScript and uses `xlsx` (already in package.json). Chunk 2 wires it into the upload UI.

---

## Troubleshooting

- **"Firebase Admin env vars missing"** — make sure `.env.local` exists and you ran scripts with `node --env-file=.env.local`.
- **"PRIVATE KEY parse error"** — your `FIREBASE_ADMIN_PRIVATE_KEY` is probably missing newline characters. Either paste the raw multi-line PEM value, or escape newlines as `\n` literals.
- **Sign-in works but the page just reloads to /login** — the session cookie isn't being set. Check that `secure: process.env.NODE_ENV === "production"` matches your dev URL (localhost should be `http://`, not `https://`).
- **"Missing or insufficient permissions" in Firestore** — you probably haven't deployed the rules. Run `npm run deploy:rules`.
