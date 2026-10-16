# Implementation Plan — Admin "Request on behalf of" for Paper Issue / Return

Goal: when an admin is logged in, allow picking a second user ("Request on behalf of") on BOTH the Paper Issue form and the Return form. That behalf user becomes the effective requester (`requested_by` = the paper holder), and the admin who placed it is recorded in a new nullable column `placed_by_admin`. In every requester display (report screen, OR export/print, daily Excel), show `<behalf user full name> (admin)`. Non-admin behavior is unchanged; the server must ignore `onBehalfOf` from non-admins.

Project: `d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard`. Work on `main` in this workspace (no worktree).
Backends: `api/index.js` is production; mirror the same logic in `server/routes/orders.js`.

Verified facts from exploration:
- `api/index.js` POST handlers are single minified lines: paper-requests at line 339, return-requests at line 351; `/all` mappers at line 337 (paper) and line 350 (return). `req.user.role === 'admin'` identifies admins; `req.user.username` is the actor.
- `server/routes/orders.js`: paper POST ~line 258, return POST ~line 390, `mapPaperReq(r)` defined ~line 739 (adds `requestedBy`, `issueTo`, ...). Return `/all` mapper ~line 380 is inline.
- `server/setupSupabase.js` has CREATE TABLE for `paper_requests` and `return_requests` (printSQL function).
- `api/cron-daily-report.js` "Paper Issue Report" sheet builds `paperData` ~line 109; requester cell is `'Requested By': r.requested_by || ''` at line 112.
- `src/pages/Dashboard.jsx`: `isAdmin = user.role === 'admin'` at line 193; state block lines 128–146; Issue form ~2890+, Return form ~2923+, All Requests table ~2975. Status strings `ISSUED TO ${getFullName(latestIssue.requestedBy || latestIssue.requested_by)}` at lines 1217 (export), 1431 (print), 2711 (on-screen). OR export "Requested By" at line 1238; print "Requested By" at line 1470; OR on-screen "Requested By" at line 2776. The return pre-check already shows holder via `getFullName(accepted.requestedBy || accepted.issueTo)` — must NOT regress.

Verification commands (run from project root `d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard`):
- `npm run build` — Vite build succeeds.
- `node --check api/index.js`
- `node --check api/cron-daily-report.js`
- `node --check server/routes/orders.js`

---

- [ ] 1. Create the single idempotent migration file adding `placed_by_admin TEXT` to both tables, and add the column to the CREATE TABLE definitions.
      Create `api/behalf-of-migration.sql` with exactly:
      `ALTER TABLE paper_requests ADD COLUMN IF NOT EXISTS placed_by_admin TEXT;`
      `ALTER TABLE return_requests ADD COLUMN IF NOT EXISTS placed_by_admin TEXT;`
      In `server/setupSupabase.js` printSQL(), add `placed_by_admin TEXT,` to both the `paper_requests` and `return_requests` CREATE TABLE blocks (place after `status`/`reject_remarks` line, before `created_at`).
      Files: `api/behalf-of-migration.sql` (new), `server/setupSupabase.js`
      MANUAL STEP (do NOT run from the workflow): the user must run `api/behalf-of-migration.sql` once in the Supabase SQL editor. One file, both ALTERs together.
      Verify: `node --check server/setupSupabase.js`; confirm `api/behalf-of-migration.sql` contains both ALTER statements.

- [ ] 2. Backend: accept `onBehalfOf` in POST /api/orders/paper-requests (api/index.js line 339) with admin-gated effective requester.
      Read `onBehalfOf` from `req.body`. Compute `const effectiveRequester = (req.user.role === 'admin' && onBehalfOf) ? onBehalfOf : req.user.username;` and `const placedByAdmin = (req.user.role === 'admin' && onBehalfOf) ? req.user.username : null;`. Use `effectiveRequester` for `requested_by` in the insert and add `placed_by_admin: placedByAdmin`. The "already pending/issued for this requester" guard is keyed on order (`order_no`) + `issue_to`/`status`, which is unchanged; do not weaken it. Non-admin `onBehalfOf` is ignored by the admin gate.
      Files: `api/index.js`
      Verify: `node --check api/index.js`.

