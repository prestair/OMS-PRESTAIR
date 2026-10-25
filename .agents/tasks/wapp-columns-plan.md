# Implementation Plan: Add 'Wapp Group' and 'Wapp Number' Columns

## Overview
Add two new columns immediately after **Phone No** in every place it appears:
- **Wapp Group** — dropdown with options `Yes / No / N/A`
- **Wapp Number** — free-text (phone-style input)

Rights are controlled through the same per-column permission system as every other column (admin defines them in UserManagement). No new rights infrastructure is needed.

---

## Step 1 — Database migration SQL file

Create the file `d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard\api\wapp-columns-migration.sql` with the two `ALTER TABLE` statements.

**Files to create:**
- `api/wapp-columns-migration.sql`

**Content:**
```sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS wapp_group  TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS wapp_number TEXT DEFAULT NULL;
```

**Verify:** File exists with the exact two lines above. SQL must be run manually on Supabase before or alongside deploying the code changes.

---

## Step 2 — Backend: `mapOrder`, `snakeOrder`, GET/POST/PUT/DELETE endpoints, and bulk import

**File:** `api/index.js`

### 2a. `mapOrder` function (≈ line 186)
The function ends with `...rowColor: o.row_color || '', createdAt: o.created_at }`.

Add the two new camelCase properties at the end of the return object literal, just before the closing `}`:

```js
wappGroup: o.wapp_group || '', wappNumber: o.wapp_number || '',
```

Final portion becomes:
```js
rowColor: o.row_color || '', createdAt: o.created_at, wappGroup: o.wapp_group || '', wappNumber: o.wapp_number || '' }
```

### 2b. `snakeOrder` function (≈ line 187)
The function ends with `if (o.rowColor !== undefined) s.row_color = o.rowColor`.

Append two new lines immediately after that last `if` statement:
```js
if (o.wappGroup  !== undefined) s.wapp_group  = o.wappGroup
if (o.wappNumber !== undefined) s.wapp_number = o.wappNumber
```

### 2c. GET `/api/orders` select string (≈ line 390)
The select string currently ends with `...review,review_remarks,row_color,created_at`. Append `,wapp_group,wapp_number` so Supabase returns the new columns.

Find:
```
,review,review_remarks,row_color,created_at'
```
Replace with:
```
,review,review_remarks,row_color,created_at,wapp_group,wapp_number'
```

### 2d. POST `/api/orders/import` bulk import (≈ line 438)
The import endpoint calls `snakeOrder(o)` for each row — because `snakeOrder` now maps `wappGroup` and `wappNumber`, no change to the endpoint itself is needed. The import mapping in Dashboard.jsx (Step 5) is what must be updated to parse the template columns.

### 2e. POST `/api/orders/deleted/import` bulk deleted-import (≈ line 404, the one-liner)
Inside the `orderData` object literal passed to `supabase.from('deleted_orders').insert(...)`, add after `orRecvd: o.orRecvd||''`:
```js
wappGroup: o.wappGroup||'', wappNumber: o.wappNumber||'',
```

**Verify:** Start the API server (or confirm Vercel build passes). Test `GET /api/orders` in the browser — the response objects should include `wappGroup` and `wappNumber` keys (both empty string for existing rows until DB migration runs).

---

## Step 3 — Frontend: `UserManagement.jsx` — `ALL_COLUMNS` array

**File:** `src/pages/UserManagement.jsx`

**Location:** Line 8, the single-line `ALL_COLUMNS` array.

After `{ key: 'phoneNo', label: 'Phone No' }` (currently position 20, right after `deliveryAddress`), insert the two new entries:

Find (within the long one-liner on line 8):
```js
{ key: 'phoneNo', label: 'Phone No' },{ key: 'siteVerification', label: 'Site Verification' }
```
Replace with:
```js
{ key: 'phoneNo', label: 'Phone No' },{ key: 'wappGroup', label: 'Wapp Group' },{ key: 'wappNumber', label: 'Wapp Number' },{ key: 'siteVerification', label: 'Site Verification' }
```

This ensures both columns appear in the column-permissions grid for User and Group forms, in the correct position after Phone No.

**Verify:** Navigate to `/users`, open any user's Edit form. The column-permissions grid should now show "Wapp Group" and "Wapp Number" entries after "Phone No".

---

## Step 4 — Frontend: `OrderForm.jsx` — `FIELDS` array and dropdown rendering

**File:** `src/components/OrderForm.jsx`

### 4a. Add to FIELDS array (≈ line 15)
The FIELDS array has `{ key: 'phoneNo', label: 'Phone No' }` at position 13 (0-indexed). Insert two new entries immediately after it:

