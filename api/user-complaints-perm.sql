-- ============================================================
-- Add per-user permission flag for Complaints Management access
-- Run once in the Supabase SQL Editor.
-- ============================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_complaints BOOLEAN DEFAULT false;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS can_complaints BOOLEAN DEFAULT false;
