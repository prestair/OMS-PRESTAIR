# Implementation Plan — Preserve Payment History for Completed Orders + Payment History in Daily Email

This plan is grounded in the actual code read during exploration. All paths are absolute under
`d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard`.

## Key design decisions (made from the code, documented here)

### D1. The `payments.order_id REFERENCES orders(id)` FK forces a migration
`server/setupSupabase.js` and `portable-app/server/setupSupabase.js` both create:
```
CREATE TABLE payments ( id SERIAL PRIMARY KEY, order_id INTEGER REFERENCES orders(id), ... )
```
No `ON DELETE` clause → PostgreSQL default is `NO ACTION` (restrict). Today the move endpoint
side-steps this by `DELETE FROM payments WHERE order_id = id` *before* `DELETE FROM orders` — which is
exactly the data-loss bug. If we simply stop deleting payment rows, deleting the parent `orders` row
would be **blocked by the FK** (or, after restore re-inserts a different id, leave the payment rows
pointing at a non-existent order).
Decision: **a migration IS required.** Convert the FK to `ON DELETE SET NULL` is NOT suitable (we must
keep `order_id` intact to re-link on restore). Instead **drop the FK constraint entirely** so a payment
row can outlive its parent `orders` row while keeping its `order_id` value as the stable link to the
`deleted_orders.original_id`. This is the minimal, safe, idempotent change. Payment integrity is then
enforced in application code (move / restore / permanent-delete all keep `order_id` consistent).
The migration is `api/payments-fk-migration.sql`, idempotent, flagged for one-time manual run in the
Supabase SQL editor (same convention as the other `api/*-migration.sql` files). The default FK name
Postgres assigns is `payments_order_id_fkey`; the migration drops it `IF EXISTS`.

### D2. Restore uses a NEW id and re-points payments (NOT original-id insert)
`orders.id` is `SERIAL`. Inserting an explicit original id does **not** advance the sequence, so a later
auto-insert could collide with the restored id — an unsafe option. Current restore already strips `id`
and lets the DB assign a fresh one. Decision: **keep new-id restore, and re-point the preserved payment
rows' `order_id` from the archived key to the new order id**, then recompute totals. This keeps the
SERIAL sequence safe and payments linked. (This is the task's documented fallback, chosen because the
preferred original-id insert is unsafe with SERIAL.)

### D3. Payment endpoint target detection (orders row vs deleted_orders snapshot)
A completed order has NO `orders` row; its data lives in `deleted_orders.data` keyed by
`original_id = id`. The payment POST/PUT/DELETE handlers recompute order totals, so each must detect
where the order lives: look up `orders` by `id` first; if present, update it as today; else look up
`deleted_orders` by `original_id = id` and update that row's `data` JSON
(`received_amount` / `balance` / `percent_received`), recomputed from the `payments` table for that
`order_id`, preserving every other field in the snapshot. Payment rows themselves always live in
`payments` keyed by `order_id`, so GET/insert/update/delete of the row is unchanged.

### D4. The rare original_id-bump collision in the move endpoint
When `deleted_orders` already has a row with `original_id = order.id`, the move bumps `delId` to a fresh
number. Since `GET /api/orders/deleted/all` exposes `id = original_id`, the completed order the UI sees
would be `delId`, not the real order id the payments are keyed to. In that (rare) branch we must
re-point the payment rows: `UPDATE payments SET order_id = delId WHERE order_id = realId`. In the normal
branch `delId === realId`, so no re-point is needed.

### D5. Frontend gating for the Completed Receipt button
`Dashboard.jsx` defines `canAddReceipt` and `canEditCompleted` but NOT `canEditReceipt`. The completed
Action column (`<th>` + `<td>`) currently renders only when `(isAdmin || canEditCompleted)`. To let a
receipt-only user operate on completed receipts, add a derived `canEditReceipt = isAdmin || user.canEditReceipt`,
widen the column render condition to `(isAdmin || canEditCompleted || canEditReceipt)`, and add a green
"Receipt" button gated `(isAdmin || canEditReceipt)` that calls `setShowPaymentForm(order)`. `PaymentForm`
needs **no structural change**: a completed order from `/api/orders/deleted/all` already carries
`id (=original_id)`, `orderNo`, `client`, `totalAmount`, so all its `/api/orders/${order.id}/payments`
calls resolve correctly via D3.

