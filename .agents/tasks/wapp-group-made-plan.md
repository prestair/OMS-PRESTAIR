# Implementation Plan — Rename "Wapp Number" → "Wapp Name" + Add "Wapp Group Made" Column

Repo root (contains spaces, quote in every shell command): `d:/OMS PRESTAIR SYSTEMS LLP/oms-dashboard`
Build: `npm run build` (runs `vite build`). No test framework exists — verification is the build.

All edits below are LABEL-only for Task 1 (keys/columns stay unchanged) and additive for Task 2.
The DB column/key `wappNumber` / `wapp_number` and `wappGroup` / `wapp_group` MUST NOT change.

---

## Key design decisions (read before implementing)

1. **Rendered dropdown option values are UPPERCASE: `YES / NO / N/A / BLANK`** (plus empty) in BOTH
   the OrderForm render block AND the Dashboard inline-edit `<select>`.
   Rationale:
   - `OrderForm.handleSubmit` uppercases every string field on save (except `paymentProofUrl`,
     `auditProofUrl`, `followUpType`). So a form-saved value is always uppercase (`YES`, `N/A`, …).
   - The existing `wappGroup` OrderForm render block already uses uppercase values (`YES/NO/N/A`),
     and the task says "follow the exact same code style as the existing wappGroup implementation".
   - The Task 5 backfill stores `N/A` (uppercase).
   - With one consistent casing, `value={val || ''}` in the inline edit matches a stored value to
     its option on display — no `normMap` needed — and filters see one casing. This avoids the
     blank/yes mismatch the user originally complained about.
   The task lists the options conceptually as "Yes, No, N/A, Blank"; those are the user-facing
   *labels*. We render the `value`/text uppercase for consistency. The decorative `options` array
   in the OrderForm FIELDS entry is written exactly as the task specifies (see Task 2 step 1).

2. **The inline-edit block omits the `wappGroup` block's `normMap`/`normVal`.**
   The task explicitly specifies `value={val || ''}` (not `value={normVal}`), which is incompatible
   with the `normMap`. With uppercase-consistent options (decision 1) no normalization is needed.
   Everything else in the block (guard, save-handler shape, `<select>` style object) matches the
   `wappGroup` block character-for-character.

3. **`wappGroupMade` is added to `ALL_COLUMNS` in UserManagement.jsx.** That single array drives the
   per-user AND per-group column-rights dropdowns (`ALL_COLUMNS.map(...)` at lines ~253 and ~328),
   which write to `column_permissions[wappGroupMade]`. `canEditColumn('wappGroupMade')` in Dashboard
   reads `userPerms['wappGroupMade'] === 'edit'`. No other rights wiring exists.

4. **Active export/print and the Completed tab table are driven by `ALL_COLUMNS` labels** — they
   auto-update when the label is renamed and `wappGroupMade` is added to `ALL_COLUMNS`. The only
   HARDCODED export list is `ALL_DELETED_COLS` inside `handleDeletedCompleteDownload` (Dashboard.jsx),
   which needs an explicit edit. The Completed tab has NO print button (only Select Columns /
   Complete Download / Download Excel / Import).

5. **Backend gap-fill (not explicitly listed in the task but required):** `POST /api/orders/deleted/import`
   builds `orderData` with a hardcoded field list (ends `...wappNumber:o.wappNumber||''}`). Without
   adding `wappGroupMade`, the frontend `handleDeletedImport` sends `wappGroupMade` but the backend
   drops it. Add `wappGroupMade:o.wappGroupMade||''` there. All other backend handlers
   (`GET /api/orders`, `POST /api/orders`, `PUT /api/orders/:id`, `GET /api/orders/deleted/all`,
   `PUT /api/orders/deleted/:id/update`, `DELETE /api/orders/:id`, restore) auto-handle
   `wappGroupMade` via `mapOrder` / `snakeOrder` / `{...d.data}` / `{...req.body}` once those two
   mappers are updated.

---

