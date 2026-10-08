# Implementation Plan — Follow Up Direct/Sir column + Auto hard-refresh on deploy

Project root: `d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard`. No worktree — edit in place.
Build/verify command (run from the project root): `npm run build` (vite build). Do NOT start the dev server.

Field naming (fixed decision): client camelCase `followUpType`, Supabase snake_case `follow_up_type`, column label `Follow Up Direct/Sir`, Excel/import header text `Follow Up Direct/Sir`. The cell is an HTML `<select>` with a blank default plus `Direct` and `Sir`. All line numbers below are STARTING POINTS confirmed during exploration; re-locate exact lines before editing because Dashboard.jsx (~3000 lines) shifts as edits are applied — work top-to-bottom so later anchors are easy to re-find.

Key architectural findings that shape this plan:
- The main Orders table body renders every cell via `getCellValue(order, col.key)` (Dashboard.jsx ~1485+) driven by the column config arrays. The main-table export (`handleExport` ~479), the print report (~565), and the completed/deleted export (`handleDeletedExport` ~660) all iterate `cols` from the column config and use `col.label` as the header. Therefore, inserting the column into the config arrays + adding a `getCellValue` branch + a value-handling branch makes the column flow automatically into those three places. Only the HARD-CODED tables need manual parallel edits: `handleDeletedCompleteDownload`'s `ALL_DELETED_COLS` (~700), the daily `percentReceived` blocks (Excel row builder ~1182, Excel col-width ~1228, print HTML `<th>`/`<td>` ~1413/1431, on-screen daily table `<th>`/`<td>` ~2677/2714), and the two import row-mappers (~814, ~895).
- The Payment Update Report table (on-screen ~2487 and print ~1311) lists PAYMENTS, where "Payment Remarks" is the payment's own `p.remarks` — payments have no order-level `followUpType`. This table is intentionally OUT OF SCOPE for the new column (noted so the implementer does not try to add a non-existent field there).
- `PUT /api/orders/:id` passes the body through `snakeOrder()` in server/routes/orders.js and `snakeOrder()` in api/index.js, so adding the reverse mapping there is what makes the inline `<select>` save persist. Inline save pattern to copy = the `akhilPoints` branch in `getCellValue` (axios.put then `fetchOrders()`), Dashboard.jsx ~1490.
- `portable-app/` contains stale copies of the server and is NOT part of the Vite build or the deployed backends — leave it untouched (out of scope).

---

## TASK 1 + TASK 3 — the `followUpType` column everywhere

- [ ] 1. Insert the column into the two Dashboard.jsx column-config arrays and the UserManagement ALL_COLUMNS array, immediately BEFORE the `paymentRemarks` entry.
      Files: `src/pages/Dashboard.jsx` (active-orders column array, add `{ key: 'followUpType', label: 'Follow Up Direct/Sir' },` directly above `{ key: 'paymentRemarks', label: 'Payment Remarks' }` at ~line 46; AND the completed/deleted column array, add the same above the `paymentRemarks` entry at ~line 689), `src/pages/UserManagement.jsx` (the single-line `ALL_COLUMNS` at line 7 — insert `{ key: 'followUpType', label: 'Follow Up Direct/Sir' },` before `{ key: 'paymentRemarks', label: 'Payment Remarks' }`).
      Verify: `npm run build` compiles with no errors.

- [ ] 1b. Make `followUpType` visible (and therefore exported) by default in BOTH the Active and Completed tabs.
      Added per explicit user requirement. In `src/pages/Dashboard.jsx` `DEFAULT_VISIBLE` (line 56), add `'followUpType'` (place it right before `'percentReceived'`/payment-area keys so ordering stays sensible). NOTE both `visibleColumns` (~line 78) and `completedVisibleColumns` (~line 84) initialize from `DEFAULT_VISIBLE` when the user has no saved selection, so this single edit covers Active AND Completed defaults. BEHAVIOR NOTE for review: existing users with a saved `oms_columns_<username>` / `oms_completed_columns_<username>` in localStorage will NOT see the new column until they enable it in the column picker — this is the app's existing per-user persistence behavior, not a bug. (Payment Remarks itself is also not in DEFAULT_VISIBLE; adding followUpType to defaults is an intentional deviation requested by the user.)
      Files: `src/pages/Dashboard.jsx`.
      Verify: `npm run build` compiles.

