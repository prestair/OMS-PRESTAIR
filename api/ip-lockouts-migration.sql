-- Run this in Supabase SQL Editor
CREATE TABLE IF NOT EXISTS ip_lockouts (
  id SERIAL PRIMARY KEY,
  ip_address TEXT NOT NULL,
  username TEXT NOT NULL,
  unlock_code TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  unlocked_at TIMESTAMPTZ,
  is_unlocked BOOLEAN DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_ip_lockouts_ip ON ip_lockouts(ip_address, is_unlocked);
