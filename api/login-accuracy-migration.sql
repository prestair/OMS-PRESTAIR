-- Run this manually in the Supabase SQL editor before the login-location accuracy
-- gating can populate the new columns. It is idempotent (safe to run more than once).
ALTER TABLE login_logs ADD COLUMN IF NOT EXISTS accuracy NUMERIC;
ALTER TABLE login_logs ADD COLUMN IF NOT EXISTS location_inherited BOOLEAN DEFAULT false;
