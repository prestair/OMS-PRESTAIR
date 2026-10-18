# Grantable "Edit/Delete Receipt" right + fixing completed-order edit enforcement

Adds one new grantable boolean right, `can_edit_receipt` / `canEditReceipt`, that gates the receipt **Edit** and **Delete** buttons in `PaymentForm.jsx` and both the payment-update and payment-delete endpoints in both backends. Separately, it fixes the completed/deleted-order edit so the **existing** `can_edit_completed` right actually works end-to-end: `PUT /orders/deleted/:id/update` moved off `adminOnly` onto an admin-or-`can_edit_completed` check. No brand-new "completed order" right was created — the user picked "Option 2" (reuse the existing right), which the plan records as superseding the original two-rights framing. A shared `userHasRight(req, col)` DB-lookup helper resolves rights per request because the JWT carries only `{id, username, role}`.

Watch for: the task brief named a second new right `canEditCompletedOrder`; it was intentionally dropped per the plan's documented correction and the user's choice (confirmed — absent from the entire codebase). The `can_edit_receipt` Supabase migration is written but NOT run, so the right silently defaults to false in production until applied (confirmed). The previously-ungated `DELETE payment` endpoint is now restricted (confirmed) — a deliberate tightening.

**Verdict**: APPROVED

## High-level view

The change reuses the established end-to-end rights template (`can_edit_completed` / `canEditCompleted`) to add `can_edit_receipt`, and it is wired at every parallel site in both backends: login response, users GET select + mapping + POST insert + PUT update, groups POST insert + PUT update, the DB schema for both tables, and the User Management user and group forms (state, group-apply spreads, both Edit onClick handlers, the user PUT payload, and one new checkbox per form). The existing `can_edit_completed` right and all its other uses are untouched.

Backend enforcement resolves rights with a per-request DB lookup rather than the JWT, matching the existing `can_delete` precedent, so a freshly granted right takes effect without a re-login and there is no stale-flag risk from the token. Admins short-circuit to allowed before any lookup. All three target endpoints — deleted-order update, payment update, payment delete — now allow admin OR the correct right, and the payment delete endpoint, which previously had no gate at all, is now restricted.

The completed-order edit fix is a pure enforcement change: the Dashboard Edit button and the `OrderForm` `allowCompletedEdit` prop already keyed on `canEditCompleted`, so only the backend `adminOnly` middleware needed removing. Restore and Permanent Delete remain admin-only, so a non-admin granted `can_edit_completed` sees Edit but not Restore/Permanent Delete.

The one operational gap is that the migration SQL is not applied: until it is run in Supabase, `can_edit_receipt` does not exist as a column, so non-admins can't be granted it and the login/select reads fall back to false. Admins are unaffected because every gate short-circuits on role.

<details>
<summary>Issues (2)</summary>

1. **Migration not applied** — `api/new-rights-migration.sql` adds `can_edit_receipt` to `users` and `groups` but is not run by this task. Run it once in the Supabase SQL Editor before the right can be granted in production; until then the right silently stays false for non-admins.
2. **Admin role still trusted from the JWT** — `userHasRight` reads `req.user.role === 'admin'` from the token, so a revoked-admin's unexpired token keeps admin access. Pre-existing pattern (matches `can_delete`), not introduced here; noted only for awareness, no action required for this change.

</details>

<details>
<summary>Details</summary>

## One new right, wired by copying the `can_edit_completed` template

The new right follows the canonical end-to-end rights pattern exactly, mirrored across both the deployed serverless backend (`api/index.js`) and the local Express backend (`server/routes/*`, `server/setupSupabase.js`):

- Login response: `canEditReceipt: isAdmin || grAny('can_edit_receipt')` in `api/index.js`; `canEditReceipt: isAdminRole ? true : getUserRight('can_edit_receipt')` in `server/routes/auth.js`.
- Users: `can_edit_receipt` added to the GET `.select(...)` column list and `canEditReceipt: u.can_edit_receipt` to the mapped output; `can_edit_receipt: ...canEditReceipt || false` added to both POST insert and PUT update, in both backends.
- Groups: the `can_edit_receipt = b.can_edit_receipt ?? b.canEditReceipt` fallback const plus the field in both the insert and update row objects (`api/index.js`); the matching `gEditReceipt` const + conditional update and the insert field in `server/routes/users.js`.
- Schema: `can_edit_receipt BOOLEAN DEFAULT false` added to both the `users` and `groups` CREATE TABLE blocks in `server/setupSupabase.js`.

The camelCase/snake_case bridging on the group paths (`?? b.canEditReceipt`, `|| g.can_edit_receipt`) matches how the neighboring rights already tolerate either casing from the client, so group-sourced values resolve regardless of which shape the UI sends.

## UserManagement wiring is complete on every path a right flows through

`canEditReceipt` was added to the user `form` and `groupForm` initial state, to both `applyGroupRights` and `resetToGroupRights` spreads (`canEditReceipt: g.canEditReceipt || g.can_edit_receipt || false`), to both the per-user Edit onClick and the group Edit onClick that repopulate the forms, to the user PUT payload, and as one `Edit/Delete Receipt` checkbox in each of the user and group forms. User-create posts the whole `form` and group create/update send `groupForm` wholesale, so the new checkbox state flows without an explicit payload field. No site that the existing `canEditCompleted` touches was left unmirrored.