## What MUST NOT change

- The key `wappNumber` and DB column `wapp_number` (only the display label becomes "Wapp Name").
- The key `wappGroup` and DB column `wapp_group` and their existing options/behavior.
- Any configuration, settings, environment variables, or unrelated functionality.
- The `OrderForm` uppercase-on-save transform (do NOT add `wappGroupMade` to its exclusion list;
  uppercase storage is intentional per decision 1).
- `DEFAULT_VISIBLE`, `COMPLETED_FREEZE_WIDTHS`, cache TTLs, RLS, or any other existing config.

---

## Task 1 — Rename display label "Wapp Number" → "Wapp Name" (label only)

### 1a. `src/components/OrderForm.jsx` — FIELDS label
Anchor (line 21):
```js
  { key: 'wappGroup', label: 'Wapp Group', type: 'select', options: ['', 'Yes', 'No', 'N/A', 'Exists'] },
  { key: 'wappNumber', label: 'Wapp Number' },
```
After:
```js
  { key: 'wappGroup', label: 'Wapp Group', type: 'select', options: ['', 'Yes', 'No', 'N/A', 'Exists'] },
  { key: 'wappNumber', label: 'Wapp Name' },
```

### 1b. `src/pages/UserManagement.jsx` — ALL_COLUMNS label (line 8, single long line)
Find: `{ key: 'wappGroup', label: 'Wapp Group' },{ key: 'wappNumber', label: 'Wapp Number' },{ key: 'siteVerification', label: 'Site Verification' }`
Replace the middle entry only:
`{ key: 'wappNumber', label: 'Wapp Number' }` → `{ key: 'wappNumber', label: 'Wapp Name' }`

### 1c. `src/pages/Dashboard.jsx` — ALL_COLUMNS label (line 35)
Find:
```js
  { key: 'wappGroup', label: 'Wapp Group' },
  { key: 'wappNumber', label: 'Wapp Number' },
```
After:
```js
  { key: 'wappGroup', label: 'Wapp Group' },
  { key: 'wappNumber', label: 'Wapp Name' },
```

### 1d. `src/pages/Dashboard.jsx` — `ALL_DELETED_COLS` label (inside `handleDeletedCompleteDownload`, line 843)
Find:
```js
      { key: 'wappGroup',  label: 'Wapp Group'  },
      { key: 'wappNumber', label: 'Wapp Number' },
```
After:
```js
      { key: 'wappGroup',  label: 'Wapp Group'  },
      { key: 'wappNumber', label: 'Wapp Name' },
```

### 1e. `src/pages/Dashboard.jsx` — import mappers (Excel header read)
`handleImport` (line 1074): `wappNumber: row['Wapp Number'] || '',` → `wappNumber: row['Wapp Name'] || '',`
`handleDeletedImport` (line 997): `wappNumber: row['Wapp Number'] || '',` → `wappNumber: row['Wapp Name'] || '',`

### 1f. `src/pages/Dashboard.jsx` — inline-edit alert text (line 1717, inside `getCellValue` wappNumber block)
`catch { alert('Failed to save Wapp Number') }` → `catch { alert('Failed to save Wapp Name') }`

### 1g. `api/cron-daily-report.js` — daily-report Excel headers (object keys)
`COL_WIDTHS`: `'Wapp Number':        12,` → `'Wapp Name':          12,`
`activeData` mapping: `'Wapp Number':       o.wapp_number || '',` → `'Wapp Name':         o.wapp_number || '',`
`completedData` mapping: `'Wapp Number':        o.wapp_number || o.wappNumber || '',` → `'Wapp Name':          o.wapp_number || o.wappNumber || '',`

