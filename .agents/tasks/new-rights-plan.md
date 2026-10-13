# Implementation Plan — one new grantable right (`canEditReceipt`) + fix existing `canEditCompleted` enforcement

## CORRECTION (supersedes the original Right-A plan below)
User tested the current build: a user with the EXISTING `canEditCompleted` right could SEE the completed/deleted Edit button but got "Admin only" on save, because `PUT /api/orders/deleted/:id/update` was `adminOnly`. User chose "Option 2": the completed/deleted edit must be controlled by the EXISTING `can_edit_completed` right — NOT by a brand-new right.

So the plan is revised:
- **Right A (`canEditCompletedOrder`/`can_edit_completed_order`) is DROPPED entirely.** No new DB column, no login/users/groups/UserManagement wiring, no Dashboard constant, not in the migration.
- Instead, **fix the existing right's enforcement**: open `PUT /api/orders/deleted/:id/update` to admins OR users with `can_edit_completed` (via the shared `userHasRight` DB-lookup helper), in both `api/index.js` and `server/routes/orders.js`. The Dashboard Edit button stays gated on `canEditCompleted`; the `OrderForm` `allowCompletedEdit` prop stays `canEditCompleted`. Restore + Permanent Delete stay admin-only.
- **Right B (`canEditReceipt`) is unchanged** and implemented in full (below).

Net: only ONE new right (`can_edit_receipt`) is created. The migration only needs the two `can_edit_receipt` ALTERs (users + groups).

## Goal (ORIGINAL — Right A superseded by the correction above)
Add TWO brand-new independent boolean user/group rights and gate two button-sets plus their backend endpoints on them:

- **Right A — `canEditCompletedOrder`** (DB column `can_edit_completed_order`): gates the Completed/Deleted-orders tab **Edit** button + the deleted-order edit *form* + the deleted-order **update endpoint**. This is a NEW right, completely separate from the existing `can_edit_completed`/`canEditCompleted`. The existing right and ALL its other uses (daily-report deleted-row editing via `restrictToFields`, etc.) stay exactly as they are.
- **Right B — `canEditReceipt`** (DB column `can_edit_receipt`): gates BOTH the receipt **Edit** and **Delete** buttons in `PaymentForm.jsx` and BOTH backend endpoints (payment update + payment delete). One right covers both.

Admins always have both implicitly via the established `const canX = isAdmin || user.canX` pattern. An admin can grant each right to a non-admin from User Management (and via Groups); only then does that user see/use the buttons.

Template to copy at every site: **`can_edit_completed` / `canEditCompleted`** (the canonical end-to-end right).

## Key facts verified by reading the code
- **Two real backends**, BOTH carry the full rights pattern and BOTH must be edited:
  - `api/index.js` — the deployed Vercel serverless backend (condensed one-liners).
  - `server/routes/auth.js`, `server/routes/users.js`, `server/routes/orders.js`, `server/setupSupabase.js` — the local/non-deployed Express backend. `server/index.js` wires these routers. Keep them consistent.
- **`portable-app/server/...` is a separate bundled copy and is OUT OF SCOPE** — the task names only `server/` and `api/`. Do not edit `portable-app/`.
- **JWT only carries `{ id, username, role }`** (`generateToken` in both `api/index.js` ~line 54 and `server/middleware/auth.js`). `authenticate` sets `req.user = decoded`, so the new rights are NOT on `req.user`. Backend gates MUST look the right up in the DB by `req.user.id`. Precedent already exists: `server/routes/orders.js` `DELETE /:id` (~line 503) does `supabase.from('users').select('can_delete, role').eq('id', req.user.id)`. **Decision: add a small shared async helper `userHasRight(req, columnName)` in each backend** that returns `true` for admins or when the user's DB column is `true`; use it in all three gated handlers per backend.
- Build command: **`npm run build`** (= `vite build`) from `d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard`. There is NO test framework. Backend files are plain CommonJS/ESM run by Node, so verify them with **`node --check <file>`**. Grep is used only to confirm presence at every site, never as the sole verification.
- Note the param name differs between backends for payment routes: `api/index.js` uses `:pid`; `server/routes/orders.js` uses `:paymentId`. Preserve each file's existing name.
- In `server/routes/orders.js` BOTH payment update and payment delete are already `adminOnly`. In `api/index.js` the payment UPDATE is `adminOnly` but the payment DELETE currently has NO gate (only `authenticate`) — adding the `can_edit_receipt`-or-admin gate there intentionally *tightens* a previously-open endpoint (desired).
- `migratePercentReceived.js`/`seedData.js` do not touch these columns — no change needed there.

