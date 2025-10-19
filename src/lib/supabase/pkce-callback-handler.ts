import { getAuthClient, syncDataClientSession } from "@/lib/supabase/client"

let hasProcessedPkceCallback = false

function clearUrlHash() {
  const cleanUrl = window.location.pathname + window.location.search
  window.history.replaceState({}, document.title, cleanUrl)
}

export function handlePkceCallbackFromUrl() {
  if (hasProcessedPkceCallback) {
    return
  }

  if (typeof window === "undefined") {
    return
  }

  const { hash } = window.location
  if (!hash || !hash.startsWith("#")) {
    return
  }

  const params = new URLSearchParams(hash.slice(1))
  const accessToken = params.get("access_token")
  const refreshToken = params.get("refresh_token")

  if (!accessToken || !refreshToken) {
    return
  }

  hasProcessedPkceCallback = true

  const authClient = getAuthClient()

  void (async () => {
    try {
      const { data, error } = await authClient.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })

      if (error) {
        throw error
      }

      const session = data.session ?? null
      await syncDataClientSession(session)
    } catch (error) {
      console.error("Failed to process PKCE callback from URL hash", error)
    } finally {
      clearUrlHash()
    }
  })()
}
