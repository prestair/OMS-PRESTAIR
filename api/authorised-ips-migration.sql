-- Authorised IPs table for login IP restriction
CREATE TABLE IF NOT EXISTS authorised_ips (
  id SERIAL PRIMARY KEY,
  ip_address TEXT NOT NULL UNIQUE,
  label TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS (matching pattern for all other tables in setupSupabase.js)
ALTER TABLE authorised_ips ENABLE ROW LEVEL SECURITY;

-- Allow all access via anon key (matches pattern in setupSupabase.js)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'authorised_ips' AND policyname = 'Allow all'
  ) THEN
    CREATE POLICY "Allow all" ON authorised_ips FOR ALL USING (true) WITH CHECK (true);
  END IF;
END$$;
