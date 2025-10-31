// src/lib/supabase/client.ts
// Main Supabase client exports for the I AM CFO platform
// Two Supabase instances: Platform (auth) + Client (data)

import { createClient as createSupabaseClient, SupabaseClient, type Session } from "@supabase/supabase-js"

// ============================================
// PLATFORM SUPABASE - Authentication
// ============================================

const platformUrl = process.env.NEXT_PUBLIC_PLATFORM_SUPABASE_URL!
const platformAnonKey = process.env.NEXT_PUBLIC_PLATFORM_SUPABASE_ANON_KEY!

if (!platformUrl || !platformAnonKey) {
  throw new Error("Missing NEXT_PUBLIC_PLATFORM_SUPABASE_URL or NEXT_PUBLIC_PLATFORM_SUPABASE_ANON_KEY")
}

let authClientInstance: SupabaseClient | null = null

export function getAuthClient(): SupabaseClient {
  if (authClientInstance) {
    return authClientInstance
  }

  authClientInstance = createSupabaseClient(platformUrl, platformAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false, // CRITICAL: Must be false to prevent JWT corruption
      flowType: "pkce",
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      storageKey: "iamcfo-platform-auth",
    },
  })

  console.log('Auth client initialized')
  return authClientInstance
}

// ============================================
// CLIENT SUPABASE - Business Data
// ============================================

const clientUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const clientAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!clientUrl || !clientAnonKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY")
}

let dataClientInstance: SupabaseClient | null = null

export function getDataClient(): SupabaseClient {
  if (dataClientInstance) {
    return dataClientInstance
  }

  dataClientInstance = createSupabaseClient(clientUrl, clientAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  console.log('Data client initialized')
  return dataClientInstance
}

// ============================================
// SESSION SYNC - Bridge Platform auth to Client data
// ============================================

export async function syncDataClientSession(session: Session | null): Promise<void> {
  const dataClient = getDataClient()

  if (!session?.access_token) {
    await dataClient.auth.signOut()
    return
  }

  try {
    if (session.refresh_token) {
      await dataClient.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      })
      console.log('Session synced to data client')
    }
  } catch (error) {
    console.error("Failed to sync session with data client:", error)
  }
}

// ============================================
// BACKWARDS COMPATIBILITY
// ============================================

// For any code still using createClient()
export function createClient() {
  return getDataClient()
}

export default getDataClient
