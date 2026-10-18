# Implementation Plan — Orders Dashboard filter changes

Single file to edit: `d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard\src\pages\Dashboard.jsx` (~3200 lines).
Build/verify from `d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard`:
- `npm run build` (runs `vite build`) must succeed with no new errors.
- `node --check src/pages/Dashboard.jsx` to catch syntax errors quickly between edits.
- No test framework exists; filter logic is verified by reasoning + the worked example in item 7.
- No dev server. Commit locally on `main`; do NOT push.

Locate every edit by the code LANDMARK quoted below, not by absolute line (lines shift as edits land).

---

## Findings that drive the plan (read before implementing)

- **Active tab** uses state `columnFilters`; dropdown open-state setter `setOpenFilterWithRef(null)` (defined ~line 103: `const setOpenFilterWithRef = (val) => { openFilterRef.current = val; setOpenFilter(val) }`). Active value-filtering runs in the main filtering `useEffect`, block `Object.entries(columnFilters).forEach(([key, selectedValues]) => {...})` (landmark: `const raw = String(o[key] || '').trim()` with the `(Non Blank)`/`(Blank)` special handling). Helpers: `getUniqueValues(key)`, `toggleFilterValue(colKey, value)`, `clearFilter(colKey)`.
- **Completed/Deleted tab** uses state `deletedColumnFilters`; open-state setter is `setDeletedOpenFilter(null)` (confirmed; state declared `const [deletedOpenFilter, setDeletedOpenFilter] = useState(null)`). It has TWO dropdown kinds inside the column `.map`: the value-checkbox dropdown (`deletedOpenFilter === col.key && col.key !== 'deletedOn'`) which manages state inline via `setDeletedColumnFilters(prev => ...)`, and the special Deleted-On date-range dropdown (`deletedOpenFilter === col.key && col.key === 'deletedOn'`) using `deletedDateFrom` / `deletedDateTo`. Completed value-filtering appears in TWO places with identical logic: the inline render IIFE (landmark `let filtered = deletedOrders`) and the export builder `handleDeletedExport` (landmark `let exportFiltered = deletedOrders`).
- **Proof fields (With Image).** Deployed backend is `api/index.js` (Vercel). Its `mapOrder` returns BOTH `paymentProofUrl: o.payment_proof_url` and `auditProofUrl: o.audit_proof_url`. Frontend cell renderers confirm the names: `paymentRemarks` cell reads `order.paymentProofUrl`; `remarks` cell reads `order.auditProofUrl` (both render a "View Supporting" link when truthy). So on ACTIVE orders, read `o.paymentProofUrl` / `o.auditProofUrl` directly.
- **Proof fields on COMPLETED/DELETED orders.** `GET /api/orders/deleted/all` maps rows as `{ ...d.data, id, deletedBy, deletedAt }`, and `d.data` is a `mapOrder(...)` snapshot captured at delete time. Therefore `o.paymentProofUrl` / `o.auditProofUrl` are present at the TOP level on deleted orders too — read them the same way as active. Documented limitation: an order deleted BEFORE its proof image was uploaded won't have the field in its snapshot, so `(With Image)` can't match it; this is correct/expected and needs no special handling (the truthy check already excludes it). No nested-path reading is required.
- **Date bug.** Both Deleted-On comparison sites use `new Date(o.deletedAt) >= new Date(deletedDateFrom)` and `new Date(o.deletedAt) <= new Date(deletedDateTo + 'T23:59:59')`. `new Date('2026-10-03')` is parsed as UTC midnight while `o.deletedAt` and the `'...T23:59:59'` form are LOCAL — the offset shifts boundaries and leaks adjacent days. Fix = compare DATE-ONLY integer keys built from LOCAL parts (order) and from direct string split (inputs).

---

## Plan items

- [ ] 1. Add a shared date-key helper `deletedDateKey(dateLike)` inside the Dashboard component, near the other small helpers (place it right after `clearFilter` / before `displayedColumns`, so it is in scope for both the render IIFE and `handleDeletedExport`).
      It returns an integer `y*10000 + m*100 + d` or `null`. Two input shapes:
      - A full timestamp (ISO string / Date, i.e. `o.deletedAt`): parse with `new Date(dateLike)`, guard `isNaN(d.getTime())` → return null, then use LOCAL parts: `d.getFullYear()*10000 + (d.getMonth()+1)*100 + d.getDate()`.
      - A `YYYY-MM-DD` input string (`deletedDateFrom` / `deletedDateTo`): detect with a `/^\d{4}-\d{2}-\d{2}/` test, split on `-`, `parseInt` the three parts, and build `y*10000 + m*100 + day` WITHOUT `new Date()` (this is what avoids the UTC-midnight shift). Empty/falsy string → return null.
      Implementation note: a single helper handling both is cleanest — check `typeof dateLike === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateLike)` first (treat as date-input string), else fall through to the `new Date()` local-parts branch.
      Files: `src/pages/Dashboard.jsx`.
      Verify: `node --check src/pages/Dashboard.jsx` passes.