## Decision: the deleted-order edit FORM (`allowCompletedEdit`)
`Dashboard.jsx` renders ONE `<OrderForm>` instance (~line 3236) and passes `allowCompletedEdit={canEditCompleted}` plus `isDeleted={editingDeleted}`. `OrderForm.jsx` uses `allowCompletedEdit` only on the `isDeleted` path (field visibility ~line 227 and editability ~line 270). The Completed-tab Edit button opens this form with `editingDeleted=true`. To move deleted-order editing onto the new right **without** disturbing the daily-report path, change the prop to:
`allowCompletedEdit={editingDeleted ? canEditCompletedOrder : canEditCompleted}`.
This keeps `OrderForm.jsx` itself unchanged and leaves `canEditCompleted` governing the non-deleted (daily-report `restrictToFields`) path exactly as before.

## Access matrix to verify at the end
| Actor | Completed-tab Edit btn + form + `PUT /orders/deleted/:id/update` | Restore / Permanent Delete | Receipt Edit+Delete btns + payment update/delete endpoints |
|---|---|---|---|
| admin | allowed | allowed | allowed |
| user with `can_edit_completed_order` only | allowed | **denied (admin-only)** | denied |
| user with `can_edit_receipt` only | denied | denied | allowed |
| user with existing `can_edit_completed` only | **denied** (new right required) | denied | denied |
| user with none | denied | denied | denied |

---

# Steps

- [ ] 1. Add both new columns to the schema definitions.
      Add `can_edit_completed_order BOOLEAN DEFAULT false` and `can_edit_receipt BOOLEAN DEFAULT false` to BOTH the `users` CREATE TABLE and the `groups` CREATE TABLE, placed right after the `can_edit_daily` line in each (mirror the `can_edit_completed` placement).
      Files: `server/setupSupabase.js`
      Verify: `node --check server/setupSupabase.js` passes; `npm run build` still succeeds (schema file is not bundled, so build is just a regression guard). Grep confirms 2 new columns in each of the two CREATE TABLE blocks.

- [ ] 2. Create the idempotent migration SQL file (do NOT run it).
      New file following the `api/permissions-migration.sql` style (header comment that it is run once in Supabase SQL Editor, safe to re-run). Contents: `ALTER TABLE users ADD COLUMN IF NOT EXISTS can_edit_completed_order BOOLEAN DEFAULT false;`, same for `can_edit_receipt`, and the same two ALTERs on `groups` (4 statements total).
      Files: `api/new-rights-migration.sql` (create)
      Verify: file exists with all four `ADD COLUMN IF NOT EXISTS` statements (grep for both column names × both tables). Flag to the user in the final summary that this migration must be run manually in Supabase before the rights work in production.

- [ ] 3. Wire both new rights into the deployed backend login response (`api/index.js`).
      In the `/api/auth/login` `res.json({ token, user: {...} })` (~line 121), after `canEditCompleted: isAdmin || grAny('can_edit_completed')` add `canEditCompletedOrder: isAdmin || grAny('can_edit_completed_order')` and `canEditReceipt: isAdmin || grAny('can_edit_receipt')`, using the same `grAny` helper the neighboring new-style rights use.
      Files: `api/index.js`
      Verify: `node --check api/index.js` passes. Grep confirms both `canEditCompletedOrder` and `canEditReceipt` appear in the login response object.

- [ ] 4. Wire both new rights into the deployed backend users GET/POST/PUT (`api/index.js`).
      `GET /api/users` (~line 167): add `can_edit_completed_order,can_edit_receipt` to the `.select(...)` column list and add `canEditCompletedOrder:u.can_edit_completed_order, canEditReceipt:u.can_edit_receipt` to the mapped output. `POST /api/users` (~line 168): add `can_edit_completed_order:req.body.canEditCompletedOrder||false, can_edit_receipt:req.body.canEditReceipt||false` to the insert object (follow the `req.body.canColor` style since these fields are read off `req.body`, not destructured). `PUT /api/users/:id` (~line 169): add the same two to the update object.
      Files: `api/index.js`
      Verify: `node --check api/index.js` passes. Grep confirms both snake_case columns appear in the select, insert, and update of the users routes and both camelCase keys appear in the GET mapping.

