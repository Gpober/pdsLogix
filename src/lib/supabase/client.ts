// src/lib/supabase/client.ts
import { getAuthClient } from './auth-client'

export function createClient() {
  return getAuthClient()
}
