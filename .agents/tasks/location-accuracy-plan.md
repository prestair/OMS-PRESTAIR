# Implementation Plan — Login-Location Accuracy Gating

Fix the login-location accuracy bug: unreliable (km-level) geolocation readings must be rejected
instead of being shown as a confident wrong city. Keep browser geolocation (works on desktop and
mobile), no IP lookup, no paid API. Gate readings by `coords.accuracy` (68%-confidence radius in
meters); reject anything worse than 2000 m (2 km).

## Design decisions (grounded in the code read during exploration)

- **Threshold = 2000 m**, named `ACCURACY_THRESHOLD_M`, per the user's explicit "2km tak ok hai".
  Readings with `accuracy <= 2000` are reverse-geocoded and shown; worse-or-missing readings are
  stored as UNRELIABLE with null lat/lon/city/country but a kept `accuracy` value so the UI can
  explain why. Rationale: the user accepts approximations up to 2 km but not 30-40 km blunders.
- **Login never blocks on poor accuracy.** `getGPS()` still resolves (now with accuracy) and login
  proceeds; only the *location record* is gated, server-side. The existing denied/unsupported
  `locationBlocked` UX in `Login.jsx` is left exactly as-is.
- **Row-binding fix: return the inserted row id and thread it through.** The current handler updates
  "the most recent row for this user in the last 2 min" via `.eq(username).gte(logged_in_at,...)`,
  which can hit an unrelated older row on rapid re-login. The login handler in `api/index.js` already
  does a fire-and-forget insert; I will make it `.select('id').single()` and return the new row id to
  the client in the login response (`locationLogId`), then have the client post that id to
  `/api/auth/log-location`, which updates strictly `.eq('id', locationLogId)`.
  Tradeoff (documented in code comment): adds one id round-trip and makes the login insert no longer
  purely fire-and-forget-silent (we read its id), but it is still non-blocking for auth and it removes
  all chance of mutating the wrong row. Chosen over "fetch most-recent id then update by id" because
  that still races on concurrent logins by the same user; the explicit id is race-free.
  Fallback: if `locationLogId` is absent (older client, or insert failed), the handler falls back to
  the existing most-recent-within-2-min update so behavior degrades gracefully rather than erroring.
- **`server/routes/auth.js` is NOT mirrored.** Exploration confirmed it has only a `/login` handler
  and no `log-location` route (and it does not even write `login_logs`); it is the legacy local-dev
  server, not the production backend. The task says `api/index.js` is the only production backend.
  No change needed there. (`portable-app/` is a separate bundled copy and is out of scope.)
- **Frontend reads raw columns.** `UserManagement.jsx` renders `log.latitude/longitude/city/country`
  straight from `login_logs.select('*')` with no snake→camel mapping layer, so `log.accuracy` is
  available directly once the column exists; no mapping code to touch.

## Verification baseline

No test framework is configured (`package.json` has only vite/electron scripts). Verification is:
`npm run build` (which runs `vite build`) and `node --check` on edited server JS. No dev server.

---

- [ ] 1. Add `accuracy` to the geolocation capture and send it on login.
      In `getGPS()`, resolve `{ lat, lon, accuracy: pos.coords.accuracy }` (keep `enableHighAccuracy:true`,
      `timeout`, `maximumAge` unchanged; do NOT touch the denied/unsupported reject branch or the
      `locationBlocked` UI). In the submit handler's post, include `accuracy: gps.accuracy` in the
      `/api/auth/log-location` body. Login must still succeed regardless of accuracy value.
      Files: d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard\src\pages\Login.jsx
      Verify: `npm run build` from d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard completes with zero errors.

- [ ] 2. Return the inserted login_logs row id from the login handler and thread it to the client.
      In `POST /api/auth/login`, change the `login_logs` insert to `.insert({...}).select('id').single()`
      and capture the id (keep it non-blocking: still inside a `.then()`/catch so a failure never blocks
      the response — await the insert's id before `res.json` only if trivially safe, otherwise send it
      via a short await wrapped in try/catch so login still returns on insert failure). Add
      `locationLogId` to the `user`/response payload so the client can post it back. Do NOT change any
      permission/token logic.
      Files: d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard\api\index.js
      Verify: `node --check api/index.js` passes.

- [ ] 3. Thread `locationLogId` from the login response through the client post.
      In `Login.jsx`, the `login(username,password)` call (via AuthContext) must surface the new
      `locationLogId`; include it as `logId` in the `/api/auth/log-location` body alongside lat/lon/accuracy.
      If AuthContext's `login` does not return the server payload, read it there and expose it (check
      d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard\src\context\AuthContext.jsx first; make the minimal change
      so the id reaches Login.jsx). Keep the `.catch(()=>{})` on the post so it stays fire-and-forget.
      Files: d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard\src\pages\Login.jsx,
      d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard\src\context\AuthContext.jsx (only if needed to pass the id through)
      Verify: `npm run build` completes with zero errors.

- [ ] 4. Gate the location record by accuracy in POST /api/auth/log-location and fix row-binding.
      Read `{ lat, lon, accuracy, logId }`. Define `const ACCURACY_THRESHOLD_M = 2000`. Keep the
      existing `lat/lon required` 400 guard. Branch:
      (a) accuracy missing OR `accuracy > ACCURACY_THRESHOLD_M` → UNRELIABLE: skip Nominatim; build
      update `{ latitude:null, longitude:null, city:null, country:null, accuracy: accuracy ?? null }`.
      (b) `accuracy <= ACCURACY_THRESHOLD_M` → reverse-geocode via Nominatim exactly as today; build
      update `{ latitude:lat, longitude:lon, city, country, accuracy }`.
      Apply the update by exact id when `logId` is present (`.eq('id', logId)`); otherwise fall back to
      the existing `.eq('username', req.user.username).gte('logged_in_at', twoMinAgo)` path. Add a short
      code comment documenting the id-threading tradeoff. Store `accuracy` in BOTH branches.
      Files: d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard\api\index.js
      Verify: `node --check api/index.js` passes.

