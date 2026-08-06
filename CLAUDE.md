# ClikixPress — WhatsApp Automation Dashboard

**Update this file whenever you change routes, auth, env vars, deployment config, or major functionality — this is a living doc, not a one-time snapshot.**

## What this is
A single-tenant WhatsApp automation dashboard (multi-WhatsApp-number management, bulk sending,
scheduled/recurring campaigns, a keyword chatbot, group/channel messaging, Google Sheets-driven
product broadcast queues, group member-add queues, and basic analytics). Backend features
(confirmed from `backend/src/routes/*.js`): numbers, contacts, templates, campaigns, bulk send
(SSE progress), chatbot, analytics, settings, Google Sheets sync, groups/channels, product
broadcast queue, group member-add queue, auth.

**⚠️ Auth is currently DISABLED (deliberate, temporary)**: every `/api/*` route and the frontend
route gate are open with no login required, while the login/domain/TLS deployment gets sorted out.
The full JWT + hashed-password + forgot-password system below still exists in the code and works —
it's just not being enforced. See "Auth" section for exactly what to restore and where.

## Architecture
- **Backend**: `backend/` — Express + `@whiskeysockets/baileys` (WhatsApp Web protocol) +
  `better-sqlite3` (file DB at `backend/src/db/index.js`). No Chromium/Puppeteer needed (Baileys is
  a pure WebSocket client) — see `backend/Dockerfile`. `railway.json` exists but is currently unused;
  the backend actually runs on a self-managed Bluehost VPS (Ubuntu 24.04, Docker), migrated off a
  DigitalOcean droplet — confirm the current IP in `frontend/vercel.json` before assuming it's stale.
- **Frontend**: `frontend/` — React + Vite + Tailwind. Deployed on Vercel; `frontend/vercel.json`
  rewrites `/api/:path*` to the backend VPS and serves `index.html` for all other routes (SPA).
  Local dev proxies `/api` via `vite.config.js` instead.
- **n8n**: also intended to run as a separate Docker container on the same VPS (port 5678) —
  unrelated to this app's own scheduler; check if actually deployed before assuming it's live.

## Auth (JWT, built but currently NOT ENFORCED — see warning above)
**To re-enable**: (1) in `backend/src/server.js`, put `requireAuth` back in front of every route
mounted after `/api/auth` (it was removed from all of them); (2) in `backend/src/routes/sheets.js`,
restore `router.use(requireAuth)` after the two OAuth routes and the two `jwt.verify()` calls inside
`/oauth/start` and `/oauth/callback` (both currently skip verification); (3) in `frontend/src/App.jsx`,
restore the `authed` state + gate that renders `<Login>` when logged out (git history has the exact
prior version — search for when this comment block was added). Login.jsx, ResetPassword.jsx, and
every backend auth route work correctly right now — only the *enforcement* was removed, not the
mechanism, so re-enabling is a small, contained change.
- `POST /api/auth/login` (`backend/src/routes/auth.js`, public) checks `req.body.password` against
  a **bcrypt hash stored in the `settings` table** (`dashboard_password_hash`, restricted key — see
  below), not directly against an env var, and returns a JWT signed with `process.env.JWT_SECRET`,
  7-day expiry.
- **Password storage/bootstrap**: `process.env.DASHBOARD_PASSWORD` is only used once, by
  `backend/src/db/index.js` on first boot, to seed `dashboard_password_hash` if no hash exists yet
  in the DB. After that the DB hash is the source of truth — env vars can't be rewritten by a running
  process, so this is what makes "Forgot password" resets actually persist across restarts/redeploys.
  Changing `DASHBOARD_PASSWORD` in `.env` after first boot has no effect unless the DB row is cleared.
- **Forgot/reset password**: `POST /api/auth/forgot-password` (public, no body) emails a 15-minute
  JWT reset link (`purpose: 'password-reset'`) to the single fixed `process.env.ADMIN_EMAIL` via
  `backend/src/services/emailService.js` (nodemailer; requires `SMTP_HOST/PORT/USER/PASS` in `.env` —
  fails with a clear 500 if unset, does not crash). `POST /api/auth/reset-password` verifies the
  token and overwrites `dashboard_password_hash`. Frontend: `frontend/src/pages/Login.jsx` has the
  "Forgot password?" trigger; `frontend/src/pages/ResetPassword.jsx` (route `/reset-password?token=`)
  is the only page reachable without being logged in — `App.jsx` special-cases that path before the
  `authed` gate. This is a single shared-password app (no user accounts), so resets always go to the
  one configured `ADMIN_EMAIL`, never an address from the request.
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
  routing on `sessionStorage.getItem('token')`. `frontend/src/layout/Layout.jsx` has a Logout button
  (sidebar + mobile drawer) that clears the token and reloads.
