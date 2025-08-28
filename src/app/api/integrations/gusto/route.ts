import { NextResponse } from "next/server"
import { ensureIntegration, deleteIntegrationSecrets, upsertIntegration } from "@/lib/repos/integrations"

export async function DELETE() {
  try {
    const id = await ensureIntegration("gusto")
    await deleteIntegrationSecrets(id)
    await upsertIntegration("gusto", {
      status: "not_connected",
      account_name: null,
      last_sync_at: null,
      connected_at: null,
    })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
