# Supabase egress reduction via gzip, column trimming, and poll change-detection

The change cuts Supabase egress through three behavior-preserving moves in the production backend (`api/index.js`) and the dashboard frontend (`src/pages/Dashboard.jsx`): P1 adds `compression()` middleware so every API JSON response ships gzipped; P2 swaps `select('*')` for explicit mapper-derived column lists on the five heavy list endpoints; P3 adds two tiny signal endpoints and gates the 2-minute orders poll and the 30-second reminders checker/tab on them so the full payloads only move when something actually changed. The column lists were cross-checked field-by-field against `mapOrder`/`mapComplaint`/the payment and reminder mappers, and all remark/text columns plus `resolution_history` were deliberately kept (P4 is out of scope). Scope is clean — no AuthContext/version-check, Follow-Up-column, or P4/P5/P6 changes leaked in.

Watch for: the reminders signal `{count,maxId,maxResponseDate}` does not reliably detect a **reassign** (it nulls `response_date` and leaves count/maxId unchanged), so a reassign by one user may not refresh another user's passively-open reminders tab until the next detectable change or a manual refresh (possible, non-blocking — the response-notification path is unaffected because responses always advance `maxResponseDate`). The orders `{count,maxId}` signal intentionally cannot see in-place edits; this is bounded to ~10 min by the safety-net full refetch, matching the existing `TTL_ORDERS` window (confirmed, by design).

**Verdict**: APPROVED

## High-level view

P1 is the dominant, lowest-risk lever: `compression()` is registered before `cors()`/`express.json` and all routes in both `api/index.js` and the non-deployed `server/index.js`, and `compression ^1.7.4` is in `package.json` dependencies with `package-lock.json` updated. The measured ratio (564,231 B → 82,056 B, 85.5%) applies to every JSON response and alone clears the 60% target.

P2 preserves behavior. Each explicit SELECT was verified against the function that consumes the rows: `mapOrder` (46 reads + computed balance/percentReceived), `mapComplaint` (27 reads including `resolution_history`), the payment mapper (`id,order_id,date,amount,mode,remarks`), and both reminders routes (13 columns covering `/all`'s spread-and-map and `/due`'s filter). No remark/text column and no `resolution_history` was dropped, and the reminders-tab render sites consume only columns present in the SELECT.

P3 gates the heavy polls on tiny signals. The orders signal catches inserts/deletes via `{count,maxId}`; in-place edits are caught by a forced full refetch every 5th tick (~10 min). Initial mount load, the manual Refresh (`window.location.reload()`), and signal-fetch-failure all fall back to a full fetch, so the design fails open (never stale on error). The reminders signal catches new/deleted reminders and new responses; its one soft spot is reassign detection.

The impact doc records P1 as measured and P2/P3 as clearly-labelled estimates, with the orders-edit staleness bound called out as unchanged from the existing cache TTL.

<details>
<summary>Issues (2)</summary>

1. **Reassign not reliably signalled (reminders)** — a reassign nulls `response_date` and changes neither `count` nor `maxId`; unless the reassigned row held the global `max(response_date)`, the reminders signal is unchanged, so another user's passively-open reminders tab won't refresh until the next detectable change or manual refresh. Non-blocking: the actor sees it immediately (direct `fetchAllReminders()`), the notification path is unaffected, and the plan's "catches responses/reassigns" comment overstates the reassign case. Consider adding `max(id-of-last-write)` or a `max(date)` term, or accept and document the bound.
2. **Orders in-place-edit staleness** — `{count,maxId}` cannot see edits that don't change row count or max id; bounded to ~10 min by the 5th-tick safety-net refetch. By design and matches `TTL_ORDERS`; informational.

</details>

<details>
<summary>Details</summary>

### P1 — compression wiring

`const compression = require('compression')` and `app.use(compression())` sit immediately after `const app = express()` and before `app.use(cors())` / `app.use(express.json(...))` in `api/index.js`, so compression wraps every downstream route response. `compression ^1.7.4` is in `package.json` dependencies and present in `package-lock.json`. The same two lines were mirrored into `server/index.js` (not deployed, parity only). The recorded measurement — raw 564,231 B vs gzip 82,056 B = 85.5% on a 200-row `/api/orders` payload built with per-row unique remarks — is not overstated for this JSON shape (the unique-remarks construction prevents a trivially-compressible best case).

### P2 — explicit column lists preserve every consumed field

Each converted endpoint was checked against the exact snake_case keys its mapper reads:

- `/api/orders` → `mapOrder` reads 46 columns (`id,date,po_no,client,order_no,status,delivery_date,delivery_remarks,customer_name,gst,billing_address,follow_up,sales_rep,delivery_address,phone_no,site_verification,site_verification_remarks,installation_status,installation_remarks,lop,section_drawing,section_drawing_remarks,in_production,billing,installation,akhil_points,total_amount,received_amount,follow_up_type,payment_remarks,payment_proof_url,days_to_order,remarks,audit_proof_url,akhil_sir_audit,advance_bill,advance_bill_remarks,or_recvd,photography,photography_remarks,site_video,site_video_remarks,review,review_remarks,row_color,created_at`); `balance`/`percentReceived` are computed from `total_amount`/`received_amount` and correctly not selected. The SELECT matches the reads one-for-one. `order_no` doubles as the sort key.
- `/api/orders/payments/all` → payment mapper reads `id,order_id,date,amount,mode,remarks` — all six selected; the second orders read was already explicit and left untouched.
- `/api/orders/reminders/due` + `/all` → both share the `reminders_all` cache and the 13-column list `id,order_id,order_no,client,description,date,visible_to,assigned_to,created_by,response_text,response_date,responded_by,created_at`. `/all` spreads `...r` then maps `order_no,created_by,order_id,visible_to,assigned_to,response_text,response_date,responded_by`; `/due` filters on `responded_by,created_by,visible_to`. All covered. The reminders-tab render sites consume `orderNo,client,description,createdBy,assignedTo/assigned_to/visibleTo,responseText,respondedBy,responseDate` — every one backed by a selected column.
- `/api/complaints` → `mapComplaint` reads all 27 selected columns including `resolution_history` (kept, as required; it also carries `bill_required`, `amount`, `service_slip_no`, `resolution_date`, etc.). Ordering by `id` is preserved.

