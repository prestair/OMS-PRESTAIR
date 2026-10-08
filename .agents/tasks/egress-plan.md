# Egress Reduction Implementation Plan (P1 + P2 + P3)

Scope: reduce Supabase egress ~60–70% via three behavior-preserving changes in the ONLY production backend `api/index.js` (Vercel serverless, routed by `vercel.json` `/api/(.*)` → `api/index.js`) and the frontend `src/pages/Dashboard.jsx`. Work happens directly in `d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard` on `main` (no worktree). `server/` is NOT deployed — only mirror a change there if it is a trivial one-line parity edit; production correctness is judged on `api/index.js`.

Grounding evidence (read during planning):
- `.agents/tasks/supabase-egress-investigation.md` — ranked contributors, line refs.
- `api/index.js` — `mapOrder` (line ~84), `mapComplaint` (line ~227), payments mapper inside `/api/orders/payments/all` (line ~202), both reminders routes (lines ~204 `/due`, ~188 `/all`), `/api/orders` (line ~195), `/api/complaints` (line ~234).
- `src/pages/Dashboard.jsx` — on-mount fetch (line ~245), 2-min interval (line ~249), reminders-tab 30s interval (line ~255), `checkNewResponses` 30s (line ~261), fetch functions (lines ~419–467), manual Refresh = `window.location.reload()` (line ~1631).
- Schema check: a repo-wide search for `updated_at` returns ZERO matches; there is NO orders/reminders table SQL and `mapOrder` reads only `created_at`. Conclusion: orders has NO reliable `updated_at`. Signal design below accounts for this with evidence.

Build/test commands (from `package.json`): build = `npm run build` (vite build); dependency install = `npm install`; syntax check = `node --check api/index.js`. There is no unit-test framework in this repo (no test script, no vitest/jest), so verification = clean build + `node --check` + a throwaway Node measurement script. Record before/after sizes in `.agents/tasks/egress-impact.md`.

Order is dependency-driven: P1 first (self-contained, highest impact), then P2 (backend-only column trimming), then P3 backend signal endpoints, then P3 frontend wiring (depends on the new endpoints). Each item leaves the repo buildable.

---

## P1 — Enable gzip/brotli compression on the API

- [ ] 1. Add the `compression` dependency to `package.json` and install it.
      Add `"compression": "^1.7.4"` to the `dependencies` object (alphabetically near `cors`/`bcryptjs`). Then run install so `package-lock.json` updates.
      Files: `package.json` (and generated `package-lock.json`).
      Verify: `npm install` completes without error and `compression` appears under `node_modules/compression`.

- [ ] 2. Wire `compression()` middleware into `api/index.js` before CORS/body-parser and all routes.
      Current (lines 1–9):
      ```js
      const express = require('express')
      const cors = require('cors')
      const bcrypt = require('bcryptjs')
      const jwt = require('jsonwebtoken')
      const { createClient } = require('@supabase/supabase-js')

      const app = express()
      app.use(cors())
      app.use(express.json({ limit: '50mb' }))
      ```
      Target:
      ```js
      const express = require('express')
      const compression = require('compression')
      const cors = require('cors')
      const bcrypt = require('bcryptjs')
      const jwt = require('jsonwebtoken')
      const { createClient } = require('@supabase/supabase-js')

      const app = express()
      app.use(compression())
      app.use(cors())
      app.use(express.json({ limit: '50mb' }))
      ```
      Transparent to axios/fetch (auto-decompress via `Accept-Encoding`). No API contract change.
      Files: `api/index.js`.
      Verify: `node --check api/index.js` passes; `compression()` is registered before the first `app.get`/`app.post` route and before `cors()`/`express.json`.

- [ ] 3. (Optional parity) If `server/index.js` or a `server/` express entry sets up middleware the same way, add the identical two lines there (`const compression = require('compression')` + `app.use(compression())`). Skip if `server/` has no matching express bootstrap. This is parity only; `server/` is not deployed.
      Files: `server/index.js` (only if a one-line mirror applies).
      Verify: `node --check server/index.js` passes (if edited).

