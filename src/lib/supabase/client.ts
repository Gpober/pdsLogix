// src/lib/supabase/client.ts
// Export the CLIENT Supabase for business data queries
import { supabase } from './supabaseClient'

export function createClient() {
  return supabase
}
