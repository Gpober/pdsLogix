import { NextResponse } from "next/server"
import { getStatuses } from "@/lib/repos/integrations"

export async function GET() {
  try {
    const items = await getStatuses()
    return NextResponse.json({ items })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export type IntegrationStatus = {
  type: "gusto" | "accounting"
  status: "connected" | "not_connected" | "action_required"
  accountName?: string | null
  lastSyncAt?: string | null
}

export type IntegrationsResponse = { items: IntegrationStatus[] }