- [ ] 2. Add the `followUpType` render branch in `getCellValue` so the main table (and the config-driven exports/print) show an editable `<select>`.
      In `src/pages/Dashboard.jsx` `getCellValue` (~line 1485), add a branch BEFORE the `paymentRemarks` branch (~1508):
      ```jsx
      if (key === 'followUpType') {
        if (!canEditColumn('followUpType')) return val || ''   // existing per-column gate; admins true, else userPerms[key]==='edit'
        const save = async (e) => {
          const newVal = e.target.value
          if (newVal === (val || '')) return
          try { await axios.put(`/api/orders/${order.id}`, { followUpType: newVal }); fetchOrders() }
          catch { alert('Failed to save Follow Up Direct/Sir') }
        }
        return <select value={val || ''} onClick={e => e.stopPropagation()} onChange={save}
          style={{ width: '100%', border: '1px solid #ddd', borderRadius: '3px', padding: '3px 5px', fontSize: '11px', boxSizing: 'border-box' }}>
          <option value="">—</option>
          <option value="Direct">Direct</option>
          <option value="Sir">Sir</option>
        </select>
      }
      ```
      (Mirror the `akhilPoints` inline-save pattern at ~1490. Gating uses the EXISTING per-column permission helper `canEditColumn(key)` defined at ~line 220, which returns true for admins and `userPerms[key]==='edit'` otherwise — NO new user-right. `userPerms = user.columnPermissions || {}` ~line 194.)
      Files: `src/pages/Dashboard.jsx`.
      Verify: `npm run build` compiles. (Manual UI confirmation deferred to review; no dev server.)

- [ ] 3. Confirm the config-driven exports pick up `followUpType` for BOTH Active and Completed, mapping key→label correctly.
      In `src/pages/Dashboard.jsx`, the three config-driven builders use chains ending in `else val = val || ''`, which already handles a plain string field. Explicitly verify each maps `col.key`→`col.label` and outputs `o.followUpType`:
      - Active export `handleExport` (~481): builds `exportData` from `allowedColumns.filter(visibleColumns)` via `cols.forEach`, writing `row[col.label] = val`. Because step 1 adds the config entry and step 1b adds it to DEFAULT_VISIBLE, `followUpType` flows through with header `Follow Up Direct/Sir`. Confirm the `else val = val || ''` branch (~487) catches it.
      - Active print report (~565/594): same `cols.forEach`; confirm fall-through at ~594.
      - Completed/Deleted export `handleDeletedExport` (~660): uses `exportCols = completedDisplayedColumns`, which derives from the SHARED column config (`allowedColumns.filter(c => completedVisibleColumns.includes(c.key))`, defined ~line 1595). So the Completed download inherits `followUpType` from step 1 + step 1b — confirm the `else val = val || ''` branch (~645) catches it. No separate list to edit here.
      Add an explicit `else if (col.key === 'followUpType') val = val || ''` ONLY if a different default is observed.
      Files: `src/pages/Dashboard.jsx` (verification/no-op unless a special case is found).
      Verify: `npm run build` compiles.

- [ ] 4. Add `followUpType` to the hard-coded `ALL_DELETED_COLS` array in `handleDeletedCompleteDownload`.
      In `src/pages/Dashboard.jsx` (~line 700), insert `{ key: 'followUpType', label: 'Follow Up Direct/Sir' },` immediately before `{ key: 'paymentRemarks', label: 'Payment Remarks' },`. The generic row builder below it (`row[col.label] = o[col.key] || ''`, ~708) already handles string columns, so no extra per-column code is needed.
      Files: `src/pages/Dashboard.jsx`.
      Verify: `npm run build` compiles.

