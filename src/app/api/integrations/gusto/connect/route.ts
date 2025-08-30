import { NextResponse } from "next/server"
import { z } from "zod"
import crypto from "crypto"
import { buildAuthorizeUrl } from "@/lib/oauth/gusto"
import { ensureIntegration, saveOAuthState } from "@/lib/repos/integrations"

const bodySchema = z.object({ mode: z.literal("oauth") })

export async function POST(req: Request) {
  try {
    const body = await req.json()
    bodySchema.parse(body)
    const state = crypto.randomBytes(16).toString("hex")
    await saveOAuthState(state)
    await ensureIntegration("gusto")
    const redirectUrl = buildAuthorizeUrl(state)
    return NextResponse.json({ redirectUrl })
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: 400 },
    )
  }
}
