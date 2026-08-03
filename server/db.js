import { createClient } from '@supabase/supabase-js'

// dotenv only needed locally - Vercel injects env vars automatically
try {
  const dotenv = await import('dotenv')
  dotenv.config()
} catch (e) {
  // ignore if dotenv not available
}

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_KEY environment variables')
}

const supabase = createClient(supabaseUrl, supabaseKey)

export { supabase }

export function initDatabase() {
  console.log('Supabase connected:', supabaseUrl)
}