- [ ] 2. TASK 3 — Fix the inline completed-render Deleted-On comparison.
      Landmark (inside the `let filtered = deletedOrders` IIFE, just before `return filtered.map(...)`):
      `if (deletedDateFrom) filtered = filtered.filter(o => o.deletedAt && new Date(o.deletedAt) >= new Date(deletedDateFrom))`
      `if (deletedDateTo) filtered = filtered.filter(o => o.deletedAt && new Date(o.deletedAt) <= new Date(deletedDateTo + 'T23:59:59'))`
      Replace with a single key-based filter:
      ```
      const fromKey = deletedDateKey(deletedDateFrom)
      const toKey = deletedDateKey(deletedDateTo)
      if (fromKey != null || toKey != null) {
        filtered = filtered.filter(o => {
          if (!o.deletedAt) return false
          const dayKey = deletedDateKey(o.deletedAt)
          if (dayKey == null) return false
          if (fromKey != null && dayKey < fromKey) return false
          if (toKey != null && dayKey > toKey) return false
          return true
        })
      }
      ```
      Files: `src/pages/Dashboard.jsx`.
      Verify: `node --check` passes; trace the item-7 example against this block.

- [ ] 3. TASK 3 — Apply the identical fix in `handleDeletedExport`.
      Landmark (inside `handleDeletedExport`, after its `Object.entries(deletedColumnFilters)...` block):
      `if (deletedDateFrom) exportFiltered = exportFiltered.filter(o => o.deletedAt && new Date(o.deletedAt) >= new Date(deletedDateFrom))`
      `if (deletedDateTo) exportFiltered = exportFiltered.filter(o => o.deletedAt && new Date(o.deletedAt) <= new Date(deletedDateTo + 'T23:59:59'))`
      Replace with the same `fromKey`/`toKey` + `dayKey` logic as item 2, operating on `exportFiltered`. Do not change the unrelated `Deleted On` display formatting a few lines below (the `${String(d.getDate())...}` cell string) — leave it as is.
      After this, re-grep the whole file for `deletedDateFrom` and `deletedDateTo` to confirm the only remaining uses are: state declarations, the summary-chip render (`Active Filters` section), the `isActive` flag, the Clear buttons, and the two `<input type="date">` bindings — i.e. NO `new Date(deletedDate...)` comparison remains anywhere.
      Files: `src/pages/Dashboard.jsx`.
      Verify: `node --check` passes; grep confirms no `new Date(deletedDate` comparisons remain.

