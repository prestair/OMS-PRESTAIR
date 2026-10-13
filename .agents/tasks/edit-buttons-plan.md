# Implementation Plan — Add inline "Edit" buttons to six daily-report views

Goal: replicate the EXISTING daily-report Edit button (currently only on `photography` / `siteVideo` / `review`) on six more daily-report views, gated by the SAME existing `canEditDaily` right. Screen-only change. The ONLY file to modify is `src/pages/Dashboard.jsx`. No backend / AuthContext / UserManagement / schema / permission changes. No filter buttons added or moved. Excel/print code untouched.

Project root: `d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard`. Branch: `main`, direct in workspace (no worktree). Build/verify command: `npm run build` (= `vite build`). No test framework exists.

---

## Verified findings (grounded in the code I read)

### A. The `dailyEditFields` → OrderForm contract (VERIFIED)
- `src/pages/Dashboard.jsx`:
  - State: `const [dailyEditFields, setDailyEditFields] = useState(null)` (~line 95).
  - Passed to the form (~line 3233) as: `restrictToFields={dailyEditFields}`.
- `src/components/OrderForm.jsx`:
  - Signature: `function OrderForm({ ..., restrictToFields })`.
  - In `getVisibleFields()`: `if (restrictToFields && restrictToFields.length) { return FIELDS.filter(f => restrictToFields.includes(f.key)) }`.
  - So `dailyEditFields` is simply a list of `FIELDS[].key` strings; the form renders exactly those fields, in `FIELDS` order, and handles ANY count (no upper limit). A key not present in `FIELDS` would render nothing (not error), so keys must match exactly.
- `FIELDS` key existence check — ALL required keys are present in `OrderForm.jsx`'s `FIELDS` array:
  `siteVerification` ✓, `siteVerificationRemarks` ✓, `installationStatus` ✓, `installationRemarks` ✓,
  `lop` ✓, `sectionDrawing` ✓, `sectionDrawingRemarks` ✓, `inProduction` ✓, `akhilSirAudit` ✓,
  `remarks` ✓ (label "Audit Remarks"), `advanceBill` ✓, `advanceBillRemarks` ✓.

**Conclusion:** every field key the task requested is recognized. The `advanceBill` 4-field set works as-is — no need to fall back to the 2-field minimum.

### Final verified per-view field-key set (value for `setDailyEditFields(...)`)
| Filter | Field keys (exact) |
|---|---|
| `photography` (existing, unchanged) | `['photography','photographyRemarks']` |
| `siteVideo` (existing, unchanged) | `['siteVideo','siteVideoRemarks']` |
| `review` (existing, unchanged) | `['review','reviewRemarks']` |
| `siteVerification` | `['siteVerification','siteVerificationRemarks']` |
| `installationStatus` | `['installationStatus','installationRemarks']` |
| `sectionDrawing` | `['sectionDrawing','lop','sectionDrawingRemarks']` |
| `inProduction` | `['inProduction']` |
| `akhilSirAudit` | `['akhilSirAudit','remarks']` |
| `advanceBill` | `['advanceBill','advanceBillRemarks','akhilSirAudit','remarks']` |

### B. The render block (VERIFIED — `src/pages/Dashboard.jsx`, daily tab, approx. lines 2765–2845)
- `canEditDaily` defined ~line 204: `const canEditDaily = isAdmin || user.canEditDaily`. Reuse ONLY this.
- Header row and body row are structurally symmetric: both render 8 base cells (`#`, Date, PO No, Client, Order No, GST, Follow Up, and the generic value cell `{dailyFilter && ...}`), then per-view extra cells in the SAME order, then the Action cell LAST.
- Generic value column already renders `o[dailyFilter]` for every filter, so `inProduction` already shows its value with zero extra columns.
- `isFromDeleted` per row = `colorableFilters && deletedIds.has(o.id)` where `colorableFilters = dailyFilter === 'photography' || 'siteVideo' || 'review'`. For the six new filters `colorableFilters` is false ⇒ `isFromDeleted` is false ⇒ `setEditingDeleted(false)` — correct; keep the same expression unchanged.

