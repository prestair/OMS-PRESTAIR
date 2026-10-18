# Gate login location by GPS accuracy, with same-IP inheritance

The login-location feature was showing km-level browser geolocation readings as a confident, often wrong, city (Noida vs Gurgaon vs Delhi). This change threads the browser's `coords.accuracy` (the 68%-confidence radius in metres) from the client to the server and gates on it: readings within `ACCURACY_THRESHOLD_M = 2000` (2 km, matching the user's stated tolerance) are reverse-geocoded and stored as before; worse-than-2km readings are no longer shown as a confident city. The server also binds the location update to the exact login row via an id threaded through the login response, removing the old "most-recent-row-in-2-min" race. It stays on browser geolocation only — no IP lookup, no paid API.

Watch for: the implementation goes beyond the review brief by adding a same-IP location inheritance path (unreliable reading copies the most recent reliable location from the exact same `ip_address`) — this is deliberate, documented in the commit, and serves the original "same office network should resolve to one precise place" intent, but it means an unreliable row can still display a city (muted, labelled "same network") rather than always showing "not reliable" (confirmed). The migration is intentionally not auto-run and must be applied in Supabase before the new columns populate (confirmed).

**Verdict**: APPROVED

## High-level view

The accuracy signal flows client to server cleanly. `getGPS()` now resolves `accuracy` alongside lat/lon and posts it with a `logId`; `login()` is still awaited unconditionally and the denied/unavailable/timeout UX is untouched (only the geolocation timeout moved 10s→12s). Login never blocks on poor accuracy — gating is purely server-side on the location record.

Row binding is now race-free. The login handler reads back the inserted row's id (`.select('id').single()`, wrapped so a logging failure never blocks auth) and returns it as `user.locationLogId`. `AuthContext.login()` returns that user object, so the client's `loggedInUser?.locationLogId` resolves, and `log-location` updates strictly by id. The 2-min most-recent predicate survives only as a fallback when no id is available, so behaviour degrades gracefully rather than breaking.

The gating has three outcomes, not two. Reliable (`accuracy <= 2000`) reverse-geocodes and stores city + accuracy with `location_inherited=false`. Unreliable first tries to inherit the latest reliable location from the exact same IP (`location_inherited=true`, keeping the bad accuracy); only if there's no prior same-IP reading does it store null city/lat/lon + accuracy. Accuracy is persisted in all three branches. IP is matched exactly, never across IPs.

The UI mirrors the three outcomes: reliable rows show city + `(±N m)`/`(±N.N km)` with the maps link; inherited rows show the city muted with a "(same network)" label and the maps link; unreliable-with-nothing-to-inherit shows a muted "Location not reliable (±X km)" and never a city; legacy rows with no accuracy keep the dash.

Schema adds `accuracy NUMERIC` and `location_inherited BOOLEAN DEFAULT false` to `login_logs`. The migration is idempotent (`ADD COLUMN IF NOT EXISTS`) but is not run by this change — it must be applied manually in Supabase first.

<details>
<summary>Issues (2)</summary>

1. **Inheritance path exceeds the brief** — the brief specified unreliable → always null city; the code instead inherits a same-IP reliable location and shows it muted as "(same network)". Deliberate and aligned with the original user intent, but confirm this is the intended product behaviour rather than the strict null-city spec. Non-blocking.
2. **Migration not applied** — new columns won't populate until `api/login-accuracy-migration.sql` is run in Supabase. Operational step, called out in the commit; ensure it runs before deploy. Non-blocking.

</details>

<details>
<summary>Details</summary>

### Accuracy threading and the unchanged login path

`getGPS()` resolves `{ lat, lon, accuracy }` from `pos.coords.accuracy` and the submit handler posts `accuracy` plus `logId: loggedInUser?.locationLogId`. The POST is still fire-and-forget (`.catch(() => {})`) and still guarded by `if (gps)`, so a denied/unavailable/timeout geolocation never posts and never affects auth. `await login(...)` is unconditional, so login success is fully decoupled from accuracy — matching the requirement that poor accuracy gates only the record, not the login. The only UX change is the geolocation timeout moving from 10s to 12s.

### Race-free row binding via threaded id

