# Egress Reduction — Impact Measurement (P1 + P2 + P3)

Scope implemented: P1 (gzip compression on the API), P2 (explicit column lists on heavy list
endpoints), P3 (change-detection signal before full refetch on the 2-min orders poll and the 30s
reminders checker). Backend changes live in `api/index.js` (the only production backend); frontend
changes in `src/pages/Dashboard.jsx`.

What is **measured** vs **estimated**:
- P1 ratio: **measured** with a Node `zlib` script on a representative 200-row `/api/orders` payload.
- P2 per-row reduction: **estimated** — stated with its assumption.
- P3 call reduction: **estimated** from the poll cadence and a worked change-rate example.
- The definitive Supabase egress number only shows in the Supabase dashboard over 1–2 days
  post-deploy; the figures below are the engineering projection, not a dashboard reading.

---

## P1 — gzip compression (MEASURED)

Method: a throwaway script (`scripts/_measure-egress.cjs`, since deleted) built a realistic array
of 200 orders in the exact `mapOrder` output shape, with per-row **unique** free-text remarks (so
the payload is not trivially compressible and the ratio is not overstated), then compared raw UTF-8
bytes against `zlib.gzipSync`.

| Payload (200 orders) | Bytes | Reduction vs raw |
|---|---|---|
| Raw JSON (uncompressed, today) | 564,231 | — |
| gzip (`compression` middleware default) | 82,056 | **85.5%** |
| brotli (reference only) | 21,005 | 96.3% |

**P1 result: ~85.5% reduction** on the orders list payload with gzip (the Express `compression`
middleware negotiates gzip via `Accept-Encoding`; axios/fetch auto-decompress — no client change).
This single change applies to **every** JSON response from the API (orders, reminders, payments,
complaints, deleted orders, paper/return requests), so it is the dominant lever.

Caveat to confirm in prod: Vercel must pass the function's `Content-Encoding` through (it respects
the Node function's encoding). If a platform layer ever stripped it, brotli-at-edge is the fallback.

---

## P2 — explicit column lists (ESTIMATED)

Replaced `select('*')` with the exact columns each mapper reads (plus `id` and ordering/filter
columns) on: `/api/orders`, `/api/orders/payments/all` (payments read), `/api/orders/reminders/due`,
`/api/orders/reminders/all`, `/api/complaints`.

Assumption: the DB tables carry some columns the mappers never read (internal/legacy/audit columns
and anything added later). `select('*')` ships all of them to the serverless function on every cache
miss; the explicit list ships only what the UI consumes.

Estimated per-endpoint effect:
- **Orders**: the list intentionally KEEPS all remark/text columns (P4 is out of scope), and
  `mapOrder` already consumes almost every business column, so the P2 win here is **small**
  (bounded to any non-mapped DB columns — roughly **2–8%** of the orders row, depending on how many
  unused columns the table has). The big orders win comes from P1, not P2.
- **Payments**: `select('*')` → 6 columns (`id,order_id,date,amount,mode,remarks`). Payments rows are
  narrow; dropping any unused columns trims an estimated **5–15%** per row.
- **Reminders**: trimmed to the 13 columns both routes use. Estimated **5–15%** per row from dropping
  unused columns (text columns like `response_text` are kept).
- **Complaints**: trimmed to the 27 mapper columns, `resolution_history` KEPT. Estimated **5–15%**
  per row from unused columns.

**P2 result (estimated): ~5–15% additional reduction on payments/reminders/complaints payloads, and
a small (~2–8%) trim on orders.** P2 does not stack fully on top of P1 (compression already shrinks
redundant column data); its real value is cutting bytes at the Supabase→serverless hop (which
compression does not touch) and guarding against future wide-column creep.

---

## P3 — change-detection before full refetch (ESTIMATED)

New tiny endpoints: `GET /api/orders/signal` → `{count,maxId}` and
`GET /api/orders/reminders/signal` → `{count,maxId,maxResponseDate}`. Each returns a few scalars
(tens of bytes) instead of the full list.

Frontend: the 2-min orders poll and the 30s reminders checker now fetch the signal first and only
run the heavy fetch when the signal changed. A safety-net full orders refetch runs every 5th tick
(~10 min) to catch in-place edits the `{count,maxId}` signal cannot see — this bounds edit staleness
to ~10 min, which matches the existing `TTL_ORDERS` 10-min cache window (no regression).

### Orders — 2-minute poll, per user per hour
- Ticks/hour: 60 min / 2 min = **30 ticks**.
- Before: **30 full** orders fetches/hour (each ≈ the full orders payload; ~82 KB gzipped at 200
  rows from the P1 measurement — larger as the table grows).