### Column-count check per view (header `<th>` count must equal body `<td>` count, incl. new Action)
Base = 8 (shared, identical in header and body). Action = +1 (last cell).
| Filter | Extra cols (same in header & body) | Total with Action |
|---|---|---|
| `siteVerification` | +1 (Site Verification Remarks) | 8+1+1 = **10 = 10** ✓ |
| `installationStatus` | +1 (Installation Remarks) | 8+1+1 = **10 = 10** ✓ |
| `sectionDrawing` | +2 (LOP, SD Remarks) | 8+2+1 = **11 = 11** ✓ |
| `inProduction` | +0 | 8+0+1 = **9 = 9** ✓ |
| `akhilSirAudit` | +1 (Audit Remarks) | 8+1+1 = **10 = 10** ✓ |
| `advanceBill` | +3 (Advance Bill Remarks, Akhil Sir Audit, Audit Remarks) | 8+3+1 = **12 = 12** ✓ |

Because all per-view extra cells already render before the Action cell in BOTH header and body, and the Action cell stays last, symmetry is preserved automatically when the shared condition is extended. No reordering needed.

---

## Ordered implementation steps

- [ ] 1. Add a shared editable-filters constant used by both the header `<th>` and body `<td>` Action conditions.
      Define it once, in scope of the daily render block, immediately before the `<table>` in the `activeTab === 'daily'` branch (just inside the `) : (` else-branch that opens `<div style={styles.tableWrap}>`, before `<table>`), OR co-locate it with the IIFE body — pick the point that keeps it in scope for BOTH the header and the body usages (the whole `<table>...</table>` is one JSX subtree, so a `const` just before `<table>` is visible to both). Use:
      `const DAILY_EDITABLE = ['photography','siteVideo','review','siteVerification','installationStatus','sectionDrawing','inProduction','akhilSirAudit','advanceBill']`
      Files: `src/pages/Dashboard.jsx`
      Verify: build still succeeds after wiring in steps 2–3 (do not build on this step alone; the constant is unused until step 2). Combined verify at step 4.

- [ ] 2. Replace the header Action `<th>` condition to use the shared set.
      Find (~line 2792): `{(dailyFilter === 'photography' || dailyFilter === 'siteVideo' || dailyFilter === 'review') && canEditDaily && <th style={styles.th}>Action</th>}`
      Replace the condition with: `{DAILY_EDITABLE.includes(dailyFilter) && canEditDaily && <th style={styles.th}>Action</th>}`
      Leave every other `<th>` line (Site Verification Remarks, Installation Remarks, LOP, SD Remarks, Advance Bill Remarks, Akhil Sir Audit, Audit Remarks, etc.) exactly as-is — they already exist for these filters.
      Files: `src/pages/Dashboard.jsx`
      Verify: combined at step 4.

- [ ] 3. Replace the body Action `<td>` condition AND expand the `fieldMap` to all nine filters.
      Find the block (~lines 2829–2836):
      ```
      {(dailyFilter === 'photography' || dailyFilter === 'siteVideo' || dailyFilter === 'review') && canEditDaily && (
        <td style={styles.td}>
          <button onClick={() => {
            const fieldMap = { photography: ['photography','photographyRemarks'], siteVideo: ['siteVideo','siteVideoRemarks'], review: ['review','reviewRemarks'] }
            setEditingOrder(o); setEditingDeleted(isFromDeleted); setDailyEditFields(fieldMap[dailyFilter]); setShowOrderForm(true)
          }} style={{ ...styles.tblBtn, background: '#2980b9' }} title="Edit">Edit</button>
        </td>
      )}
      ```
      Change ONLY two things: (a) the outer condition to `{DAILY_EDITABLE.includes(dailyFilter) && canEditDaily && (`; (b) extend `fieldMap` to all nine entries (keep existing three, add six) exactly:
      ```
      const fieldMap = {
        photography: ['photography','photographyRemarks'],
        siteVideo: ['siteVideo','siteVideoRemarks'],
        review: ['review','reviewRemarks'],
        siteVerification: ['siteVerification','siteVerificationRemarks'],
        installationStatus: ['installationStatus','installationRemarks'],
        sectionDrawing: ['sectionDrawing','lop','sectionDrawingRemarks'],
        inProduction: ['inProduction'],
        akhilSirAudit: ['akhilSirAudit','remarks'],
        advanceBill: ['advanceBill','advanceBillRemarks','akhilSirAudit','remarks']
      }
      ```
      Keep `setEditingOrder(o); setEditingDeleted(isFromDeleted); setDailyEditFields(fieldMap[dailyFilter]); setShowOrderForm(true)` and the button styling (`{ ...styles.tblBtn, background: '#2980b9' }`), `title="Edit"`, label `Edit` all unchanged. Do NOT touch `colorableFilters` or `isFromDeleted` (leaving them means `isFromDeleted` is false for the six new filters, which is correct).
      Files: `src/pages/Dashboard.jsx`
      Verify: combined at step 4.

