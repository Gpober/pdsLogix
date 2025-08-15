import { createClient, type SupabaseClient } from "@supabase/supabase-js"

// Lazily create the client so missing env vars don't break the build
export const getSupabaseClient = (): SupabaseClient => {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase URL and anon key must be provided")
  }

  return createClient(supabaseUrl, supabaseAnonKey)
}