The relevant risk here is dropping a free-text/proof column that would blank a cell. None was dropped — the orders list keeps all ten `*_remarks` columns plus both proof URLs, and complaints keeps `resolution_history`. The spread-based reminders mappers (`...r`) now spread only the 13 selected columns instead of the whole row; the frontend consumes nothing outside that set.

### P3 — signal design and poll gating

```
2-min orders poll:            30s reminders checker/tab:
  GET /api/orders/signal        GET /api/orders/reminders/signal
  key = count_maxId             key = count_maxId_maxResponseDate
  changed OR 5th tick ----> full fetch      changed ----> full fetch
  signal error ---------> full fetch (fail-open)   signal error -> full fetch
```

The orders poll increments `ordersPollTicks` each tick and forces a full `fetchOrders()/fetchDeletedOrders()/fetchPaperRequests()` on every 5th tick (~10 min), on first run (`lastOrdersSignal === null`), on key change, and on signal-fetch failure. The mount effect seeds `lastOrdersSignal` so the first interval tick does not fire a redundant full refetch. Manual Refresh is `window.location.reload()`, which resets all refs and forces a full load. Every error or ambiguity path (null ref, signal-fetch failure, forced tick) resolves to a full fetch, so the gating fails open rather than stale.

The orders signal catches inserts (count and maxId move) and deletes (count moves). It cannot see an in-place `PUT /api/orders/:id` edit that changes neither count nor max id — a known, documented limitation bounded to ~10 min by the safety-net tick, matching the existing `TTL_ORDERS` 10-min cache. This does not regress cross-user edit visibility beyond what the cache already imposed.

The reminders signal `{count,maxId,maxResponseDate}` catches new reminders (count/maxId), deletes (count), and new responses: the respond handler sets `response_date = new Date().toISOString()`, which always advances `max(response_date)`, so a response always flips the key and both the notifier and the tab refetch. The notifier keeps its own `lastResponseSignal` ref separate from the tab's `lastRemindersSignal`, so the two 30s polls can't swallow each other's trigger — a deliberate and correct guard.

The gap is reassign. `PUT /api/orders/reminders/:id/reassign` sets `response_date = null` and `responded_by = null`, leaving count and maxId unchanged. If the reassigned row did not hold the global `max(response_date)`, the signal key is unchanged and a passively-open reminders tab on another user's screen won't refetch until the next detectable change or a manual refresh. The actor who performs the reassign calls `fetchAllReminders()` directly, so they see it immediately, and the response-notification path (new `responded_by`) is unaffected. The plan comment "maxResponseDate catches responses/reassigns" is accurate for responses but overstates reassigns.

### Scope discipline

The commit touches only `api/index.js`, `server/index.js`, `src/pages/Dashboard.jsx`, `package.json`, `package-lock.json`, and the three task docs. `src/context/AuthContext.jsx` (the ~60s version check and daily client-side refresh) is untouched; no Follow-Up-column edits; no P4 (text-column splitting), P5 (poll de-dup), or P6 (cache headers) work leaked in. The `select('*')` reads on out-of-scope endpoints (`/api/orders/deleted/all`, paper/return requests, edit-logs, login-logs) were correctly left alone.

### Verification evidence (not re-run)

The implementer recorded, in both the plan and impact doc and the commit message: `npm install` exit 0 (compression present), `npm run build` (vite) exit 0 with only pre-existing warnings, `node --check api/index.js` and `node --check server/index.js` exit 0, and the 85.5% gzip measurement via a since-deleted `scripts/_measure-egress.cjs`. The impact doc exists with P1 measured, P2/P3 estimated-and-labelled, and the combined ~60–75% projection with the staleness bound noted. Per the review mandate these were read, not re-executed.

</details>

<details>
<summary>File map</summary>

- `api/index.js` — compression middleware; explicit SELECTs on `/api/orders`, `/api/orders/payments/all`, `/api/orders/reminders/due`, `/api/orders/reminders/all`, `/api/complaints`; new `/api/orders/signal` and `/api/orders/reminders/signal`.
- `server/index.js` — compression middleware (parity only; not deployed).
- `src/pages/Dashboard.jsx` — change-detection refs; signal-gated 2-min orders poll with 10-min safety net; signal-gated reminders tab and `checkNewResponses`.
- `package.json` / `package-lock.json` — `compression ^1.7.4` dependency.
- `.agents/tasks/egress-impact.md` — measured-vs-estimated impact figures.

Full diff: `git diff c6fc83c HEAD`.

</details>
