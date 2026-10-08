# Supabase Egress Investigation — OMS Dashboard

Investigation only. No code was changed. All findings cite `api/index.js` (the only production backend, routed via `vercel.json` → `/api/(.*)` → `api/index.js`), `src/pages/Dashboard.jsx`, `src/context/AuthContext.jsx`, and related components.

---

## 1. Summary answer (what is driving egress)

Egress is high because of three multiplying factors:

1. **No HTTP compression on the API.** There is NO `compression` middleware and NO manual `Content-Encoding` anywhere in `api/index.js` (confirmed: a search for `compression|Content-Encoding|res.setHeader|Cache-Control` across `api/` returns zero matches). Every JSON response leaves Supabase→serverless→browser as raw, uncompressed text. JSON of this shape typically compresses 75–90%. This single gap inflates ALL egress by roughly 4–8×.

2. **`select('*')` on the two biggest tables returned in full, every poll.** `/api/orders` does `supabase.from('orders').select('*')` with no limit, no pagination, no date filter — it returns every order with ~50 columns, including many large free-text columns (`remarks`, `delivery_remarks`, `payment_remarks`, `installation_remarks`, `site_verification_remarks`, `section_drawing_remarks`, `advance_bill_remarks`, `photography_remarks`, `site_video_remarks`, `review_remarks`) plus `payment_proof_url` / `audit_proof_url`. `/api/orders/payments/all` does `select('*')` on `payments` AND a second `select(...)` on `orders`.

3. **Every logged-in user polls the full orders list on a 2-minute timer, forever.** `Dashboard.jsx` runs `setInterval(() => { fetchOrders(); fetchDeletedOrders(); fetchPaperRequests() }, 120000)`. With ~15–20 users (number stated in the cache comment in `api/index.js`), that is a continuous background load of full-table reads regardless of whether data changed.

The in-memory cache (`cacheGet`/`cacheSet`) **reduces Supabase→serverless egress on warm hits**, but does NOT reduce serverless→browser egress at all (every poll still ships the full payload to each browser), and on Vercel the cache is per-instance and frequently cold, so DB-side egress relief is partial.

**Biggest, lowest-risk win by far: enable gzip/brotli compression on the API.** Combined with trimming `select('*')` and lightweight change-detection for the 2-minute poll, 60–70% total egress reduction is realistic.

---

## 2. Evidence — every Supabase read in `api/index.js`

### Heavy list endpoints (polled and/or large)

| Endpoint | Query | Limit / filter | Columns | Cache (TTL) | Notes |
|---|---|---|---|---|---|
| `GET /api/orders` | `orders.select('*')` | **none** | ALL ~50 cols incl. 10+ remark/text cols | `orders` (10 min) | **Top contributor.** Returns entire table every miss; polled every 2 min by every user. |
| `GET /api/orders/payments/all` | `payments.select('*')` **+** `orders.select('id,order_no,client,date,total_amount,received_amount,balance')` | `payments` none; ordered by date | payments all cols + 7 order cols | `payments_all` (10 min) | Two full reads. `payments` is `select('*')`. |
| `GET /api/orders/deleted/all` | `deleted_orders.select('*')` | **none** | `data` JSONB blob per row (full order snapshot) + audit | `deleted_orders` (15 min) | Each row embeds a whole order object in `data`. Polled every 2 min via `fetchDeletedOrders`. |
| `GET /api/orders/reminders/due` | `reminders.select('*')` | **none** (filtered in JS) | all cols incl. `response_text` free text | `reminders_all` (5 min) | Fetches ALL reminders then filters in Node — full table crosses the wire from Supabase even though user sees a subset. |
| `GET /api/orders/reminders/all` | `reminders.select('*')` order by created_at | **none** | all cols incl. `response_text` | `reminders_all` (5 min) | Polled every 30 s while on Reminders tab AND every 30 s by the response-notification checker (`checkNewResponses`) regardless of tab. |
| `GET /api/complaints` | `complaints.select('*')` order by id | **none** | all cols incl. `problem_reported`, `resolution`, `problem_identified`, and `resolution_history` JSONB array | **not cached** | Full table, uncached, includes a growing JSONB history array per row. |
| `GET /api/users/login-logs` | `login_logs.select('*')` order by logged_in_at | `.limit(limit)` default **500** | all cols incl. `user_agent` (long strings), lat/lon, city, country | not cached | Admin-only; 500 rows × long UA strings. Bounded but heavy per call. |
| `GET /api/orders/edit-logs/all` | `order_edit_history.select('*')` | `.limit(500)` | all cols incl. `changes` JSONB array | not cached | Admin audit; bounded. |
| `GET /api/orders/:id/edit-logs` | `order_edit_history.select('*').eq(order_id)` | per-order | `changes` JSONB | not cached | Small, on-demand. |
| `GET /api/orders/paper-requests/all` | `paper_requests.select('*')` | none | all cols | `paper_requests_all` (5 min) | Moderate size. |
| `GET /api/orders/return-requests/all` | `return_requests.select('*')` | none | all cols | `return_requests_all` (5 min) | Moderate size. |

