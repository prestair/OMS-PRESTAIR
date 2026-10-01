-- Migration: create login_logs table to track who/when/IP/device logs in.
-- Run once in Supabase SQL Editor (Dashboard > SQL Editor > New query > paste > Run).

CREATE TABLE IF NOT EXISTS login_logs (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  full_name TEXT,
  role TEXT,
  ip_address TEXT,
  user_agent TEXT,
  logged_in_at TIMESTAMPTZ DEFAULT NOW()
);

-- Allow anon key to insert and select (needed for API)
ALTER TABLE login_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "allow_all_login_logs" ON login_logs FOR ALL USING (true) WITH CHECK (true);
