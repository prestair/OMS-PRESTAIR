-- Migration: drop the payments.order_id -> orders(id) foreign key. Run once in Supabase SQL Editor.
-- Rationale: payments.order_id REFERENCES orders(id) has no ON DELETE clause (default NO ACTION),
-- which blocks deleting the parent orders row while payment rows still reference it. Dropping the FK
-- lets payment rows outlive their parent orders row (so payment history is preserved when an order
-- moves Active -> Completed), while order_id stays intact as the link to deleted_orders.original_id.
-- Payment integrity is enforced in application code (move / restore / permanent-delete).
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_order_id_fkey;
