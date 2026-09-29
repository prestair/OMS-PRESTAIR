-- Migration: add assignable permissions for editing completed orders and daily-report fields.
-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query > paste > Run).
-- Safe to re-run: IF NOT EXISTS guards prevent errors on columns that already exist.

ALTER TABLE users  ADD COLUMN IF NOT EXISTS can_edit_completed BOOLEAN DEFAULT false;
ALTER TABLE users  ADD COLUMN IF NOT EXISTS can_edit_daily     BOOLEAN DEFAULT false;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS can_edit_completed BOOLEAN DEFAULT false;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS can_edit_daily     BOOLEAN DEFAULT false;

-- Backfill a column the login already reads but that was missing on groups:
ALTER TABLE groups ADD COLUMN IF NOT EXISTS can_color BOOLEAN DEFAULT false;
