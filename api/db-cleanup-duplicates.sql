-- One-time cleanup: remove duplicate deleted_orders rows, keep latest (highest id) per original_id
-- Run this in Supabase SQL editor ONCE to fix existing duplicates
DELETE FROM deleted_orders
WHERE id NOT IN (
  SELECT MAX(id) FROM deleted_orders GROUP BY original_id
);
