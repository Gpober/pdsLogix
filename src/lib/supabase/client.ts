// src/lib/supabase/client.ts
// Export the CLIENT Supabase for business data queries
import { supabase } from '../supabaseClient'  // Go up one folder level

export function createClient() {
  return supabase
}