### Migration summary
One new idempotent migration: `api/payments-fk-migration.sql` (drop `payments_order_id_fkey`). Flagged
for manual one-time run. No other schema change.

---

## Ordered implementation items

- [ ] 1. Add the idempotent FK-drop migration.
      Create `api/payments-fk-migration.sql` with a header comment (one-time manual run in Supabase SQL
      editor, same style as `api/follow-up-type-migration.sql`) and:
      `ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_order_id_fkey;`
      Files: `d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard\api\payments-fk-migration.sql`
      Verify: file exists and is valid SQL by inspection (no build step for .sql). This must be run
      manually before the move endpoint can delete an `orders` row that still has payment rows.

- [ ] 2. Fix the Active→Completed move in BOTH backends to preserve payments.
      In `app.delete('/api/orders/:id')` (api/index.js) and `router.delete('/:id')`
      (server/routes/orders.js): REMOVE the `supabase.from('payments').delete().eq('order_id', id)` line.
      After the archive insert succeeds, if `delId !== orders[0].id` (collision-bump branch, D4), run
      `supabase.from('payments').update({ order_id: delId }).eq('order_id', orders[0].id)` so payments
      follow the archived key. Then delete the `orders` row as today. Keep cache invalidation
      (`cacheDel('orders','deleted_orders','payments_all')` in api/index.js).
      Files: `d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard\api\index.js`,
      `d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard\server\routes\orders.js`
      Verify: `node --check api/index.js` and `node --check server/routes/orders.js` pass.

- [ ] 3. Make payment POST/PUT/DELETE recompute totals against orders OR deleted_orders (D3), in BOTH backends.
      In `POST /api/orders/:id/payments`, `PUT /api/orders/:id/payments/:pid`,
      `DELETE /api/orders/:id/payments/:pid` (api/index.js) and the mirrors in server/routes/orders.js:
      after mutating the `payments` row and summing `received = SUM(payments.amount WHERE order_id=id)`,
      first query `orders` by `id`. If a row exists, update `received_amount/balance/percent_received`
      there (current behavior). Else query `deleted_orders` by `original_id = id`; if found, read
      `totalAmount` from `data` (`data.total_amount ?? data.totalAmount ?? 0`), compute
      `balance = total - received` and `percent = total ? round2(received/total*100) : 0`, and write back
      `data` with those three fields updated (spread the existing `data`, override the three), via
      `supabase.from('deleted_orders').update({ data: newData }).eq('original_id', id)`. Keep the
      can_edit_receipt gate on PUT/DELETE, keep the `order_edit_history` RECEIPT_EDIT logging in PUT, and
      invalidate `deleted_orders` cache (in addition to the existing `orders`,`payments_all`) when the
      completed branch is taken.
      Files: `d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard\api\index.js`,
      `d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard\server\routes\orders.js`
      Verify: `node --check api/index.js` and `node --check server/routes/orders.js` pass.

- [ ] 4. Make restore re-link payments to the new order id (D2), in BOTH backends.
      In `POST /api/orders/deleted/:id/restore` (api/index.js) and `router.post('/deleted/:id/restore')`
      (server/routes/orders.js): after the new order inserts (`inserted[0].id = newId`), re-point payments
      with `supabase.from('payments').update({ order_id: newId }).eq('order_id', parseInt(req.params.id))`
      (the archived key = original_id = route id). Then recompute totals on the new order from its
      payments (`received = SUM`, `total = inserted[0].total_amount`, update
      `received_amount/balance/percent_received` on the orders row). Then delete the `deleted_orders` row
      as today. Keep adminOnly. Invalidate `orders`,`deleted_orders`,`payments_all` caches.
      Files: `d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard\api\index.js`,
      `d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard\server\routes\orders.js`
      Verify: `node --check api/index.js` and `node --check server/routes/orders.js` pass.