- [ ] 5. Wire both new rights into the deployed backend groups POST/PUT (`api/index.js`).
      `POST /api/users/groups` and `PUT /api/users/groups/:id` (~lines 175-176): after the `can_edit_completed`/`can_edit_daily` destructure-with-fallback lines, add `const can_edit_completed_order=b.can_edit_completed_order??b.canEditCompletedOrder;` and `const can_edit_receipt=b.can_edit_receipt??b.canEditReceipt;`, and add `can_edit_completed_order:can_edit_completed_order||false, can_edit_receipt:can_edit_receipt||false` to BOTH the insert and the update row objects. (`GET /api/users/groups` does `select('*')`, so no column list to extend.)
      Files: `api/index.js`
      Verify: `node --check api/index.js` passes. Grep confirms both new columns appear in both the groups insert and the groups update.

- [ ] 6. Add the shared `userHasRight` helper and gate the three endpoints in the deployed backend (`api/index.js`).
      Add a module-level helper near `adminOnly` (~line 94): `async function userHasRight(req, col){ if(req.user.role==='admin') return true; const { data } = await supabase.from('users').select(col).eq('id', req.user.id); return !!(data?.[0]?.[col]) }`. Then: change `PUT /api/orders/deleted/:id/update` (~line 218) from `adminOnly` to an inline guard — remove the `adminOnly` middleware and at the top of the handler `if(!(await userHasRight(req,'can_edit_completed_order'))) return res.status(403).json({error:'No permission'})`. Do the same for `PUT /api/orders/:id/payments/:pid` (~line 224) with `can_edit_receipt`. For `DELETE /api/orders/:id/payments/:pid` (~line 225, currently only `authenticate`) ADD the same `can_edit_receipt` guard at the top of the handler (keep `authenticate`).
      Files: `api/index.js`
      Verify: `node --check api/index.js` passes. Grep confirms `userHasRight` is defined once and called in all three handlers with the correct column names; confirm `adminOnly` was removed from the deleted-update and payment-update routes.

- [ ] 7. Mirror the login response in the local backend (`server/routes/auth.js`).
      After `canEditCompleted: isAdminRole ? true : getUserRight('can_edit_completed')` add `canEditCompletedOrder: isAdminRole ? true : getUserRight('can_edit_completed_order'),` and `canEditReceipt: isAdminRole ? true : getUserRight('can_edit_receipt'),` using the existing `getUserRight` helper.
      Files: `server/routes/auth.js`
      Verify: `node --check server/routes/auth.js` passes. Grep confirms both new keys in the login response.

- [ ] 8. Mirror users GET/POST/PUT in the local backend (`server/routes/users.js`).
      `GET /` : add `can_edit_completed_order, can_edit_receipt` to the `.select(...)` list and `canEditCompletedOrder: u.can_edit_completed_order, canEditReceipt: u.can_edit_receipt` to the mapped object. `POST /` insert: add `can_edit_completed_order: req.body.canEditCompletedOrder || false, can_edit_receipt: req.body.canEditReceipt || false`. `PUT /:id`: follow the `if (req.body.canColor !== undefined) updates.can_color = ...` pattern — add `if (req.body.canEditCompletedOrder !== undefined) updates.can_edit_completed_order = req.body.canEditCompletedOrder` and the same for `canEditReceipt`.
      Files: `server/routes/users.js`
      Verify: `node --check server/routes/users.js` passes. Grep confirms both columns in select/insert/update and both camelCase keys in the GET mapping.

