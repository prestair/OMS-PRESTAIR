# Inline "Edit" button extended to six daily-report views

Commit `f1a67c7` adds the daily-report inline Edit button — previously only on `photography`, `siteVideo`, and `review` — to six more views (`siteVerification`, `installationStatus`, `sectionDrawing`, `inProduction`, `akhilSirAudit`, `advanceBill`). The 3-way OR condition that gated the Action header and row cell is replaced by a shared `DAILY_EDITABLE` array used by both, and the inline `fieldMap` that decides which fields the restricted OrderForm shows is expanded from three to nine entries. The button stays gated by the existing `canEditDaily` right; no new permission is introduced. Screen-only change confined to `src/pages/Dashboard.jsx` plus the task plan file.

Watch for: nothing blocking. Column symmetry holds for all nine views, every `fieldMap` key resolves to a real `FIELDS` entry in OrderForm, and the scope guardrails (no new right, no filter button, no backend/export changes) are respected (all confirmed).

**Verdict**: APPROVED

## High-level view

The gating strategy is the heart of the change: a single `DAILY_EDITABLE` list drives both the header `<th>Action</th>` and the body Action `<td>`, so the two can no longer drift out of sync the way two independently-maintained OR chains could. The condition is `DAILY_EDITABLE.includes(dailyFilter) && canEditDaily` in both places, identical.

The API surface the Edit button touches is OrderForm's `restrictToFields` contract. The form filters its `FIELDS` array by key with no count ceiling, so each view's `fieldMap` entry is just a list of real field keys. All nine entries use keys that exist in `FIELDS` — including the four-key `advanceBill` set and the `remarks` key (whose form label is "Audit Remarks"), so nothing renders blank or throws.

Column-count integrity is preserved structurally rather than by coincidence: every per-view extra column is guarded by the same `dailyFilter === X` test in header and body, in the same order, with the shared Action cell always last. The special-shaped views (`sectionDrawing` +2, `advanceBill` +3, `akhilSirAudit` +1) each keep matching `<th>`/`<td>` counts.

Scope stayed tight — only `Dashboard.jsx` and the plan file changed, the six new views draw from the plain `orders` list so `isFromDeleted` stays false for them (consistent with prior non-colorable behavior), and `canEditDaily` is reused with no new right, filter button, or export/print edits.

<details>
<summary>Issues (0)</summary>

No blocking or non-blocking action items. The change is clean.

</details>

<details>
<summary>Details</summary>

### Shared DAILY_EDITABLE gate replaces the duplicated OR chain

The previous code gated the Action column with `(dailyFilter === 'photography' || dailyFilter === 'siteVideo' || dailyFilter === 'review') && canEditDaily` written out twice — once for the header `<th>` and once for the row `<td>`. The commit lifts the filter list into one `DAILY_EDITABLE` constant and references it from both sites, so header and row are now provably driven by the same predicate. This is a strict improvement over two hand-synced OR chains: adding or removing a view is a one-line edit to the array, and the header/row can't diverge (confirmed — both read `DAILY_EDITABLE.includes(dailyFilter) && canEditDaily`).

The constant is introduced via an IIFE wrapping the `<table>` subtree (`{(() => { const DAILY_EDITABLE = [...]; return ( <table>…</table> ) })()}`), which keeps it in scope for both the `<thead>` and `<tbody>` usages while leaving the surrounding JSX structure intact (confirmed by reading lines 2764 and 2853).

### fieldMap keys all resolve against OrderForm's FIELDS contract

OrderForm receives the selected view's key list as `restrictToFields` and, in `getVisibleFields()`, returns `FIELDS.filter(f => restrictToFields.includes(f.key))` with no upper bound on count. A key absent from `FIELDS` would silently contribute nothing. Every key in the expanded `fieldMap` was checked against the `FIELDS` array:

```
siteVerification      → siteVerification, siteVerificationRemarks        ✓ ✓
installationStatus    → installationStatus, installationRemarks          ✓ ✓
sectionDrawing        → sectionDrawing, lop, sectionDrawingRemarks        ✓ ✓ ✓
inProduction          → inProduction                                     ✓
akhilSirAudit         → akhilSirAudit, remarks                            ✓ ✓
advanceBill           → advanceBill, advanceBillRemarks,
                        akhilSirAudit, remarks                            ✓ ✓ ✓ ✓
```

