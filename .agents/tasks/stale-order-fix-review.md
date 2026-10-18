# Make orders signal delete-aware + refetch active list on mutations

The orders change-detection signal used `{count, maxId}`, which cannot see a move that deletes a non-max row — count can be masked by a later insert and maxId is untouched — so the 2-min signal-gated poll could skip the refetch and leave a just-completed order in the Active list until a forced full poll. This change adds a third scalar `sumId = SUM(id)` so any delete shifts the signal, resets the client signal baseline (`lastOrdersSignal.current = null`) on every order mutation, and makes `handleDelete` refetch the Active list immediately so a stale cross-instance cached GET can't re-add the moved row. `TTL_ORDERS` drops from 10 min to 60s to bound how long a per-instance stale cache can live on Vercel. The signal still returns only integers and the full `GET /api/orders` payload stays cache- and signal-gated, so steady-state egress does not increase.

Watch for: the signal now fetches every row's `id` column instead of a `head:true` count plus a 1-row max query — bounded and tiny, but it does grow linearly with the orders table (likely).

**Verdict**: APPROVED

## High-level view

The root cause is a signal that was blind to deletes-with-rebalanced-count. `sumId` closes that gap because removing any row always changes the id sum, so the poll's gating key moves on every move/delete regardless of what inserts happen alongside. This is the minimal correct scalar given the table has no `updated_at`.

Correctness no longer rides solely on the poll. Each mutation handler now nulls the client baseline so the next poll is forced to treat the signal as changed, and `handleDelete` additionally calls `fetchOrders()` so the Active list is made authoritative at mutation time rather than waiting up to two minutes. That is the belt-and-suspenders that guarantees the moved order leaves Active without a manual refresh and never appears in both lists.

Egress is held flat by construction: the signal response is still three integers, the full orders GET is still cached and only fetched when the signal key changes or on the pre-existing every-5th-tick safety net, and the new refetches fire only on user-initiated mutations, not on any new timer. No new polling interval was added. The TTL cut only shortens the window a cross-instance stale cache can survive; the hot path (back-to-back pollers inside a minute) still hits the cache.

The one cost worth naming: the signal query shifted from a `count/head` + single-row-max pair to selecting the `id` of every order. The payload back to the client is unchanged (still scalars), but the Supabase-side read now scales with row count rather than being constant.

<details>
<summary>Issues (1)</summary>

1. **Signal query scales with row count** — `GET /api/orders/signal` now selects every order's `id` to compute `sumId` in JS, instead of a constant-cost `count(head)` + 1-row max. Payload to the client is still scalars, but the DB read grows with the table. Non-blocking at current scale; if the orders table grows large, move the aggregation into a Postgres RPC (`select count(*), max(id), sum(id)`) to return the three scalars without transferring every id.

</details>

<details>
<summary>Details</summary>

### sumId closes the delete-detection gap

The previous `{count, maxId}` signal had a concrete blind spot for exactly the reported bug. Moving an order to Completed deletes its `orders` row. If that row is not the max id, `maxId` is unchanged; and if any insert happened in the same window, `count` can land back on its prior value. The gating key then matches the stored baseline and the poll skips `fetchOrders()`, so the completed order lingers in Active. `sumId = SUM(id)` removes that coincidence: dropping any row lowers the id sum, and an unrelated insert gets a fresh (higher) id, so the sum cannot silently return to its prior value. Given the `orders` table has no `updated_at` to key off (confirmed — `mapOrder` reads only `created_at`), the id sum is the cheapest scalar that moves on every insert and delete. The key is built identically in the mount seed and the 2-min poll (`${count}_${maxId}_${sumId}`), so the baseline and the comparison can't drift out of format.

In-place edits that change no row's id are still invisible to the signal — acknowledged in the handler comment — and are covered by the existing every-5th-tick forced full refetch. That safety net is unchanged.

### Mutation handlers make the Active list authoritative

The fix does not rely on the poll alone to converge. `handleDelete` now, after optimistically filtering the row out of local state, sets `lastOrdersSignal.current = null` and calls `fetchOrders()`. The null baseline guarantees the next poll's `lastOrdersSignal.current === null` branch forces a refetch regardless of the signal value; the immediate `fetchOrders()` re-pulls the server list so that even if a stale cached GET on another Vercel instance would have re-added the row, the authoritative list wins at mutation time. `handleRestore`, `handlePermanentDelete`, and `handleOrderSaved` each null the baseline too (restore and save already called `fetchOrders()`; permanent-delete operates on the deleted list only, so nulling the baseline is the right minimal touch).

