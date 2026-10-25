# Egress Reduction — Second Pass: Implementation Plan

## Findings

### Current invocation count per user per hour (steady state)

| Loop | Interval | Calls/tick | Ticks/hr | Invocations/user/hr |
|------|----------|-----------|----------|---------------------|
| `checkPaperRequests` (always-on 30s poller) | 30 s | 2 (`paper-requests/my` + `return-requests/my`) | 120 | **240** |
| Orders signal poll (2 min) | 120 s | 1 (`orders/signal`) + rarely `orders`+`deleted/all`+`paper-requests/all` | 30 | ~30 signal + ~3 full |
| Reminders signal poll (30 s) | 30 s | 1 (`reminders/signal`) + rarely `reminders/all` | 120 | ~120 signal |
| `authenticate` middleware (forceLogoutCache 30 s TTL) | 30 s window | Supabase hit every 30 s per user | — | ~120 (already cached) |

**At 15 users, `checkPaperRequests` alone generates 3,600 Supabase hits/hr** — every hit is a direct full table scan with no cache.

---

### Endpoints with ZERO cache (direct Supabase on every request)

| Endpoint | Table queried | Why uncached |
|----------|---------------|--------------|
| `GET /api/orders/paper-requests/my` | `paper_requests` WHERE issue\_to=user AND status=PENDING | Per-user result — not safe to share a single cache key |
| `GET /api/orders/return-requests/my` | `return_requests` WHERE return\_to=user AND status=PENDING | Same — per-user |
| `GET /api/orders/:id` | `orders` + `payments` | Single-row lookup, intentionally uncached |
| `GET /api/orders/:id/payments` | `payments` | Single-order lookup |
| `GET /api/orders/edit-logs/all` | `order_edit_history` | Admin-only; infrequent |

`paper-requests/my` and `return-requests/my` are the only **high-frequency** uncached endpoints.

---

### Hot path 1 — `checkPaperRequests` (confirmed uncached)

**Confirmed:** Line 418 of `api/index.js`:
```js
app.get('/api/orders/paper-requests/my', authenticate, async (req, res) => {
  try {
    const{data}=await supabase.from('paper_requests').select('*').eq('issue_to',req.user.username).eq('status','PENDING');
    res.json((data||[]).map(...))
  } catch(e){res.status(500).json({error:e.message})}
})
```
No `cacheGet`, no `cachedRead`. Identical for `return-requests/my` (line 428). The frontend polls both every 30 s unconditionally in `checkPaperRequests` (Dashboard.jsx ~line 432–469).

**Chosen approach: Option (a) + (c) combined** — per-user TTL cache with 60 s TTL (doubling the poll interval from 30 s to 60 s would help but is not needed once cache is in place; keeping 30 s for responsive notifications is fine with a 60 s cache). A 30 s TTL on the cache still cuts Supabase hits to 1 per user per 30 s instead of 2; a 60 s TTL (matching the poll) makes the first call a DB hit and all subsequent calls within 60 s cache hits, reducing per-user Supabase reads from 120/hr to 60/hr per endpoint, **75% reduction** at 15 users.

Option (b) — a shared signal — would be ideal but requires knowing which user's `my` data changed without a per-user query, which defeats the purpose. Option (a) is cleaner and sufficient.

---

### Hot path 2 — Initial page-load parallel fetch storm

**Confirmed** (Dashboard.jsx line 342–345):
```js
useEffect(() => {
  fetchOrders(); fetchDeletedOrders(); fetchPaperRequests()
  axios.get('/api/orders/signal').then(...)
}, [])
```

`fetchPaperRequests` (line 583–602) fires **5 parallel requests**:
- `GET /api/orders/paper-requests/all` ← cached (TTL_PAPER 5 min)
- `GET /api/orders/paper-requests/my` ← **uncached**
- `GET /api/users/list` ← cached (TTL_USERS_LIST 30 min)
- `GET /api/orders/return-requests/all` ← cached (TTL_PAPER 5 min)
- `GET /api/orders/return-requests/my` ← **uncached**

