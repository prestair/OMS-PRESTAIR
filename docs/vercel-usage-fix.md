# OMS-PRESTAIR: Vercel usage changes

Prepared against `061f3812fc0eee4752ccbcff745eb960019767e2` on branch
`fix/vercel-function-usage`.

## Before deployment

The daily-report source contained an embedded Gmail app password. Revoke that
password in the sending Google account and create a replacement. Removing it
from a new commit does not remove the old credential from Git history.

The API also contained a hardcoded JWT signing secret. Configure a new, random
`JWT_SECRET` before deploying this change. The production API now requires it;
rotating it will require users to sign in again. Never commit the new secrets.

In the existing Vercel project's **Settings → Environment Variables**, configure:

| Variable | Required value |
| --- | --- |
| `JWT_SECRET` | New random signing secret, shared by the API and report handler |
| `CRON_SECRET` | Separate random secret for Vercel's scheduled report requests |
| `SUPABASE_URL` | Existing project's Supabase URL |
| `SUPABASE_KEY` | Existing server-side Supabase key with the required access |
| `GMAIL_USER` | Sending Gmail account |
| `GMAIL_APP_PASSWORD` | Replacement Gmail app password |
| `REPORT_RECEIVER` | Optional recipient override; defaults to the existing report recipient |

Set production variables before the production deployment. For preview testing,
use test credentials/data and a test recipient. Do not place these variables in
`VITE_*` variables, because those are exposed to browsers.

Vercel supplies `Authorization: Bearer <CRON_SECRET>` to cron requests when that
environment variable is configured. The existing daily cron schedule is retained.
The dashboard's **Send Report** button still sends the logged-in administrator's
JWT. The report handler verifies the current admin role and force-logout status.

Reference: https://vercel.com/docs/cron-jobs/manage-cron-jobs

## What changed

- Notification polling keeps the existing 30-second foreground interval. When
  the page is hidden, reminder and paper/return notification checks run every
  five minutes. Background notifications can consequently arrive later.
- Returning to a visible tab immediately checks for updates. Full order polling
  pauses while hidden. A wall-clock ten-minute safety refresh catches in-place
  order edits after a long absence.
- Polls pause offline, cancel on component cleanup, and schedule the next request
  after the current request finishes, preventing overlapping requests.
- The reminders table and response notification share one signal poll. Refreshing
  the users list no longer restarts the reminder polling effect. A five-minute
  full reminders refresh handles edits/caches that the simple signal can miss.
- Admins no longer request the due-reminder popup data, which they never display.
- Order/reminder signal queries run in parallel and use a 15-second cache inside
  each function instance. Simultaneous readers share an in-flight request. Local
  writes invalidate the relevant signal, and late older reads cannot overwrite it.
- Signal reads have ten-second timeouts, and reverse geocoding has a three-second
  timeout. Bulk-import/write timings are preserved.
- The report endpoint rejects anonymous/non-admin requests before database reads
  or report-library loading. Mail credentials come from environment variables;
  report database reads and SMTP operations have explicit timeouts.

The existing one-minute app-version/force-refresh checks and 13:40 daily refresh
are preserved. This change does not alter stored orders, payments, user permission settings,
or the database schema. No production database writes or real emails were used to test it.

## Expected effect and limits

For each affected notification loop, changing the background interval from 30
seconds to 300 seconds reduces its scheduled checks from 120 to about 12 per hour
(90% fewer checks for that loop, before visibility changes and request duration).
This is a calculation from the code, **not** a measured reduction in GB-hours.
Foreground usage, concurrent instances, response times, other projects, and
unauthorized traffic determine the actual Vercel savings.

The cache is per function instance, not a shared database or CDN cache. Existing
orders/reminders data caches can still delay cross-instance updates. No private
order or user data is added to a public CDN cache.

These changes reduce future consumption; they do not reset already-used quota or
automatically reactivate a paused Vercel project.

## Apply and verify

1. Review the changed files on a separate branch, or extract the supplied
   changed-files ZIP into a clean checkout at the base commit above. If main has
   advanced, merge the changes rather than overwriting newer work.
2. Configure the environment variables above before deploying.
3. Run `npm ci --ignore-scripts`, `npm run build`, and
   `node --test tests/polling.test.mjs tests/report.test.cjs tests/signals.test.cjs`.
   The tests use Node 24's built-in test runner and mocked database/mail services.
4. Deploy a preview through the existing Vercel project and verify normal/admin
   sign-in, order refresh, reminder responses, and paper/return notifications.
5. Merge/deploy after review. Verify the daily cron through Vercel's cron logs.
   Test manual report sending only when an actual email is intended.
6. In Vercel **Usage**, filter to this project and compare Provisioned Memory and
   invocations over comparable working hours before/after deployment. In
   **Observability → Vercel Functions**, compare function duration and errors.
   Record other projects separately because the alert is for the whole team.

## Validation performed

- Production Vite build passed. The pre-existing large JavaScript bundle warning
  remains; static bundle size is a different metric from Fluid Provisioned Memory.
- Backend/helper syntax checks passed.
- 12 regression tests passed: visibility/offline/cancellation/overlap behavior,
  report authorization and mocked delivery, parallel/shared signal reads,
  error recovery, and invalidation races.
- Live Vercel usage, production cron delivery, and production login were not
  verified because this session has no access to their runtime configuration.
