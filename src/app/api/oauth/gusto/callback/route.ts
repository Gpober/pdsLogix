import { NextResponse } from "next/server"
import { z } from "zod"
import { exchangeCodeForTokens } from "@/lib/oauth/gusto"
import {
  consumeOAuthState,
  ensureIntegration,
  saveGustoSecret,
  upsertIntegration,
} from "@/lib/repos/integrations"

const querySchema = z.object({ code: z.string(), state: z.string() })

export async function GET(req: Request) {
  const url = new URL(req.url)
  try {
    const { code, state } = querySchema.parse({
      code: url.searchParams.get("code"),
      state: url.searchParams.get("state"),
    })

    const valid = await consumeOAuthState(state)
    if (!valid) {
      return NextResponse.json({ ok: false, error: "Invalid state" }, { status: 400 })
    }

    const tokens = await exchangeCodeForTokens(code)
    const integrationId = await ensureIntegration("gusto")
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null

    await saveGustoSecret(integrationId, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt,
      metadata: {},
    })

    await upsertIntegration("gusto", {
      status: "connected",
      connected_at: new Date().toISOString(),
    })

    const baseUrl = process.env.APP_BASE_URL || "http://localhost:3000"
    return NextResponse.redirect(
      `${baseUrl}/settings/integrations?connected=gusto`,
    )
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: 400 },
    )
  }
}
