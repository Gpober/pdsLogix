import { createClient } from "@supabase/supabase-js"

const supabaseUrl = "https://bdtmsfbhaztukqppnhdk.supabase.co"
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkdG1zZmJoYXp0dWtxcHBuaGRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMDE0NTQsImV4cCI6MjA3MDc3NzQ1NH0.1nJz_lgeRQNTaiFohC5u6yk3OXEleA4sI5pgwPouRsU"

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
