# Implementation Plan — Stale Active-Order Fix (egress-neutral)

## Context (verified by reading the code)

- **Build:** `npm run build` (= `vite build`) from `d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard`. No test framework. Syntax-check backend files with `node --check`.
- **Production backend:** `api/index.js` (Vercel serverless) — this is the ONLY production backend and the only place with the in-memory cache + signal.
- **Local dev backend mirror:** `server/routes/orders.js` (used by `node server/index.js` / `npm run dev:server`), mounted at `/api/orders`. It has **NO cache, NO TTL, and NO `/signal` route** today. To keep it a faithful mirror and avoid a 404 if the dev server is ever used, we add a `/signal` route with the same shape (no cache logic needed there).
- **Frontend:** `src/pages/Dashboard.jsx`.

### Current cache state in `api/index.js` (verified — mutation cache-busting is ALREADY correct)
- `TTL_ORDERS = 10 * 60 * 1000` (10 min), defined at line ~44.
- Cache helpers `cacheGet/cacheSet/cacheDel/cacheClear` at lines ~24–39.
- `GET /api/orders` (line ~265): caches under key `'orders'` with `TTL_ORDERS`.
- `GET /api/orders/signal` (line ~266): current shape is **`{ count, maxId }`** — `count` via `select('id',{count:'exact',head:true})`, `maxId` via `select('id').order('id',{ascending:false}).limit(1)`.
- `POST /api/orders` (create, ~295): `cacheDel('orders','payments_all')` ✓
- `PUT /api/orders/:id` (update, ~296): `cacheDel('orders','payments_all')` (+ conditional `cacheDel('reminders_all')`) ✓
- `DELETE /api/orders/:id` (Active→Completed move, ~297): `cacheDel('orders','deleted_orders','payments_all')` ✓
- `DELETE /api/orders/deleted/:id` (permanent delete, ~300): `cacheDel('deleted_orders','payments_all')` ✓
- `POST /api/orders/deleted/:id/restore` (restore, ~301): `cacheDel('orders','deleted_orders','payments_all')` ✓

**Conclusion:** All order mutations already bust the correct cache keys. No cache-key fixes are required (step 4 of the brief is a verify-only confirmation). The real root cause is the two items below.

### Current frontend signal state in `Dashboard.jsx` (verified)
- `lastOrdersSignal = useRef(null)` with comment `` `${count}_${maxId}` `` (line ~247).
- Mount seed (line ~255): `axios.get('/api/orders/signal').then(sig => { lastOrdersSignal.current = `${sig.data.count}_${sig.data.maxId}` })`.
- 2-min poll (line ~268): `const key = `${sig.data.count}_${sig.data.maxId}``, refetch gated on `forceFull || lastOrdersSignal.current === null || lastOrdersSignal.current !== key`; every 5th tick forces a full refetch.
- `handleDelete` (~1050): `await axios.delete(...)` → `setOrders(prev => prev.filter(...))` → `setDeleteConfirm(null)` → `fetchDeletedOrders()`. **No `fetchOrders()`, no signal reset.**
- `handlePermanentDelete` (~1064): `await fetchDeletedOrders()`. No signal reset.
- `handleRestore` (~1074): `fetchOrders(); fetchDeletedOrders()`. No signal reset.
- `handleOrderSaved` (~1085, one-liner): `fetchOrders(); fetchDeletedOrders()`. No signal reset.
- `fetchOrders` (~476) and `fetchDeletedOrders` (~485) are simple `axios.get` → `setState`.

### New signal shape (decision)
Add a third cheap scalar **`sumId` = sum of all order ids**. Rationale: a delete of a non-max row leaves `maxId` unchanged and can leave `count` coincidentally equal (after an unrelated insert), but removing any row always changes the sum of ids. `orders` has no `updated_at` (verified — `mapOrder` reads only `created_at`), so a sum of ids is the cheapest scalar that moves on any insert/delete. PostgREST has no portable scalar SUM via the JS client without an RPC, so we fetch **only the `id` column** (`select('id')` — tiny vs the ~50-column full rows) and compute `count`, `maxId`, and `sumId` in JS from that single array. New JSON shape: `{ count, maxId, sumId }`. Frontend key becomes `` `${count}_${maxId}_${sumId}` ``.

