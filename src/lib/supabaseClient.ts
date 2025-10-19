import { createClient } from "@supabase/supabase-js"

const supabaseUrl =
  process.env.NEXT_PUBLIC_PLATFORM_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_PLATFORM_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl) {
  throw new Error(
    "Missing NEXT_PUBLIC_PLATFORM_SUPABASE_URL environment variable (falling back to NEXT_PUBLIC_SUPABASE_URL also failed)"
  )
}

if (!supabaseAnonKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_PLATFORM_SUPABASE_ANON_KEY environment variable (falling back to NEXT_PUBLIC_SUPABASE_ANON_KEY also failed)"
  )
}

if (!process.env.NEXT_PUBLIC_PLATFORM_SUPABASE_URL || !process.env.NEXT_PUBLIC_PLATFORM_SUPABASE_ANON_KEY) {
  console.warn(
    "⚠️ Using legacy NEXT_PUBLIC_SUPABASE_* environment variables. Configure NEXT_PUBLIC_PLATFORM_SUPABASE_* for platform auth."
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
