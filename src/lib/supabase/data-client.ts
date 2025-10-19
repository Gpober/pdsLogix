import { createClient as createSupabaseClient, SupabaseClient, type Session } from "@supabase/supabase-js"

const dataUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const dataAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!dataUrl || !dataAnonKey) {
  throw new Error("Missing Client Supabase environment variables")
}

let dataClientInstance: SupabaseClient | null = null

export function getDataClient(): SupabaseClient {
  if (dataClientInstance) {
    return dataClientInstance
  }

  dataClientInstance = createSupabaseClient(dataUrl, dataAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  return dataClientInstance
}

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
    }
  } catch (error) {
    console.error("Failed to sync data client session:", error)
  }
}