On mount, total cold Vercel invocations per user ≈ **8** (`orders` + `deleted/all` + `paper-requests/all` + `paper-requests/my` + `users/list` + `return-requests/all` + `return-requests/my` + `orders/signal`). The first 2 of the 5 `fetchPaperRequests` sub-calls hit Supabase if not cached; the other 3 may hit cache.

A batch `/api/poll` endpoint is not needed — `fetchPaperRequests/my` caching already fixes the uncached pieces. The two `all` endpoints are already cached and the 5-call fanout is a one-time cost, not a recurring one.

---

### Hot path 3 — TTL tuning

| Cache key | Current TTL | Proposed TTL | Rationale |
|-----------|------------|--------------|-----------|
| `orders` | 60 s | **90 s** | Signal invalidates on every write (POST/PUT/DELETE all call `cacheDel('orders')`). Extra 30 s only affects stale cross-instance windows. |
| `reminders_all` | 5 min | **8 min** | Signal invalidates on every change. 8 min is safe. |
| `paper_requests_all` | 5 min | **5 min** | Already correct; keep. |
| `return_requests_all` | 5 min | **5 min** | Already correct; keep. |
| `TTL_APP_VERSION` | 5 min | no change | Correct. |
| `TTL_DELETED` | 15 min | no change | Correct. |

---

### Hot path 4 — `authenticate` middleware / `forceLogoutCache`

**Confirmed working correctly.** Lines 130–149 of `api/index.js`:
```js
const cached = forceLogoutCache[decoded.id]
let forceLogoutAt = null
if (cached && (now - cached.fetchedAt) < FORCE_LOGOUT_TTL) {
  forceLogoutAt = cached.value
} else {
  const { data: userData } = await supabase.from('users').select('force_logout_at').eq('id', decoded.id)
  forceLogoutAt = userData?.[0]?.force_logout_at || null
  forceLogoutCache[decoded.id] = { value: forceLogoutAt, fetchedAt: now }
}
```
TTL is 30 s (`FORCE_LOGOUT_TTL = 30 * 1000`). No bypass path found. The cache is also explicitly cleared on `force-logout` (line 342: `delete forceLogoutCache[...]`). **No action needed.**

---

### Hot path 5 — Per-user cache key design for `paper-requests/my` / `return-requests/my`

All mutating endpoints that touch `paper_requests` or `return_requests` and therefore need to call `cacheClear('paper_my_')` / `cacheClear('return_my_')`:

**paper_requests table mutating endpoints:**
1. `POST /api/orders/paper-requests` (create) — invalidate `paper_my_<issueTo>`
2. `POST /api/orders/paper-requests/:id/accept` — need to read `issue_to` from row, then invalidate `paper_my_<issue_to>`
3. `POST /api/orders/paper-requests/reissue` — inserts new row with `issue_to = currentHolder`, invalidate `paper_my_<currentHolder>`
4. `POST /api/orders/paper-requests/:id/reject` — invalidate `paper_my_<issue_to>` (already fetched as `request` in accept flow; need a fetch here too)
5. `PUT /api/orders/paper-requests/:id/change-user` — changes `issue_to`, invalidate both old and new `paper_my_<user>`
6. `POST /api/orders/paper-requests/:id/reroute` — inserts new row `issue_to=rerouteTo`, invalidate `paper_my_<rerouteTo>`
7. `DELETE /api/orders/paper-requests/:id` — invalidate `cacheClear('paper_my_')`
8. `POST /api/orders/return-requests/:id/accept` — also updates `paper_requests` (RETURNED/CANCELLED), use `cacheClear('paper_my_')`

**return_requests table mutating endpoints:**
1. `POST /api/orders/return-requests` (create) — invalidate `return_my_<returnTo>`
2. `POST /api/orders/return-requests/:id/accept` — invalidate `return_my_<return_to>` (read from row)
3. `POST /api/orders/return-requests/:id/reject` — invalidate `return_my_<return_to>` (need a fetch)
4. `PUT /api/orders/return-requests/:id/change-user` — invalidate old+new `return_my_<user>`

