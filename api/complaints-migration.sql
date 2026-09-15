-- ============================================================
-- Complaints Management - migration for new fields
-- Run this once in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/ttbyhawdgwwqemcqwjen/sql/new
-- ============================================================

ALTER TABLE complaints ADD COLUMN IF NOT EXISTS purchase_bill_no TEXT;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS purchase_date TEXT;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS warranty_status TEXT;   -- 'IN' or 'OUT'
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS helper TEXT;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS bill_required BOOLEAN DEFAULT false;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS resolution_history JSONB DEFAULT '[]'::jsonb;

-- order_no is no longer used by the form (kept nullable for backward compatibility; safe to ignore)

-- Assignment type: 'PLANNED' or 'UNPLANNED'
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS assignment_type TEXT;
