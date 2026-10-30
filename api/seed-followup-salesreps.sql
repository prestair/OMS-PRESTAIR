-- Seed follow_up_agents from existing unique follow_up values in orders table
-- Run once in Supabase SQL Editor

INSERT INTO follow_up_agents (name, is_active)
SELECT DISTINCT UPPER(TRIM(follow_up)), TRUE
FROM orders
WHERE follow_up IS NOT NULL AND TRIM(follow_up) <> ''
ON CONFLICT (name) DO NOTHING;

-- Seed sales_reps from existing unique sales_rep values in orders table
-- (in case any exist in orders that are not yet in sales_reps table)
INSERT INTO sales_reps (name, is_active)
SELECT DISTINCT UPPER(TRIM(sales_rep)), TRUE
FROM orders
WHERE sales_rep IS NOT NULL AND TRIM(sales_rep) <> ''
ON CONFLICT (name) DO NOTHING;
