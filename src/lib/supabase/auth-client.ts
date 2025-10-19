// src/lib/supabase/auth-client.ts
import { createClient, SupabaseClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_PLATFORM_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_PLATFORM_SUPABASE_ANON_KEY

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_PLATFORM_SUPABASE_URL environment variable")
}

if (!supabaseAnonKey) {
  throw new Error("Missing NEXT_PUBLIC_PLATFORM_SUPABASE_ANON_KEY environment variable")
}

// Singleton instance - only create once
let authClientInstance: SupabaseClient | null = null

function getAuthClient() {
  if (!authClientInstance) {
    console.log('🔧 Creating new auth client instance')
    authClientInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
        storageKey: 'iamcfo-auth',
      },
    })
  } else {
    console.log('♻️ Reusing existing auth client instance')
  }
  return authClientInstance
}

// Export as both named export and default
export const authClient = getAuthClient()
export default getAuthClient
