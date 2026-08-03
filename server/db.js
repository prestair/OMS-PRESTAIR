import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

// Load .env file only in local development
dotenv.config()

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_KEY environment variables')
}

const supabase = createClient(supabaseUrl || '', supabaseKey || '')

export { supabase }

export function initDatabase() {
  console.log('Supabase connected:', supabaseUrl)
}