- [ ] 9. Mirror groups POST/PUT in the local backend (`server/routes/users.js`).
      `POST /groups`: after the `can_edit_completed`/`can_edit_daily` fallback consts add `const can_edit_completed_order = req.body.can_edit_completed_order ?? req.body.canEditCompletedOrder` and the receipt equivalent, and add `can_edit_completed_order: can_edit_completed_order || false, can_edit_receipt: can_edit_receipt || false` to the insert. `PUT /groups/:id`: add the two fallback consts and the matching `if (xEditCompletedOrder !== undefined) updates.can_edit_completed_order = ...` / receipt lines, mirroring the existing `gEditCompleted`/`gEditDaily` block.
      Files: `server/routes/users.js`
      Verify: `node --check server/routes/users.js` passes. Grep confirms both new columns in the groups insert and the groups update.

- [ ] 10. Add the shared helper and gate the three endpoints in the local backend (`server/routes/orders.js`).
      Add a helper (top of file after the imports, or reuse the inline DB-lookup pattern already used by `DELETE /:id` ~line 503): `async function userHasRight(req, col){ if(req.user.role==='admin') return true; const { data } = await supabase.from('users').select(col).eq('id', req.user.id); return !!(data?.[0]?.[col]) }`. Change `PUT /deleted/:id/update` (~line 152) from `adminOnly` to an inline `can_edit_completed_order` guard. Change `PUT /:id/payments/:paymentId` (~line 545, currently `adminOnly`) to an inline `can_edit_receipt` guard. Change `DELETE /:id/payments/:paymentId` (~line 556, currently `adminOnly`) to an inline `can_edit_receipt` guard. (Note: here the param is `:paymentId`, not `:pid`.)
      Files: `server/routes/orders.js`
      Verify: `node --check server/routes/orders.js` passes. Grep confirms `userHasRight` used in all three handlers with the right columns and that `adminOnly` was removed from those three routes.

- [ ] 11. Add both new fields to UserManagement form/group state and group-apply handlers (`src/pages/UserManagement.jsx`).
      Add `canEditCompletedOrder: false, canEditReceipt: false` conceptually to the user `form` and `groupForm` initial objects (these objects omit several rights and rely on `|| false`, so adding them is optional for correctness but add them for clarity/consistency with how `canEditCompleted` flows). In `applyGroupRights`, `resetToGroupRights`, the per-user Edit onClick (`setForm({... canEditCompleted:...})` ~line 135), and the group-list Edit onClick (`setGroupForm({... canEditCompleted:...})` ~line 228): add parallel spreads `canEditCompletedOrder: g.canEditCompletedOrder || g.can_edit_completed_order || false` and `canEditReceipt: g.canEditReceipt || g.can_edit_receipt || false` (for user-from-group) and `g.canEditCompletedOrder||g.can_edit_completed_order||false` style for the group editor. In `handleSubmit` user PUT payload (~line 88) add `canEditCompletedOrder: form.canEditCompletedOrder, canEditReceipt: form.canEditReceipt` (user create uses `axios.post('/api/users', form)` so the whole form is sent — no extra change there). The group create/update send `groupForm`/`groupForm` wholesale, so the checkbox state added in step 12 flows automatically.
      Files: `src/pages/UserManagement.jsx`
      Verify: `npm run build` succeeds. Grep confirms `canEditCompletedOrder` and `canEditReceipt` appear in both group-apply handlers, both Edit onClick handlers, and the user PUT payload.

- [ ] 12. Add the two permission checkboxes to both the user form and the group form (`src/pages/UserManagement.jsx`).
      In the user-form rights block (after the `Edit Completed` checkbox ~line 174, before/around `Edit Daily Report`): add `<label style={s.tl}><input type="checkbox" checked={form.canEditCompletedOrder||false} onChange={e=>setForm({...form,canEditCompletedOrder:e.target.checked})}/><span>Edit Completed Order</span></label>` and a second one bound to `canEditReceipt` with label `Edit/Delete Receipt`. Add the SAME two checkboxes to the group-form rights block (after the group `Edit Completed` checkbox ~line 247) bound to `groupForm.canEditCompletedOrder` / `groupForm.canEditReceipt`.
      Files: `src/pages/UserManagement.jsx`
      Verify: `npm run build` succeeds. Grep confirms 2 new checkboxes in the user form and 2 in the group form (4 occurrences each of the two new field names across the checkbox blocks).