Find:
```js
  { key: 'phoneNo', label: 'Phone No' },
  { key: 'siteVerification', label: 'Site Verification' },
```
Replace with:
```js
  { key: 'phoneNo', label: 'Phone No' },
  { key: 'wappGroup', label: 'Wapp Group', type: 'select', options: ['', 'Yes', 'No', 'N/A'] },
  { key: 'wappNumber', label: 'Wapp Number' },
  { key: 'siteVerification', label: 'Site Verification' },
```

### 4b. Add `wappGroup` to the `isDropdown` check (≈ line 222)
Find the line:
```js
const isDropdown = ['photography','siteVideo','review','status','installation','inProduction','siteVerification','lop','sectionDrawing','installationStatus','akhilSirAudit','advanceBill','orRecvd','salesRep','followUpType'].includes(field.key)
```
Add `'wappGroup'` to that array:
```js
const isDropdown = ['photography','siteVideo','review','status','installation','inProduction','siteVerification','lop','sectionDrawing','installationStatus','akhilSirAudit','advanceBill','orRecvd','salesRep','followUpType','wappGroup'].includes(field.key)
```

### 4c. Add dropdown options for `wappGroup` in the JSX select render (≈ line 228–300)
Inside the `isDropdown` block, before the `field.key === 'photography'` default branch (last `else` in the chain), add a new branch:

Find the section handling `salesRep` (or just before the final default `else` for photography/siteVideo/review):
```js
      ) : (
        <>
          <option value="">-- Select --</option>
          <option value="NOT REQUIRED">NOT REQUIRED</option>
```
The exact position is: the final `else` branch in the isDropdown select. Add a new condition before it:

Find the pattern (the last `else` block inside the `isDropdown` ternary):
```js
        <>
          <option value="">-- Select --</option>
          <option value="NOT REQUIRED">NOT REQUIRED</option>
          <option value="REQUIRED">REQUIRED</option>
          <option value="IN PROCESS">IN PROCESS</option>
          <option value="DONE">DONE</option>
          <option value="ISSUE">ISSUE</option>
        </>
```
Change the `else` just before it to `else if (field.key === 'photography' || field.key === 'siteVideo' || field.key === 'review')`, and insert a new `else if` for wappGroup before the final fallthrough:

```jsx
                      ) : field.key === 'wappGroup' ? (
                        <>
                          <option value="">-- Select --</option>
                          <option value="YES">YES</option>
                          <option value="NO">NO</option>
                          <option value="N/A">N/A</option>
                        </>
                      ) : (
```

**Important:** The `handleChange` function already uppercases all string values via `upperForm[key] = upperForm[key].toUpperCase()` in `handleSubmit`, so storing `YES/NO/N/A` is consistent with the pattern used by other dropdown columns.

**Verify:** Open any order's edit form. After Phone No, "Wapp Group" (dropdown: `YES / NO / N/A`) and "Wapp Number" (text input) should appear. Saving the form should persist the values.

---

## Step 5 — Frontend: `Dashboard.jsx` — ALL_COLUMNS, handleImport, handleDeletedImport, handleDeletedCompleteDownload

**File:** `src/pages/Dashboard.jsx`

### 5a. `ALL_COLUMNS` array (lines 13–44)
After `{ key: 'phoneNo', label: 'Phone No' }` (currently line ~33) and before `{ key: 'siteVerification', label: 'Site Verification' }`, insert:

Find:
```js
  { key: 'phoneNo', label: 'Phone No' },
  { key: 'siteVerification', label: 'Site Verification' },
```
Replace with:
```js
  { key: 'phoneNo', label: 'Phone No' },
  { key: 'wappGroup', label: 'Wapp Group' },
  { key: 'wappNumber', label: 'Wapp Number' },
  { key: 'siteVerification', label: 'Site Verification' },
```

This makes both columns appear in the Active and Completed column pickers (after Phone No), and in all filtered/exported data that iterates `ALL_COLUMNS`.

### 5b. `handleImport` active-orders import mapping (≈ lines 1060–1112)
In the `return { ... }` block inside `data.map(row => { ... })` within `handleImport`, after:
```js
        phoneNo: String(row['Phone No'] || row['PHONE NO'] || ''),
```
Add:
```js
        wappGroup:  row['Wapp Group']  || '',
        wappNumber: row['Wapp Number'] || '',
```

### 5c. `handleDeletedImport` completed-orders import mapping (≈ lines 937–1030)
In the `orders = data.map(row => ({ ... }))` block inside `handleDeletedImport`, after:
```js
        phoneNo: String(row['Phone No'] || row['PHONE NO'] || ''),
```
Add:
```js
        wappGroup:  row['Wapp Group']  || '',
        wappNumber: row['Wapp Number'] || '',
```