**Simplification decision:** Rather than reading the row in every mutating endpoint to find the exact `issue_to`/`return_to`, use `cacheClear('paper_my_')` and `cacheClear('return_my_')` to wipe ALL per-user entries for that table. There are at most 15 users so the prefix sweep is O(15) — negligible. This avoids adding extra Supabase reads to endpoints that currently don't fetch the row.

---

## Answers to Plan Questions

1. **Current invocations/user/hr:**  240 (paper poll) + 150 (signals) ≈ **390/user/hr**. At 15 users ≈ **5,850/hr** total.
2. **Zero-cache endpoints (high frequency):** `GET /api/orders/paper-requests/my`, `GET /api/orders/return-requests/my`.
3. **cacheDel required in mutating endpoints:** Yes — see full list above. Use `cacheClear('paper_my_')` and `cacheClear('return_my_')` in all 12 endpoints listed above.
4. **Risk of TTL_ORDERS 60s → 90s:** Zero. Every `PUT /api/orders/:id`, `POST /api/orders`, `DELETE /api/orders/:id`, `POST /api/orders/import`, `PUT /api/orders/deleted/:id/update`, `POST /api/orders/deleted/:id/restore`, `DELETE /api/orders/deleted/:id` already calls `cacheDel('orders')`. The signal also busts `orders_signal`. The 30 s extension only extends the maximum stale window on a Vercel instance that hasn't received a mutation — acceptable.
5. **Estimated invocation reductions per change:**

| Change | Before | After | Reduction (15 users) |
|--------|--------|-------|---------------------|
| Per-user 60 s cache on `paper-requests/my` | 1,800 DB hits/hr | 900 DB hits/hr | **−50%** (900/hr) |
| Per-user 60 s cache on `return-requests/my` | 1,800 DB hits/hr | 900 DB hits/hr | **−50%** (900/hr) |
| TTL_ORDERS 60 s → 90 s | 40 DB reads/hr/instance (rare full polls) | ~27/hr | Minor (~30%) |
| TTL_REMINDERS 5 min → 8 min | 12 DB reads/hr/instance | ~7.5/hr | Minor (~37%) |

**Primary gain: −1,800 Supabase hits/hr at 15 users (from the two `my` endpoints alone).**

---

## Implementation Checklist

### Change 1 — Add per-user TTL cache to `GET /api/orders/paper-requests/my`
**Impact: HIGH — eliminates ~900 unnecessary Supabase reads/hr at 15 users**

- **File:** `api/index.js` line 418
- **Before:**
```js
app.get('/api/orders/paper-requests/my', authenticate, async (req, res) => { try { const{data}=await supabase.from('paper_requests').select('*').eq('issue_to',req.user.username).eq('status','PENDING'); res.json((data||[]).map(r=>({...r,orderNo:r.order_no,requestedBy:r.requested_by,issueTo:r.issue_to}))) } catch(e){res.status(500).json({error:e.message})} })
```
- **After:**
```js
app.get('/api/orders/paper-requests/my', authenticate, async (req, res) => {
  try {
    const cacheKey = `paper_my_${req.user.username}`
    const result = await cachedRead(cacheKey, 60000, async () => {
      const { data } = await supabase.from('paper_requests').select('*').eq('issue_to', req.user.username).eq('status', 'PENDING')
      return (data || []).map(r => ({ ...r, orderNo: r.order_no, requestedBy: r.requested_by, issueTo: r.issue_to }))
    })
    res.json(result)
  } catch(e) { res.status(500).json({ error: e.message }) }
})
```
- **Reduction:** 120 DB hits/hr → 60 DB hits/hr per user. At 15 users: −900 Supabase reads/hr.

---

### Change 2 — Add per-user TTL cache to `GET /api/orders/return-requests/my`
**Impact: HIGH — eliminates ~900 unnecessary Supabase reads/hr at 15 users**