### Small / bounded reads (low egress — leave as-is)

- `GET /api/sales-reps` — mapped to `{id,name}`, cached 30 min. Tiny.
- `GET /api/users/list` — explicit `select('id, username, full_name, role')`, cached 30 min. Tiny.
- `GET /api/users` (admin) — explicit column list incl. `plain_password`; admin-only, not polled. Small.
- `GET /api/users/groups` — `select('*')` on `groups`; few rows. Small.
- `GET /api/app-version` — `app_settings.select('value').eq('key','app_version').limit(1)`, cached 5 min. **Tiny** — returns `{version:'...'}`. The 60 s version poll (below) is cheap.
- `authenticate()` force-logout check — `users.select('force_logout_at').eq('id',...)`, cached per-user 30 s. One tiny field. Low.
- `GET /api/orders/:id`, `/api/orders/:id/payments`, `paper-requests/my`, `return-requests/my` — on-demand, scoped by id/user. Low.

### Writes / mutations
Numerous `insert`/`update`/`delete` calls exist (orders, payments, reminders, complaints, paper/return requests). These are **ingress-dominated**, not egress, except where they do a read-back `.select()` of the inserted row (small). Not a primary egress concern.

---

## 3. Evidence — frontend polling & refetch behavior

### `src/pages/Dashboard.jsx`
- **Line ~245** — on mount: `fetchOrders(); fetchDeletedOrders(); fetchPaperRequests()`.
- **Line ~249** — **2-minute global auto-refresh**: `setInterval(() => { fetchOrders(); fetchDeletedOrders(); fetchPaperRequests() }, 120000)`. This is the main repeating cost. `fetchOrders()` → `GET /api/orders` (full table), `fetchDeletedOrders()` → `GET /api/orders/deleted/all` (full snapshots), `fetchPaperRequests()` → **5 parallel GETs** (`paper-requests/all`, `paper-requests/my`, `users/list`, `return-requests/all`, `return-requests/my`).
- **Line ~257** — on Reminders tab: `setInterval(fetchAllReminders, 30000)` → `GET /api/orders/reminders/all` every 30 s.
- **Line ~291** — `checkNewResponses` **every 30 s regardless of tab**: `GET /api/orders/reminders/all` (full reminders list) to detect new responses. Runs for all users continuously.
- **Line ~346** — `checkPaperRequests` every 30 s: 2 parallel GETs (`paper-requests/my`, `return-requests/my`). Small but frequent.
- `fetchAllPayments` → `GET /api/orders/payments/all` fires on demand when the "Payment Update" daily filter is clicked (line ~2380), not on a timer.
- `ComplaintsManagement.jsx` `fetchComplaints` → `GET /api/complaints` on mount of that view (not on a timer).
- `UserManagement.jsx` `fetchLoginLogs` → `GET /api/users/login-logs?limit=500` on demand (admin).

### `src/context/AuthContext.jsx`
- **Line ~80** — daily refresh checker `setInterval(checkDailyRefresh, 20000)`: **pure client-side**, no API call. Zero egress.
- **Line ~121** — version checker `setInterval(checkVersion, 60000)`: calls `GET /api/app-version` every 60 s. Response is `{version:'...'}` and cached 5 min server-side — **negligible egress** (tens of bytes). Keep it; just ensure it stays tiny (it is).
- **Login** also calls `/api/app-version` once to baseline. Negligible.

### Net repeating egress per user (steady state)
- Every 2 min: full orders + full deleted orders + 5 paper/return/users calls.
- Every 30 s: full reminders list (`checkNewResponses`), plus my-requests pair; reminders-tab doubles reminders polling.
- Every 60 s: tiny version check.

The 30 s reminders full-list poll and the 2 min full-orders poll, multiplied by ~15–20 users and shipped uncompressed, are the dominant steady-state egress.

