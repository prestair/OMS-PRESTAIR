# Rename "Wapp Number" to "Wapp Name" and add "Wapp Group Made" column

This change renames the display label "Wapp Number" to "Wapp Name" across every header and label surface while leaving the `wappNumber` key and the `wapp_number` database column untouched, then adds a new `wappGroupMade` / `wapp_group_made` column with a Yes/No/N/A/Blank dropdown wired through the whole data path: the order form, the dashboard inline editor, the per-user and per-group column rights, the active and completed import/export templates, the daily report, and an appended migration `ALTER TABLE`. The new column is editable inline exactly like `wappGroup`, and its values are stored uppercase (YES/NO/N/A/BLANK) for casing consistency. Watch for: the migration SQL must be run in Supabase before deploying, because `GET /api/orders` now selects `wapp_group_made` and will return a 500 if the column is absent; and the import mappers read `wappGroupMade` verbatim with no uppercasing, so a manually-edited mixed-case Excel can store a value the uppercase-only inline editor cannot display.

**Verdict**: APPROVED

## High-level view

The rename is label-only. Every place that surfaced "Wapp Number" as a header or label — the column definitions in Dashboard and UserManagement, the order-form field, both Excel import mappers, the export/print headers, and the daily-report column headers — now reads "Wapp Name", while the `wappNumber` key and `wapp_number` column are unchanged.

The new `wappGroupMade` column is threaded through the same pipeline as `wappGroup`, always inserted immediately after the `wappNumber` entry: the `ALL_COLUMNS` arrays (which auto-drive the active/completed export, print, and table headers), the order-form `FIELDS` with a select type, the `mapOrder`/`snakeOrder` mappers, the `GET /api/orders` column select, the deleted-order import's explicit field list, the daily-report column widths and active/completed data mappings, and an appended `ALTER TABLE … wapp_group_made` in the migration file.

Inline editing mirrors the `wappGroup` block — same `canEditColumn` guard, same save-handler shape, same `<select>` styling, same PUT to `/api/orders/:id` — but drops `wappGroup`'s `normMap` case-normalizer and uses uppercase option values, leaning on the column being uppercase-consistent from the start.

The import/export templates for both Active and Completed pick up the new column automatically through the shared `ALL_COLUMNS` labels plus the two explicit import mappers; no configuration, TTL, RLS, or environment setting is touched.

The one hard dependency is deploy ordering: the orders select string now names `wapp_group_made`, so the `ALTER TABLE` has to land in the database before the code goes live.

<details>
<summary>Issues (2)</summary>

1. **Migration before deploy** — `GET /api/orders` now selects `wapp_group_made`; if the appended `ALTER TABLE orders ADD COLUMN … wapp_group_made` has not been run in Supabase, the orders endpoint 500s and the entire list fails to load. Run the (idempotent, `IF NOT EXISTS`) migration SQL before deploying the code.
2. **Import casing gap** — The Active and Completed import mappers read `row['Wapp Group Made']` verbatim with no uppercasing, but the inline editor and order form render only uppercase options with no `normMap`. A manually-edited Excel containing a mixed-case value (e.g. "Yes") is stored as-is, then renders as blank in the inline editor and likely misses the filters — the same value-casing mismatch class the original request was about. Uppercase the imported value on read (or add a normalizer) to match the rest of the uppercase-consistent design.

</details>

<details><summary>Details</summary>

### Label rename: "Wapp Number" → "Wapp Name", keys and column untouched

