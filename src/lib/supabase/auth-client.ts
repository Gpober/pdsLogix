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

const globalForSupabase = globalThis as unknown as {
  __IAMCFO_AUTH_CLIENT__?: SupabaseClient
}

function createAuthClient(): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      storageKey: "iamcfo-auth",
    },
  })
}

if (!globalForSupabase.__IAMCFO_AUTH_CLIENT__) {
  globalForSupabase.__IAMCFO_AUTH_CLIENT__ = createAuthClient()
}

export const authClient = globalForSupabase.__IAMCFO_AUTH_CLIENT__

export function getAuthClient(): SupabaseClient {
  return authClient
}

export default getAuthClient