---

## 4. Evidence — cache layer

`api/index.js` defines an in-memory TTL cache: `_cache`, `cacheGet`, `cacheSet`, `cacheDel`, `cacheClear`, with TTLs `TTL_ORDERS=10m`, `TTL_DELETED=15m`, `TTL_PAYMENTS_ALL=10m`, `TTL_REMINDERS=5m`, `TTL_PAPER=5m`, `TTL_USERS_LIST=30m`, `TTL_SALES_REPS=30m`, `TTL_APP_VERSION=5m`. Cached endpoints: orders, deleted orders, payments/all, reminders (both routes share `reminders_all`), paper-requests/all, return-requests/all, users/list, sales-reps, app-version. Complaints, login-logs, edit-logs are **not** cached.

Two important limits:
- **It does not reduce browser-facing egress.** Even a cache hit sends the full payload to each browser. Supabase egress specifically = bytes Supabase sends out (DB → serverless). The cache helps THAT on warm hits, but…
- **Vercel serverless cache is per-instance and cold-prone.** Each cold invocation starts with an empty `_cache`, so a cache miss still does the full `select('*')`. Under spread-out polling across many short-lived instances, hit rate is lower than it looks. The mitigation that actually bounds Supabase egress is shrinking the query payload and polling less, not relying on the cache.

---

## 5. Evidence — compression

**Not enabled.** `api/index.js` sets up only `app.use(cors())` and `app.use(express.json({ limit: '50mb' }))`. There is no `compression()` middleware, no `Content-Encoding`, no `res.setHeader`, no `Cache-Control`. `package.json` does not list the `compression` package. All API JSON is served uncompressed. This is the largest single multiplier on egress.