- [ ] 3. Backend: accept `onBehalfOf` in POST /api/orders/return-requests (api/index.js line 351) with admin-gated effective actor.
      Read `onBehalfOf`. Compute `effectiveRequester`/`placedByAdmin` as in item 2. For the holder-validation block, treat the behalf user as the actor: compute `const actor = (req.user.role === 'admin' && onBehalfOf) ? onBehalfOf : req.user.username;` and change the guard to `if (holder !== actor && requester !== actor)`. Keep the existing holder error message `Order ${orderNo} paper is with ${holder.toUpperCase()}, only they can submit a return request` (do not regress). Insert with `requested_by: effectiveRequester, placed_by_admin: placedByAdmin`.
      Files: `api/index.js`
      Verify: `node --check api/index.js`.

- [ ] 4. Backend: update both /all mappers in api/index.js to expose `placedByAdmin`.
      In paper-requests/all (line 337) and return-requests/all (line 350) map objects, add `placedByAdmin: r.placed_by_admin`.
      Files: `api/index.js`
      Verify: `node --check api/index.js`.

- [ ] 5. Mirror items 2–4 in server/routes/orders.js.
      In paper POST (~258): read `onBehalfOf`, apply the same admin-gated `effectiveRequester`/`placedByAdmin`, set `requested_by` + `placed_by_admin` in insert. In return POST (~390): same, plus `actor` in the holder guard, keep the holder message. In `mapPaperReq` (~739) add `placedByAdmin: r.placed_by_admin`. In the inline return-requests/all mapper (~380) add `placedByAdmin: r.placed_by_admin`. Also add `placedByAdmin: r.placed_by_admin` to the return POST response map if it maps (currently returns `data[0]` raw — leave the raw response but ensure `/all` mapper carries it).
      Files: `server/routes/orders.js`
      Verify: `node --check server/routes/orders.js`.

- [ ] 6. Daily report: show `(admin)` on the requester cell in api/cron-daily-report.js.
      In `paperData` map (line 109), change `'Requested By': r.requested_by || ''` to `'Requested By': (r.requested_by || '') + (r.placed_by_admin ? ' (admin)' : '')`. Only touch the requester cell; leave Issue To and others alone. (Full-name resolution is not available in this sheet today — it already uses raw usernames — so append the marker to the existing value; do not introduce a name lookup unless one already exists in the file.)
      Files: `api/cron-daily-report.js`
      Verify: `node --check api/cron-daily-report.js`.

- [ ] 7. Frontend state + requesterLabel helper (Dashboard.jsx).
      Add state near lines 128–146: `paperBehalfOf`/`setPaperBehalfOf` (''), `paperBehalfSearch`/`setPaperBehalfSearch` (''), `showPaperBehalfDrop`/`setShowPaperBehalfDrop` (false); and `returnBehalfOf`/`setReturnBehalfOf`, `returnBehalfSearch`/`setReturnBehalfSearch`, `showReturnBehalfDrop`/`setShowReturnBehalfDrop`. Add a helper near other helpers: `const requesterLabel = (r) => getFullName(r.requestedBy || r.requested_by) + ((r.placedByAdmin || r.placed_by_admin) ? ' (admin)' : '')`.
      Files: `src/pages/Dashboard.jsx`
      Verify: `npm run build` succeeds.

- [ ] 8. Frontend Issue form: admin-only "Request on behalf of" autocomplete + wire into POST.
      In the Issue form (~2890), BEFORE the existing "Request To" field, render (only when `isAdmin`) an autocomplete mirroring the "Request To" one but bound to `paperBehalfSearch`/`paperBehalfOf`/`showPaperBehalfDrop`, placeholder "Request on behalf of...". Filter `allUsers` excluding `user.username`. In the Issue button handler: when `isAdmin && paperBehalfOf`, include `onBehalfOf: paperBehalfOf` in the POST body, and the duplicate pre-check `r.requestedBy === user.username` must compare against `(isAdmin && paperBehalfOf) ? paperBehalfOf : user.username`. On success reset `paperBehalfOf`/`paperBehalfSearch` alongside the existing resets.
      Files: `src/pages/Dashboard.jsx`
      Verify: `npm run build` succeeds.

