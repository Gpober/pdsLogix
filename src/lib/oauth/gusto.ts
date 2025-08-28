import { URLSearchParams } from "url"

const {
  GUSTO_CLIENT_ID,
  GUSTO_CLIENT_SECRET,
  GUSTO_AUTH_URL,
  GUSTO_TOKEN_URL,
  GUSTO_API_VERSION,
  APP_BASE_URL,
} = process.env

if (!GUSTO_CLIENT_ID) throw new Error("Missing GUSTO_CLIENT_ID env variable")
if (!GUSTO_CLIENT_SECRET) throw new Error("Missing GUSTO_CLIENT_SECRET env variable")
if (!GUSTO_AUTH_URL) throw new Error("Missing GUSTO_AUTH_URL env variable")
if (!GUSTO_TOKEN_URL) throw new Error("Missing GUSTO_TOKEN_URL env variable")
if (!GUSTO_API_VERSION) throw new Error("Missing GUSTO_API_VERSION env variable")
if (!APP_BASE_URL) throw new Error("Missing APP_BASE_URL env variable")

const redirectUri = `${APP_BASE_URL}/api/oauth/gusto/callback`

export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: GUSTO_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope:
      "companies:read employees:read contractors:read payrolls:read pay_schedules:read",
    state,
  })
  return `${GUSTO_AUTH_URL}?${params.toString()}`
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
}

export async function exchangeCodeForTokens(
  code: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: GUSTO_CLIENT_ID!,
    client_secret: GUSTO_CLIENT_SECRET!,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    code,
  })

  const res = await fetch(GUSTO_TOKEN_URL!, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Gusto-API-Version": GUSTO_API_VERSION!,
    },
    body,
  })

  if (!res.ok) {
    throw new Error(`Failed to exchange code: ${res.status}`)
  }

  const json = (await res.json()) as TokenResponse
  return json
}
