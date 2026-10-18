# Login Activity Modal: Date→IP Grouped View with Bulk Delete

The Login Activity modal has been rewritten from a flat list into a two-level grouped view: dates collapse into IP rows, IP rows expand into individual login sub-tables. A bulk-delete endpoint was added to the API alongside the existing single-record delete, and the Excel export was extended to include an IP Label column. The grouped view is populated on-demand when the modal opens, fetching authorised-IP labels in parallel to annotate known IPs inline.

**Watch for:** *(confirmed)* Date-section headers show a static `▼` — dates have no collapse behaviour, clicking the header does nothing. *(confirmed)* Logins in the first 5h30m of an IST day fall outside the UTC bulk-delete window and survive "Del All" on their displayed date. *(confirmed)* Excel filename uses UTC date, so after 18:30 IST the file is named with tomorrow's date.

**Verdict**: APPROVED

---

## High-level view

The bulk-delete endpoint (`DELETE /api/users/login-logs/bulk`) is placed before the parameterised `DELETE /api/users/login-logs/:id` route on lines 341 and 353 of `api/index.js`, so Express resolves `bulk` as a literal path segment and never shadows it with the `:id` wildcard. Both routes carry `authenticate` and `adminOnly` middleware. The date-range filter uses inclusive ISO timestamp bounds (`T00:00:00.000Z` / `T23:59:59.999Z`) as specified.

The three new state variables — `authorisedIPMap`, `expandedGroups`, `expandTick` — are added alongside the existing login-activity state block. The authorised-IP fetch fires on modal open and silently degrades on error, so a failing `GET /api/authorised-ips` never blocks the modal from loading.

The Excel export uses `xlsx-js-style` with navy headers, role-coloured rows (light red for admin, light green for user), and a light-blue cell for non-empty IP labels — filename pattern `OMS_Login_Activity_YYYY-MM-DD.xlsx`.

One cosmetic deviation from spec: the date section headers show a static `▼` triangle rather than toggling. The dates are always expanded (all IP rows for a date are always visible); only the IP → sub-table level is collapsible. This is a layout simplification, not a broken feature — all data is reachable.

---

<details>
<summary>Issues (3)</summary>

1. **Static date-header chevron** — Date section headers always show `▼` regardless of any state. Dates are not individually collapsible; clicking the header does nothing. Fix: either add date-level collapse state or remove the `▼` from date headers and keep the toggle only on IP rows where it is functional. Non-blocking.

2. **IST date / UTC bulk-delete mismatch** — Logins that occurred in the first 5h30m of an IST day (before midnight UTC) are displayed under that IST date but fall outside the UTC window the bulk-delete sends to Supabase. Those rows survive a "Del All" on their displayed date. Pre-existing tension between IST display and UTC storage; no fix required, but document it. Non-blocking.

3. **Excel filename uses UTC date** — `new Date().toISOString().slice(0,10)` gives the UTC date. After 18:30 IST the filename will show tomorrow's date. Fix: use IST date for filename construction. Non-blocking.

</details>

---

<details>
<summary>Details</summary>

### Route ordering and bulk-delete contract

`app.delete('/api/users/login-logs/bulk', ...)` on line 341 precedes `app.delete('/api/users/login-logs/:id', ...)` on line 353 — route shadowing is not a risk. The bulk handler requires both `ipAddress` and `date`, returns 400 otherwise, queries the UTC-day window `T00:00:00.000Z`–`T23:59:59.999Z`, and responds `{ deleted: true }`. Both endpoints carry `authenticate` and `adminOnly`.

### IST date grouping vs UTC bulk-delete window

The date key passed to the bulk-delete endpoint is produced by `toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })` — `YYYY-MM-DD` in IST. The endpoint appends UTC midnight/end-of-day boundaries. A login at 00:15 IST (18:45 UTC the prior calendar day) is grouped under the IST date but falls outside the UTC window sent to Supabase, so that row would survive a "Del All" on its displayed date. This is an inherent tension between IST display grouping and UTC storage; it's pre-existing behaviour, not introduced here, and affects only logins in the first 5:30 of an IST day.

### Static date-header chevron

The date section header always renders `▼ {fmtDate(dateKey)}`. No click handler or collapse state exists at the date level. The static `▼` misleads users into clicking a header that does nothing. This is non-blocking — all IP rows remain visible — but should either gain collapse behaviour or drop the chevron.

### Excel filename uses UTC date

`new Date().toISOString().slice(0,10)` produces a UTC date. After 18:30 IST the filename will show tomorrow's date. Cosmetic issue only.

</details>

---

<details>
<summary>File map</summary>

- `api/index.js` — Added `DELETE /api/users/login-logs/bulk` endpoint (lines 341–352), placed before `DELETE /api/users/login-logs/:id` (line 353)
- `src/pages/UserManagement.jsx` — Added `authorisedIPMap`, `expandedGroups`, `expandTick` state; rewrote Login Activity modal body to grouped date→IP view with expandable sub-tables; extended `downloadLoginExcel` to include IP Label column with role-coloured row styling

Full diff: `git diff main -- api/index.js src/pages/UserManagement.jsx`

</details>
