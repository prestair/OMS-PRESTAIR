import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)

async function setup() {
  console.log('Testing Supabase connection...')
  const { data, error } = await supabase.from('orders').select('*').limit(1)
  if (error && error.code === '42P01') {
    console.log('Table does not exist yet - need to create via SQL Editor')
    console.log('')
    console.log('=== GO TO SUPABASE DASHBOARD ===')
    console.log('https://supabase.com/dashboard/project/ttbyhawdgwwqemcqwjen/sql/new')
    console.log('')
    console.log('Paste and run this SQL:')
    console.log('=============================')
    printSQL()
  } else if (error) {
    console.log('Error:', error.message)
    console.log('Code:', error.code)
  } else {
    console.log('Connected! Orders table exists. Rows:', data.length)
  }
}

function printSQL() {
  console.log(`
-- Create tables for OMS

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  full_name TEXT,
  role TEXT DEFAULT 'user',
  user_group TEXT DEFAULT '',
  column_permissions JSONB DEFAULT '{}',
  can_edit BOOLEAN DEFAULT false,
  can_receipt BOOLEAN DEFAULT false,
  can_assign_reminder BOOLEAN DEFAULT false,
  can_delete BOOLEAN DEFAULT false,
  can_create_quote BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS groups (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  column_permissions JSONB DEFAULT '{}',
  can_edit BOOLEAN DEFAULT false,
  can_receipt BOOLEAN DEFAULT false,
  can_assign_reminder BOOLEAN DEFAULT false,
  can_delete BOOLEAN DEFAULT false,
  can_create_quote BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  date TEXT,
  po_no TEXT,
  client TEXT,
  order_no TEXT UNIQUE,
  status TEXT,
  delivery_date TEXT,
  delivery_remarks TEXT,
  customer_name TEXT,
  gst TEXT,
  billing_address TEXT,
  follow_up TEXT,
  sales_rep TEXT,
  delivery_address TEXT,
  phone_no TEXT,
  site_verification TEXT,
  site_verification_remarks TEXT,
  installation_status TEXT,
  installation_remarks TEXT,
  lop TEXT,
  section_drawing TEXT,
  section_drawing_remarks TEXT,
  in_production TEXT,
  billing TEXT,
  installation TEXT,
  total_amount NUMERIC DEFAULT 0,
  received_amount NUMERIC DEFAULT 0,
  balance NUMERIC DEFAULT 0,
  percent_received NUMERIC DEFAULT 0,
  payment_remarks TEXT,
  days_to_order INTEGER DEFAULT 0,
  remarks TEXT,
  akhil_sir_audit TEXT,
  advance_bill TEXT,
  or_recvd TEXT,
  photography TEXT,
  photography_remarks TEXT,
  site_video TEXT,
  site_video_remarks TEXT,
  review TEXT,
  review_remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deleted_orders (
  id SERIAL PRIMARY KEY,
  original_id INTEGER,
  data JSONB,
  deleted_by TEXT,
  deleted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id),
  date TEXT,
  mode TEXT,
  amount NUMERIC DEFAULT 0,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reminders (
  id SERIAL PRIMARY KEY,
  order_id INTEGER,
  order_no TEXT,
  client TEXT,
  description TEXT,
  date TEXT,
  visible_to JSONB DEFAULT '[]',
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS paper_requests (
  id SERIAL PRIMARY KEY,
  order_no TEXT,
  client TEXT,
  requested_by TEXT,
  issue_to TEXT,
  status TEXT DEFAULT 'PENDING',
  rerouted_by TEXT,
  rerouted_at TIMESTAMPTZ,
  accepted_by TEXT,
  accepted_at TIMESTAMPTZ,
  rejected_by TEXT,
  rejected_at TIMESTAMPTZ,
  reject_remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS return_requests (
  id SERIAL PRIMARY KEY,
  order_no TEXT,
  client TEXT,
  requested_by TEXT,
  return_to TEXT,
  status TEXT DEFAULT 'PENDING',
  accepted_by TEXT,
  accepted_at TIMESTAMPTZ,
  rejected_by TEXT,
  rejected_at TIMESTAMPTZ,
  reject_remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Disable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE deleted_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_requests ENABLE ROW LEVEL SECURITY;

-- Create policies to allow all access (for anon key)
CREATE POLICY "Allow all" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON groups FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON deleted_orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON payments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON reminders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON paper_requests FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON return_requests FOR ALL USING (true) WITH CHECK (true);

-- Insert default admin user (password: admin@123 hashed with bcrypt)
INSERT INTO users (username, password, full_name, role, user_group) 
VALUES ('admin', '$2a$10$eJ6ekO2a2Idfs8AywLwUf.9RsldpUgPTdeJjySWlOhJQpiJ2kil4W', 'Administrator', 'admin', '')
ON CONFLICT (username) DO NOTHING;

-- Insert default groups
INSERT INTO groups (name, can_edit, can_receipt, can_assign_reminder, can_delete, can_create_quote) VALUES
('ADMIN', true, true, true, true, true),
('SALES', true, false, false, false, true),
('DISPATCH', false, false, false, false, false),
('HR', false, false, false, false, false),
('ACCOUNTS', false, true, false, false, false)
ON CONFLICT (name) DO NOTHING;
  `)
}

setup()