### 5d. `ALL_DELETED_COLS` in `handleDeletedCompleteDownload` (≈ lines 822–865)
This is the "Complete Download" for Completed/Deleted orders. After:
```js
      { key: 'phoneNo', label: 'Phone No' },
```
Add:
```js
      { key: 'wappGroup',  label: 'Wapp Group'  },
      { key: 'wappNumber', label: 'Wapp Number' },
```

**Verify:** 
1. Active tab: Column picker shows "Wapp Group" and "Wapp Number" after "Phone No". Both appear in the table when selected, and in downloaded Excel.
2. Completed tab: Same column picker behavior.
3. Import Excel for Active orders: A template column "Wapp Group" / "Wapp Number" is read correctly.

---

## Step 6 — Frontend: `Dashboard.jsx` — Download Import Template buttons

The codebase does **not** have a dedicated "Download Template" function — users download the current export as a reference and re-import it. The two new columns will automatically appear in exported files once Steps 5a–5d are applied, so no separate template function needs to be created.

If the codebase ever adds a separate template download, add `'Wapp Group'` and `'Wapp Number'` header columns immediately after `'Phone No'` in the template headers array.

---

## Step 7 — Cron report: `api/cron-daily-report.js` — Active Orders and Completed Orders sheet column definitions and COL_WIDTHS

**File:** `api/cron-daily-report.js`

### 7a. `COL_WIDTHS` object (≈ lines 78–122)
After the `'Phone No': 12,` entry, add:
```js
  'Wapp Group':  8,
  'Wapp Number': 12,
```

### 7b. Sheet 1: Active Orders `activeData` mapping (≈ lines 195–238)
The `activeData` array inside `orders.map(...)`. After:
```js
      'Phone No':          o.phone_no || '',
```
Add:
```js
      'Wapp Group':        o.wapp_group  || '',
      'Wapp Number':       o.wapp_number || '',
```

### 7c. Sheet 2: Completed Orders `completedData` mapping (≈ lines 241–280)
The `completedData` array inside `deleted.map(...)`. After:
```js
        'Phone No':           o.phone_no || o.phoneNo || '',
```
Add:
```js
        'Wapp Group':         o.wapp_group  || o.wappGroup  || '',
        'Wapp Number':        o.wapp_number || o.wappNumber || '',
```

**Verify:** Trigger the daily report manually via the "Send Report" button in the dashboard header. Open the received Excel:
- Sheet "Active Orders": columns "Wapp Group" and "Wapp Number" appear after "Phone No", width 8 and 12 respectively.
- Sheet "Completed Orders": same.

---

## Execution order summary

| Step | File | What |
|------|------|------|
| 1 | `api/wapp-columns-migration.sql` | Create migration SQL (run on DB) |
| 2 | `api/index.js` | mapOrder, snakeOrder, GET select, deleted/import |
| 3 | `src/pages/UserManagement.jsx` | ALL_COLUMNS — column permissions UI |
| 4 | `src/components/OrderForm.jsx` | FIELDS, isDropdown, wappGroup select options |
| 5 | `src/pages/Dashboard.jsx` | ALL_COLUMNS, handleImport, handleDeletedImport, ALL_DELETED_COLS |
| 6 | (no change needed) | Template download is export-based |
| 7 | `api/cron-daily-report.js` | COL_WIDTHS, activeData, completedData |

All steps must be deployed together (except Step 1 SQL which runs on the database independently). The SQL migration is safe to run before or after deploying — new columns default to NULL and the code falls back to `|| ''`, so there is no window of breakage.

---

## Notes and assumptions

- **Column position**: Both new columns are inserted **immediately after `phoneNo`** in every array/object where `phoneNo` appears. This keeps them visually adjacent across the table, form, export, and cron report.
- **Wapp Group options stored uppercase**: `YES`, `NO`, `N/A`. The form's `handleSubmit` already calls `.toUpperCase()` on all string fields.
- **Column permissions**: The two new keys (`wappGroup`, `wappNumber`) appear in the permissions grid via `ALL_COLUMNS` in UserManagement. Admin assigns `none/view/edit` per user/group exactly like every other column — no separate rights table needed.
- **Import templates**: The active-orders and completed-orders import handlers will read `'Wapp Group'` and `'Wapp Number'` columns from uploaded Excel files. Existing files without these columns will import without error (they default to `''`).
- **`snakeOrder` and `mapOrder` completeness**: `snakeOrder` is used by POST `/api/orders` (create), PUT `/api/orders/:id` (edit), and the import endpoint — all three will correctly persist the new fields after Step 2.
- **Deleted orders**: The `deleted_orders` table stores order data as a JSONB `data` column, not as typed columns — so no SQL migration is needed for the deleted-orders table. The `wappGroup`/`wappNumber` values will be stored inside the JSONB blob when an order with these fields is moved to completed.
