// src/lib/supabase/client.ts
import { authClient } from './auth-client'

export function createClient() {
  return authClient
}
