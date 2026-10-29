-- Admin OTP table for serverless-safe OTP storage
-- Run this ONCE in Supabase SQL editor before deploying the fix
CREATE TABLE IF NOT EXISTS admin_otps (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  otp TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER DEFAULT 0,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE admin_otps ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'admin_otps' AND policyname = 'Allow all'
  ) THEN
    CREATE POLICY "Allow all" ON admin_otps FOR ALL USING (true) WITH CHECK (true);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS admin_otps_username_idx ON admin_otps(username);