- **File:** `api/index.js` line 428
- **Before:**
```js
app.get('/api/orders/return-requests/my', authenticate, async (req, res) => { try { const{data}=await supabase.from('return_requests').select('*').eq('return_to',req.user.username).eq('status','PENDING'); res.json((data||[]).map(r=>({...r,orderNo:r.order_no,requestedBy:r.requested_by,returnTo:r.return_to}))) } catch(e){res.status(500).json({error:e.message})} })
```
- **After:**
```js
app.get('/api/orders/return-requests/my', authenticate, async (req, res) => {
  try {
    const cacheKey = `return_my_${req.user.username}`
    const result = await cachedRead(cacheKey, 60000, async () => {
      const { data } = await supabase.from('return_requests').select('*').eq('return_to', req.user.username).eq('status', 'PENDING')
      return (data || []).map(r => ({ ...r, orderNo: r.order_no, requestedBy: r.requested_by, returnTo: r.return_to }))
    })
    res.json(result)
  } catch(e) { res.status(500).json({ error: e.message }) }
})
```
- **Reduction:** 120 DB hits/hr → 60 DB hits/hr per user. At 15 users: −900 Supabase reads/hr.

---

### Change 3 — Invalidate per-user caches in all mutating paper/return endpoints
**Impact: HIGH — correctness requirement for Changes 1 & 2**

All 12 mutating endpoints that write `paper_requests` or `return_requests` need to bust the per-user caches. Use `cacheClear('paper_my_')` (wipes all `paper_my_<user>` keys) and `cacheClear('return_my_')`.

- **File:** `api/index.js`
- **Endpoints and exact additions:**

| Line (approx) | Endpoint | Add after existing `cacheDel(...)` |
|---|---|---|
| 419 | `POST /api/orders/paper-requests` (create) | `cacheClear('paper_my_')` |
| 420 | `POST /api/orders/paper-requests/:id/accept` | `cacheClear('paper_my_')` |
| 421 | `POST /api/orders/paper-requests/reissue` | `cacheClear('paper_my_')` |
| 421 | `POST /api/orders/paper-requests/:id/reject` | `cacheClear('paper_my_')` |
| 422 | `PUT /api/orders/paper-requests/:id/change-user` | `cacheClear('paper_my_')` |
| 424 | `POST /api/orders/paper-requests/:id/reroute` | `cacheClear('paper_my_')` |
| 425 | `DELETE /api/orders/paper-requests/:id` | `cacheClear('paper_my_')` |
| 429 | `POST /api/orders/return-requests/:id/accept` (also mutates paper_requests) | `cacheClear('paper_my_'); cacheClear('return_my_')` |
| 429 | `POST /api/orders/return-requests` (create) | `cacheClear('return_my_')` |
| 430 | `POST /api/orders/return-requests/:id/reject` | `cacheClear('return_my_')` |
| 423/424 | `PUT /api/orders/return-requests/:id/change-user` | `cacheClear('return_my_')` |

**Note:** The `cacheClear` function already exists in `api/index.js` (line 44):
```js
function cacheClear(prefix) {
  new Set([...Object.keys(_cache), ...pendingReads.keys()]).forEach(k => { if (k.startsWith(prefix)) cacheDel(k) })
}
```
This is O(number of cached keys) — safe for 15 users.

**Pattern — every mutating paper endpoint looks like:**
```js
// Before:
cacheDel('paper_requests_all'); res.json(...)
// After:
cacheDel('paper_requests_all'); cacheClear('paper_my_'); res.json(...)
```

**Pattern — every mutating return endpoint:**
```js
// Before:
cacheDel('return_requests_all'); res.json(...)
// After:
cacheDel('return_requests_all'); cacheClear('return_my_'); res.json(...)
```

The `return-requests/:id/accept` endpoint also modifies `paper_requests` (marks them RETURNED/CANCELLED), so add `cacheClear('paper_my_')` there too.

---

### Change 4 — Increase `TTL_ORDERS` from 60 s to 90 s
**Impact: MEDIUM — reduces stale-cache-window invocations; safe because signal+cacheDel cover all writes**