- [ ] 5. Add `followUpType` to the daily `percentReceived` Excel row builder and column-width map.
      In `src/pages/Dashboard.jsx`: in the `dailyFilter === 'percentReceived'` row object (~1182) add `row['Follow Up Direct/Sir'] = o.followUpType || ''` BEFORE the `row['Payment Remarks'] = ...` assignment; in the `ws['!cols']` width map (~1228) add `if (key === 'Follow Up Direct/Sir') return { wch: 18 }` next to the `Payment Remarks` width rule.
      Files: `src/pages/Dashboard.jsx`.
      Verify: `npm run build` compiles.

- [ ] 6. Add `followUpType` to the two print-HTML daily `percentReceived` blocks (header + data), before Payment Remarks.
      In `src/pages/Dashboard.jsx`: header block (~1413) — insert `<th style="min-width:120px">Follow Up Direct/Sir</th>` immediately before `<th style="min-width:160px">Payment Remarks</th>`; data block (~1431) — insert `<td>${o.followUpType || ''}</td>` immediately before `<td>${o.paymentRemarks || ''}</td>`. Keep `<th>` and `<td>` counts matched.
      Files: `src/pages/Dashboard.jsx`.
      Verify: `npm run build` compiles.

- [ ] 7. Add `followUpType` to the on-screen daily `percentReceived` table (header + data), before Payment Remarks.
      In `src/pages/Dashboard.jsx`: header (~2677) — add `{dailyFilter === 'percentReceived' && <th style={styles.th}>Follow Up Direct/Sir</th>}` immediately before the `<th style={styles.th}>Payment Remarks</th>` line; data (~2714) — add `{dailyFilter === 'percentReceived' && <td style={styles.td}>{o.followUpType}</td>}` immediately before the `<td style={styles.td}>{o.paymentRemarks}</td>` line. Keep header/data cell counts matched.
      Files: `src/pages/Dashboard.jsx`.
      Verify: `npm run build` compiles.

- [ ] 8. Add `followUpType` to BOTH import row-mappers so imports round-trip for Active AND Completed/Deleted.
      In `src/pages/Dashboard.jsx`: the Completed/Deleted-orders import mapper (the object posted to `/api/orders/deleted/import`, ~814/815) — add `followUpType: row['Follow Up Direct/Sir'] || '',` next to `paymentRemarks: ...`; the main Active `handleImport` mapper (~895) — add `followUpType: row['Follow Up Direct/Sir'] || '',` next to `paymentRemarks: row['Payment Remarks'] ...`. These are the only two XLSX row-mapping objects in the file (confirmed by searching `paymentRemarks:` row-mappings); together they cover active + completed import. The exported header text produced in step 1/3/4 (`Follow Up Direct/Sir`) matches the import key, so a round-trip (export → re-import) preserves the value for both views.
      Files: `src/pages/Dashboard.jsx`.
      Verify: `npm run build` compiles.

- [ ] 9. (Consistency, recommended) Add `followUpType` to the OrderForm modal FIELDS so admins can also set it from the Edit dialog, matching the inline select.
      In `src/components/OrderForm.jsx` FIELDS array (~line 30), insert `{ key: 'followUpType', label: 'Follow Up Direct/Sir', type: 'select', options: ['', 'Direct', 'Sir'] }` immediately before the `paymentRemarks` entry. Then confirm how FIELDS entries render inputs in OrderForm's body (read the render loop first); if the form does not already support a `type: 'select'`/`options` branch, add a minimal `<select>` branch there rather than a text input, OR fall back to a plain text field if adding a select branch is risky — but keep the field key `followUpType` so saves map correctly. If this introduces any user-visible behavior change beyond adding the field, STOP and surface it.
      Files: `src/components/OrderForm.jsx`.
      Verify: `npm run build` compiles.

- [ ] 10. Backend sync — server/routes/orders.js mappings.
      In `src/../server/routes/orders.js`: `mapOrder` (~602, the single big `return {...}`) add `followUpType: o.follow_up_type,` (e.g. next to `paymentRemarks: o.payment_remarks`); in `snakeOrder` (~638) add `if (o.followUpType !== undefined) s.follow_up_type = o.followUpType` next to the `paymentRemarks` line; in the deleted-orders snapshot `orderData` object (~115) add `followUpType: o.followUpType || '',` next to `paymentRemarks: o.paymentRemarks || ''`.
      Files: `server/routes/orders.js`.
      Verify: `npm run build` still compiles (frontend build is unaffected by server files, but run it to confirm nothing else broke). Node syntax check: `node --check server/routes/orders.js` must pass.