### TTL decision
Reduce `TTL_ORDERS` from `10 * 60 * 1000` to `60 * 1000` (60s). Egress-neutral because the only recurring caller of `GET /api/orders` is the 2-min poll, which is itself gated by the signal and almost never does a full GET; the hot path (back-to-back pollers within a minute) still hits the cache. A 60s TTL only means a lone full GET more than a minute after the last one re-queries once — negligible, and it bounds how long cross-instance stale data can persist.

---

## Steps

- [ ] 1. Make the orders signal delete-aware in the production backend.
      In `api/index.js`, change `GET /api/orders/signal` (line ~266) to fetch only the id column once (`const { data: idRows } = await supabase.from('orders').select('id')`) and compute, in JS: `count = idRows.length`, `maxId = idRows.reduce((m,r)=>r.id>m?r.id:m, 0)`, `sumId = idRows.reduce((s,r)=>s+(r.id||0), 0)`. Return `{ count, maxId, sumId }`. Remove the old separate `count:'exact',head:true` + max-id queries. Update the handler's leading comment to describe the delete-aware sumId.
      Files: `api/index.js`
      Verify: `node --check "d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard\api\index.js"` exits 0.

- [ ] 2. Reduce `TTL_ORDERS` to 60s with an inline rationale comment.
      In `api/index.js`, change `const TTL_ORDERS = 10 * 60 * 1000` (line ~44) to `const TTL_ORDERS = 60 * 1000`. Add a one-line comment stating it is egress-neutral because the 2-min poll is signal-gated and the hot poll path still hits the cache; the shorter TTL only bounds cross-instance stale-cache lifetime.
      Files: `api/index.js`
      Verify: `node --check "d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard\api\index.js"` exits 0.

- [ ] 3. Confirm (do not change) that every order mutation in `api/index.js` busts the right cache keys.
      Read the five handlers and confirm: create (`cacheDel('orders','payments_all')`), update (`cacheDel('orders','payments_all')`), move/DELETE (`cacheDel('orders','deleted_orders','payments_all')`), permanent-delete (`cacheDel('deleted_orders','payments_all')`), restore (`cacheDel('orders','deleted_orders','payments_all')`). Only edit if a key is actually missing; per verification above none are. If all present, make no change.
      Files: `api/index.js` (no edit expected)
      Verify: `node --check "d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard\api\index.js"` exits 0.

- [ ] 4. Mirror the delete-aware signal in the local dev backend.
      In `server/routes/orders.js`, add a new route `router.get('/signal', async (req, res) => { ... })` that returns `{ count, maxId, sumId }` computed the same way as step 1 (fetch `select('id')`, compute in JS). Place it **before** `router.get('/:id', ...)` (line ~442) so `/signal` is not captured by the `:id` param route. The mirror has no cache, so no cacheDel work is needed here.
      Files: `server/routes/orders.js`
      Verify: `node --check "d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard\server\routes\orders.js"` exits 0.

- [ ] 5. Update the frontend signal key to include `sumId` in BOTH places it is built.
      In `src/pages/Dashboard.jsx`: (a) mount seed (~line 255) → `lastOrdersSignal.current = `${sig.data.count}_${sig.data.maxId}_${sig.data.sumId}``; (b) 2-min poll (~line 268) → `const key = `${sig.data.count}_${sig.data.maxId}_${sig.data.sumId}``. Also update the `lastOrdersSignal` ref comment (~line 247) to `` `${count}_${maxId}_${sumId}` ``. Do NOT change the poll interval, the forceFull/5th-tick safety net, or add any new polling.
      Files: `src/pages/Dashboard.jsx`
      Verify: `npm run build` (from project root) succeeds. (Build also covers steps 6–7.)