NOTE on "export/download Excel header" and "print header": the Active Download Excel
(`handleExport`) and Active Print (`handlePrint`) build headers from `col.label` of the
`ALL_COLUMNS`-derived `allowedColumns`; the Completed Download Excel (`handleDeletedExport`) and
the Completed tab table use `completedDisplayedColumns` (also `ALL_COLUMNS`-derived). So edit 1c
alone updates the Active export header, Active print header, Completed Download Excel header, and
Completed tab header automatically. Edit 1d covers the separate hardcoded `ALL_DELETED_COLS`
(Complete Download). No other hardcoded print header exists in Dashboard.

---

## Task 2 — Add new column `wappGroupMade` / `wapp_group_made` (after `wappNumber` everywhere)

Dropdown: real selectable options Yes / No / N/A / Blank (rendered uppercase per decision 1);
default empty (no value). Add IMMEDIATELY AFTER the `wappNumber` entry in every list/mapping below.

### 2.1 `src/components/OrderForm.jsx` — FIELDS entry
After the (renamed) wappNumber line, add:
```js
  { key: 'wappGroupMade', label: 'Wapp Group Made', type: 'select', options: ['', 'Yes', 'No', 'N/A', 'Blank'] },
```
So the FIELDS sequence becomes:
```js
  { key: 'wappGroup', label: 'Wapp Group', type: 'select', options: ['', 'Yes', 'No', 'N/A', 'Exists'] },
  { key: 'wappNumber', label: 'Wapp Name' },
  { key: 'wappGroupMade', label: 'Wapp Group Made', type: 'select', options: ['', 'Yes', 'No', 'N/A', 'Blank'] },
```

### 2.2 `src/components/OrderForm.jsx` — `isDropdown` list
Find:
```js
const isDropdown = ['photography','siteVideo','review','status','installation','inProduction','siteVerification','lop','sectionDrawing','installationStatus','akhilSirAudit','advanceBill','orRecvd','salesRep','followUpType','wappGroup'].includes(field.key)
```
Add `'wappGroupMade'` before the closing `]`:
```js
...,'followUpType','wappGroup','wappGroupMade'].includes(field.key)
```
(Without this, the field renders as a text input instead of a select.)

### 2.3 `src/components/OrderForm.jsx` — render block (immediately after the `wappGroup` render block)
The existing `wappGroup` block is:
```jsx
                    ) : field.key === 'wappGroup' ? (
                      <>
                        <option value="">-- Select --</option>
                        <option value="YES">YES</option>
                        <option value="NO">NO</option>
                        <option value="N/A">N/A</option>
                      </>
                    )
```
Insert immediately after it (same style, uppercase values, adds BLANK):
```jsx
                    ) : field.key === 'wappGroupMade' ? (
                      <>
                        <option value="">-- Select --</option>
                        <option value="YES">YES</option>
                        <option value="NO">NO</option>
                        <option value="N/A">N/A</option>
                        <option value="BLANK">BLANK</option>
                      </>
                    )
```

### 2.4 `src/pages/UserManagement.jsx` — ALL_COLUMNS entry (line 8)
After `{ key: 'wappNumber', label: 'Wapp Name' }` add `{ key: 'wappGroupMade', label: 'Wapp Group Made' }`:
`...{ key: 'wappNumber', label: 'Wapp Name' },{ key: 'wappGroupMade', label: 'Wapp Group Made' },{ key: 'siteVerification', label: 'Site Verification' }...`
This makes the rights dropdown appear for users AND groups automatically (no other edit needed).

### 2.5 `src/pages/Dashboard.jsx` — ALL_COLUMNS entry (line 35)
After the wappNumber line add:
```js
  { key: 'wappNumber', label: 'Wapp Name' },
  { key: 'wappGroupMade', label: 'Wapp Group Made' },
```
This auto-adds the column to: Active Download Excel, Active Print, Completed Download Excel
(`handleDeletedExport` via `completedDisplayedColumns`), and the Completed tab table.

### 2.6 `src/pages/Dashboard.jsx` — `ALL_DELETED_COLS` entry (inside `handleDeletedCompleteDownload`, line 843)
After the (renamed) wappNumber line add:
```js
      { key: 'wappNumber', label: 'Wapp Name' },
      { key: 'wappGroupMade', label: 'Wapp Group Made' },
```