- **Required env vars** (`backend/.env`, gitignored — see `backend/.env.example` for the template):
  `DASHBOARD_PASSWORD` (first-boot bootstrap only, see above), `JWT_SECRET`. For "Forgot password"
  to work: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `ADMIN_EMAIL`. Never commit real values.
- **Google Sheets OAuth is also state-protected**: `/api/sheets/oauth/start` and `/oauth/callback`
  can't use `requireAuth` (Google's redirect carries no Bearer header), but they're not fully open —
  `oauth/start` requires `?token=<dashboard JWT>` and passes it through as Google's `state` param;
  `oauth/callback` verifies that `state` is still a valid JWT before exchanging the code. Without
  this, anyone who found the backend URL could hijack the single shared Google connection without
  ever logging into the dashboard. `frontend/src/pages/Sheets.jsx` builds the link with the token
  from `sessionStorage`.
- The Google refresh token is stored in the same `settings` table as user-facing preferences
  (`google_refresh_token` key) — `backend/src/routes/settings.js` explicitly excludes it (a
  `RESTRICTED_KEYS` set) from both `GET /api/settings` and `PUT /api/settings` so it can never be
  read back or overwritten through the general settings API. Keep that exclusion if the settings
  table grows more secret-like keys.

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
- `services/scheduler.js` — `node-cron`-driven campaign runner + broadcast/member queue tick + sheet
  sync. Owns `runMemberQueueNow` (exported, used by `routes/memberQueue.js`'s "Run Now") and an
  in-memory `queuesInProgress` lock keyed `broadcast:<id>` / `member:<id>` — prevents two overlapping
  runs of the *same* queue (a slow cron tick bleeding into the next tick, or "Run Now" racing a
  scheduled tick) from both reading a stale `current_index` and double-sending/double-adding before
  either writes its advance back. This is process-local (fine given the "no concurrent multi-instance
  support" constraint below) — would need real distributed locking if that ever changes.
- `services/sheetsService.js` — Google Sheets OAuth + read/write via `googleapis`.
- `services/aiService.js` — Gemini (`@google/generative-ai`) caption/reply generation.
- `services/emailService.js` — nodemailer wrapper, sends the "Forgot password" reset link.
- `services/telegramService.js` — Telegram Bot API wrapper (`sendTelegramMessage`/`sendTelegramPhoto`),
  requires `TELEGRAM_BOT_TOKEN`. Bot must be added as an admin (Post Messages permission) to any
  channel it sends to. Used by `scheduler.js` to cross-post Auto Broadcast schedules to Telegram.
- `utils/paths.js` — resolves `dbDir`/`sessionsDir`/`uploadsDir`, honoring `DATA_DIR` for persistent-volume deployments (Railway).

### `frontend/src/`
- `App.jsx` — auth gate + route table.
- `api/client.js` — axios instance: base URL, Bearer token attach, 401 handling.
- `pages/*.jsx` — one page per feature area (Login, ResetPassword, Dashboard, Numbers, BulkSender, Contacts, Templates, Campaigns, Chatbot, Analytics, Sheets, Groups, Broadcast, AutoBroadcast, AddMembers, Settings).
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
  slot fires (multi-slot-per-day support). Optional `telegram_chat_id` column (e.g. `@clikixpress`) —
  when set, the same product/moment also posts to that Telegram channel via `telegramService.js`,
  alongside the WhatsApp targets. NULL = WhatsApp-only, the default. Set via the "Also Post to
  Telegram" field on the Auto Broadcast create/edit form (`frontend/src/pages/AutoBroadcast.jsx`).
  Manual one-off sends (`routes/broadcast.js`) do NOT cross-post to Telegram — this is Auto Broadcast
  only.
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
- `frontend/vercel.json` proxies to the backend VPS's bare IP over plain HTTP, not HTTPS — traffic
  between Vercel and the backend is unencrypted. Worth putting a domain + TLS in front of the VPS.
- All SQL in `backend/src/routes/*.js` uses parameterized `better-sqlite3` `.prepare()` calls — no
  string-concatenated SQL was found.
- CORS is restricted to `process.env.FRONTEND_URL` when set, else allow-all (dev fallback).
- **`better-sqlite3` gotcha**: `.run()` throws on a JS `undefined` bind parameter (only `null` is
  accepted) — this bites PUT routes that destructure optional fields from `req.body` without a
  default, *even if* the SQL itself uses `COALESCE(?, col)`, because the throw happens at bind time,
  before SQL ever evaluates. Every PUT route in `backend/src/routes/*.js` now defaults optional
  destructured fields to `null` (or backfills from the existing row) specifically to avoid this —
  keep that pattern when adding new partial-update routes.
- Frontend pages that call a list endpoint returning `{ rows, total, page, pages }` (currently just
  `GET /api/contacts`) must read `.data.rows`, not treat the response as a bare array — several pages
  got this wrong historically (fixed in `Broadcast.jsx`, `AddMembers.jsx`).
