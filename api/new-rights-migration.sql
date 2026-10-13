-- Migration: add the grantable "Edit/Delete Receipt" permission (can_edit_receipt).
-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query > paste > Run).
-- Safe to re-run: IF NOT EXISTS guards prevent errors on columns that already exist.

ALTER TABLE users  ADD COLUMN IF NOT EXISTS can_edit_receipt BOOLEAN DEFAULT false;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS can_edit_receipt BOOLEAN DEFAULT false;