- [ ] 4. Measure compression ratio with a throwaway Node `zlib` script and record it.
      Write a temp script (e.g. `scripts/_measure-egress.cjs`) that takes a representative orders-list JSON sample (either a saved real `/api/orders` response or a synthetic array of ~200 mapped order objects built from the `mapOrder` shape) and prints raw byte length vs `zlib.gzipSync` length and the % reduction. Run with `node scripts/_measure-egress.cjs`.
      Files: `scripts/_measure-egress.cjs` (temporary — delete after recording), `.agents/tasks/egress-impact.md` (record raw vs gzip bytes + ratio under a "P1 compression" heading).
      Verify: script prints a ratio (expect ~75–90% reduction for this JSON shape); the ratio is written to `egress-impact.md`; delete the temp script afterward.

---

## P2 — Replace `select('*')` with explicit minimal column lists on heavy list endpoints

Source of truth = the mapper functions. Keep every column the mapper reads plus `id` and any ordering/filter column. P4 is OUT OF SCOPE — KEEP all remark/text/proof columns and `resolution_history`.

Derived column lists (snake_case, from the mappers in `api/index.js`):

- **orders** (`mapOrder`, line ~84 — every property it reads, plus `order_no` is also the sort key):
  `id,date,po_no,client,order_no,status,delivery_date,delivery_remarks,customer_name,gst,billing_address,follow_up,sales_rep,delivery_address,phone_no,site_verification,site_verification_remarks,installation_status,installation_remarks,lop,section_drawing,section_drawing_remarks,in_production,billing,installation,akhil_points,total_amount,received_amount,follow_up_type,payment_remarks,payment_proof_url,days_to_order,remarks,audit_proof_url,akhil_sir_audit,advance_bill,advance_bill_remarks,or_recvd,photography,photography_remarks,site_video,site_video_remarks,review,review_remarks,row_color,created_at`
  (Note: `balance` and `percentReceived` are computed in `mapOrder` from `total_amount`/`received_amount`, so they are NOT selected. `row_color` is read as `o.row_color || ''`.)

- **payments** (mapper inside `/api/orders/payments/all`, line ~202):
  `id,order_id,date,amount,mode,remarks`
  (Leave the SECOND read in that handler — `orders.select('id,order_no,client,date,total_amount,received_amount,balance')` — UNCHANGED; it is already explicit.)

- **reminders** (both `/due` line ~204 and `/all` line ~188; `/all` spreads `...r` and orders by `created_at`, `/due` filters on `responded_by`/`created_by`/`visible_to`):
  `id,order_id,order_no,client,description,date,visible_to,assigned_to,created_by,response_text,response_date,responded_by,created_at`

- **complaints** (`mapComplaint`, line ~227; ordered by `id`):
  `id,complaint_no,complaint_date,client,customer_name,phone,purchase_bill_no,purchase_date,warranty_status,product,problem_reported,priority,technician,helper,assignment_type,scheduled_date,status,problem_identified,resolution,bill_required,bill_no,amount,service_slip_no,resolution_date,resolution_history,created_by,created_at`
  (KEEP `resolution_history` — the frontend renders attempt counts and History modal from it; `ComplaintsManagement.jsx` lines ~390, ~394, ~501, ~551.)

- [ ] 5. `/api/orders` — replace `orders.select('*')` with the explicit orders column list.
      Current (line ~195): `const{data}=await supabase.from('orders').select('*')`
      Target: `const{data}=await supabase.from('orders').select('id,date,po_no,client,order_no,status,delivery_date,delivery_remarks,customer_name,gst,billing_address,follow_up,sales_rep,delivery_address,phone_no,site_verification,site_verification_remarks,installation_status,installation_remarks,lop,section_drawing,section_drawing_remarks,in_production,billing,installation,akhil_points,total_amount,received_amount,follow_up_type,payment_remarks,payment_proof_url,days_to_order,remarks,audit_proof_url,akhil_sir_audit,advance_bill,advance_bill_remarks,or_recvd,photography,photography_remarks,site_video,site_video_remarks,review,review_remarks,row_color,created_at')`
      Files: `api/index.js`.
      Verify: `node --check api/index.js` passes; every property returned by `mapOrder` has a matching column in the SELECT (cross-check the two lists field-by-field).