- [ ] 5. Make permanent-delete also delete preserved payments (no orphans), in BOTH backends.
      In `DELETE /api/orders/deleted/:id` (api/index.js) and `router.delete('/deleted/:id')`
      (server/routes/orders.js): before/after deleting the `deleted_orders` row, run
      `supabase.from('payments').delete().eq('order_id', parseInt(req.params.id))` (route id = original_id
      = payments' order_id). Keep adminOnly. Invalidate `deleted_orders`,`payments_all` caches
      (api/index.js uses `cacheDel('deleted_orders')` today — add `payments_all`).
      Files: `d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard\api\index.js`,
      `d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard\server\routes\orders.js`
      Verify: `node --check api/index.js` and `node --check server/routes/orders.js` pass.

- [ ] 6. Add the Completed-tab Receipt button + widen Action column gating (D5) in Dashboard.jsx.
      Add `const canEditReceipt = isAdmin || user.canEditReceipt` near the other derived rights
      (~line 203, beside `canEditCompleted`). Change the completed Action `<th>` condition (~line 2185)
      and the Action `<td>` wrapper condition (~line 2240) from `(isAdmin || canEditCompleted)` to
      `(isAdmin || canEditCompleted || canEditReceipt)`. Inside the `<td>`, add as the first button:
      `{(isAdmin || canEditReceipt) && <button onClick={() => setShowPaymentForm(order)} style={{ ...styles.tblBtn, background: '#27ae60' }} title="Receipt">Receipt</button>}`.
      Keep Edit (isAdmin||canEditCompleted), Restore (isAdmin), Permanent Delete (isAdmin) unchanged.
      Files: `d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard\src\pages\Dashboard.jsx`
      Verify: `npm run build` (from project root) succeeds.

- [ ] 7. Refresh completed list after a receipt change (Dashboard.jsx).
      Change `handlePaymentSaved` (~line 1059) from `() => { setShowPaymentForm(null); fetchOrders() }`
      to also call `fetchDeletedOrders()` so updated completed totals render:
      `() => { setShowPaymentForm(null); fetchOrders(); fetchDeletedOrders() }`. Active behavior is
      unchanged (fetchOrders still runs). No PaymentForm change needed (works via order.id).
      Files: `d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard\src\pages\Dashboard.jsx`
      Verify: `npm run build` succeeds.

- [ ] 8. Show inline payment history in the EXISTING "Received" column of the daily Excel (Task 2, final format).
      Do NOT add a new sheet. In `api/cron-daily-report.js`: add
      `supabase.from('payments').select('*')` to the `Promise.all` fetch block and destructure
      `paymentsRes`; `const payments = paymentsRes.data || []`. Build a map `byOrderId: order_id -> [payment]`
      (one array per order_id), each array sorted OLDEST-first (ascending) by `date`.
      Add helper `fmtPayments(list, fallback)`:
        - if `!list || !list.length` return `fallback` (the existing numeric received value — preserves
          current behavior for orders with no payment rows);
        - else return `list.map(p => \`${fmtDate(p.date)}  ${Number(p.amount||0)}/-\`).join('\n')` —
          i.e. one payment PER LINE, DATE FIRST then amount, newline-separated. Format is
          `"<DD.MM.YY>  <amount>/-"` (two spaces between date and amount is fine; a plain integer amount
          with NO thousands separator followed by `/-`). Example cell (three lines):
          `25.05.26  5000/-\n13.06.26  50000/-\n25.08.26  35000/-`.
      Add helper `fmtDate(s)` producing DD.MM.YY (zero-padded day & month, dot-separated, 2-digit year)
      from the TEXT `p.date` (usually YYYY-MM-DD): parse with `new Date(s)` (or split YYYY-MM-DD) and
      build `\`${dd}.${mm}.${yy}\``. (Note: this is DD.MM.YY with dots — intentionally different from the
      DD-MM-YYYY used elsewhere in the report.)
      - Active Orders sheet: change `'Received': o.received_amount || 0` to
        `'Received': fmtPayments(byOrderId[o.id], o.received_amount || 0)` (active payment.order_id = o.id).
      - Completed Orders sheet (it HAS a Received column): change
        `'Received': d.data?.received_amount || d.data?.receivedAmount || 0` to
        `'Received': fmtPayments(byOrderId[d.original_id], d.data?.received_amount || d.data?.receivedAmount || 0)`
        (completed payments keyed by original_id per Task 1; pre-fix completed orders have no payment rows
        and correctly fall back to the stored number).
      WRAP TEXT so the multiple lines show (xlsx-js-style supports cell styles): after each order sheet is
      built with `json_to_sheet`, apply `alignment: { wrapText: true, vertical: 'top' }` to the "Received"
      column data cells. Determine the Received column letter from the header row, then for each data row
      set `ws[cellRef].s = { ...(ws[cellRef].s||{}), alignment: { wrapText: true, vertical: 'top' } }`
      (guard that `ws[cellRef]` exists). Do this for the Active Orders sheet and, if present, the
      Completed Orders sheet. Row height can be left to Excel/auto. Keep the existing `autoWidth` call.
      Keep ALL other columns and all 4 existing sheets exactly as they are — only the "Received" cell
      VALUE (and its wrapText style) changes. Do NOT add a payments-count line to the summary HTML.
      Recipients, auth, and schedule unchanged.
      Files: `d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard\api\cron-daily-report.js`
      Verify: `node --check api/cron-daily-report.js` passes; `npm run build` still succeeds.

- [ ] 9. Full verification pass.
      Files: (none — verification only)
      Verify: from `d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard` run `npm run build` (Vite build succeeds),
      `node --check api/index.js`, `node --check api/cron-daily-report.js`,
      `node --check server/routes/orders.js`, `node --check server/setupSupabase.js` — all exit 0.

---

## Lossless Active → Completed → Active round-trip walkthrough

Precondition: `api/payments-fk-migration.sql` has been run (FK dropped).

1. **Active order** id=42, total=100000, has 3 payment rows in `payments` (order_id=42) summing 70000;
   orders.received_amount=70000, balance=30000, percent=70.
2. **Move to Completed** (`DELETE /api/orders/42`): archive inserts `deleted_orders{original_id:42,
   data:mapOrder(order)}` (snapshot carries received=70000/balance=30000/percent=70). Payments are NOT
   deleted. Normal branch: delId=42=realId, so no re-point. The `orders` row 42 is deleted (allowed now
   that the FK is gone). Payment rows stay with order_id=42.
3. **View in Completed tab**: `/api/orders/deleted/all` returns the order as id=42. The new green Receipt
   button opens PaymentForm, which GETs `/api/orders/42/payments` → the same 3 rows. History intact.
4. **Edit a receipt in Completed** (PUT `/api/orders/42/payments/:pid`, 70000→80000): payments row
   updated; handler finds NO orders row id=42 → finds `deleted_orders` original_id=42 → recomputes
   received=80000 from payments, total=100000 from snapshot, writes data.received_amount=80000,
   balance=20000, percent=80 back into the snapshot. Completed list refreshes (fetchDeletedOrders) and
   shows 80000.
5. **Restore to Active** (`POST /api/orders/deleted/42/restore`): snapshot inserted as a NEW order (id=57,
   say) with received/balance/percent from the snapshot. Payments re-pointed:
   `UPDATE payments SET order_id=57 WHERE order_id=42`. Totals recomputed on order 57 from its payments
   (received=80000, balance=20000, percent=80). `deleted_orders` row 42 removed.
6. **Result**: order is Active again (id=57) with all 3 payment rows (now order_id=57) and correct totals.
   No payment data was lost or orphaned at any step. Opening the receipt view on the Active order shows
   the full history. (Permanent delete instead of restore would also delete the 3 payment rows for
   order_id=42, leaving no orphans.)

## Things left alone
Egress, Follow Up column, filters, daily-report edit buttons, rights work, row-color, auto-refresh, and
login-location accuracy are untouched. The `can_edit_receipt` / `can_edit_completed` gates are preserved
(restore + permanent delete remain admin-only).