- [ ] 4. Build and confirm the change compiles and column counts stay symmetric.
      Run: `npm run build` from `d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard`.
      Expected: Vite build completes with no errors (exit 0, "built in …"). This confirms the JSX edits are valid.
      Then do a manual code re-read confirming, for each of the six new filters, the header `<th>` count equals the body `<td>` count per the table in finding B (both end with the single shared Action cell). No automated test exists; this read-back is the integrity check for the "column-count per view" requirement.
      Files: none (verification only)
      Verify: `npm run build` exits 0 with no errors.

---

## Notes / assumptions
- No limitation hit on `advanceBill`: OrderForm's `restrictToFields` handles the full 4-key set, so the full `['advanceBill','advanceBillRemarks','akhilSirAudit','remarks']` is used (not the 2-key fallback).
- `inProduction` needs NO extra data column — the generic `o[dailyFilter]` cell already renders its value; only the Action column is added. Its field set is single-key `['inProduction']` (matches the one `FIELDS` key).
- All six new filters source rows from the plain `orders` list (not deletedOrders), so no red "from deleted" rows and `editingDeleted` stays false — consistent with existing non-colorable behavior.
- Scope guardrails honored: reuse `canEditDaily` only; no new rights; no filter button changes; no Excel/print changes; photography/siteVideo/review behavior preserved (only the shared-condition + fieldMap refactor touches them, with identical runtime result).

---

## Verification evidence (iteration 1)

- Command run (from `d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard`): `npm run build` (= `vite build`).
- Result: SUCCESS, exit code 0 — "✓ 103 modules transformed" / "✓ built in 5.37s". Only warning is the pre-existing >500 kB chunk-size notice (unrelated to this change).
- `OrderForm.jsx` contract re-verified: `restrictToFields` is a list of `FIELDS[].key` strings; `getVisibleFields()` returns `FIELDS.filter(f => restrictToFields.includes(f.key))` with no count limit. All requested keys exist in `FIELDS` (siteVerification, siteVerificationRemarks, installationStatus, installationRemarks, lop, sectionDrawing, sectionDrawingRemarks, inProduction, akhilSirAudit, remarks, advanceBill, advanceBillRemarks). No fallback needed for advanceBill — the full 4-key set is used.
- Final per-view field-key set applied in `fieldMap`:
  - photography → `['photography','photographyRemarks']`
  - siteVideo → `['siteVideo','siteVideoRemarks']`
  - review → `['review','reviewRemarks']`
  - siteVerification → `['siteVerification','siteVerificationRemarks']`
  - installationStatus → `['installationStatus','installationRemarks']`
  - sectionDrawing → `['sectionDrawing','lop','sectionDrawingRemarks']`
  - inProduction → `['inProduction']`
  - akhilSirAudit → `['akhilSirAudit','remarks']`
  - advanceBill → `['advanceBill','advanceBillRemarks','akhilSirAudit','remarks']`
- Shared constant `DAILY_EDITABLE = ['photography','siteVideo','review','siteVerification','installationStatus','sectionDrawing','inProduction','akhilSirAudit','advanceBill']` defined once in an IIFE wrapping the daily `<table>` (just inside `styles.tableWrap`), in scope for both the header `<th>` Action condition and the body `<td>` Action condition. Both now use `DAILY_EDITABLE.includes(dailyFilter) && canEditDaily`.
- Column-count re-read confirmed header `<th>` count == body `<td>` count for every view (base 8 + per-view extras + 1 trailing Action), matching the table in finding B — special views sectionDrawing (+2), advanceBill (+3), akhilSirAudit (+1) land the Action cell last in both header and body.
- No new right or filter button introduced; `colorableFilters`/`isFromDeleted` left unchanged (false for the six new filters, correct); Excel/print code untouched.