The rename is confined to display strings. The label moves to "Wapp Name" in three column-definition arrays (Dashboard `ALL_COLUMNS`, Dashboard `ALL_DELETED_COLS` inside `handleDeletedCompleteDownload`, UserManagement `ALL_COLUMNS`), the OrderForm `FIELDS` label, both Excel import mappers (`handleImport`, `handleDeletedImport`) which now read `row['Wapp Name']`, the wappNumber inline-edit alert text, and the daily-report `COL_WIDTHS` plus the `activeData`/`completedData` object keys (which become the emailed Excel's column headers). None of these touched the `wappNumber` key or the `wapp_number` column — `mapOrder` still emits `wappNumber: o.wapp_number`, `snakeOrder` still maps `o.wappNumber → s.wapp_number`, and the `GET /api/orders` select still names `wapp_number`. A repo-wide grep for "Wapp Number" returns no matches.

Because the export templates now emit a "Wapp Name" header, a freshly exported template round-trips cleanly. A pre-rename template still headed "Wapp Number" would, on import, read `row['Wapp Name']` as undefined and fall back to empty — so the wapp-name value from any old saved template is dropped on re-import. That is the intended consequence of renaming the import header the task asked for; re-exporting templates after deploy clears it.

### New wappGroupMade column through the data pipeline

`wappGroupMade` / `wapp_group_made` is added in the same position (immediately after `wappNumber`) and the same style as `wappGroup` everywhere the two travel together:

- `ALL_COLUMNS` in Dashboard and UserManagement (which feed the active/completed export headers, print headers, table columns, and the per-user/per-group rights dropdowns).
- OrderForm `FIELDS` as `{ key: 'wappGroupMade', label: 'Wapp Group Made', type: 'select', options: ['', 'Yes', 'No', 'N/A', 'Blank'] }`, plus `'wappGroupMade'` appended to the `isDropdown` list so it renders a select, plus a dedicated render block emitting uppercase options (`-- Select --`, YES, NO, N/A, BLANK).
- `mapOrder` (`wappGroupMade: o.wapp_group_made || ''`) and `snakeOrder` (`o.wappGroupMade !== undefined → s.wapp_group_made`).
- The `GET /api/orders` select string (`,wapp_group,wapp_number,wapp_group_made`).
- The deleted-order import's explicit `orderData` field list (`wappGroupMade:o.wappGroupMade||''`) — a necessary gap-fill, since that handler builds its object by hand rather than spreading and would otherwise drop the field the frontend sends.
- The daily-report `COL_WIDTHS`, `activeData` (`o.wapp_group_made`), and `completedData` (`o.wapp_group_made || o.wappGroupMade`, mirroring `wapp_group || wappGroup` because completed rows come from a camelCase JSON blob).
- An appended `ALTER TABLE orders ADD COLUMN IF NOT EXISTS wapp_group_made TEXT DEFAULT NULL;` in the migration file.

The full lifecycle holds together: `POST /api/orders` and `PUT /api/orders/:id` both persist through `snakeOrder`, the PUT was spot-checked to confirm it updates via `snakeOrder(req.body)` (the `AUTO_FIELDS` list only gates change-history, not the update), delete archives through `mapOrder` so the JSON carries `wappGroupMade`, and `PUT /api/orders/deleted/:id/update` spreads `req.body` so completed edits pass it through. The daily report's `select('*')` fetch means no hardcoded column list was missed there. `deleted_orders` needs no DDL (JSON `data` column).

### Inline editing for Wapp Group Made

The new block sits between the `wappGroup` and `wappNumber` blocks in `getCellValue`. It reuses `wappGroup`'s structure character-for-character — the `canEditColumn('wappGroupMade')` read-only guard, the same async `save` that PUTs to `/api/orders/${order.id}` and calls `fetchOrders()`, the same `<select>` style object, and a `'Failed to save Wapp Group Made'` alert. The options are empty/YES/NO/N/A/BLANK and the body key is `wappGroupMade`.

The one deliberate divergence is the absence of `wappGroup`'s `normMap`/`normVal`. `wappGroup` normalizes stored mixed-case values (yes→Yes) because that column accumulated inconsistent casing historically; `wappGroupMade` is new and is written uppercase by every in-app entry point, so `value={val || ''}` matches an option directly with no normalization. This is a cleaner design that sidesteps the value-casing drift the original request complained about — but it presumes every stored value is uppercase, which the import path does not guarantee (see Issues).

### Excel import/export and print templates (Active and Completed)

No template is maintained as a separate hardcoded list where it does not need to be. The Active Download Excel (`handleExport`) and Active Print (`handlePrint`) build headers from `col.label` of the `ALL_COLUMNS`-derived `allowedColumns`; the Completed Download Excel (`handleDeletedExport`) and the Completed tab table use `completedDisplayedColumns`, also `ALL_COLUMNS`-derived. So the `ALL_COLUMNS` label rename plus the new `wappGroupMade` entry propagate to all four surfaces automatically. The only explicit, non-derived header list is `ALL_DELETED_COLS` (the all-columns "Complete Download"), which was edited directly to add both the renamed label and the new column. The import side is covered by the two explicit mappers. The daily report carries the column through its own `COL_WIDTHS`/`activeData`/`completedData`. No configuration or settings file was modified.

### Deploy ordering depends on the migration

`GET /api/orders` now names `wapp_group_made` in its Supabase select. PostgREST returns an error when a select references a column that does not exist, so deploying the code without first running the appended `ALTER TABLE` would make the orders endpoint 500 and the dashboard fail to load any orders — not a partial degradation, a full break of the primary list. The migration file is idempotent (`ADD COLUMN IF NOT EXISTS`), so re-running all three statements is safe; the new statement just needs to execute before the code is live. The runtime N/A backfill (orders before OR/2026-27/425 set to "N/A", later orders left NULL) is a separate manual step that must also follow the migration, but it is not part of this diff.

</details>

<details><summary>File map</summary>

Full diff: `git -C "d:/OMS PRESTAIR SYSTEMS LLP/oms-dashboard" diff HEAD`

- `src/pages/Dashboard.jsx` — `ALL_COLUMNS` and `ALL_DELETED_COLS` labels renamed to "Wapp Name" with `wappGroupMade` added after; both import mappers read `row['Wapp Name']` / `row['Wapp Group Made']`; new `wappGroupMade` inline-edit block added between the `wappGroup` and `wappNumber` blocks; wappNumber alert text renamed.
- `src/pages/UserManagement.jsx` — `ALL_COLUMNS` label renamed to "Wapp Name" with `wappGroupMade` added after (drives per-user and per-group rights dropdowns).
- `src/components/OrderForm.jsx` — `wappNumber` FIELDS label renamed; `wappGroupMade` FIELDS entry added (select, options `['','Yes','No','N/A','Blank']`); `'wappGroupMade'` added to `isDropdown`; dedicated uppercase render block (YES/NO/N/A/BLANK) added after the `wappGroup` block.
- `api/index.js` — `mapOrder` and `snakeOrder` extended for `wappGroupMade`/`wapp_group_made`; `GET /api/orders` select gains `wapp_group_made`; deleted-order import `orderData` gains `wappGroupMade`.
- `api/cron-daily-report.js` — `COL_WIDTHS` renamed/added; `activeData` and `completedData` mappings renamed/added for "Wapp Name" and "Wapp Group Made".
- `api/wapp-columns-migration.sql` — appended `ALTER TABLE orders ADD COLUMN IF NOT EXISTS wapp_group_made TEXT DEFAULT NULL;`.

</details>
