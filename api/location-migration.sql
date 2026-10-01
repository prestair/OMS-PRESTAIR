-- Migration: add location columns to login_logs table.
-- Run once in Supabase SQL Editor.

ALTER TABLE login_logs ADD COLUMN IF NOT EXISTS latitude  NUMERIC;
ALTER TABLE login_logs ADD COLUMN IF NOT EXISTS longitude NUMERIC;
ALTER TABLE login_logs ADD COLUMN IF NOT EXISTS city      TEXT;
ALTER TABLE login_logs ADD COLUMN IF NOT EXISTS country   TEXT;