The old handler updated "the most recent `login_logs` row for this user within 2 minutes", which races on rapid re-login or concurrent same-user logins. The login handler now does `.insert(...).select('id').single()` and returns `locationLogId` on the user object; `AuthContext.login()` returns that object, so the id reaches the client and comes back on the `log-location` body. The handler resolves `currentRow` by id first (also reading `ip_address`, needed for the inheritance step since the client never sends it), and only falls back to the 2-min predicate when `logId` is absent. The final `update` is applied `.eq('id', currentRow.id)` so an unrelated older row is never touched. The insert read-back is wrapped in try/catch so a logging failure leaves `locationLogId` null and auth still returns — the fallback predicate then applies.

### Three-way gating and the same-IP inheritance

The brief described two outcomes (reliable → geocode; unreliable → null). The code implements three:

```
accuracy <= 2000           -> reverse-geocode, store city/country/lat/lon/accuracy, inherited=false
accuracy missing or > 2000 -> look for latest reliable row on SAME ip_address (accuracy <= 2000,
                              non-null city/lat/lon)
                                found    -> copy its lat/lon/city/country, keep THIS bad accuracy,
                                            inherited=true
                                not found-> null lat/lon/city/country + accuracy, inherited=false
```

Accuracy is stored in every branch, as required. The inheritance query matches `ip_address` exactly and filters priors to `accuracy <= ACCURACY_THRESHOLD_M` with non-null city/lat/lon, so it only ever borrows a genuinely reliable earlier reading from the same network — it will not propagate another unreliable guess. This is the mechanism that answers the original complaint ("one IP showing different cities"): same office IP now resolves to one place. The tradeoff is that an unreliable row can display a city it did not itself measure; the `location_inherited` flag and the muted "(same network)" label keep the UI honest about that.

### Location cell rendering

The cell computes `accStr` as `±N m` when `< 1000` else `±N.N km` (`toFixed(1)`), matching the brief's format. Branch order is: has lat/lon + `location_inherited` → muted link with "(same network)"; has lat/lon + not inherited → green link with city and `(±X)`; `hasAcc` but no coords → muted italic "Location not reliable (±X km)" with no city and no link; otherwise (legacy, no accuracy) → the dash. The `hasAcc` guard uses `isFinite(Number(log.accuracy))` and distinguishes null/undefined from 0, so a legacy row never falls into the "not reliable" branch and keeps its dash — exactly the required distinction between gated-unreliable and pre-feature rows.

### Schema and migration

`server/setupSupabase.js` adds `accuracy NUMERIC` and `location_inherited BOOLEAN DEFAULT false` to the `login_logs` CREATE TABLE. `api/login-accuracy-migration.sql` is new and idempotent — `ADD COLUMN IF NOT EXISTS` for both columns — and carries a comment that it must be run manually before the columns populate. `server/routes/auth.js` has no `log-location` handler (grep confirms zero matches), so there is nothing to mirror there; the handler lives only in `api/index.js`.

### Scope

Changes are confined to the login/location path: `Login.jsx`, `api/index.js` (login + log-location handlers), `UserManagement.jsx` location cell, the schema, and the migration file (plus a plan doc under `.agents/tasks`). The receipt edit/delete, user-colour, and permission code paths from the broader project history are untouched by this diff — no unrelated features were bundled in.

### Verification evidence

The commit message records `npm run build` passing with zero errors and `node --check` passing on `api/index.js` and `server/setupSupabase.js`; no dev server was started and no test framework exists in the project. No automated test coverage was added — not tested: the accuracy gate boundary (exactly 2000), the same-IP inheritance selection, and the three UI branches. Given there is no test harness in the repo, this matches the project's existing posture rather than a regression introduced here.

</details>

<details>
<summary>File map</summary>

- `src/pages/Login.jsx` — `getGPS()` resolves `accuracy`; POST includes `accuracy` + `logId`; timeout 10s→12s.
- `api/index.js` — login handler reads back row id and returns `locationLogId`; `log-location` gates on `ACCURACY_THRESHOLD_M = 2000`, adds same-IP inheritance, binds update by id.
- `src/pages/UserManagement.jsx` — location cell renders reliable / inherited / not-reliable / legacy states.
- `server/setupSupabase.js` — adds `accuracy` and `location_inherited` columns to `login_logs`.
- `api/login-accuracy-migration.sql` — new idempotent migration for the two columns (run manually).
- `.agents/tasks/location-accuracy-plan.md` — planning doc.

Full diff: `git show f305a94`.

</details>