- [ ] 11. Backend sync — api/index.js (Vercel, condensed one-liners) mappings.
      In `api/index.js`: `mapOrder` (~92) add `followUpType: o.follow_up_type,` into the returned object (near `paymentRemarks: o.payment_remarks`); `snakeOrder` (~96) add `if (o.followUpType !== undefined) s.follow_up_type = o.followUpType;` near the `paymentRemarks` mapping. If a deleted-orders snapshot object exists in api/index.js that captures remark-like fields (search `paymentRemarks:o.paymentRemarks` around ~182), add `followUpType:o.followUpType||''` there too.
      Files: `api/index.js`.
      Verify: `node --check api/index.js` must pass; `npm run build` compiles.

- [ ] 12. DB schema + migration file (ONE migration only — orders data column).
      In `server/setupSupabase.js` CREATE TABLE orders block, add `  follow_up_type TEXT,` next to `payment_remarks TEXT,` (~line 95). Create a NEW idempotent file `api/follow-up-type-migration.sql` (mirror `api/location-migration.sql` style) containing:
      ```sql
      -- Migration: add follow_up_type column to orders (and deleted_orders if used). Run once in Supabase SQL Editor.
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS follow_up_type TEXT;
      ```
      The `deleted_orders` table stores the order as a JSON `data` column (not individual columns — confirmed in setupSupabase.js ~111-118), so NO ALTER is needed for `deleted_orders`; the JSON snapshot change in step 10 covers it. Do NOT run the migration.
      Files: `server/setupSupabase.js`, `api/follow-up-type-migration.sql` (new).
      Verify: `node --check server/setupSupabase.js` passes; the new .sql file exists.

- [ ] 13. Backend sync — server/migrateData.js insert payload.
      In `server/migrateData.js` (~55, where `payment_remarks: o.paymentRemarks,` is set) add `follow_up_type: o.followUpType,` to the upsert `row` object.
      Files: `server/migrateData.js`.
      Verify: `node --check server/migrateData.js` passes.

---

## TASK 1c — Permission via the EXISTING per-column grid (NO new boolean right)

CORRECTION applied: do NOT add any `canFollowUp` / `can_follow_up` boolean right. The Follow Up permission is controlled by the EXISTING per-column permission grid (None / View / Edit per column key) in the Edit User / Group modal — exactly like every other column. No DB boolean, no second migration file, no login-response field, no users/groups wiring, no top-row checkbox, no derived `canFollowUp` in Dashboard. The ONLY work here is confirming the existing machinery picks up the new key, which it does automatically once `followUpType` is in the shared `ALL_COLUMNS`.

- [ ] A. Confirm the column flows through the existing per-column permission grid and both "Select Columns" pickers — no code change expected.
      The per-column grid in the Edit User / Edit Group modal and both column pickers all render from the SAME column list. Because step 1 adds `followUpType` to the frontend `ALL_COLUMNS` (Dashboard.jsx ~44-50 / ~688-693) AND `UserManagement.jsx` `ALL_COLUMNS` (line 7), a "Follow Up Direct/Sir" row with a None/View/Edit dropdown appears automatically in the Edit User grid, and visibility/edit is enforced per user via `columnPermissions`. Confirm in code:
      - `getAllowedColumns()` (Dashboard.jsx ~215) returns `ALL_COLUMNS` for admins, else `ALL_COLUMNS.filter(col => userPerms[col.key] === 'view' || userPerms[col.key] === 'edit')`.
      - `canEditColumn(key)` (~220) returns true for admins, else `userPerms[key] === 'edit'`.
      - `userPerms = user.columnPermissions || {}` (~194).
      - Both pickers map `allowedColumns.map(col => ...)` (Active ~1785, Completed ~1935); the UserManagement per-column grid renders from the same `ALL_COLUMNS` — VERIFY it iterates `ALL_COLUMNS` (read the grid render in UserManagement.jsx) so the new key gets a None/View/Edit control.
      Keep ONE consistent label `Follow Up Direct/Sir` everywhere (orders table/exports and the permission-grid row); do not add a second entry.
      Files: none (verification only; the single ALL_COLUMNS edit in step 1 is what enables this).
      Verify: `npm run build` compiles; review confirms the grid shows a Follow Up row with None/View/Edit and the orders cell is editable only when that column permission is View/Edit (admins always).

