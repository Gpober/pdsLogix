// src/lib/supabase/client.ts
import { createClient as createSupabaseClient, SupabaseClient, type Session } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable")
}

if (!supabaseAnonKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable")
}

const globalForSupabase = globalThis as unknown as {
  __IAMCFO_DATA_CLIENT__?: SupabaseClient
}

function createDataClient(): SupabaseClient {
  return createSupabaseClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

export function getDataClient(): SupabaseClient {
  if (!globalForSupabase.__IAMCFO_DATA_CLIENT__) {
    globalForSupabase.__IAMCFO_DATA_CLIENT__ = createDataClient()
  }

  return globalForSupabase.__IAMCFO_DATA_CLIENT__
}

export async function syncDataClientSession(session: Session | null): Promise<void> {
  const dataClient = getDataClient()

  if (!session || !session.access_token) {
    await dataClient.auth.signOut()
    return
  }

  try {
    if (session.refresh_token) {
      await dataClient.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      })
    } else {
      await dataClient.auth.setAuth(session.access_token)
    }
  } catch (error) {
    console.error("❌ Failed to sync session with data Supabase:", error)
  }
}

export function createClient(): SupabaseClient {
  return getDataClient()
}

export default getDataClient
