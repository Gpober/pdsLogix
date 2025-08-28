import { NextResponse } from "next/server"
import { ensureIntegration, getGustoSecret, upsertIntegration, appendSyncLog } from "@/lib/repos/integrations"

export async function POST() {
  try {
    const integrationId = await ensureIntegration("gusto")
    const secret = await getGustoSecret(integrationId)
    if (!secret?.access_token) {
      return NextResponse.json(
        { ok: false, error: "Not connected" },
        { status: 400 },
      )
    }

    const startedAt = new Date().toISOString()
    const delay = 500 + Math.floor(Math.random() * 1000)
    await new Promise((r) => setTimeout(r, delay))

    await upsertIntegration("gusto", { last_sync_at: new Date().toISOString() })
    await appendSyncLog(integrationId, { success: true, rows_processed: 0 })

    return NextResponse.json({ ok: true, startedAt })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