- **File:** `api/index.js` (TTL constants block, ~line 57)
- **Before:**
```js
const TTL_ORDERS = 60 * 1000  // 60s
```
- **After:**
```js
const TTL_ORDERS = 90 * 1000  // 90s — safe: cacheDel('orders') is called in every POST/PUT/DELETE on orders; signal also busts orders_signal
```
- **Reduction:** ~30% fewer full-orders DB reads during quiet periods between writes.

---

### Change 5 — Increase `TTL_REMINDERS` from 5 min to 8 min
**Impact: MEDIUM — safe because reminders signal and cacheDel('reminders_all') cover all writes**

- **File:** `api/index.js` (TTL constants block, ~line 60)
- **Before:**
```js
const TTL_REMINDERS = 5  * 60 * 1000  // 5 min
```
- **After:**
```js
const TTL_REMINDERS = 8  * 60 * 1000  // 8 min — safe: cacheDel('reminders_all') called on every reminder create/respond/reassign/delete; signal invalidates within 15s
```
- **Reduction:** ~37% fewer `reminders_all` full DB reads on the signal-miss path.

---

### Change 6 — Bump `checkPaperRequests` poll interval from 30 s to 60 s in Dashboard.jsx
**Impact: HIGH — cuts Vercel invocations from the checkPaperRequests loop by 50% regardless of caching**

Even with per-user cache (Change 1+2), each poll tick still creates 2 Vercel invocations (authenticate + route handler) even if the response comes from cache. Doubling the interval halves these.

Paper requests are non-urgent (a request that sits for 30 extra seconds is acceptable — the popup notification already requires the user to be on the page). Desktop notification latency goes from ≤30 s to ≤60 s — still far faster than any other workflow channel.

- **File:** `src/pages/Dashboard.jsx` (~line 468)
- **Before:**
```js
return startPolling(checkPaperRequests, { intervalMs: 30000 })
```
- **After:**
```js
return startPolling(checkPaperRequests, { intervalMs: 60000 })
```
- **Reduction:** 240 Vercel invocations/user/hr → 120/user/hr. At 15 users: **−1,800 invocations/hr**.

---

### Change 7 — Keep `hiddenIntervalMs: null` behaviour — no change needed
The `checkPaperRequests` effect does NOT pass `hiddenIntervalMs`, so `startPolling` uses its default behaviour (continues polling in background at the same rate). Confirmed in `polling.mjs`. No action.

---

## Summary of Total Estimated Reduction

| Change | Supabase hits/hr reduction (15 users) | Vercel invocations/hr reduction (15 users) |
|--------|--------------------------------------|---------------------------------------------|
| #1 Cache `paper-requests/my` (60 s) | −900 | −900 |
| #2 Cache `return-requests/my` (60 s) | −900 | −900 |
| #6 Poll 30 s → 60 s | 0 additional | −1,800 (Vercel, cached calls) |
| #4 TTL_ORDERS 60→90 s | ~−15 | ~−15 |
| #5 TTL_REMINDERS 5→8 min | ~−10 | ~−10 |
| **Total** | **~−1,825/hr** | **~−3,625/hr** |

Combined with the first-pass gains already live, this second pass targets a further **50–60% reduction** in paper-request related Supabase egress.

---

## Build / Verify Commands

Run from `d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard`:

```bash
# 1. Syntax check the backend (catches typos in the inline one-liners)
node --check api/index.js

# 2. Full frontend build (catches import errors, JSX errors in Dashboard.jsx)
npm run build
```

Both must exit 0 with no errors. There are no automated backend unit tests in this project; correctness is verified by the build check + manual smoke test of:
1. Open dashboard as a non-admin user — paper issue popup should still appear within 60 s of a new request.
2. Create a paper request and immediately check that the recipient's `paper-requests/my` returns the new item (cache should have been busted by the `cacheClear`).
3. Accept a return request and verify that both `paper-requests/my` and `return-requests/my` for the affected user are fresh (no stale data).
