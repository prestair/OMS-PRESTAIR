-- ============================================================
-- Complaints Management - Supabase setup
-- Run this once in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/ttbyhawdgwwqemcqwjen/sql/new
-- ============================================================

CREATE TABLE IF NOT EXISTS complaints (
  id SERIAL PRIMARY KEY,
  complaint_no TEXT,
  complaint_date TEXT,
  client TEXT,
  customer_name TEXT,
  phone TEXT,
  order_no TEXT,
  product TEXT,
  problem_reported TEXT,
  priority TEXT,
  technician TEXT,
  scheduled_date TEXT,
  status TEXT DEFAULT 'OPEN',
  problem_identified TEXT,
  resolution TEXT,
  bill_no TEXT,
  amount NUMERIC DEFAULT 0,
  service_slip_no TEXT,
  resolution_date TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS and allow the anon key full access (matches the rest of this app)
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON complaints;
CREATE POLICY "Allow all" ON complaints FOR ALL USING (true) WITH CHECK (true);
