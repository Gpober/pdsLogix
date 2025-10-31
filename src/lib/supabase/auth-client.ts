import { createClient, SupabaseClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_PLATFORM_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_PLATFORM_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Platform Supabase environment variables")
}

let authClientInstance: SupabaseClient | null = null

export function getAuthClient(): SupabaseClient {
  if (authClientInstance) {
    return authClientInstance
  }

  authClientInstance = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false, // ⚠️ CRITICAL: Must be false to prevent JWT corruption
      flowType: "pkce",
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      storageKey: "iamcfo-platform-auth",
    },
  })

  console.log('✅ Auth client initialized')
  return authClientInstance
}
