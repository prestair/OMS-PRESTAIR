# Authorised IP whitelist with alert email

Login now checks the caller's IP against an `authorised_ips` table in Supabase. When the table is empty every login proceeds normally (fail-open). When it contains rows, any IP not on the list gets a 403 and triggers a fire-and-forget alert email to `agm.prestairsystem@gmail.com`. Admins manage the list through a new modal in the Dashboard header. The feature uses the existing nodemailer/Gmail transport — no new env vars. The migration SQL ships as a standalone `.sql` file rather than being folded into `setupSupabase.js`.

Watch for: cache invalidation on POST/DELETE correctly busts both the guard and admin cache keys (confirmed). The email is genuinely fire-and-forget — not awaited, call site double-wrapped in try/catch (confirmed). `sendUnauthorisedLoginAlert` is declared `async` and internally awaits `sendMail`; the outer catch at the call site will never see its rejection because the promise is not awaited — this is intentional and correct, but worth noting for anyone wondering why the empty catch doesn't surface email failures.

**Verdict**: APPROVED

---

## High-level view

The migration SQL is idempotent and schema-complete. The `DO $$` block guards `CREATE POLICY` against duplicate errors on re-run; `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` is a no-op when RLS is already on.

Two separate cache keys avoid a projection mismatch: `authorised_ips_guard` caches only `ip_address` (used at login), while `authorised_ips_admin` caches full rows (used by the management UI). Both are invalidated together on every write.

The login guard is correctly fail-open at two levels: the outer `try/catch` passes login through if the table read fails entirely, and the `allowedIps.length > 0` check passes login through if the table is empty. IP extraction uses `x-forwarded-for` → `x-real-ip` → `socket.remoteAddress`, taking the first comma-separated value. The POST route validates IP format with `net.isIP()` before inserting.

The alert email matches the spec: subject, sender, recipient, and HTML body (App Name / IP Address / Username / Time IST rows) are all confirmed against the stated requirements.

The Dashboard button sits between Force Refresh All and Logout, is `isAdmin`-only, loads on open, and shows the fail-open behaviour in the info line. The modal table has the correct columns and a confirm-before-delete action.

<details>
<summary>Issues (0)</summary>

No blocking issues found.

</details>

<details>
<summary>Details</summary>

### Two-key cache split

```
Login path:   cachedRead('authorised_ips_guard', 60s)  →  SELECT ip_address
Admin GET:    cachedRead('authorised_ips_admin', 60s)  →  SELECT *
POST/DELETE:  cacheDel('authorised_ips_guard', 'authorised_ips_admin')
```

The split is necessary because the login path selects only `ip_address` for a lean read; serving those lean objects to the admin UI would lose `label`, `created_by`, and `created_at`. Without the split, a login that primes the guard cache would cause the admin GET to return incomplete rows until TTL expiry.

### Fire-and-forget async subtlety

```js
try { sendUnauthorisedLoginAlert(clientIp, user.username) } catch {}
```

`sendUnauthorisedLoginAlert` is `async` — it returns a promise. The synchronous `try/catch` wrapping it cannot catch an async rejection. Email failures are only observable via `console.error` inside the function. This is the correct pattern for fire-and-forget; the empty catch is there to silence the "unhandled promise" lint warning, not to recover from failures.

</details>

---

<details>
<summary>File map</summary>

| File | Change |
|---|---|
| `api/authorised-ips-migration.sql` | New table `authorised_ips` with RLS and policy |
| `api/index.js` | `sendUnauthorisedLoginAlert` helper; IP guard in login; GET/POST/DELETE `/api/authorised-ips` routes; `TTL_AUTHORISED_IPS` constant; two-key cache split |
| `src/pages/Dashboard.jsx` | State vars for modal; `fetchAuthorisedIPs`; Authorised IP header button; full management modal |

Full diff: `git diff main -- api/authorised-ips-migration.sql api/index.js src/pages/Dashboard.jsx`

</details>