- [ ] 6. `/api/orders/payments/all` — replace `payments.select('*')` with the explicit payments column list; leave the orders read untouched.
      Current (line ~202): `const{data:payments}=await supabase.from('payments').select('*').order('date',{ascending:false})`
      Target: `const{data:payments}=await supabase.from('payments').select('id,order_id,date,amount,mode,remarks').order('date',{ascending:false})`
      Files: `api/index.js`.
      Verify: `node --check api/index.js` passes; the payment mapper reads only `p.id,p.order_id,p.date,p.amount,p.mode,p.remarks` — all present.

- [ ] 7. `/api/orders/reminders/due` AND `/api/orders/reminders/all` — replace both `reminders.select('*')` with the explicit reminders column list (keep `.order('created_at',{ascending:false})` on `/all`).
      Current `/due` (line ~204): `const{data}=await supabase.from('reminders').select('*')`
      Current `/all` (line ~188): `const{data}=await supabase.from('reminders').select('*').order('created_at',{ascending:false})`
      Target `/due`: `const{data}=await supabase.from('reminders').select('id,order_id,order_no,client,description,date,visible_to,assigned_to,created_by,response_text,response_date,responded_by,created_at')`
      Target `/all`: `const{data}=await supabase.from('reminders').select('id,order_id,order_no,client,description,date,visible_to,assigned_to,created_by,response_text,response_date,responded_by,created_at').order('created_at',{ascending:false})`
      Both routes cache into the shared `reminders_all` key — keep that behavior; both read from the same cached array so the column set must cover BOTH routes' field usage (it does).
      Files: `api/index.js`.
      Verify: `node --check api/index.js` passes; `/all` maps `order_no,created_by,order_id,visible_to,assigned_to,response_text,response_date,responded_by` and `/due` filters on `responded_by,created_by,visible_to` — all present in the SELECT.

- [ ] 8. `/api/complaints` — replace `complaints.select('*')` with the explicit complaints column list (keep `.order('id',{ascending:false})`). KEEP `resolution_history`.
      Current (line ~234): `const { data } = await supabase.from('complaints').select('*').order('id',{ascending:false})`
      Target: `const { data } = await supabase.from('complaints').select('id,complaint_no,complaint_date,client,customer_name,phone,purchase_bill_no,purchase_date,warranty_status,product,problem_reported,priority,technician,helper,assignment_type,scheduled_date,status,problem_identified,resolution,bill_required,bill_no,amount,service_slip_no,resolution_date,resolution_history,created_by,created_at').order('id',{ascending:false})`
      Files: `api/index.js`.
      Verify: `node --check api/index.js` passes; every property returned by `mapComplaint` has a matching column (including `resolution_history`).

- [ ] 9. Confirm no rendered field was dropped (frontend cross-check — not a substitute for build, a safety grep).
      Grep `src/pages/Dashboard.jsx` for order field usage (`o.`/`order.` camelCase keys) and `src/components/ComplaintsManagement.jsx` for complaint field usage; confirm each camelCase key maps to a snake_case column present in the SELECTs above. If any consumed field is missing a column, ADD it (keep-if-uncertain rule).
      Files: none changed unless a gap is found (then `api/index.js`).
      Verify: no consumed field lacks a backing column; `npm run build` still passes.

---

## P3 — Change-detection before full refetch

### Signal design decision (with schema evidence)

- **Orders signal** — orders has NO `updated_at` (zero repo matches; `mapOrder` reads only `created_at`). Use `GET /api/orders/signal` → `{ count, maxId }`:
  - `count` via Supabase `head:true, count:'exact'`; `maxId` via `select('id').order('id',{ascending:false}).limit(1)`.
  - This catches INSERTS and DELETES (both change `count`; inserts change `maxId`).
  - LIMITATION (documented, per task): in-place edits (e.g. status/field changes via `PUT /api/orders/:id` that do not change row count or id) are NOT reflected by this signal. Mitigation: a periodic SAFETY-NET full refetch (see item 13) runs every 10 minutes regardless of signal, matching the existing server-side `TTL_ORDERS=10min` cache window — so cross-user edit staleness is already bounded by that cache today and is not made worse. This keeps cross-user edit visibility within the same window the app already has, while eliminating the per-2-min full payload on the common no-change case.