NOTE: enforcement in the orders cell is handled in step 2 via the EXISTING `canEditColumn('followUpType')` gate (admins always edit; others edit only when their column permission is 'edit'; otherwise read-only text). No separate right.

---

## TASK 2 — Auto hard-refresh on login when a new deployment is published

Decisions: (a) `hardReload()` is currently defined INSIDE the daily-refresh `useEffect` in AuthContext.jsx; lift it to a module-scope or component-scope helper so both the daily refresh and the new version/build checks can call it. (b) Use existing `GET /api/app-version` (api/index.js ~185) as the server source of truth. The local `server/` backend has NO such route (confirmed: no `app-version`/`app_settings`/`force-refresh` matches under `server/`) — add matching routes so the feature also works on the Render/local backend. (c) Guard every reload: always write the new value to localStorage BEFORE calling `hardReload()`, and only reload when a stored baseline exists and differs.

- [ ] 14. Add the Vite build-time constant.
      In `vite.config.js`, add a `define` block to the existing `defineConfig({...})`: `define: { __APP_BUILD__: JSON.stringify(Date.now().toString()) }`. Keep existing `plugins`, `base`, `server.proxy`.
      Files: `vite.config.js`.
      Verify: `npm run build` compiles with no errors (confirms the define is valid and `__APP_BUILD__` is replaced at build time).

- [ ] 15. Refactor AuthContext to expose a shared `hardReload` and add the login-time version baseline.
      In `src/context/AuthContext.jsx`: move the `hardReload` function (currently inside the daily-refresh `useEffect`, ~line 51) to component scope (define it once inside `AuthProvider`), and update the daily-refresh effect to call that shared helper. In `login()` (~line 85), AFTER a successful login, fetch `GET /api/app-version` and store the returned version into `localStorage['oms_app_version']` as the baseline (so a fresh login never immediately triggers a reload). Also store the running bundle's build constant: `localStorage.setItem('oms_build', __APP_BUILD__)` at login time as the build baseline. Wrap the fetch in try/catch so a failed version call never blocks login.
      Files: `src/context/AuthContext.jsx`.
      Verify: `npm run build` compiles (note: reference `__APP_BUILD__` only after step 14 adds the define, else the build fails on an undefined global).

- [ ] 16. Add the periodic server-version check and the build-constant check, both loop-guarded.
      In `src/context/AuthContext.jsx`, add a `setInterval` (~60s) — either inside the existing daily-refresh `useEffect` or a new effect that depends on `user` so it only runs while logged in. Each tick:
      - Build check (synchronous, runs first): read `localStorage['oms_build']`; if it exists and `!== __APP_BUILD__`, write `__APP_BUILD__` to `oms_build` FIRST, then call the shared `hardReload()` and return.
      - Server-version check: `GET /api/app-version`; read `localStorage['oms_app_version']`; only if the stored baseline EXISTS and the server `version` differs, write the server `version` to `oms_app_version` FIRST, then call `hardReload()`. If no baseline exists yet (edge case), just store it without reloading. Wrap in try/catch.
      Clear the interval on cleanup. Keep the existing daily-13:40 refresh intact.
      Files: `src/context/AuthContext.jsx`.
      Verify: `npm run build` compiles. Review must confirm: version/build written to localStorage strictly BEFORE any `hardReload()`, and reload only fires on an existing-and-different stored value (no infinite loop).

