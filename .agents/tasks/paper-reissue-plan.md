# Implementation Plan — Paper Issue Request: Reissue Accept Flow + Action Column Del Button

Goal: two fixes in the OMS Dashboard Paper Issue Request feature. (1) After a reissue is accepted, physical possession and return authorization must belong to the reissue requester (`requested_by`), not the old holder (`issue_to`); plus the All Requests table must show REISSUED status and reissue remarks distinctly. (2) The Del button in the All Requests Action column is sometimes not visible — widen the column and ensure the button renders inline-block.

Project: `d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard` (Vite + React frontend, Express + Supabase backend). Work directly on `main` in this workspace (no worktree).

## Verified facts from exploration

- `server/index.js` mounts `orderRoutes` (`require('./routes/orders.js')`) at `/api/orders`, and the dev server (`npm run dev:server` = `node server/index.js`) listens on port 5000. Vite (`vite.config.js`) proxies `/api` → `http://localhost:5000`. So `server/routes/orders.js` is the backend the dev server actually serves. Confirmed correct target per the brief.
- `src/pages/Dashboard.jsx` is a single large file with very long lines in the paperIssue tab. All six frontend edits are string-replaceable; each find-string below was confirmed UNIQUE in the file.
- There is a second copy of the backend at `portable-app/server/routes/orders.js` (lines 305–308) with a slightly different check (`if (holder !== req.user.username && requester !== req.user.username)`). It is OUT OF SCOPE — do NOT edit it.
- `api/index.js` has NO matching `holder !== actor` / `requested_by || issue_to` return-authorization block (grep returned no matches); it is the production/Vercel entry but the brief scopes the backend change to `server/routes/orders.js` only. Do NOT edit `api/index.js`.
- The reissue popup (`paperIssuePopup`, lines 3174–3189) renders title "Paper Issue Request Pending!" and per-item "Requested by: {getFullName(r.requestedBy)}". `paperIssuePopup`/`myPaperRequests` are populated from `/api/orders/paper-requests/my` (line 449–451), which returns all PENDING requests whose `issue_to` is the current user — this includes reissue requests. For a reissue, `requestedBy` is the reissue requester (D) and the popup is shown to the current holder (C), so "Requested by: D" is accurate and unambiguous. NO EDIT NEEDED (matches the brief's "verify only, no change unless ambiguous").

### Exact code locations (confirmed by reading the files)

- **Dashboard.jsx line 3029** — frontend return-authorization check (inside the Return button `onClick`):
  `if (accepted.issueTo !== actor && accepted.requestedBy !== actor) {`
- **orders.js lines 411–413** — backend return-authorization check (`router.post('/return-requests', ...)`), `actor` defined at line 395:
  `const holder = acceptedReqs[0].requested_by || acceptedReqs[0].issue_to` / `const requester = acceptedReqs[0].requested_by` / `if (holder !== actor && requester !== actor) {`
  (`requester` is used ONLY on line 412; safe to remove.)
- **Dashboard.jsx line 3058** (the All Requests table render, one long line) — three edits live here: the Status cell color ternary, the Rejection Remark cell span, and the Action column th/td.
- **Dashboard.jsx line 3618** — `tblBtn` style definition (does NOT currently have `display:'inline-block'`).

## Verification commands (run from project root `d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard`)

- Frontend compiles: `npx vite build --mode development` — must succeed with no errors.
- Server syntax: `node --check server/routes/orders.js` — must exit 0 / no output.
- Do NOT start the dev server yourself — the user runs `npm run dev` manually for manual UI testing.

---

- [ ] 1. Backend: fix return-authorization check in `server/routes/orders.js` (lines 411–413) to only count `requested_by` as the physical holder after reissue.
      Files: `server/routes/orders.js`
      FIND (exact 3 lines, 2-space indent — unique to the `/return-requests` handler; the `currentHolder`/`issuedTo` variants use different names):
      ```
        const holder = acceptedReqs[0].requested_by || acceptedReqs[0].issue_to
        const requester = acceptedReqs[0].requested_by
        if (holder !== actor && requester !== actor) {
      ```
      REPLACE with (2 lines):
      ```
        const holder = acceptedReqs[0].requested_by
        if (holder !== actor) {
      ```
      Leave the following error-message line unchanged: `return res.status(400).json({ error: `Order ${orderNo} paper is with ${holder.toUpperCase()}, only they can submit a return request` })`.
      Verify: `node --check server/routes/orders.js` — exits 0 (no syntax errors).

- [ ] 2. Frontend: fix return-authorization check in `src/pages/Dashboard.jsx` (line 3029, inside the Return button `onClick`) to only count `accepted.requestedBy` as the holder.
      Files: `src/pages/Dashboard.jsx`
      FIND (exact, unique):
      ```
      if (accepted.issueTo !== actor && accepted.requestedBy !== actor) {
      ```
      REPLACE with:
      ```
      if (accepted.requestedBy !== actor) {
      ```
      Leave the next error-message line (`errors.push(`...Paper is with ${getFullName(accepted.requestedBy || accepted.issueTo)}, only they can return`)`) unchanged.
      Verify: `npx vite build --mode development` — frontend compiles.

- [ ] 3. Frontend: add a REISSUED branch to the Status cell color ternary in the All Requests table (`src/pages/Dashboard.jsx`, line 3058) so REISSUED statuses show purple (#8e44ad) instead of falling through to rejection red.
      Files: `src/pages/Dashboard.jsx`
      FIND (exact substring of the Status `<td>` color — unique to `r.status`):
      ```
      r.status === 'ISSUE' ? '#e74c3c' : (r.status||'').startsWith('REROUTED') ? '#8e44ad' : '#e74c3c'
      ```
      REPLACE with:
      ```
      r.status === 'ISSUE' ? '#e74c3c' : (r.status||'').startsWith('REROUTED') ? '#8e44ad' : (r.status||'').startsWith('REISSUED') ? '#8e44ad' : '#e74c3c'
      ```
      Verify: `npx vite build --mode development` — frontend compiles.

- [ ] 4. Frontend: change the Rejection Remark cell in the All Requests table (`src/pages/Dashboard.jsx`, line 3058) so a remark starting with `REISSUE BY` shows a green "Reissued by:" label with the prefix stripped, instead of the orange "ISSUE (R):" label.
      Files: `src/pages/Dashboard.jsx`
      FIND (exact, unique — the `r.rejectRemarks` span):
      ```
      if (r.rejectRemarks) parts.push(<span key='i' style={{color:'#8e44ad'}}>ISSUE (R): {r.rejectRemarks}</span>);
      ```
      REPLACE with:
      ```
      if (r.rejectRemarks) parts.push(<span key='i' style={{color:(r.rejectRemarks.startsWith('REISSUE BY')?'#27ae60':'#8e44ad')}}>{r.rejectRemarks.startsWith('REISSUE BY')?('Reissued by: '+r.rejectRemarks.replace(/^REISSUE BY /,'')):('ISSUE (R): '+r.rejectRemarks)}</span>);
      ```
      Leave the second span (`if (ret && ret.rejectRemarks) parts.push(<span key='r' ...>RETURN (R): ...`) unchanged.
      Verify: `npx vite build --mode development` — frontend compiles.

- [ ] 5. Frontend: widen the All Requests Action column so the Del button is always visible (`src/pages/Dashboard.jsx`, line 3058) by adding `minWidth:'60px'` to its `th` and `td`.
      Files: `src/pages/Dashboard.jsx`
      5a. FIND (exact, unique — "Rejection Remark" only appears in this table head):
      ```
      Rejection Remark</th><th style={styles.th}>Action</th>
      ```
      REPLACE with:
      ```
      Rejection Remark</th><th style={{...styles.th,minWidth:'60px'}}>Action</th>
      ```
      5b. FIND (exact, unique — only the All Requests Action `<td>` is guarded by `r.status==='PENDING'&&(r.requestedBy===user.username||isAdmin)`):
      ```
      <td style={{...styles.td,whiteSpace:'nowrap'}}>{r.status==='PENDING'&&(r.requestedBy===user.username||isAdmin)&&<button
      ```
      REPLACE with:
      ```
      <td style={{...styles.td,whiteSpace:'nowrap',minWidth:'60px'}}>{r.status==='PENDING'&&(r.requestedBy===user.username||isAdmin)&&<button
      ```
      Do NOT touch the `myPaperRequests` / `myReturnRequests` Action cells (they use `<td style={{...styles.td,whiteSpace:'nowrap'}}>` followed by an `Accept`/`Reject` button, no `minWidth`).
      Verify: `npx vite build --mode development` — frontend compiles.

- [ ] 6. Frontend: ensure the Del button is not hidden by overflow by adding `display:'inline-block'` to the `tblBtn` style definition (`src/pages/Dashboard.jsx`, line 3618).
      Files: `src/pages/Dashboard.jsx`
      FIND (exact, unique):
      ```
      tblBtn: { padding: '3px 6px', background: '#2980b9', color: '#fff', border: 'none', borderRadius: '3px', fontSize: '10px', cursor: 'pointer', marginRight: '3px' },
      ```
      REPLACE with:
      ```
      tblBtn: { padding: '3px 6px', background: '#2980b9', color: '#fff', border: 'none', borderRadius: '3px', fontSize: '10px', cursor: 'pointer', marginRight: '3px', display: 'inline-block' },
      ```
      Verify: `npx vite build --mode development` — frontend compiles.

- [ ] 7. Verify the reissue popup label is clear (NO code edit required).
      Files: none (inspection only).
      Confirm `paperIssuePopup` (Dashboard.jsx lines 3174–3189) renders per-item "Requested by: {getFullName(r.requestedBy)}" and is populated from `/api/orders/paper-requests/my` (line 449–451), which already includes pending reissue requests (issue_to = current user). For a reissue, `requestedBy` is the requester and the popup is shown to the current holder, so the label is accurate and unambiguous. No change needed.
      Verify: visual/inspection only — confirm no edit was made here; the existing label is clear.

- [ ] 8. Full verification pass.
      Files: none.
      Verify: from `d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard` run `node --check server/routes/orders.js` (exits 0) AND `npx vite build --mode development` (compiles with no errors). Then the user starts `npm run dev` and manually confirms: after a reissue accept, only the new holder (reissue requester) can return; the All Requests table shows REISSUED status in purple and "Reissued by:" in green; the Del button is visible in the Action column.

## Notes / assumptions

- The brief explicitly scopes the backend change to `server/routes/orders.js`. The `portable-app/server/routes/orders.js` copy and `api/index.js` are NOT edited (the brief says do not change any behavior beyond the listed edits). If the user later wants the portable/production copies in sync, that is a separate request.
- The error messages in both the frontend (item 2) and backend (item 1) return-authorization checks are left verbatim per the brief; only the holder/condition logic changes. The frontend message still references `accepted.requestedBy || accepted.issueTo` for the holder name display — left as-is to avoid touching behavior beyond the specified edits.
- `requester` (orders.js line 412) was confirmed used only in the removed `if` condition, so deleting its declaration is safe.
- All REISSUED and REROUTED statuses share the purple #8e44ad as specified; REISSUED is inserted as its own branch so the final `#e74c3c` else remains for genuine rejections.
- The reissue remark prefix stripped is `REISSUE BY ` (with trailing space) per the brief; `replace(/^REISSUE BY /,'')` removes exactly that leading prefix. Gated on `startsWith('REISSUE BY')` so non-reissue remarks keep the orange "ISSUE (R):" label.
- ISSUE 2's "ensure Del not hidden by overflow" is satisfied by the `minWidth:'60px'` on the Action th/td (item 5) plus `display:'inline-block'` on `tblBtn` (item 6). The Action `<td>` already has `whiteSpace:'nowrap'` so buttons stay on one line. No other overflow change is made, per "do not change other behavior."
