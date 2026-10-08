-- Migration: add follow_up_type column to orders. Run once in Supabase SQL Editor.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS follow_up_type TEXT;
