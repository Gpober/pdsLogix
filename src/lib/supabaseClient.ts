import { createClient } from "@supabase/supabase-js"

// Allow either public or server-only environment variables
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Supabase URL and anon key must be provided")
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