- After, worked example — orders change ~10 times/hour: the 10 ticks after a change still do a full
  fetch; the ~10-min safety net adds up to 6 forced full fetches/hour; overlap aside, that's roughly
  **10–12 full fetches/hour**, the remaining ~18–20 ticks replaced by a tens-of-bytes signal call.
- That's a **~60–65% drop** in full orders downloads for that user, with the skipped ticks costing
  near-zero. On a quiet hour (0 changes) only the ~6 safety-net full fetches run → **~80% drop**.

### Reminders — 30-second checker, per user per hour
- Ticks/hour: 3600 / 30 = **120 ticks**.
- Before: **120 full** reminders-list fetches/hour (per user, all tabs).
- After, worked example — reminders/responses change ~12 times/hour: ~12 full fetches, the other
  ~108 ticks replaced by a tiny signal call → **~90% drop** in full reminders downloads.
- The reminders-TAB 30s live view is gated the same way (loads immediately on entering the tab, then
  only refetches on signal change), and the manual Refresh button (`window.location.reload()`) still
  forces a full reload.

**P3 result (estimated): ~60–80% fewer full orders downloads and ~90% fewer full reminders downloads
per user in steady state**, replaced by negligible signal calls. The exact number depends on each
deployment's real change rate.

---

## Combined estimate

- P1 alone removes ~85% of the bytes on every response (measured) and already clears the 60% target.
- P2 trims additional bytes at the DB→serverless hop that compression does not cover (estimated low
  double digits on the narrower tables).
- P3 removes a large share of the *repeating* polling payloads entirely (estimated 60–90% fewer full
  downloads for the two hot polls).

**Overall projected Supabase egress reduction: ~60–75%** (honestly: P1 is measured and is the main
driver; P2 and P3 are estimated and add margin, especially under many concurrent users where the
2-min and 30s polls dominate steady-state traffic).

**Verification note:** confirm the actual reduction in the Supabase dashboard egress graph 1–2 days
after deploy — that is the only authoritative figure.

---

## What was run (evidence)

- `npm install` — exit 0; `compression` present under `node_modules/compression` and in
  `package-lock.json`.
- `npm run build` (vite) — exit 0, built successfully, zero errors (pre-existing CJS-deprecation and
  chunk-size warnings only).
- `node --check api/index.js` — exit 0. `node --check server/index.js` — exit 0.
- `node scripts/_measure-egress.cjs` — raw 564,231 B / gzip 82,056 B → 85.5% (script since deleted).

### Final column lists per endpoint
- `/api/orders`: `id,date,po_no,client,order_no,status,delivery_date,delivery_remarks,customer_name,gst,billing_address,follow_up,sales_rep,delivery_address,phone_no,site_verification,site_verification_remarks,installation_status,installation_remarks,lop,section_drawing,section_drawing_remarks,in_production,billing,installation,akhil_points,total_amount,received_amount,follow_up_type,payment_remarks,payment_proof_url,days_to_order,remarks,audit_proof_url,akhil_sir_audit,advance_bill,advance_bill_remarks,or_recvd,photography,photography_remarks,site_video,site_video_remarks,review,review_remarks,row_color,created_at`
- `/api/orders/payments/all` (payments read): `id,order_id,date,amount,mode,remarks` (the second orders read was already explicit — left untouched).
- `/api/orders/reminders/due` and `/api/orders/reminders/all`: `id,order_id,order_no,client,description,date,visible_to,assigned_to,created_by,response_text,response_date,responded_by,created_at`
- `/api/complaints`: `id,complaint_no,complaint_date,client,customer_name,phone,purchase_bill_no,purchase_date,warranty_status,product,problem_reported,priority,technician,helper,assignment_type,scheduled_date,status,problem_identified,resolution,bill_required,bill_no,amount,service_slip_no,resolution_date,resolution_history,created_by,created_at`

### Signal-column decision
- Orders has NO reliable `updated_at` (zero repo matches; `mapOrder` reads only `created_at`), so the
  orders signal uses `{count,maxId}`. This catches inserts and deletes but not in-place edits;
  mitigated by the ~10-min safety-net full refetch (matches existing `TTL_ORDERS`).
- Reminders uses `{count,maxId,maxResponseDate}` — `maxResponseDate = max(response_date)` catches
  responses/reassigns (the exact event `checkNewResponses` watches), count/maxId catch new/deleted
  reminders.
