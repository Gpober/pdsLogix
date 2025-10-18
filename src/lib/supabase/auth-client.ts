import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_PLATFORM_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_PLATFORM_SUPABASE_ANON_KEY

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_PLATFORM_SUPABASE_URL environment variable")
}

if (!supabaseAnonKey) {
  throw new Error("Missing NEXT_PUBLIC_PLATFORM_SUPABASE_ANON_KEY environment variable")
}

// This client connects to YOUR platform Supabase for authentication
export const authClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // This will pick up the session from URL hash
    flowType: 'pkce',
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    storageKey: 'iamcfo-auth', // Shared storage key
  },
})
