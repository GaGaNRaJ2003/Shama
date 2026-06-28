import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.SUPABASE_URL || ''
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || ''

export const isDbConfigured = !!(supabaseUrl && supabaseAnonKey)

export const supabase = isDbConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : (null as any)

if (!isDbConfigured) {
  console.warn('WARNING: SUPABASE_URL or SUPABASE_ANON_KEY environment variables are missing. Backend will operate in fallback mock data mode.')
}
