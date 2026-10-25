# Per-user short-TTL caching for paper/return request endpoints

The second egress-reduction pass adds per-user in-memory caches to the two most frequently polled personal endpoints (`GET /api/orders/paper-requests/my` and `GET /api/orders/return-requests/my`), increases the main orders and reminders TTLs, doubles the signal cache windows, and stretches the client-side paper-request poll interval from 30 s to 60 s. The change is narrowly scoped to TTL constants and cache invalidation calls; no endpoint URL, response shape, or auth check was altered.

Watch for: (1) The task brief states TTL_REMINDERS was raised to 10 min — the code shows **8 min**. Minor discrepancy, likely the brief was written from an earlier draft. (2) The task brief states the per-user cache TTL is 30 s — the code uses **60 s** for both `paper_my_` and `return_my_`. At 60 s a user who is issued a paper request waits up to 60 s before the popup appears. This is longer than the 30 s poll interval that previously gave worst-case 30 s latency; the new 60 s TTL combined with 60 s poll means worst-case 120 s. Confirm this is acceptable.

**Verdict**: NEEDS_CHANGES

---

## High-level view

The `cacheClear('paper_my_')` and `cacheClear('return_my_')` calls are present on every mutating paper/return endpoint — CREATE, ACCEPT, REISSUE, REJECT, CHANGE-USER, REROUTE, DELETE for paper; CREATE, ACCEPT, REJECT, CHANGE-USER for return. The return-accept path also invalidates both prefixes since it mutates both tables. Coverage is complete — confirmed.

The per-user cache keys `paper_my_${username}` and `return_my_${username}` are structurally distinct from `paper_requests_all` and `return_requests_all` (different prefixes entirely, not just a suffix variation), so prefix-based `cacheClear` cannot cross-contaminate the shared all-requests caches.

TTL_ORDERS at 90 s and TTL_REMINDERS at 8 min are both safe because every write path to those tables calls `cacheDel('orders')` or `cacheDel('reminders_all')` respectively. The signal TTL increase (15 s → 30 s) is confirmed in both `cachedRead('orders_signal', 30000, ...)` and `cachedRead('reminders_signal', 30000, ...)`.

The `intervalMs: 60000` change targets the `checkPaperRequests` polling closure (line 468), not the orders or reminders poll (120 s and 30 s respectively). The correct call was changed.

The per-user cache TTL is 60 s, not 30 s as stated in the task brief. The poll interval is also 60 s, so worst-case notification latency for a paper-request recipient goes from 30 s (old poll + no server cache) to up to 120 s (60 s server TTL + 60 s poll). The TTL_REMINDERS comment says "8 min" where the brief said 10 min — this is the live value; the brief described a prior draft.

---

<details>
<summary>Issues (2)</summary>

1. **per-user cache TTL is 60 s, not 30 s** — The `cachedRead(cacheKey, 60000, ...)` calls for `paper_my_` and `return_my_` use a 60 s TTL. Combined with the 60 s poll interval, worst-case paper-request notification latency is now ~120 s. The task brief specified 30 s TTL to keep latency under 60 s. Confirm the 60 s TTL is intentional, or reduce it to 30000.

2. **TTL_REMINDERS discrepancy between brief and code** — The task brief says TTL_REMINDERS was raised to 10 min; the live constant is `8 * 60 * 1000` (8 min). No blocking concern (8 min is a safe value and all invalidation paths are intact), but confirm whether 8 min or 10 min is the intended target so the brief can be corrected.

</details>

<details>
<summary>Details</summary>

### cacheClear placement on paper/return mutating endpoints

Every endpoint that writes to `paper_requests` or `return_requests` was audited:

| Endpoint | table(s) written | cacheClear calls |
|---|---|---|
| POST /api/orders/paper-requests | paper_requests INSERT | `cacheDel('paper_requests_all')`, `cacheClear('paper_my_')` ✓ |
| POST /api/orders/paper-requests/:id/accept | paper_requests UPDATE (×2) | `cacheDel('paper_requests_all')`, `cacheClear('paper_my_')` ✓ |
| POST /api/orders/paper-requests/reissue | paper_requests INSERT | `cacheDel('paper_requests_all')`, `cacheClear('paper_my_')` ✓ |
| POST /api/orders/paper-requests/:id/reject | paper_requests UPDATE | `cacheDel('paper_requests_all')`, `cacheClear('paper_my_')` ✓ |
| PUT /api/orders/paper-requests/:id/change-user | paper_requests UPDATE | `cacheDel('paper_requests_all')`, `cacheClear('paper_my_')` ✓ |
| POST /api/orders/paper-requests/:id/reroute | paper_requests UPDATE + INSERT | `cacheDel('paper_requests_all')`, `cacheClear('paper_my_')` ✓ |
| DELETE /api/orders/paper-requests/:id | paper_requests DELETE | `cacheDel('paper_requests_all')`, `cacheClear('paper_my_')` ✓ |
| POST /api/orders/return-requests | return_requests INSERT | `cacheDel('return_requests_all')`, `cacheClear('return_my_')` ✓ |
| POST /api/orders/return-requests/:id/accept | return_requests UPDATE + paper_requests UPDATE×2 | `cacheDel('return_requests_all','paper_requests_all')`, `cacheClear('return_my_')`, `cacheClear('paper_my_')` ✓ |
| POST /api/orders/return-requests/:id/reject | return_requests UPDATE | `cacheDel('return_requests_all')`, `cacheClear('return_my_')` ✓ |
| PUT /api/orders/return-requests/:id/change-user | return_requests UPDATE | `cacheDel('return_requests_all')`, `cacheClear('return_my_')` ✓ |

All 11 mutating endpoints carry the correct invalidation calls — confirmed.

### Per-user cache TTL: 60 s in code vs 30 s in brief

`GET /api/orders/paper-requests/my` uses `cachedRead(cacheKey, 60000, ...)` and `GET /api/orders/return-requests/my` also uses `cachedRead(cacheKey, 60000, ...)`. The task brief specified 30 s. With the poll interval also at 60 s, the pessimistic path is: a request is created, the issuing user's `paper_my_` cache still has a fresh 60 s entry, the next poll fires just after the cache populates — total wait ≈ 60 s server TTL + 60 s poll = 120 s. Under the old behaviour (30 s poll, no server cache) the worst case was 30 s. Whether 120 s is acceptable depends on the notification urgency requirement.

### Signal TTL and orders/reminders TTL regressions

`cachedRead('orders_signal', 30000, ...)` and `cachedRead('reminders_signal', 30000, ...)` are both confirmed at 30 000 ms. `TTL_ORDERS = 90 * 1000` and `TTL_REMINDERS = 8 * 60 * 1000` match the code. Every write endpoint that touches `orders` calls `cacheDel('orders')`, and `cacheDel` also cascades to `orders_signal` via the `related` map. Same for `reminders_all` → `reminders_signal`. No regression path found — confirmed.

</details>

---

<details>
<summary>File map</summary>

- `api/index.js` — added `cachedRead`-based per-user caches on `GET paper-requests/my` and `GET return-requests/my`; added `cacheClear('paper_my_')` and `cacheClear('return_my_')` to all 11 mutating endpoints; raised `TTL_ORDERS` to 90 s, `TTL_REMINDERS` to 8 min; changed `orders_signal` and `reminders_signal` cache TTL from 15 s to 30 s.
- `src/pages/Dashboard.jsx` — changed `checkPaperRequests` poll interval from 30 s to 60 s.

Full diff: `git diff main -- api/index.js src/pages/Dashboard.jsx`

</details>