## Backend gates resolve the right from the DB, not the token

```
userHasRight(req, col):
  role === 'admin'            -> allowed (no lookup)
  else: SELECT col WHERE id   -> allowed iff column is true
```

Both backends define the identical helper and call it at the top of each gated handler. Because the JWT only carries `{id, username, role}`, reading the boolean from the DB each request is the correct choice — it avoids a stale-flag problem entirely (a freshly granted right works without re-login) and matches the pre-existing `can_delete` lookup in `DELETE /:id`. The one value still taken from the token is `role`; a revoked-admin's unexpired token would still pass the admin short-circuit, but that is the existing system-wide behavior, not something this change introduces.

Endpoint-by-endpoint, in both `api/index.js` and `server/routes/orders.js`:

- `PUT /orders/deleted/:id/update`: `adminOnly` removed, now `if (!(await userHasRight(req,'can_edit_completed'))) 403`.
- `PUT /orders/:id/payments/:pid` (`:paymentId` in the local backend): now gated on `can_edit_receipt`; previously `adminOnly` in both.
- `DELETE /orders/:id/payments/:pid`: now gated on `can_edit_receipt`. In `server/routes/orders.js` it was `adminOnly`; in `api/index.js` it had **no** gate beyond `authenticate`, so this closes an open hole where any authenticated user could delete payments. The tightening is intentional and matches the plan.

The per-backend param-name difference (`:pid` vs `:paymentId`) is preserved in each file.

## Completed-order edit: enforcement fix, not a new right

The Dashboard already derived `canEditCompleted = isAdmin || user.canEditCompleted` and gated the deleted-tab Action `<th>`, the Action `<td>` wrapper, and the Edit button on `(isAdmin || canEditCompleted)`, while Restore and Permanent Delete were `isAdmin`-only; the `OrderForm` prop was `allowCompletedEdit={canEditCompleted}`. The only thing broken was the server: the update endpoint was `adminOnly`, so a non-admin with the right saw the button but got rejected on save. Removing `adminOnly` in favor of the `can_edit_completed` lookup closes that gap with no frontend change — which is why `Dashboard.jsx` and `OrderForm.jsx` are absent from the diff. A non-admin granted only `can_edit_completed` now sees and uses Edit but still cannot Restore or Permanently Delete.

## Access matrix holds

Reasoning through the gates: admin passes everything via the role short-circuit on every button and endpoint. A user with only `can_edit_completed` gets the Completed-tab Edit (button + endpoint) but not Restore/Permanent Delete (admin-only buttons; restore/permanent-delete endpoints remain `adminOnly`) and not receipts. A user with only `can_edit_receipt` gets receipt Edit+Delete (buttons + both endpoints) and nothing else. A user with neither sees no Action controls and is 403'd at all three endpoints.

## Migration is intentionally not applied

`api/new-rights-migration.sql` contains the two idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS can_edit_receipt BOOLEAN DEFAULT false` statements for `users` and `groups`, with a header noting it is safe to re-run. It is not executed by this task. Until it is applied in the Supabase SQL editor, the production `users`/`groups` tables lack the column, so the right can't be stored or granted for non-admins — admins are unaffected because every gate short-circuits on role before touching the column.

## Verification evidence

The coder's commit message records `npm run build` OK (exit 0) and `node --check` passing on `api/index.js` and all edited `server/*.js` files. There is no test framework in this project, so that is the expected evidence; it is present and was not re-run.

## Scope

Only the files the plan enumerates were touched (both backends, schema, migration, `PaymentForm.jsx`, `UserManagement.jsx`), plus the plan document itself. `portable-app/server/...` was correctly left untouched. No unrelated changes are bundled in.

</details>

<details>
<summary>File map</summary>

- `api/index.js` — `userHasRight` helper; `canEditReceipt` in login/users/groups; three endpoint gates (deleted-update → `can_edit_completed`, payment update+delete → `can_edit_receipt`).
- `server/routes/orders.js` — same `userHasRight` helper and the same three endpoint gates (`:paymentId` param).
- `server/routes/auth.js` — `canEditReceipt` in login response.
- `server/routes/users.js` — `can_edit_receipt` in users GET/POST/PUT and groups POST/PUT.
- `server/setupSupabase.js` — `can_edit_receipt` column on `users` and `groups`.
- `api/new-rights-migration.sql` — new; idempotent ALTERs for `can_edit_receipt` on both tables (not run).
- `src/components/PaymentForm.jsx` — derived `canEditReceipt`; receipt Edit+Delete gated on it.
- `src/pages/UserManagement.jsx` — `canEditReceipt` in form/group state, group-apply spreads, both Edit onClicks, user PUT payload, one checkbox per form.
- `.agents/tasks/new-rights-plan.md` — new; the implementation plan with the Option-2 correction.

Full diff: `git show 79ad895`.

</details>
