const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.SUPABASE_URL || 'https://ttbyhawdgwwqemcqwjen.supabase.co'
const supabaseKey = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0YnloYXdkZ3d3cWVtY3F3amVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3MjU3ODcsImV4cCI6MjEwMTMwMTc4N30.V_d9mK8Bv6Sx6w89VE4Pzt6KRKvIAeHI7Dz6SbaLyh8'

const supabase = createClient(supabaseUrl, supabaseKey)

function initDatabase() {
  console.log('Supabase connected:', supabaseUrl)
}

module.exports = { supabase, initDatabase }
