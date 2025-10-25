import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRole = process.env.SUPABASE_SERVICE_ROLE

if (!url) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable')
}

if (!serviceRole) {
  throw new Error('Missing SUPABASE_SERVICE_ROLE environment variable')
}

export const supabase = createClient(url, serviceRole, {
  auth: { persistSession: false },
})