- [ ] 4. TASK 2 — Wire `(With Image)` into the ACTIVE value-filter evaluation.
      Landmark (main filtering `useEffect`): the `Object.entries(columnFilters).forEach(([key, selectedValues]) => {...})` block whose inner filter has:
      ```
      const raw = String(o[key] || '').trim()
      const val = raw || '(Empty)'
      if (selectedValues.includes('(Non Blank)') && raw) return true
      if (selectedValues.includes('(Blank)') && !raw) return true
      return selectedValues.includes(val)
      ```
      Add an OR branch BEFORE the final `return`, preserving existing OR semantics (any matching selected value passes the row):
      ```
      if (selectedValues.includes('(With Image)')) {
        if (key === 'paymentRemarks' && o.paymentProofUrl) return true
        if (key === 'remarks' && o.auditProofUrl) return true
      }
      ```
      (Place it after the `(Blank)` check and before `return selectedValues.includes(val)`. Because `(With Image)` is never a real column value, it won't accidentally match via `includes(val)`.)
      Files: `src/pages/Dashboard.jsx`.
      Verify: `node --check` passes.

- [ ] 5. TASK 2 — Wire `(With Image)` into BOTH completed value-filter evaluations.
      There are two identical `Object.entries(deletedColumnFilters).forEach(([key, selectedValues]) => {...})` blocks — one in the inline render IIFE (`let filtered = deletedOrders`) and one in `handleDeletedExport` (`let exportFiltered = exportFiltered`). Each inner filter is:
      ```
      const raw = String(o[key] || '').trim()
      if (selectedValues.includes('(Non Blank)') && raw) return true
      if (selectedValues.includes('(Blank)') && !raw) return true
      return selectedValues.includes(raw)
      ```
      In BOTH, add before the final `return`:
      ```
      if (selectedValues.includes('(With Image)')) {
        if (key === 'paymentRemarks' && o.paymentProofUrl) return true
        if (key === 'remarks' && o.auditProofUrl) return true
      }
      ```
      Reads `o.paymentProofUrl` / `o.auditProofUrl` directly (available on deleted orders per findings). Make the two edits identical.
      Files: `src/pages/Dashboard.jsx`.
      Verify: `node --check` passes.

- [ ] 6. TASK 2 — Render the `(With Image)` checkbox option in the paymentRemarks/remarks dropdowns, in BOTH tabs.
      Gate every insertion with `col.key === 'paymentRemarks' || col.key === 'remarks'`, placed at the TOP of the option list (above the existing `(Non Blank)` label).
      - ACTIVE dropdown (landmark `<div style={styles.filterOptions}>` immediately followed by the `(Non Blank)` `<label>` that uses `columnFilters` + `toggleFilterValue`): prepend
        ```
        {(col.key === 'paymentRemarks' || col.key === 'remarks') && (
          <label key="(With Image)" style={{ ...styles.filterOption, fontWeight: 600 }} onMouseDown={e => e.preventDefault()}>
            <input type="checkbox" checked={(columnFilters[col.key] || []).includes('(With Image)')} onChange={() => toggleFilterValue(col.key, '(With Image)')} />
            <span style={{ fontSize: '11px' }}>(With Image)</span>
          </label>
        )}
        ```
      - COMPLETED value-dropdown (landmark: the `deletedOpenFilter === col.key && col.key !== 'deletedOn'` block's `<div style={styles.filterOptions}>` whose `(Non Blank)` label manages state via the inline `setDeletedColumnFilters(prev => ...)` pattern): prepend the same label but mirror the inline toggle used by its siblings (NOT `toggleFilterValue`, which targets `columnFilters`):
        ```
        {(col.key === 'paymentRemarks' || col.key === 'remarks') && (
          <label key="(With Image)" style={{ ...styles.filterOption, fontWeight: 600 }} onMouseDown={e => e.preventDefault()}>
            <input type="checkbox" checked={(deletedColumnFilters[col.key] || []).includes('(With Image)')} onChange={() => {
              setDeletedColumnFilters(prev => {
                const current = prev[col.key] || []
                const updated = current.includes('(With Image)') ? current.filter(v => v !== '(With Image)') : [...current, '(With Image)']
                if (updated.length === 0) { const { [col.key]: _, ...rest } = prev; return rest }
                return { ...prev, [col.key]: updated }
              })
            }} />
            <span style={{ fontSize: '11px' }}>(With Image)</span>
          </label>
        )}
        ```
      The `deletedOn` date dropdown is untouched (it's not paymentRemarks/remarks). `getUniqueValues` / `uniqueVals` continue to list real values unchanged.
      Files: `src/pages/Dashboard.jsx`.
      Verify: `npm run build` succeeds; `(With Image)` option appears only for paymentRemarks and remarks columns in both tabs (reason through the gate).

- [ ] 7. TASK 2 — Worked-example / logic check for `(With Image)` and TASK 3 date fix (no code; verification reasoning to confirm items 2-6 before build).
      With Image: selecting `(With Image)` on `paymentRemarks` keeps only rows where `o.paymentProofUrl` is truthy; on `remarks` only rows where `o.auditProofUrl` is truthy; combined with another selected real value it OR-passes either condition (matches existing `(Non Blank)`/`(Blank)` OR semantics). On the completed tab the same holds using the snapshot fields.
      Date fix: From = To = `2026-10-03` → `fromKey = toKey = 20261003`.
      - Order deleted `2026-09-03T...` → `dayKey = 20260903`; `20260903 < 20261003` → EXCLUDED. ✓ (fixes the reported bug)
      - Order deleted `2026-10-03T18:30:00+05:30` (any time of day) → LOCAL parts give `dayKey = 20261003`; not `< from`, not `> to` → INCLUDED. ✓
      - Order deleted `2026-10-04T...` → `20261004 > 20261003` → EXCLUDED. ✓
      Verify: confirm the above traces hold against the code written in items 1-5.

- [ ] 8. TASK 1 — Add a TOP-LEFT `Done` button to the ACTIVE filter dropdown header.
      Landmark (`styles.filterDropdownHeader` div in the active table):
      ```
      <div style={styles.filterDropdownHeader}>
        <span style={{ fontSize: '11px', fontWeight: '600' }}>Filter: {col.label}</span>
        <button onClick={() => clearFilter(col.key)} style={{ fontSize: '10px', background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer' }}>Clear</button>
      </div>
      ```
      Insert a Done button as the FIRST child (left of the label), closing via the active setter `setOpenFilterWithRef(null)`. Keep Clear on the right unchanged. Use the shared compact style from item 11:
      ```
      <button onClick={() => setOpenFilterWithRef(null)} style={styles.filterDoneTopBtn}>Done</button>
      ```
      Leave the existing bottom `<button ... style={styles.filterDoneBtn}>Done</button>` in place (harmless). Do not disturb `onClick={e => e.stopPropagation()}` on the dropdown or the `openFilterRef` click-outside behavior.
      Files: `src/pages/Dashboard.jsx`.
      Verify: `npm run build` succeeds.

- [ ] 9. TASK 1 — Add the TOP-LEFT `Done` button to the COMPLETED value-dropdown header.
      Landmark (`deletedOpenFilter === col.key && col.key !== 'deletedOn'` block header):
      ```
      <div style={styles.filterDropdownHeader}>
        <span style={{ fontSize: '11px', fontWeight: '600' }}>Filter: {col.label}</span>
        <button onClick={() => { setDeletedColumnFilters(prev => { const { [col.key]: _, ...rest } = prev; return rest }); setDeletedOpenFilter(null) }} ...>Clear</button>
      </div>
      ```
      Insert as FIRST child, closing via `setDeletedOpenFilter(null)`:
      `<button onClick={() => setDeletedOpenFilter(null)} style={styles.filterDoneTopBtn}>Done</button>`
      Keep the existing Clear and the bottom Done. 
      Files: `src/pages/Dashboard.jsx`.
      Verify: `npm run build` succeeds.

- [ ] 10. TASK 1 — Add the TOP-LEFT `Done` button to the COMPLETED Deleted-On date dropdown header.
      Landmark (`deletedOpenFilter === col.key && col.key === 'deletedOn'` block header):
      ```
      <div style={styles.filterDropdownHeader}>
        <span style={{ fontSize: '11px', fontWeight: '600' }}>Filter: Deleted On</span>
        <button onClick={() => { setDeletedDateFrom(''); setDeletedDateTo(''); setDeletedOpenFilter(null) }} ...>Clear</button>
      </div>
      ```
      Insert as FIRST child, closing via `setDeletedOpenFilter(null)`:
      `<button onClick={() => setDeletedOpenFilter(null)} style={styles.filterDoneTopBtn}>Done</button>`
      (The dropdown's bottom button here is labeled `Apply` and also calls `setDeletedOpenFilter(null)` — leave it.)
      Files: `src/pages/Dashboard.jsx`.
      Verify: `npm run build` succeeds.

- [ ] 11. TASK 1 — Add the `filterDoneTopBtn` style used by items 8-10.
      Landmark: the `styles` object near the bottom, next to `filterDoneBtn` and `filterDropdownHeader`. Add a compact primary (green/dark) variant, e.g.:
      ```
      filterDoneTopBtn: { padding: '2px 10px', background: '#27ae60', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '10px', fontWeight: 600, cursor: 'pointer', flexShrink: 0 },
      ```
      This keeps the header balanced: compact green Done on the left, the `Filter: {label}` span in the middle, the red Clear link on the right. (Could be done inline instead, but a shared style keeps the three dropdowns consistent — chosen for consistency and single-point tweaking.)
      Note: do this item BEFORE or together with items 8-10 so the style exists when referenced; either order is fine since all land before the build in item 12.
      Files: `src/pages/Dashboard.jsx`.
      Verify: `npm run build` succeeds.

- [ ] 12. Final full verification.
      Run `npm run build` from `d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard` and confirm `vite build` completes with no errors. Re-grep the file to confirm: (a) no `new Date(deletedDate` comparison remains; (b) `(With Image)` appears only under paymentRemarks/remarks gates; (c) three `filterDoneTopBtn` usages exist (one per dropdown header). Then commit locally on `main` with a clear message (e.g. "Dashboard filters: top Done button, (With Image) option, fix Deleted On date range"). Do NOT push.
      Files: `src/pages/Dashboard.jsx`.
      Verify: build passes; `git status` shows only Dashboard.jsx changed; commit created; no push.

---

## Constraints reaffirmed
- Only `src/pages/Dashboard.jsx` is edited. No backend / AuthContext / egress / Follow-Up changes.
- Existing behavior preserved: search, color filter, `(Blank)`/`(Non Blank)`, Clear, Clear All, summary chips, bottom Done/Apply, and `openFilterRef` click-outside-to-close.
- Done-in-header applies to Active AND Completed (all three dropdown kinds). `(With Image)` applies to paymentRemarks/remarks in both tabs. Deleted-On date fix is Completed-tab only (render + export).