- **Reminders signal** — reminders has `created_at` (ordering) and `response_date` (set on respond/reassign). To detect BOTH new reminders AND new responses cheaply, use `GET /api/orders/reminders/signal` → `{ count, maxId, maxResponseDate }`:
  - `count` + `maxId` catch new/deleted reminders; `maxResponseDate` = `max(response_date)` catches responses (the exact event `checkNewResponses` watches). All three are tiny scalars, far smaller than the full reminders list.

Both signal endpoints are authenticated like the heavy ones and may use a very short optional cache; keep them uncached initially for simplicity (they are tiny `head`/single-row reads).

- [ ] 10. Add `GET /api/orders/signal` to `api/index.js` returning `{ count, maxId }`.
      Place it near the other orders routes (e.g. just after the `/api/orders` handler, before `/api/orders/deleted/all`). Implementation sketch:
      ```js
      app.get('/api/orders/signal', authenticate, async (req, res) => { try {
        const { count } = await supabase.from('orders').select('id', { count: 'exact', head: true })
        const { data: maxRow } = await supabase.from('orders').select('id').order('id',{ascending:false}).limit(1)
        res.json({ count: count || 0, maxId: maxRow?.[0]?.id || 0 })
      } catch(e){ res.status(500).json({ error: e.message }) } })
      ```
      Files: `api/index.js`.
      Verify: `node --check api/index.js` passes; route defined once; response contains only `count` and `maxId` (no row payload).

- [ ] 11. Add `GET /api/orders/reminders/signal` to `api/index.js` returning `{ count, maxId, maxResponseDate }`.
      Place it near the reminders routes. Implementation sketch:
      ```js
      app.get('/api/orders/reminders/signal', authenticate, async (req, res) => { try {
        const { count } = await supabase.from('reminders').select('id', { count: 'exact', head: true })
        const { data: maxIdRow } = await supabase.from('reminders').select('id').order('id',{ascending:false}).limit(1)
        const { data: maxRespRow } = await supabase.from('reminders').select('response_date').order('response_date',{ascending:false,nullsFirst:false}).limit(1)
        res.json({ count: count || 0, maxId: maxIdRow?.[0]?.id || 0, maxResponseDate: maxRespRow?.[0]?.response_date || null })
      } catch(e){ res.status(500).json({ error: e.message }) } })
      ```
      Files: `api/index.js`.
      Verify: `node --check api/index.js` passes; response contains only the three scalars; no reminder rows returned.

- [ ] 12. (Parity, optional) Mirror items 5–11 into `server/` ONLY where a route is a trivial one-line `select('*')` → explicit-list swap or an obvious signal-route copy. Do not invest effort reconciling `server/` divergence; `server/` is not deployed. Skip entirely if `server/` lacks these routes.
      Files: `server/*` (only trivial mirrors).
      Verify: `node --check` on any edited `server/` file passes.