The `remarks` key maps to the `FIELDS` entry labeled "Audit Remarks", which matches both the `akhilSirAudit` and `advanceBill` views' intent. The four-key `advanceBill` set works directly — `restrictToFields` imposes no count limit — so no two-key fallback was needed. The three pre-existing entries (`photography`, `siteVideo`, `review`) are unchanged.

### Column-count integrity across all nine views

Both header and body render eight shared cells (#, Date, PO No, Client, Order No, GST, Follow Up, and the generic `o[dailyFilter]` value cell), then per-view extra cells guarded by `dailyFilter === X`, then the single shared Action cell last. For every per-view extra `<th>` there is a `<td>` under the identical condition and in the same order, so counts stay equal view by view:

```
view                 base  extras                                  action  th == td
siteVerification       8   +1 (Site Verification Remarks)            +1     10 == 10
installationStatus     8   +1 (Installation Remarks)                 +1     10 == 10
sectionDrawing         8   +2 (LOP, SD Remarks)                      +1     11 == 11
inProduction           8   +0                                        +1      9 ==  9
akhilSirAudit          8   +1 (Audit Remarks)                        +1     10 == 10
advanceBill            8   +3 (Advance Bill Remarks, Akhil Sir       +1     12 == 12
                              Audit, Audit Remarks)
```

The special-shaped views are the ones worth naming: `sectionDrawing` adds LOP + SD Remarks, `advanceBill` adds three audit-related columns, and `akhilSirAudit` adds the Audit Remarks column. In each the Action cell lands last in both header and row, so symmetry is structural, not incidental (confirmed by reading lines 2777–2792 for the header and 2814–2849 for the body). `inProduction` carries no extra data column — the generic value cell already renders `o.inProduction` — so only the Action column is added, matching its single-key `['inProduction']` field set.

### Deleted-row behavior unchanged for the new views

`isFromDeleted` is computed as `colorableFilters && deletedIds.has(o.id)`, and `colorableFilters` is still only true for `photography`/`siteVideo`/`review`. For the six new views it is false, so `isFromDeleted` is false and `setEditingDeleted(false)` is passed when their Edit button opens the form — consistent with how every other non-colorable daily view already behaves. The commit left `colorableFilters` and `isFromDeleted` untouched (confirmed at lines 2801 and 2805).

### Scope and the three pre-existing views

`git show --stat` shows only `src/pages/Dashboard.jsx` (two hunks) and the new `.agents/tasks/edit-buttons-plan.md` were touched. No backend, AuthContext, UserManagement, egress, Follow-Up, prior-filter, or Excel/print code is in the diff, and no new right or filter button was added — `canEditDaily` is reused as-is. The `photography`/`siteVideo`/`review` views keep identical runtime behavior: their condition still evaluates the same (they are members of `DAILY_EDITABLE`) and their `fieldMap` entries are byte-for-byte the same three arrays as before.

### Test coverage

The project has no test framework, so there is no automated coverage for this change. The coder recorded a `npm run build` (vite build) run in both the commit message and the plan's verification note: exit 0, 103 modules transformed, built in ~5.4s, only the pre-existing >500 kB chunk-size warning. Build evidence is present, so per the review instructions it was not re-run. Not tested (no suite exists): runtime rendering of each new view's Action column, and that OrderForm opens with the correct restricted field set per view — these were verified by code reading, not execution.

</details>

<details>
<summary>File map</summary>

- `src/pages/Dashboard.jsx` — shared `DAILY_EDITABLE` constant added via IIFE around the daily `<table>`; header `<th>` and row `<td>` Action conditions switched to `DAILY_EDITABLE.includes(dailyFilter) && canEditDaily`; `fieldMap` expanded from 3 to 9 entries.
- `.agents/tasks/edit-buttons-plan.md` — new implementation plan with verification note (not product code).

Full diff: `git diff adbe35a..f1a67c7`

</details>
