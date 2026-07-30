# ClikixPress — WhatsApp Automation Dashboard

**Update this file whenever you change routes, auth, env vars, deployment config, or major functionality — this is a living doc, not a one-time snapshot.**

## What this is
A single-tenant WhatsApp automation dashboard (multi-WhatsApp-number management, bulk sending,
scheduled/recurring campaigns, a keyword chatbot, group/channel messaging, Google Sheets-driven
product broadcast queues, group member-add queues, and basic analytics), gated behind one shared
dashboard password. Backend features (confirmed from `backend/src/routes/*.js`): numbers, contacts,
templates, campaigns, bulk send (SSE progress), chatbot, analytics, settings, Google Sheets sync,
groups/channels, product broadcast queue, group member-add queue, auth.

## Architecture
- **Backend**: `backend/` — Express + `@whiskeysockets/baileys` (WhatsApp Web protocol) +
  `better-sqlite3` (file DB at `backend/src/db/index.js`). Deployed on Railway via
  `railway.json` → `backend/Dockerfile`.
- **Frontend**: `frontend/` — React + Vite + Tailwind. Deployed on Vercel; `frontend/vercel.json`
  rewrites `/api/:path*` to the backend (currently a raw IP, `http://168.144.151.196:5000` — not
  HTTPS, verify/update this before relying on it) and serves `index.html` for all other routes (SPA).
  Local dev proxies `/api` via `vite.config.js` instead.

## Auth (JWT, added — was previously a hardcoded client-side password)
- `POST /api/auth/login` (`backend/src/routes/auth.js`, public) checks `req.body.password` against
  `process.env.DASHBOARD_PASSWORD` and returns a JWT signed with `process.env.JWT_SECRET`, 7-day expiry.
- `backend/src/middleware/auth.js` (`requireAuth`) verifies `Authorization: Bearer <token>` on every
  other `/api/*` route, mounted per-route in `backend/src/server.js`.
- Exception: `backend/src/routes/sheets.js` mounts with no top-level middleware because
  `/oauth/start` and `/oauth/callback` are hit directly by the browser/Google redirect (no Bearer
  token available there) — `requireAuth` is applied inside that file to every other route via
  `router.use(requireAuth)` placed after the two OAuth routes.
- Frontend: `frontend/src/pages/Login.jsx` POSTs to `/api/auth/login`, stores the JWT in
  `sessionStorage.token`. `frontend/src/api/client.js` attaches it as `Authorization: Bearer` on
  every request via an axios request interceptor, and a response interceptor clears the token and
  reloads the page on any 401 (except from `/auth/login` itself). `frontend/src/App.jsx` gates
  routing on `sessionStorage.getItem('token')`.
- **Required env vars** (`backend/.env`, gitignored — see `backend/.env.example` for the template):
  `DASHBOARD_PASSWORD`, `JWT_SECRET`. Never commit real values for these.

## Directory map
### `backend/src/`
- `server.js` — Express app setup, route mounting + auth middleware, scheduler start, graceful shutdown.
- `db/index.js` — SQLite schema (CREATE TABLE IF NOT EXISTS) + lightweight column migrations + default settings seed.
- `middleware/auth.js` — JWT verification middleware.
- `routes/auth.js` — login endpoint.
- `routes/numbers.js` — connect/disconnect/QR/reset/activate/limits/warmup/diagnose per WhatsApp number.
- `routes/contacts.js` — CRUD, CSV/sheet import, search/filter/paginate.
- `routes/templates.js` — message template CRUD + AI-generate.
- `routes/campaigns.js` — scheduled/recurring campaign CRUD.
- `routes/bulkSend.js` — one-off bulk send with SSE progress stream, `{name}/{date}/{vehicle}` variables.
- `routes/chatbot.js` — keyword-reply flow CRUD + live test endpoint.
- `routes/analytics.js` — read-only stats.
- `routes/settings.js` — key/value settings CRUD.
- `routes/sheets.js` — Google OAuth (public callback), sheet config CRUD, sync, product listing.
- `routes/groups.js` — group/channel cache refresh, add channel by link/JID, send to groups.
- `routes/broadcast.js` — AI caption generation + immediate/batch product send from a sheet.
- `routes/broadcastQueue.js` — recurring product broadcast queue CRUD (drip-feeds products to targets).
- `routes/memberQueue.js` — recurring group member-add queue CRUD (drip-adds contacts to a WA group).
- `services/waManager.js` — Baileys client lifecycle per number (connect/QR/session/send/groups).
- `services/scheduler.js` — `node-cron`-driven campaign runner + broadcast/member queue tick + sheet sync.
- `services/sheetsService.js` — Google Sheets OAuth + read/write via `googleapis`.
- `services/aiService.js` — Gemini (`@google/generative-ai`) caption/reply generation.
- `utils/paths.js` — resolves `dbDir`/`sessionsDir`/`uploadsDir`, honoring `DATA_DIR` for persistent-volume deployments (Railway).

### `frontend/src/`
- `App.jsx` — auth gate + route table.
- `api/client.js` — axios instance: base URL, Bearer token attach, 401 handling.
- `pages/*.jsx` — one page per feature area (Login, Dashboard, Numbers, BulkSender, Contacts, Templates, Campaigns, Chatbot, Analytics, Sheets, Groups, Broadcast, AutoBroadcast, AddMembers, Settings).
- `components/NumberSwitcher.jsx`, `components/PhoneMockup.jsx` — shared UI widgets.
- `layout/Layout.jsx`, `layout/navItems.js` — shell/nav.

## Operational facts
- **Run locally**: backend — `cd backend && npm run dev` (nodemon) or `npm start`; needs `backend/.env`
  with at least `DASHBOARD_PASSWORD`, `JWT_SECRET`, `PORT` (default 5000). Frontend —
  `cd frontend && npm run dev` (Vite, proxies `/api` to `http://localhost:5000`).
- **Broadcast queue** (`services/scheduler.js` + `routes/broadcastQueue.js`): each queue holds an
  ordered `product_ids` list and a `current_index`; on each matching `send_time`/`send_times` slot
  (IST HH:MM, checked every minute per recent commit history) it sends `products_per_day` products
  to `target_ids` and advances the index, only rolling `next_send_at` forward after the *last* daily
  slot fires (multi-slot-per-day support).
- **Member queue** (`routes/memberQueue.js`): same drip pattern for adding contacts to a WhatsApp
  group — `members_per_day` per cycle, `delay_seconds` between each add, JID built by prefixing `91`
  to bare 10-digit numbers.
- **WhatsApp session data**: lives on disk per number under `backend/sessions` (gitignored; `DATA_DIR`
  env var relocates this + the DB + uploads to a persistent volume in production).

## Known constraints (verified from code)
- SQLite is file-based at `backend/data/designoia.db` (or `<DATA_DIR>/db/designoia.db` if `DATA_DIR`
  is set) — no concurrent multi-instance support.
- WhatsApp session state (`backend/sessions`) is per-account and tied to the filesystem; without a
  mounted persistent volume (`DATA_DIR`) on Railway, sessions/DB/uploads are wiped on every redeploy.
- `frontend/vercel.json` currently proxies to a bare IP over plain HTTP, not the Railway HTTPS domain
  — confirm this is intentional/current before treating it as the source of truth.
- All SQL in `backend/src/routes/*.js` uses parameterized `better-sqlite3` `.prepare()` calls — no
  string-concatenated SQL was found.
- CORS is restricted to `process.env.FRONTEND_URL` when set, else allow-all (dev fallback).