- [ ] 9. Frontend Return form: admin-only "Return on behalf of" autocomplete + wire into POST (no regression of holder message).
      In the Return form (~2923), BEFORE the "Return To" field, render (only when `isAdmin`) an autocomplete bound to `returnBehalfSearch`/`returnBehalfOf`/`showReturnBehalfDrop`, placeholder "Return on behalf of...". In the Return button handler: compute `const actor = (isAdmin && returnBehalfOf) ? returnBehalfOf : user.username` and change the client pre-check to `if (accepted.issueTo !== actor && accepted.requestedBy !== actor)`, keeping the existing message `Paper is with ${getFullName(accepted.requestedBy || accepted.issueTo)}, only they can return` (do NOT regress the full-name holder message). When `isAdmin && returnBehalfOf`, include `onBehalfOf: returnBehalfOf` in the POST. On success reset `returnBehalfOf`/`returnBehalfSearch`.
      Files: `src/pages/Dashboard.jsx`
      Verify: `npm run build` succeeds.

- [ ] 10. Frontend report rendering: use requesterLabel in all requester displays.
      Replace requester rendering with `requesterLabel(...)`:
      - All Requests table "Requested By" cell (~2976): `getFullName(r.requestedBy)` -> `requesterLabel(r)`.
      - OR Issue Report on-screen "Requested By" (~2776): `getFullName(pr.requestedBy || pr.requested_by)` -> `requesterLabel(pr)`.
      - Status strings at 1217, 1431, 2711: `ISSUED TO ${getFullName(latestIssue.requestedBy || latestIssue.requested_by)}` -> `ISSUED TO ${requesterLabel(latestIssue)}`.
      - OR export "Requested By" (~1238): `getFullName(pr.requestedBy || pr.requested_by)` -> `requesterLabel(pr)`.
      - OR print "Requested By" (~1470): `getFullName(pr.requestedBy||pr.requested_by)` -> `requesterLabel(pr)`.
      Leave all target ("Issued By" / "Return To") cells as plain `getFullName(...)`. Do NOT change the `orTabUserSearch` filter lines (search over plain names is fine).
      Files: `src/pages/Dashboard.jsx`
      Verify: `npm run build` succeeds.

- [ ] 11. Full verification pass.
      Files: none.
      Verify: `npm run build`; `node --check api/index.js`; `node --check api/cron-daily-report.js`; `node --check server/routes/orders.js` — all succeed.

## Notes / assumptions
- The daily report sheet currently shows raw usernames (no full-name map in that file), so item 6 appends `(admin)` to the existing raw value rather than introducing a name lookup, matching the "only touch the requester cell" instruction.
- The return POST in both backends still returns `data[0]` raw; the `(admin)` marker surfaces via the `/all` mappers that the report screens consume. No change needed to the raw POST response.
- `onBehalfOf` is admin-gated server-side in BOTH backends, so a non-admin sending `onBehalfOf` is ignored (never sets `requested_by` to someone else).

## Addendum — Admin BACK-DATE for Issue/Return requests (added mid-implementation)
Requirement: an admin (on-behalf-of OR normal) may choose a back date for a paper Issue request or a Return request instead of being forced to today. Non-admins: unchanged, server default date (now).

Backend (DONE in FEAT-001, both `api/index.js` and `server/routes/orders.js`):
- `POST /api/orders/paper-requests` and `POST /api/orders/return-requests` accept an optional `requestDate` (YYYY-MM-DD) in the body.
- When `req.user.role === 'admin'` AND `requestDate` parses as a valid date, the insert explicitly sets `created_at` to that date (ISO). Otherwise the DB default `now()` is used. Validated server-side (`!isNaN(new Date(requestDate).getTime())`) and ignored for non-admins — the client is never trusted.
- No new column / no migration needed: `created_at` already exists and drives the report dates (OR Issue Report uses `acceptedAt || createdAt`; daily Excel reads `created_at`), so the back date surfaces in reports automatically. Sorting by `id`/date is unaffected.

Frontend (TODO in FEAT-002, `src/pages/Dashboard.jsx`):
- On BOTH the Issue form (~2890) and Return form (~2923), when `isAdmin`, show an optional `type=date` input (label e.g. "Request Date (optional)" / back date) with its own state; hidden for non-admins.
- When the admin picks a date, include `requestDate: <YYYY-MM-DD>` in the respective POST body (empty = today). Reset the date state on submit success alongside the on-behalf-of resets.