- [ ] 13. Gate the 2-minute orders poll in `src/pages/Dashboard.jsx` on `/api/orders/signal` with a 10-minute safety-net full refetch.
      Add a ref to hold the last-seen orders signal and a counter for the safety net. Rewrite the 2-min effect (line ~249):
      ```js
      const lastOrdersSignal = useRef(null)
      const ordersPollTicks = useRef(0)
      useEffect(() => {
        const interval = setInterval(async () => {
          ordersPollTicks.current += 1
          const forceFull = ordersPollTicks.current % 5 === 0 // every 5th tick = ~10 min safety net for in-place edits
          try {
            const sig = await axios.get('/api/orders/signal')
            const key = `${sig.data.count}_${sig.data.maxId}`
            if (forceFull || lastOrdersSignal.current === null || lastOrdersSignal.current !== key) {
              fetchOrders(); fetchDeletedOrders(); fetchPaperRequests()
            }
            lastOrdersSignal.current = key
          } catch {
            // signal failed — fall back to the original full refetch so data never goes stale
            fetchOrders(); fetchDeletedOrders(); fetchPaperRequests()
          }
        }, 120000)
        return () => clearInterval(interval)
      }, [])
      ```
      The on-mount effect (line ~245) still does the initial full load unchanged, so first paint is unaffected; it should also seed `lastOrdersSignal.current` — fetch the signal once on mount (or let the first interval tick seed it; seeding on mount avoids a redundant refetch on the first tick). Preferred: in the on-mount effect, after the initial `fetchOrders()`, also `axios.get('/api/orders/signal').then(sig => { lastOrdersSignal.current = `${sig.data.count}_${sig.data.maxId}` }).catch(()=>{})`.
      Manual Refresh is `window.location.reload()` (line ~1631) → full page reload resets refs → always a full refetch. Preserved automatically.
      Files: `src/pages/Dashboard.jsx` (ensure `useRef` is imported from React — it is already used elsewhere; confirm).
      Verify: `npm run build` passes with zero errors; logic review confirms (a) no-change ticks skip the three heavy fetches, (b) every 5th tick forces a full refetch, (c) signal-fetch failure falls back to full refetch, (d) initial mount load unchanged.

- [ ] 14. Gate the `checkNewResponses` 30-second poll on `/api/orders/reminders/signal`.
      In the effect at line ~261, add a ref `lastRemindersSignal` seeded in the existing `init()` call. In `checkNewResponses`, first GET `/api/orders/reminders/signal`; only call the full `GET /api/orders/reminders/all` + run the response-diff logic when the signal key `${count}_${maxId}_${maxResponseDate}` differs from the stored one; then store it. On signal-fetch error, fall back to the full fetch (preserve current behavior). `init()` should fetch the full list once (as today) AND seed `lastRemindersSignal.current` from the signal.
      Files: `src/pages/Dashboard.jsx`.
      Verify: `npm run build` passes; review confirms new reminders (count/maxId change) and new responses (maxResponseDate change) BOTH trigger the full fetch, so notifications still fire; unchanged ticks skip the full reminders payload.

- [ ] 15. Drive the reminders-TAB 30s interval (line ~255) off the same signal so the live view updates without full polling every 30s.
      In the `activeTab === 'reminders'` effect, reuse `lastRemindersSignal` (or a tab-local ref): on each tick GET the reminders signal and only `fetchAllReminders()` when it changed; always `fetchAllReminders()` once immediately on entering the tab (preserve current initial-load behavior) and on signal-fetch error. Keep the reminders tab visually live.
      Files: `src/pages/Dashboard.jsx`.
      Verify: `npm run build` passes; entering the Reminders tab still loads immediately; subsequent 30s ticks only refetch on signal change.

- [ ] 16. Do NOT touch the ~60s `/api/app-version` version check in `AuthContext.jsx` or the daily 13:40/20s client-side refresh. Confirm they remain unmodified.
      Files: none.
      Verify: `git diff --stat` shows no changes to `src/context/AuthContext.jsx`.

---

## Final verification & measurement

- [ ] 17. Full build + syntax gate.
      Run `node --check api/index.js` and `npm run build`.
      Verify: `node --check` prints nothing (success); `npm run build` completes with zero errors.

- [ ] 18. Record before/after egress measurement in `.agents/tasks/egress-impact.md`.
      Capture: (a) P1 raw-vs-gzip ratio on a representative `/api/orders` payload (from item 4); (b) P2 payload-size delta — compare byte length of a `select('*')` orders row vs the trimmed column set on a sample (document estimated % reduction of the orders/payments/reminders/complaints payloads from dropping unused columns — note the main orders win is small since P4 text columns are intentionally kept; the real P2 win is on payments/reminders/complaints metadata and dropping computed/unused columns); (c) P3 steady-state call reduction — describe that no-change 2-min ticks drop 3 heavy calls → 1 tiny signal call, and 30s reminders ticks drop 1 heavy call → 1 tiny signal call, with the per-user per-hour egress estimate before vs after. Summarize the combined expected 60–70% reduction and note the orders-edit staleness bound (≤10 min, unchanged from existing cache TTL).
      Files: `.agents/tasks/egress-impact.md`.
      Verify: `egress-impact.md` exists and contains P1 ratio, P2 delta, P3 call-count delta, and the combined estimate.