- [ ] 17. Add `GET /api/app-version` and `POST /api/force-refresh` to the local/Render backend so parity exists.
      In `server/routes/orders.js` (or the appropriate server route file — read `server/index.js` first to see where routes mount and pick the file consistent with existing patterns), add a `GET /api/app-version` that reads `app_settings` key `app_version` from Supabase and returns `{ version }` (mirror api/index.js ~185, minus the in-memory cache if the server has none), and a `POST /api/force-refresh` (admin-guarded, mirror api/index.js ~186) that sets `app_version` to `Date.now().toString()`. Confirm the route path is reachable as `/api/app-version` given how the router is mounted. If an `app_settings` table is not guaranteed to exist on the local DB, make the GET fail soft by returning `{ version: '1' }` on error (same as api/index.js).
      Files: `server/routes/orders.js` (or sibling server route file), possibly `server/index.js` if a new router mount is needed.
      Verify: `node --check` on each edited server file passes. (No dev server run.)

---

## FINAL VERIFICATION (must be run by the implementer)

- [ ] 18. Build and grep-confirm presence.
      Run `npm run build` from `d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard` and ensure it compiles with zero errors; fix any build errors before finishing.
      Then confirm `followUpType` / `follow_up_type` / `Follow Up Direct/Sir` appear in: Dashboard.jsx (both column configs, `DEFAULT_VISIBLE`, `getCellValue` select branch, `ALL_DELETED_COLS`, the percentReceived Excel/print/screen blocks, both import mappers), UserManagement.jsx `ALL_COLUMNS`, server/routes/orders.js (`mapOrder` + `snakeOrder` + deleted snapshot), api/index.js (`mapOrder` + `snakeOrder`), server/setupSupabase.js, server/migrateData.js; and that `api/follow-up-type-migration.sql` exists (this is the ONLY migration file — there is NO `can-follow-up-migration.sql` and NO `can_follow_up` DB column). Confirm the orders cell gates its `<select>` with the EXISTING `canEditColumn('followUpType')` and that NO `canFollowUp`/`can_follow_up` boolean right was added anywhere (none in api/index.js, server/routes/*, server/setupSupabase.js, or UserManagement.jsx). Confirm AuthContext.jsx has the login-time baseline (`oms_app_version` + `oms_build`), the ~60s periodic server-version check, and the build-constant check, all writing localStorage before `hardReload()`. (Grep is a presence check only — the build is the real verification.)
      Verify: `npm run build` passes AND all the above strings are present.

## Export/Import symmetry (Active + Completed) — explicit coverage
- Active export (`handleExport`) and Active print (print report) are config-driven and inherit the column via step 1 + step 1b. Active import = `handleImport` mapper (step 8).
- Completed export (`handleDeletedExport`) is config-driven via `completedDisplayedColumns` (shared config) and inherits the column via step 1 + step 1b. The separate full dump `handleDeletedCompleteDownload` has its own `ALL_DELETED_COLS` and is handled explicitly in step 4. Completed/Deleted import = the `/api/orders/deleted/import` mapper (step 8).
- DEFAULT_VISIBLE (step 1b) ensures the column is visible — and thus exported — out of the box in both tabs for users without a saved column selection.

## Notes / assumptions
- `portable-app/server/*` stale copies are intentionally left untouched (not built, not deployed).
- The Payment Update Report tables (payments list) are excluded by design — payments have no order `followUpType`.
- Column insertion is always immediately BEFORE Payment Remarks, keeping header and data cell counts matched in every hard-coded table.
- ONE migration SQL file is created but NOT run: `api/follow-up-type-migration.sql` (adds `orders.follow_up_type`). It must be run manually in the Supabase SQL Editor before the feature works against the live DB — flag this in the final summary. There is NO users/groups schema change and NO second migration.
- The Follow Up edit permission uses the EXISTING per-column permission grid (None/View/Edit) via `canEditColumn('followUpType')`. NO new boolean right (`canFollowUp`/`can_follow_up`) is added — it was explicitly dropped by the user. Admins always edit; other users edit only when their column permission for `followUpType` is 'edit'; otherwise they see read-only text.
- No tests exist in the repo (no test runner in package.json); the mandated verification is the vite build plus `node --check` on edited CommonJS server files.