- [ ] 6. Invalidate the client signal baseline and refetch active orders on every order mutation.
      In `src/pages/Dashboard.jsx`, after the awaited server call succeeds in each handler, add `lastOrdersSignal.current = null` so the next poll cannot skip a refetch:
      - `handleDelete` (~1050): after the existing `setOrders(...)`/`fetchDeletedOrders()`, add `fetchOrders()` (so the active list is authoritative and a later stale GET can't re-add the moved row) and `lastOrdersSignal.current = null`.
      - `handlePermanentDelete` (~1064): add `lastOrdersSignal.current = null`.
      - `handleRestore` (~1074): add `lastOrdersSignal.current = null`.
      - `handleOrderSaved` (~1085): add `lastOrdersSignal.current = null` (keep the existing `fetchOrders(); fetchDeletedOrders()`).
      Do NOT add polling; these refetches fire only on infrequent user mutations.
      Files: `src/pages/Dashboard.jsx`
      Verify: `npm run build` (from project root) succeeds with no errors.

- [ ] 7. Final full verification and commit.
      Run all three checks and confirm clean. Then commit locally on `main` (do NOT push).
      Files: none (verification + commit only)
      Verify (all must pass):
      - `node --check "d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard\api\index.js"`
      - `node --check "d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard\server\routes\orders.js"`
      - `npm run build` from `d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard` (Vite build completes, no errors)
      Commit message (suggested): `fix: make orders signal delete-aware + refetch active list on mutations (egress-neutral stale-list fix)`.

---

## Egress-neutrality reasoning (the final summary MUST state this)

1. **Signal stays a tiny scalar response.** `GET /api/orders/signal` still returns three integers (`count`, `maxId`, `sumId`), never rows. It now fetches only the `id` column (`select('id')`) instead of two separate count/max queries — comparable or smaller egress than before, and far smaller than the full ~50-column order list.
2. **The 2-min poll is still signal-gated.** The full `GET /api/orders` payload is only fetched when the signal changes (or on the existing every-5th-tick safety net). Steady state with no changes = tiny signal responses only, exactly as before.
3. **New mutation refetches are on user actions only.** The added `fetchOrders()`/baseline resets fire on delete/restore/permanent-delete/create/edit — infrequent, user-initiated events, not a new poll. No new recurring traffic.
4. **TTL 10min→60s is egress-neutral.** The only recurring caller of `GET /api/orders` is the signal-gated 2-min poll, which rarely does a full GET. Within any 60s window the hot path still hits the cache; the shorter TTL only bounds how long a cross-instance stale cache can live on a Vercel serverless instance (the cross-instance `cacheDel` miss described in the brief), without adding steady-state queries.
5. **No DB schema change / no migration** — `orders` has no `updated_at`; the fix uses only existing columns.

---

## Verification note (first iteration — implemented)

Changes made:
- `api/index.js`: `GET /api/orders/signal` now fetches only the `id` column (`select('id')`) and computes `{ count, maxId, sumId }` in JS (sumId = SUM(id), delete-aware). `TTL_ORDERS` reduced 10min → 60s with inline egress-neutral rationale. All five order mutations confirmed to bust correct cache keys (create/update `orders,payments_all`; move/restore `orders,deleted_orders,payments_all`; permanent-delete `deleted_orders,payments_all`) — no key changes needed.
- `server/routes/orders.js`: added mirror `router.get('/signal')` returning the same `{ count, maxId, sumId }`, placed before `router.get('/:id')` so `/signal` isn't captured by the `:id` param route.
- `src/pages/Dashboard.jsx`: signal key now `${count}_${maxId}_${sumId}` in both the mount seed and the 2-min poll (ref comment updated). `handleDelete` now resets `lastOrdersSignal.current = null` and adds `fetchOrders()`; `handlePermanentDelete`, `handleRestore`, and `handleOrderSaved` each reset `lastOrdersSignal.current = null`. No new polling added.

Commands run and results (all passed, zero errors):
- `node --check api/index.js` → exit 0
- `node --check server/routes/orders.js` → exit 0
- `npm run build` (vite build, from project root) → exit 0, built in ~5.5s, 103 modules transformed (pre-existing chunk-size warning only, not an error).
