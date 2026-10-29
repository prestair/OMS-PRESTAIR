-- Admin IP-bypass OTP — Migration Notes
-- ============================================================
-- The OTP bypass flow uses a server-side in-memory Map (adminOtpStore in index.js).
-- NO database table is required for the OTP itself.
--
-- KNOWN LIMITATION — in-memory OTP store:
--   OTPs are stored in process memory only. A server restart during a 15-minute OTP
--   window silently drops all pending OTPs; affected admins must start the login flow
--   again. This is acceptable for the current deployment because:
--     a) The server rarely restarts unexpectedly during an active login attempt.
--     b) The admin can simply retry — the flow has no side-effects for the user.
--   If this becomes a problem, move the store to a Redis key with TTL or a DB table.
--
-- ============================================================
-- STEP 1 (REQUIRED): Add email column to users table.
-- The OTP is sent to user.email when set; falls back to REPORT_RECEIVER otherwise.
-- Safe to run: IF NOT EXISTS guard prevents errors if already applied.
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;

-- Index for faster lookups if email-based queries are added later:
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ============================================================
-- STEP 2 (MANUAL): Set the admin's email address.
-- After running STEP 1, update the admin user record with their personal email so
-- OTPs go directly to their inbox rather than the shared REPORT_RECEIVER mailbox.
-- Example (replace with actual username and email):
-- UPDATE users SET email = 'admin@example.com' WHERE username = 'admin';
-- ============================================================