### 2.7 `src/pages/Dashboard.jsx` — `handleImport` mapping (active import, line 1074)
After the wappNumber line add:
```js
        wappNumber: row['Wapp Name'] || '',
        wappGroupMade: row['Wapp Group Made'] || '',
```

### 2.8 `src/pages/Dashboard.jsx` — `handleDeletedImport` mapping (completed import, line 997)
After the wappNumber line add:
```js
        wappNumber: row['Wapp Name'] || '',
        wappGroupMade: row['Wapp Group Made'] || '',
```

### 2.9 `api/index.js` — `mapOrder` (line 167)
Find the end of the return object:
```js
..., createdAt: o.created_at, wappGroup: o.wapp_group || '', wappNumber: o.wapp_number || '' }
```
After:
```js
..., createdAt: o.created_at, wappGroup: o.wapp_group || '', wappNumber: o.wapp_number || '', wappGroupMade: o.wapp_group_made || '' }
```

### 2.10 `api/index.js` — `snakeOrder` (line 171)
Find the last assignment before `return s`:
```js
  ...; if (o.wappGroup !== undefined) s.wapp_group = o.wappGroup; if (o.wappNumber !== undefined) s.wapp_number = o.wappNumber
  return s
```
After:
```js
  ...; if (o.wappGroup !== undefined) s.wapp_group = o.wappGroup; if (o.wappNumber !== undefined) s.wapp_number = o.wappNumber; if (o.wappGroupMade !== undefined) s.wapp_group_made = o.wappGroupMade
  return s
```
This makes `POST /api/orders` (insert) and `PUT /api/orders/:id` (inline edit + form edit) persist
`wapp_group_made`, and the restore handler (which runs each data-JSON key through `snakeOrder`)
restores it correctly.

### 2.11 `api/index.js` — `GET /api/orders` select string (line 364)
Find: `...row_color,created_at,wapp_group,wapp_number')`
After: `...row_color,created_at,wapp_group,wapp_number,wapp_group_made')`

### 2.12 `api/index.js` — `POST /api/orders/deleted/import` orderData (line 391) [GAP-FILL]
This handler builds `orderData` with an explicit field list (does NOT spread). Find its tail:
```js
...,orRecvd:o.orRecvd||'',wappGroup:o.wappGroup||'',wappNumber:o.wappNumber||''};
```
After:
```js
...,orRecvd:o.orRecvd||'',wappGroup:o.wappGroup||'',wappNumber:o.wappNumber||'',wappGroupMade:o.wappGroupMade||''};
```
Without this, completed-imported orders lose `wappGroupMade`.

### 2.13 `api/cron-daily-report.js` — COL_WIDTHS
After the (renamed) `'Wapp Name': 12,` add `'Wapp Group Made': 12,`:
```js
  'Wapp Group':          8,
  'Wapp Name':          12,
  'Wapp Group Made':    12,
```

### 2.14 `api/cron-daily-report.js` — `activeData` mapping
After the (renamed) `'Wapp Name': o.wapp_number || '',` add:
```js
      'Wapp Name':         o.wapp_number || '',
      'Wapp Group Made':   o.wapp_group_made || '',
```

### 2.15 `api/cron-daily-report.js` — `completedData` mapping
After the (renamed) `'Wapp Name': o.wapp_number || o.wappNumber || '',` add:
```js
        'Wapp Name':          o.wapp_number || o.wappNumber || '',
        'Wapp Group Made':    o.wapp_group_made || o.wappGroupMade || '',
```
(For completed orders `o = d.data || {}` is a camelCase JSON blob, so `o.wapp_group_made` is
undefined and it falls back to `o.wappGroupMade`, matching the existing `o.wapp_group || o.wappGroup` pattern.)

