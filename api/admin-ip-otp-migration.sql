-- Admin IP-bypass OTP — Migration Notes
-- ============================================================
-- The OTP bypass flow uses a server-side in-memory Map (adminOtpStore in index.js).
-- NO database table is required for the OTP itself.
-- OTPs expire after 15 minutes and are cleared on server restart (acceptable for this use case).
--
-- OPTIONAL: Add an email column to users so future versions can send OTP to the
-- admin's personal email instead of REPORT_RECEIVER.
-- Safe to run: IF NOT EXISTS guard prevents errors if already added.
-- ============================================================

-- OPTIONAL — run only if you want per-user email addresses:
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;

-- OPTIONAL — index for faster lookups if email-based queries are added later:
-- CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