- [ ] 5. Add the `accuracy` column to the schema and create the idempotent migration.
      In `setupSupabase.js`, add `accuracy NUMERIC,` to the `login_logs` CREATE TABLE (place it after
      `user_agent TEXT,`, before `logged_in_at`). Create a new file with a single statement:
      `ALTER TABLE login_logs ADD COLUMN IF NOT EXISTS accuracy NUMERIC;`. Do NOT run it — add a comment
      at the top of the SQL file flagging it for manual run in Supabase.
      Files: d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard\server\setupSupabase.js,
      d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard\api\login-accuracy-migration.sql (new)
      Verify: `node --check server/setupSupabase.js` passes (it is a JS file embedding the SQL string);
      open the migration SQL and confirm it contains exactly the idempotent `ADD COLUMN IF NOT EXISTS`.

- [ ] 6. Update the Login Activity Location cell to show accuracy and the unreliable state.
      In the Location `<td>`, change the rendering logic to three cases, reading `log.accuracy` directly
      (raw column, no mapping):
      - Reliable (`log.latitude && log.longitude`): keep the Google-maps link `📍 {city, country}` and
        append the accuracy radius formatted `±N m` when `accuracy < 1000`, else `±N.N km`
        (`(accuracy/1000).toFixed(1)`), shown in a muted style next to/under the city.
      - Unreliable (`accuracy` present but no lat/lon/city — the gated case): render a muted
        `Location not reliable (±X km)` using the same km formatting; never show a city, no maps link.
      - Neither (no accuracy at all — legacy rows): keep the existing `—` dash.
      Do not alter other columns/behavior. (Leave the pre-existing `colSpan={7}` as-is; out of scope.)
      Files: d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard\src\pages\UserManagement.jsx
      Verify: `npm run build` completes with zero errors.

- [ ] 7. Final whole-change verification and local commit on main.
      Run the full build and syntax checks together; fix any errors surfaced. Then commit all edits
      locally on `main` (do NOT push). The migration SQL is intentionally NOT run — restate in the
      commit body that `login-accuracy-migration.sql` must be run manually in Supabase before the
      `accuracy` column is populated.
      Files: (whole change set from items 1-6)
      Verify: `npm run build` passes with zero errors AND `node --check api/index.js` and
      `node --check server/setupSupabase.js` both pass; `git status` shows a clean tree after commit,
      `git log -1` shows the new commit on `main`, and `git status` confirms nothing was pushed.

## Added requirement (approved mid-flight): same-IP location fallback

When a login's browser reading is UNRELIABLE (accuracy missing or > 2000 m), instead of
immediately recording "Location not reliable", first try to inherit a previously-known RELIABLE
location for the SAME `ip_address`:

- The IP lives on the `login_logs` row (captured at login insert), not in the log-location body.
  In `POST /api/auth/log-location` we first fetch the current row (by `logId`, else most-recent for
  the user in 2 min) to read its `ip_address`.
- Reliable reading (accuracy <= 2000): reverse-geocode and store as planned. This row also becomes a
  future "known good" source for its IP — no extra work, it is already in `login_logs`.
- Unreliable reading: query `login_logs` for the MOST RECENT earlier row with the SAME `ip_address`
  that is reliable (`city` not null AND `latitude`/`longitude` not null AND `accuracy <= 2000`).
  - Found → copy its `latitude/longitude/city/country` onto the current row, keep the current (bad)
    `accuracy`, and set `location_inherited = true` so the UI can be honest about the source.
  - Not found → planned fallback: null city/lat/lon, store accuracy, `location_inherited = false`.
- CRITICAL: match `ip_address` EXACTLY (stored value as-is). Never borrow across different IPs.

Schema/migration: add `location_inherited BOOLEAN DEFAULT false` to `login_logs` (setupSupabase.js)
and to `api/login-accuracy-migration.sql` alongside `accuracy`. Do NOT run it.

UI (UserManagement.jsx Location cell) states:
1. Reliable this-device (`accuracy <= 2000`, not inherited): `📍 City, Country (±X m/km)` + maps link.
2. Inherited same-IP (`location_inherited = true`): `📍 City, Country (same network)`, muted, maps link.
3. Unreliable, nothing to inherit: `Location not reliable (±X km)`, no city.
4. No accuracy (legacy rows): existing dash.

Plain-language rationale: a desktop that can't get a precise GPS fix reuses the last good location
seen from the SAME IP (same office Wi-Fi), so it inherits the office's known city instead of showing
"not reliable" or a wrong far-away city — but only within the same IP, never across IPs, and only
when that IP already has a prior reliable reading.

## Gaps / assumptions

- Assumed AuthContext's `login` can be minimally extended to surface `locationLogId`; item 3 says to
  read AuthContext.jsx first and change it only if the id is not already returned. If `login` cannot
  cleanly return the id, the handler's username+time fallback (item 4) still works, so the id-threading
  is an improvement, not a hard dependency — the fix is correct either way.
- Assumed `portable-app/` is an out-of-scope bundled copy (not the production backend) and is left
  untouched, consistent with "api/index.js is the ONLY production backend".