```
move order ──► DELETE /api/orders/:id ──► server cacheDel('orders','deleted_orders','payments_all')
          └──► setOrders(filter out)           (same-instance cache busted)
          └──► lastOrdersSignal.current = null  (next poll cannot skip)
          └──► fetchOrders()                    (active list re-pulled now)
```

### Cache-busting keys are correct across all order mutations

Confirmed by reading each handler in `api/index.js`:

- create `POST /api/orders` → `cacheDel('orders','payments_all')`
- update `PUT /api/orders/:id` → `cacheDel('orders','payments_all')` (plus conditional `reminders_all` on an Akhil-points edit)
- move `DELETE /api/orders/:id` → `cacheDel('orders','deleted_orders','payments_all')`
- permanent-delete `DELETE /api/orders/deleted/:id` → `cacheDel('deleted_orders','payments_all')`
- restore `POST /api/orders/deleted/:id/restore` → `cacheDel('orders','deleted_orders','payments_all')`

The move and restore both touch the Active and Completed lists plus payment totals, so all three keys must be busted. These were already correct before this change; no key edits were made, matching the plan's verify-only step 3.

### Egress posture: signal query is the only shift

`GET /api/orders` is still read from the `'orders'` cache and written back with `TTL_ORDERS`; the 2-min poll still fetches the full payload only when `forceFull || lastOrdersSignal.current === null || lastOrdersSignal.current !== key`. Neither the cache nor the signal gating was removed. The new `fetchOrders()`/baseline resets fire only on user mutations, and no new `setInterval` was added for orders (the other three intervals in the file — reminders tab, response notifier, paper requests — are pre-existing and unrelated).

The one real change in DB-side read cost is the signal itself. It previously issued `select('id',{count:'exact',head:true})` (a count, no rows) plus a 1-row max query. It now issues `select('id')` and reduces in JS to get all three scalars. The response to the browser is still three integers, so client-facing egress is unchanged or smaller, but the Supabase read now returns one integer per order row rather than being constant-size. At the current table size this is negligible; it is the only thing in this diff that does not stay flat as the table grows. A Postgres RPC returning `count(*), max(id), sum(id)` would restore constant-size behavior if that ever matters.

### TTL reduction is bounded, not a new query source

`TTL_ORDERS` 10 min → 60s does not add steady-state traffic because the only recurring caller of the full GET is the signal-gated poll, which rarely does a full fetch. Within any 60s window back-to-back pollers still hit the cache. The shorter TTL only shortens how long a stale per-instance cache (the cross-instance `cacheDel` miss that let the stale row reappear) can survive, which directly supports the bug fix.

### Dev mirror kept faithful

`server/routes/orders.js` gains a matching `/signal` route returning the same `{count, maxId, sumId}`, placed before `router.get('/:id')` so Express does not capture `/signal` as an `:id` param. The mirror has no cache, so no cache-busting work was needed there. This only matters if the local dev server is used; it prevents a 404 and a signal-shape mismatch.

### Scope

The diff touches only `api/index.js` (signal body, TTL constant, comments), `server/routes/orders.js` (mirror signal route), `src/pages/Dashboard.jsx` (signal key in two places, baseline resets in four handlers, one added `fetchOrders()`), and the plan doc. No unrelated features were modified.

### Verification evidence

The commit message and the plan's verification note record `node --check api/index.js` → exit 0, `node --check server/routes/orders.js` → exit 0, and `npm run build` (vite) → exit 0, 103 modules, pre-existing chunk-size warning only. Per the brief I did not re-run these; the evidence is present and specific, and the code I read matches what the note describes, so no spot-check was warranted.

</details>

<details>
<summary>File map</summary>

- `api/index.js` — `GET /api/orders/signal` now returns `{count, maxId, sumId}` from a single `select('id')`; `TTL_ORDERS` 10min→60s with rationale comment.
- `server/routes/orders.js` — added mirror `/signal` route (same shape), placed before `/:id`.
- `src/pages/Dashboard.jsx` — signal key includes `sumId` in mount seed and poll; `handleDelete/handleRestore/handlePermanentDelete/handleOrderSaved` reset `lastOrdersSignal.current = null`; `handleDelete` adds `fetchOrders()`.
- `.agents/tasks/stale-order-fix-plan.md` — implementation plan + verification note.

Full diff: `git diff 061f381 1843309`.

</details>