- [ ] 13. Gate the Completed/Deleted-tab Edit button on the new right (`src/pages/Dashboard.jsx`).
      Add `const canEditCompletedOrder = isAdmin || user.canEditCompletedOrder` next to the existing `const canEditCompleted = ...` (~line 203). Change the deleted-tab Action `<th>` gate (~line 2185) from `(isAdmin || canEditCompleted)` to `(isAdmin || canEditCompletedOrder)`; change the Action `<td>` wrapper condition (~line 2238) the same way; change the **Edit** `<button>` gate (~line 2240) to `(isAdmin || canEditCompletedOrder)`. Leave the **Restore** (~line 2242) and **Permanent Delete** (~line 2243) buttons as `isAdmin`-only — so a non-admin with only the new right sees ONLY Edit. Do NOT alter the existing `canEditCompleted` constant or its other uses.
      Files: `src/pages/Dashboard.jsx`
      Verify: `npm run build` succeeds. Grep confirms `canEditCompletedOrder` is defined once and used at the `<th>`, the `<td>` wrapper, and the Edit button; confirm Restore/Permanent still reference `isAdmin`.

- [ ] 14. Route the deleted-order edit FORM through the new right (`src/pages/Dashboard.jsx`).
      Change the `<OrderForm ... allowCompletedEdit={canEditCompleted}>` prop (~line 3244) to `allowCompletedEdit={editingDeleted ? canEditCompletedOrder : canEditCompleted}`. This makes the actually-opened deleted-order edit form obey `canEditCompletedOrder` while the daily-report (`restrictToFields`, non-deleted) path keeps using `canEditCompleted`. `OrderForm.jsx` itself is NOT modified.
      Files: `src/pages/Dashboard.jsx`
      Verify: `npm run build` succeeds. Grep confirms the ternary on the `allowCompletedEdit` prop and that `OrderForm.jsx` has no diff.

- [ ] 15. Gate the receipt Edit + Delete buttons on `canEditReceipt` (`src/components/PaymentForm.jsx`).
      Add `const canEditReceipt = isAdmin || user.canEditReceipt` right after `const isAdmin = user.role === 'admin'`. Change the "Previous Receipts" Action `<th>` gate (`{isAdmin && <th ...>Action</th>}` ~line 117), the Action `<td>` wrapper gate (`{isAdmin && (<td>...` ~line 127), so both use `canEditReceipt`. Both the Edit and Delete buttons live inside that one gated `<td>`, so changing the wrapper covers both; leave the buttons themselves as-is. Keep `isAdmin` defined (still used for the ternary source value).
      Files: `src/components/PaymentForm.jsx`
      Verify: `npm run build` succeeds. Grep confirms `canEditReceipt` is defined and used on the receipt Action `<th>` and `<td>` gates.

- [ ] 16. Full verification pass + commit (do NOT push).
      Run `npm run build` from `d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard` — expect a clean Vite build. Run `node --check` on each edited backend file: `api/index.js`, `server/routes/auth.js`, `server/routes/users.js`, `server/routes/orders.js`, `server/setupSupabase.js` — all exit 0. Grep-confirm `can_edit_completed_order`/`canEditCompletedOrder` and `can_edit_receipt`/`canEditReceipt` are present at EVERY site enumerated above in both backends and all three frontend files, and that the migration file exists. Re-check the access matrix by reasoning through each gated handler and button. Then `git add` only the edited/created files and commit on `main` with a clear message (e.g. `feat: add canEditCompletedOrder and canEditReceipt grantable rights`). Do NOT run the Supabase migration and do NOT `git push`.
      Files: (all above)
      Verify: build clean, all `node --check` pass, grep matrix complete, `git status` shows the commit on `main` and nothing pushed.

## Gaps / assumptions flagged
- The Supabase migration (`api/new-rights-migration.sql`) is NOT run by this task. Until the user runs it in the Supabase SQL Editor, the new columns don't exist and the rights silently default to false (admins still work via the `isAdmin ||` short-circuit; non-admins can't be granted the rights). Call this out in the final summary.
- `portable-app/server/...` is intentionally left untouched (not in scope).
- Backend right-checks use a DB lookup per request (not the JWT), matching the existing `can_delete` precedent, so freshly granted rights take effect without forcing a re-login. One extra lightweight `users` select per gated action is acceptable and consistent with existing code.
