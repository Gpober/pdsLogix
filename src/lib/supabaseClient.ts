import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let cachedClient: SupabaseClient | null = null

export class SupabaseConfigurationError extends Error {
  constructor(message = "Supabase environment variables are not configured.") {
    super(message)
    this.name = "SupabaseConfigurationError"
  }
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  )
}

export function getSupabaseClient(): SupabaseClient {
  if (cachedClient) {
    return cachedClient
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new SupabaseConfigurationError()
  }

  cachedClient = createClient(supabaseUrl, supabaseAnonKey)
  return cachedClient
}

export function tryGetSupabaseClient(): SupabaseClient | null {
  try {
    return getSupabaseClient()
  } catch (error) {
    if (error instanceof SupabaseConfigurationError) {
      return null
    }
    throw error
  }
}

export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getSupabaseClient()
    const value = Reflect.get(client, prop, receiver)
    return typeof value === "function" ? value.bind(client) : value
  },
})