(Note: Vercel's platform may gzip some static asset responses at the edge, but the dynamic serverless JSON from `api/index.js` is what carries the order/payment/reminder payloads, and that path is uncompressed here.)

---

## 6. Ranked top egress contributors

1. **Uncompressed API responses (global).** Multiplies every item below by ~4–8×. Zero behavior change to fix.
2. **`GET /api/orders` `select('*')`, no limit, polled every 2 min × all users.** Full ~50-column table including 10+ free-text remark columns.
3. **`GET /api/orders/reminders/all` polled every 30 s (notification checker, all users) + reminders tab.** Full reminders table with free-text `response_text`.
4. **`GET /api/orders/deleted/all` `select('*')`, polled every 2 min.** Each row carries a full order snapshot in `data`.
5. **`GET /api/orders/payments/all` — two `select('*')`/wide reads.** On-demand but heavy.
6. **`fetchPaperRequests` fan-out: 5 parallel calls every 2 min.** Each individually moderate; the fan-out and frequency add up.
7. **`GET /api/complaints` `select('*')`, uncached**, with growing `resolution_history` JSONB.
8. **`GET /api/users/login-logs?limit=500`** — bounded but large per call (long `user_agent` strings); admin, infrequent.

---

## 7. Prioritized remediation plan (target 60–70% reduction)

Ordered low-risk/high-impact first. Percentages are rough, relative to current total Supabase egress, and overlap (compression + smaller payloads don't fully stack).

### P1 — Enable gzip/brotli compression on the API  → est. **55–70%** reduction
- **Change:** add the `compression` middleware to `api/index.js`: `const compression = require('compression')` and `app.use(compression())` before routes; add `compression` to `package.json` dependencies.
- **Files/lines:** `api/index.js` top (after `const app = express()`, before `app.use(cors())`); `package.json` dependencies.
- **Risk:** Very low. Transparent to the browser (axios/fetch auto-decompress via `Accept-Encoding`). No API contract change.
- **Caveat to verify in prod:** confirm Vercel passes the `compression`-encoded response through for the Node serverless function (it respects `Accept-Encoding`/`Content-Encoding` from the function). If a platform layer were to strip it, fall back to brotli at the edge — but the Express middleware is the correct first move.

### P2 — Replace `select('*')` with explicit minimal columns on list endpoints  → est. **15–25%** on top of P1
- **Change:** For `/api/orders`, select only the columns `mapOrder` actually returns, and **exclude the large text columns from the list payload** (see P4). For `/api/orders/payments/all` replace `payments.select('*')` with the fields the mapper uses (`id,order_id,date,amount,mode,remarks`). For `/api/complaints`, select the columns `mapComplaint` uses and consider excluding `resolution_history` from the list (fetch on open).
- **Files/lines:** `api/index.js` — `/api/orders` handler (`orders.select('*')`), `/api/orders/payments/all`, `/api/complaints`, `/api/orders/reminders/due` and `/reminders/all`.
- **Risk:** Low-moderate. Must keep every field the frontend reads; the `mapOrder`/`mapComplaint` functions are the source of truth for what's needed. Regression risk if a column the UI uses is dropped — verify against `mapOrder`/`mapComplaint` and Dashboard rendering.

### P3 — Change-detection before full refetch on the 2-min poll  → est. **10–20%** steady-state
- **Change:** Add a cheap endpoint returning e.g. `{count, maxUpdatedAt}` for orders (and reminders). Frontend 2-min interval and the 30 s reminders checker first hit the cheap endpoint; only call the full `fetchOrders()`/`fetchAllReminders()` when the signal changed. Requires an `updated_at`/`id`-max the server can read with a `head`/count query instead of returning rows.
- **Files/lines:** `api/index.js` (new lightweight count/updated_at endpoint); `src/pages/Dashboard.jsx` lines ~249 (2-min interval), ~257 (reminders interval), ~291 (`checkNewResponses`).
- **Risk:** Moderate. Behavior-preserving if the signal is correct, but a missed-change bug would show stale data. Needs an indexed `updated_at` or reliable id/count. Test that edits made by one user appear for others within the poll window.

### P4 — Split heavy text/proof columns out of list responses  → est. **10–20%** on orders payload
- **Change:** Drop `remarks`, `delivery_remarks`, `payment_remarks`, `installation_remarks`, `site_verification_remarks`, `section_drawing_remarks`, `advance_bill_remarks`, `photography_remarks`, `site_video_remarks`, `review_remarks`, and `payment_proof_url`/`audit_proof_url` from the `/api/orders` list; fetch them via the existing `GET /api/orders/:id` when a row is opened/expanded.
- **Files/lines:** `api/index.js` `/api/orders` + `mapOrder`; `src/pages/Dashboard.jsx` where these fields render inline (the `paymentRemarks`/`remarks` cell renderers around lines ~1527–1531 already use proof URLs — confirm the UI can lazy-load them).
- **Risk:** Moderate — this is a visible behavior change (remarks no longer present in the bulk list until a row is opened). Confirm with the user before implementing; combine with P2.

### P5 — Reduce redundant/overlapping polls  → est. **5–10%** steady-state
- **Change:** The reminders full list is polled by BOTH `checkNewResponses` (every 30 s, all tabs) and the reminders-tab interval (every 30 s). De-duplicate to one timer and lengthen to 60–90 s. Fold the `fetchPaperRequests` 5-call fan-out into fewer calls or run it less often than every 2 min.
- **Files/lines:** `src/pages/Dashboard.jsx` lines ~257, ~291, ~346, ~453–462.
- **Risk:** Low-moderate (notifications arrive slightly later). Behavior-visible timing change — confirm acceptable latency with the user.

### P6 — HTTP caching headers on near-static endpoints  → est. **2–5%**
- **Change:** Add short `Cache-Control` (e.g. `max-age=30`, or `ETag`/304) to `/api/app-version`, `/api/users/list`, `/api/sales-reps`. Lets the browser skip re-downloading unchanged tiny payloads.
- **Files/lines:** `api/index.js` those handlers.
- **Risk:** Low. These are already small; minor win. Do last.

### Expected cumulative
P1 alone typically clears the 60% bar. P1 + P2 + P3 comfortably reaches 60–70% with low-to-moderate risk, and P4/P5 add margin if the user accepts the small behavior changes. P6 is polish.

---

## 8. Recommendations / notes for approval

- **Do P1 first and measure.** Compression is a one-line middleware add with no API contract change and likely gets most of the way to the goal by itself. Measure Supabase egress for a day before deciding how far into P2–P5 to go.
- **P2 is safe to pair with P1** (verify column lists against `mapOrder`/`mapComplaint`).
- **P3, P4, P5 change user-visible behavior** (staleness window, remarks loaded on demand, slightly later notifications). These need explicit user sign-off before implementing.
- `server/` folder was not analyzed for production egress (not deployed per the brief); its handlers mirror `api/index.js` patterns, so if it is ever used the same fixes apply.
- Nothing was implemented. This document is for approval; the specific files/lines above are the implementation targets.
