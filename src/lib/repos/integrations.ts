import { supabaseAdmin } from "@/lib/supabaseAdmin"

export async function getStatuses() {
  const { data, error } = await supabaseAdmin
    .from("integrations")
    .select("id,type,status,account_name,last_sync_at")
    .in("type", ["accounting", "gusto"])

  if (error) throw error

  const map: Record<string, any> = {}
  data?.forEach((row) => {
    map[row.type] = {
      type: row.type,
      status: row.status,
      accountName: row.account_name,
      lastSyncAt: row.last_sync_at,
    }
  })

  if (!map["accounting"]) {
    map["accounting"] = {
      type: "accounting",
      status: "not_connected",
    }
  }
  if (!map["gusto"]) {
    map["gusto"] = {
      type: "gusto",
      status: "not_connected",
    }
  }

  return Object.values(map) as Array<{
    type: "gusto" | "accounting"
    status: "connected" | "not_connected" | "action_required"
    accountName?: string | null
    lastSyncAt?: string | null
  }>
}

export async function ensureIntegration(
  type: "gusto" | "accounting",
): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("integrations")
    .select("id")
    .eq("type", type)
    .maybeSingle()

  if (error) throw error

  if (data?.id) return data.id

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("integrations")
    .insert({ type, status: "not_connected" })
    .select("id")
    .single()

  if (insertError) throw insertError
  return inserted.id
}

export async function upsertIntegration(
  type: "gusto" | "accounting",
  patch: Partial<{
    status: string
    account_name: string | null
    last_sync_at: string | null
    connected_at: string | null
  }>,
) {
  const { error } = await supabaseAdmin
    .from("integrations")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("type", type)

  if (error) throw error
}

export async function saveOAuthState(state: string, ttlMinutes = 10) {
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString()
  const { error } = await supabaseAdmin
    .from("integration_oauth_states")
    .insert({ state, expires_at: expiresAt })
  if (error) throw error
}

export async function consumeOAuthState(state: string) {
  const { data, error } = await supabaseAdmin
    .from("integration_oauth_states")
    .select("state, expires_at, used")
    .eq("state", state)
    .maybeSingle()

  if (error || !data) return false
  if (data.used) return false
  if (data.expires_at && new Date(data.expires_at) < new Date()) return false

  await supabaseAdmin
    .from("integration_oauth_states")
    .update({ used: true })
    .eq("state", state)
  return true
}

export async function saveGustoSecret(
  integrationId: string,
  token: {
    access_token?: string
    refresh_token?: string
    expires_at?: string | null
    metadata?: any
  },
) {
  const { data } = await supabaseAdmin
    .from("integration_tokens")
    .select("id, metadata")
    .eq("integration_id", integrationId)
    .maybeSingle()

  const payload = {
    integration_id: integrationId,
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_at: token.expires_at,
    metadata: token.metadata ?? data?.metadata ?? {},
  }

  const query = data
    ? supabaseAdmin.from("integration_tokens").update(payload).eq("id", data.id)
    : supabaseAdmin.from("integration_tokens").insert(payload)

  const { error } = await query
  if (error) throw error
}

export async function getGustoSecret(integrationId: string) {
  const { data, error } = await supabaseAdmin
    .from("integration_tokens")
    .select("access_token, refresh_token, expires_at, metadata")
    .eq("integration_id", integrationId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function deleteIntegrationSecrets(integrationId: string) {
  await supabaseAdmin
    .from("integration_tokens")
    .delete()
    .eq("integration_id", integrationId)
}

export async function appendSyncLog(
  integrationId: string,
  data: { rows_processed?: number; success: boolean; error?: string | null },
) {
  await supabaseAdmin.from("integration_sync_logs").insert({
    integration_id: integrationId,
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
    rows_processed: data.rows_processed ?? 0,
    success: data.success,
    error: data.error,
  })
}

export async function getPayrollMapping(integrationId: string) {
  const { data, error } = await supabaseAdmin
    .from("integration_tokens")
    .select("metadata")
    .eq("integration_id", integrationId)
    .maybeSingle()

  if (error) throw error
  return (
    (data?.metadata?.payroll_mapping as Array<{
      source: "department" | "location"
      sourceId: string
      sourceName?: string | null
      mappedCustomer: string
    }>) || []
  )
}

export async function savePayrollMapping(
  integrationId: string,
  rows: Array<{
    source: "department" | "location"
    sourceId: string
    sourceName?: string | null
    mappedCustomer: string
  }>,
) {
  const { data } = await supabaseAdmin
    .from("integration_tokens")
    .select("metadata, id")
    .eq("integration_id", integrationId)
    .maybeSingle()

  const metadata = data?.metadata || {}
  metadata.payroll_mapping = rows

  const payload = {
    integration_id: integrationId,
    metadata,
  }

  const query = data
    ? supabaseAdmin.from("integration_tokens").update(payload).eq("id", data.id)
    : supabaseAdmin.from("integration_tokens").insert(payload)

  const { error } = await query
  if (error) throw error
}
