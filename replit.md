# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + Tailwind + Framer Motion + Recharts
- **Design**: Classic dark theme — zinc palette (zinc-950/900/800), blue accent (#3b82f6), clean minimal UI

## Application: FB UID Manager Pro v2

Full-featured Facebook UID tracking and management web app with per-device data isolation, analytics, and PWA support.

### Auth & Isolation
- Password-based login (`adbc4231` default, overridable via `APP_PASSWORD` env var)
- Per-device data isolation: each device gets a UUID (`dev_<uuid>`) stored in localStorage as its userId — no shared data between devices

### Core Features
- **Bulk import**: paste UIDs one per line (`uid` or `uid|password` format), auto-deduplication
- **Checked/Visited tracking**: clicking the UID link marks it checked; `visitedAt` timestamp stored for analytics
- **Save/Pin**: mark important IDs as saved
- **Notes**: per-item rich notes (up to 1000 chars)
- **Tags**: VIP / Hot / New / Done / Skip tags with colored badges
- **Bulk actions**: select multiple, bulk check/uncheck/save/delete/copy
- **Search**: filter by UID or note text
- **Sort**: newest, oldest, checked, unchecked, saved
- **Filter tabs**: All / Checked / Unchecked / Saved / Noted / Tagged
- **Copy formats**: UID|Pass, UID only, Pass only
- **Export**: copy or download as .txt or .csv per category (Checked/Unchecked/Saved)

### UX Features (Task #3)
- **Undo delete**: 6-second undo bar after deletion with item restoration
- **Swipe-to-delete**: swipe left on mobile to reveal red delete overlay
- **Infinite scroll**: 50 items at a time, loads more as you scroll
- **Settings panel**: font size (S/M/L), compact/full view mode — both persisted
- **Compact view**: 2-column dense grid layout
- **PWA**: installable, service worker for offline caching

### Analytics (Task #2)
- **Stats bar**: Total / Checked / Left / Saved counts with gradient progress bar
- **Analytics panel** (collapsible): Pie chart (Checked/Unchecked/Saved) + Bar chart (daily checks last 7 days)
- **Daily stats API**: `GET /api/facebook-ids/daily-stats` returns 7-day activity with zero-fill

### UI Design (Task #4)
- **Animated login page**: typewriter title, floating orb background, grid pattern, spring icon, shimmer button, shake on wrong password
- **Magic bottom navigation bar**: 5-tab (Home/Search/Import/Charts/Config), spring physics pill indicator, glassmorphism style

### Admin
- Admin panel at `/admin` — lists all users with UID counts (requires `ADMIN_USER_ID` env var or "admin" in email)

## DB Schema: `facebook_ids`
| Column | Type | Notes |
|--------|------|-------|
| id | serial | PK |
| userId | varchar | device UUID |
| uid | varchar(255) | Facebook UID |
| password | varchar(500) | optional |
| pinned | boolean | "Saved" |
| visited | boolean | "Checked" |
| note | varchar(1000) | optional note |
| tag | varchar(50) | VIP/Hot/New/Done/Skip |
| visitedAt | timestamp | set when visited=true |
| createdAt | timestamp | auto |

## Key API Routes
- `POST /api/auth/login` — password + deviceId → session
- `GET /api/facebook-ids` — list current device's IDs
- `POST /api/facebook-ids/bulk-import` — import UIDs with dedup
- `PATCH /api/facebook-ids/:id` — update visited/pinned/note/tag (sets visitedAt on visited=true)
- `DELETE /api/facebook-ids/:id` — delete one
- `DELETE /api/facebook-ids` — clear all
- `GET /api/facebook-ids/stats` — total/visited/unvisited/pinned counts
- `GET /api/facebook-ids/daily-stats` — 7-day check activity

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server
│   └── fb-id-manager/      # React + Vite frontend
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas
│   ├── db/                 # Drizzle ORM schema + DB connection
│   └── replit-auth-web/    # Custom password auth hook
├── scripts/
└── pnpm-workspace.yaml
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

- **Always typecheck from the root** — run `pnpm run typecheck`
- **`emitDeclarationOnly`** — only `.d.ts` files emitted; bundling via esbuild/vite
- **Project references** — cross-package imports resolved via references

## Root Scripts

- `pnpm run build` — typecheck then recursively build all packages
- `pnpm run typecheck` — `tsc --build --emitDeclarationOnly`

## DB Migrations

In development: `pnpm --filter @workspace/db run push` (or `push-force`).
Production migrations handled by Replit on publish.