- [ ] 19. Clean up temporary artifacts.
      Delete `scripts/_measure-egress.cjs` (and any sample JSON dump) created for measurement.
      Files: remove temp files.
      Verify: `git status` shows no stray temp files; only intended changes (`package.json`, `package-lock.json`, `api/index.js`, `src/pages/Dashboard.jsx`, optional `server/*`, and the two `.agents/tasks/*.md`) remain.

---

## Implementation evidence (recorded after execution)

Commands run (from `oms-dashboard`):
- `npm install` → exit 0; `compression` present in `node_modules/compression` and `package-lock.json` (line ~2748).
- `npm run build` (vite) → exit 0, built successfully with ZERO errors (only pre-existing CJS-deprecation + >500 kB chunk-size warnings).
- `node --check api/index.js` → exit 0. `node --check server/index.js` → exit 0.
- `node scripts/_measure-egress.cjs` → 200-row `/api/orders` payload: raw 564,231 B, gzip 82,056 B → **85.5% reduction** (brotli 96.3%). Script deleted afterward.

P1 measured gzip ratio: **85.5%** on a realistic orders payload (per-row unique remarks so the ratio is not overstated).

Final column lists per endpoint:
- `/api/orders`: `id,date,po_no,client,order_no,status,delivery_date,delivery_remarks,customer_name,gst,billing_address,follow_up,sales_rep,delivery_address,phone_no,site_verification,site_verification_remarks,installation_status,installation_remarks,lop,section_drawing,section_drawing_remarks,in_production,billing,installation,akhil_points,total_amount,received_amount,follow_up_type,payment_remarks,payment_proof_url,days_to_order,remarks,audit_proof_url,akhil_sir_audit,advance_bill,advance_bill_remarks,or_recvd,photography,photography_remarks,site_video,site_video_remarks,review,review_remarks,row_color,created_at`
- `/api/orders/payments/all` (payments): `id,order_id,date,amount,mode,remarks` (second orders read left explicit/untouched).
- `/api/orders/reminders/due` + `/all`: `id,order_id,order_no,client,description,date,visible_to,assigned_to,created_by,response_text,response_date,responded_by,created_at`
- `/api/complaints`: `id,complaint_no,complaint_date,client,customer_name,phone,purchase_bill_no,purchase_date,warranty_status,product,problem_reported,priority,technician,helper,assignment_type,scheduled_date,status,problem_identified,resolution,bill_required,bill_no,amount,service_slip_no,resolution_date,resolution_history,created_by,created_at`

Signal-column decision:
- Orders → `{count,maxId}` (no reliable `updated_at`; catches insert/delete; in-place edits covered by the ~10-min safety-net full refetch matching `TTL_ORDERS`).
- Reminders → `{count,maxId,maxResponseDate}` (`maxResponseDate` catches responses/reassigns).

Frontend cross-check: all consumed order fields (`mapOrder` output) and complaint fields (`ComplaintsManagement.jsx` rendering incl. `resolutionHistory`) map to a column in the SELECTs above — no rendered field dropped.

server/ parity: only the trivial two-line `compression` mirror was added to `server/index.js` (it has a matching express bootstrap). P2/P3 were NOT mirrored because `server/` uses a different non-Supabase data layer and is not deployed.

Full before/after numbers are in `.agents/tasks/egress-impact.md`.

## Notes / assumptions
- No unit-test framework exists in this repo; verification relies on `node --check`, `npm run build`, and the zlib measurement script. If the implementer finds a test runner, add targeted tests for the signal endpoints.
- The orders-edit propagation tension in the task text (use `{count,maxId}` AND keep cross-user edits visible) is resolved by the 10-minute safety-net full refetch in item 13, which bounds edit staleness to the already-existing `TTL_ORDERS` cache window rather than regressing it.
- P4/P5/P6 and the auto-refresh/version-check and Follow Up Direct/Sir features are explicitly OUT OF SCOPE and must not be modified.
