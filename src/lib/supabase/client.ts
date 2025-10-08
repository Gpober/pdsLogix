// Export auth client as createClient for login/signup pages
// This connects to YOUR platform Supabase (not PDS Logix's own Supabase)

import { authClient } from './auth-client'

export function createClient() {
  return authClient
}