### 2.16 `api/wapp-columns-migration.sql` — append column DDL
Current file ends:
```sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS wapp_group  TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS wapp_number TEXT DEFAULT NULL;
```
Append:
```sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS wapp_group_made TEXT DEFAULT NULL;
```
(`deleted_orders` uses a JSON `data` column — no DDL needed there.)

---

## Task 3 — Inline editing in `Dashboard.jsx` for `wappGroupMade`

Add a new block inside `getCellValue` (the active-table cell renderer), IMMEDIATELY AFTER the
existing `wappGroup` inline-edit block (which ends with `    }` right before `    if (key === 'wappNumber') {`).
Insert exactly:
```jsx
    if (key === 'wappGroupMade') {
      if (!canEditColumn('wappGroupMade')) return val || ''
      const save = async (e) => {
        const newVal = e.target.value
        if (newVal === (val || '')) return
        try { await axios.put(`/api/orders/${order.id}`, { wappGroupMade: newVal }); fetchOrders() }
        catch { alert('Failed to save Wapp Group Made') }
      }
      return <select value={val || ''} onClick={e => e.stopPropagation()} onChange={save}
        style={{ width: '100%', border: '1px solid #ddd', borderRadius: '3px', padding: '3px 5px', fontSize: '11px', boxSizing: 'border-box', textAlign: 'center' }}>
        <option value=""></option>
        <option value="YES">YES</option>
        <option value="NO">NO</option>
        <option value="N/A">N/A</option>
        <option value="BLANK">BLANK</option>
      </select>
    }
```
Differences from the `wappGroup` block (all per the task): field name `wappGroupMade`,
`canEditColumn('wappGroupMade')`, PUT body key `wappGroupMade`, option list (adds `BLANK`,
no `Exists`), alert text `'Failed to save Wapp Group Made'`. The `<select>` style object is
identical to the `wappGroup` select. The `wappGroup` block's `normMap`/`normVal` are intentionally
NOT carried over (task specifies `value={val || ''}`; uppercase-consistent options need no
normalization — see decision 2). The Completed tab (`getDeletedCellValue`) is read-only and has
no inline editor, so it needs no block — it displays `wappGroupMade` automatically.

---

## Task 4 — Excel import/export template (Active AND Completed), no config changes

This task is satisfied entirely by the edits already listed above:
- Active import template header: Task 1e (`row['Wapp Name']`) + Task 2.7 (`wappGroupMade`).
- Completed import template header: Task 1e (`row['Wapp Name']`) + Task 2.8 (`wappGroupMade`).
- Active Download Excel header + Active Print header: auto via Task 1c + Task 2.5 (`ALL_COLUMNS` labels).
- Completed Download Excel header + Completed tab table: auto via Task 1c + Task 2.5
  (`completedDisplayedColumns` derives from `ALL_COLUMNS`).
- Complete Download (all-columns) header: Task 1d + Task 2.6 (`ALL_DELETED_COLS`).
- Daily report Excel (Active + Completed sheets): Task 1g + Task 2.13/2.14/2.15.
No configuration or settings are touched.

---

## Task 5 — Database backfill (runtime data op via PowerShell, NOT a code edit)

PREREQUISITE (manual, one time): run `api/wapp-columns-migration.sql` (all three ALTER statements)
in the Supabase SQL editor so the `wapp_group_made` column exists on the `orders` table. REST cannot
do DDL. The PATCH below will fail with "column does not exist" if this has not been run — in that
case run the SQL, then retry Step 3.

Run in PowerShell (repo path has spaces but these commands do not depend on the cwd):

