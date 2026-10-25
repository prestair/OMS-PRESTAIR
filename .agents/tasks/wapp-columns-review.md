# Wapp Group and Wapp Number columns added to OMS Dashboard

This change adds two new order fields — `wappGroup` (a Yes/No/N/A dropdown) and `wappNumber` (free text) — positioned immediately after Phone No across every surface of the application: the order form, the dashboard table and column picker, the Excel export and import handlers, the daily-report email attachment, and the migration SQL. The admin column-permission grid in User Management is updated so these fields can be granted or restricted per-user or per-group through the existing rights UI, with no special-cased path.

Watch for: The active-orders import has no separate hardcoded template file — the import handler reads column headers from whatever Excel is uploaded. The wapp columns are read as `row['Wapp Group']` and `row['Wapp Number']`, matching the export header labels exactly, so an export-then-import round-trip is lossless. No blocking concerns found.

**Verdict**: APPROVED

---

## High-level view

Both columns are inserted after `phoneNo` in all four column definition arrays (Dashboard's `ALL_COLUMNS`, UserManagement's `ALL_COLUMNS`, OrderForm's `FIELDS`, and the `handleDeletedCompleteDownload` inline list). The API is fully wired: `mapOrder` and `snakeOrder` handle both directions, the GET `/api/orders` projection includes both columns, and create/update/import all pass through `snakeOrder`. The completed-orders import endpoint builds `orderData` explicitly and includes both fields.

The `wappGroup` dropdown option values in the select JSX are `YES`, `NO`, `N/A` (already uppercase), and the form's `handleSubmit` uppercases all string fields in form state before posting — both fields will be stored consistently in uppercase, matching every other dropdown in the system.

The cron daily report populates both columns in both the Active Orders and Completed Orders sheets, with `COL_WIDTHS` entries covering both headers. The migration SQL uses `ADD COLUMN IF NOT EXISTS`, making it safe to re-run, and `mapOrder` coerces `NULL` to `''` so existing rows have no display regression.

---

<details>
<summary>Issues (0)</summary>

No actionable issues found.

</details>

---

<details>
<summary>Details</summary>

## Column placement and consistency

`wappGroup` and `wappNumber` appear immediately after `phoneNo` in every column registry:

- `ALL_COLUMNS` in Dashboard.jsx (lines 34–35)
- `ALL_COLUMNS` in UserManagement.jsx (line 8)
- `FIELDS` in OrderForm.jsx (lines 20–21)
- `handleDeletedCompleteDownload` inline column list (lines 840–841)
- `activeData` and `completedData` objects in cron-daily-report.js (after `'Phone No'` key in both)

## wappGroup value casing

The select JSX block renders:
```jsx
<option value="YES">YES</option>
<option value="NO">NO</option>
<option value="N/A">N/A</option>
```
The `handleSubmit` function in OrderForm copies form state to `upperForm` and applies `.toUpperCase()` to all string values. Since this operates on the state object (not the DOM), it applies to `wappGroup` and converts `YES`→`YES`, `NO`→`NO`, `N/A`→`N/A` — no case drift.

## Import round-trip

Both the active import (`handleImport`) and the completed import (`handleDeletedImport`) map `row['Wapp Group'] || ''` → `wappGroup` and `row['Wapp Number'] || ''` → `wappNumber`. Since the export (handleExport, handleDeletedCompleteDownload) generates those same header strings from `ALL_COLUMNS`, an export-then-import round-trip preserves both fields without any header renaming or aliasing needed.

## Migration SQL

```sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS wapp_group  TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS wapp_number TEXT DEFAULT NULL;
```

Both statements are idempotent. Existing rows receive `NULL`, which `mapOrder` coerces to `''` via `o.wapp_group || ''`, so no display regression on old records.

</details>

---

<details>
<summary>Files changed</summary>

- `src/components/OrderForm.jsx` — added `wappGroup` (select, YES/NO/N/A) and `wappNumber` (text) to FIELDS; added `wappGroup` to the `isDropdown` check; added `wappGroup` select branch in the form renderer
- `src/pages/Dashboard.jsx` — added both columns to `ALL_COLUMNS`; added both to `handleDeletedCompleteDownload` column list; both fields mapped in active and completed import handlers
- `src/pages/UserManagement.jsx` — added both columns to `ALL_COLUMNS` so they appear in the column-permissions grid
- `api/index.js` — `mapOrder` maps `wapp_group`→`wappGroup`, `wapp_number`→`wappNumber`; `snakeOrder` maps the reverse; GET `/api/orders` projection includes both columns; completed-orders import explicitly includes both
- `api/cron-daily-report.js` — both columns added to Active Orders and Completed Orders sheet data; `COL_WIDTHS` entries added for both
- `api/wapp-columns-migration.sql` — `ALTER TABLE orders ADD COLUMN IF NOT EXISTS` for both columns

</details>
