ALTER TABLE paper_requests ADD COLUMN IF NOT EXISTS placed_by_admin TEXT;
ALTER TABLE return_requests ADD COLUMN IF NOT EXISTS placed_by_admin TEXT;