```powershell
$SUPABASE_URL = "https://ttbyhawdgwwqemcqwjen.supabase.co"
$SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0YnloYXdkZ3d3cWVtY3F3amVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3MjU3ODcsImV4cCI6MjEwMTMwMTc4N30.V_d9mK8Bv6Sx6w89VE4Pzt6KRKvIAeHI7Dz6SbaLyh8"
$headers = @{ "apikey" = $SUPABASE_KEY; "Authorization" = "Bearer $SUPABASE_KEY" }

# Step 2: find the id of order OR/2026-27/425 (slashes URL-encoded as %2F)
$resp = Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/orders?select=id&order_no=eq.OR%2F2026-27%2F425" -Headers $headers -Method Get
$foundId = $resp[0].id
if (-not $foundId) { Write-Host "Order OR/2026-27/425 not found - aborting"; return }
Write-Host "Found id: $foundId"

# Step 3: set wapp_group_made = 'N/A' for all orders with id < foundId
$patchHeaders = @{ "apikey" = $SUPABASE_KEY; "Authorization" = "Bearer $SUPABASE_KEY"; "Content-Type" = "application/json"; "Prefer" = "return=minimal" }
$body = @{ wapp_group_made = "N/A" } | ConvertTo-Json
Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/orders?id=lt.$foundId" -Headers $patchHeaders -Method Patch -Body $body
Write-Host "Backfill done: orders with id < $foundId set to N/A; orders at/after stay NULL (blank)."
```

Notes:
- `N/A` is uppercase to match decision 1 (form saves uppercase; inline edit uses uppercase options).
- Orders at id >= foundId keep the default NULL (display as blank) — matches the task spec.
- `deleted_orders` (Completed) stores rows as a JSON `data` blob with no `wapp_group_made` column,
  so it is NOT backfilled; completed orders show blank `Wapp Group Made` (consistent with task scope).
- If the PATCH errors with "column does not exist", the migration SQL has not been applied yet —
  run `api/wapp-columns-migration.sql` in the Supabase SQL editor, then re-run Step 3.
- If a PATCH errors with a 401/403/RLS message, the anon key lacks write access under RLS; retry with
  the project `service_role` key in place of `$SUPABASE_KEY` (not provided here — ask the user).

---

## Verification

1. From `d:/OMS PRESTAIR SYSTEMS LLP/oms-dashboard` run:
   `npm run build`
   Expected: Vite build completes with no errors (no test framework exists).
2. Re-run the Task 5 PowerShell only AFTER the migration SQL is applied and the deploy is live, then
   confirm with `GET /rest/v1/orders?select=id,wapp_group_made&id=lt.<foundId>` that older rows show
   `N/A` and newer rows show null.

## Commit & push (after Tasks 1–4 verified; Task 5 is a runtime op, not committed)

From the repo root:
```bash
git add src/pages/UserManagement.jsx src/pages/Dashboard.jsx src/components/OrderForm.jsx api/index.js api/cron-daily-report.js api/wapp-columns-migration.sql
git commit -m "feat: rename Wapp Number to Wapp Name, add Wapp Group Made column with import/export"
git push
```
Do NOT commit the `.agents/` plan file. Do NOT change `wappNumber`/`wapp_number` or
`wappGroup`/`wapp_group` keys/columns, or any config/settings.

---

## Verification note (post-implementation)

- Build command run: `npm run build` (runs `vite build`) in `d:/OMS PRESTAIR SYSTEMS LLP/oms-dashboard` (PowerShell).
- Result: **PASS** — `✓ built in 3.39s`, exit code 0.
- Warnings: only the pre-existing chunk-size advisory (`dist/assets/index-*.js` is 1,144.47 kB > 500 kB limit), unrelated to these changes; no new warnings.
- Completeness check: no stray `Wapp Number` display labels remain anywhere; `wappGroupMade` / `wapp_group_made` / `'Wapp Group Made'` confirmed present in all required locations (OrderForm FIELDS + isDropdown + render block; UserManagement & Dashboard ALL_COLUMNS; Dashboard ALL_DELETED_COLS; Dashboard handleImport + handleDeletedImport; Dashboard inline-edit block; api/index.js mapOrder + snakeOrder + GET /api/orders select + deleted/import orderData; cron-daily-report.js COL_WIDTHS + activeData + completedData; wapp-columns-migration.sql ALTER TABLE).
- Changes left uncommitted in the working tree for review (no commit/push performed).
