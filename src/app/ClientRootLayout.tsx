"use client"

import type { ReactNode } from "react"
import { useEffect } from "react"

import "./globals.css"

import { getAuthClient, syncDataClientSession } from "@/lib/supabase/client"

// Use sessionStorage instead of in-memory flag for mobile persistence
const PKCE_PROCESSED_KEY = "pkce_callback_processed"
const PKCE_TIMESTAMP_KEY = "pkce_callback_timestamp"

function hasRecentlyProcessedCallback(): boolean {
  if (typeof window === 'undefined') return false
  
  const timestamp = sessionStorage.getItem(PKCE_TIMESTAMP_KEY)
  if (!timestamp) return false
  
  // Consider processed if done in last 10 seconds
  const elapsed = Date.now() - parseInt(timestamp, 10)
  return elapsed < 10000
}

function markCallbackAsProcessed() {
  if (typeof window === 'undefined') return
  
  sessionStorage.setItem(PKCE_PROCESSED_KEY, 'true')
  sessionStorage.setItem(PKCE_TIMESTAMP_KEY, Date.now().toString())
}

function clearUrlHash() {
  if (typeof window === 'undefined') return
  
  const cleanUrl = window.location.pathname + window.location.search
  window.history.replaceState({}, document.title, cleanUrl)
}

export function handlePkceCallbackFromUrl() {
  // Check if already processed recently
  if (hasRecentlyProcessedCallback()) {
    console.log("🔒 PKCE callback already processed recently, skipping")
    clearUrlHash() // Still clear the hash
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

  console.log("🔐 Processing PKCE callback from URL hash")
  markCallbackAsProcessed()

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

      console.log("✅ PKCE session set successfully")
      const session = data.session ?? null

      // Sync to data client
      await syncDataClientSession(session)
      console.log("✅ Session synced to data client")

    } catch (error) {
      console.error("❌ Failed to process PKCE callback from URL hash", error)
      // Clear the processed flag so it can retry
      sessionStorage.removeItem(PKCE_PROCESSED_KEY)
      sessionStorage.removeItem(PKCE_TIMESTAMP_KEY)
    } finally {
      clearUrlHash()
    }
  })()
}

// Export a function to reset the flag if needed
export function resetPkceCallbackFlag() {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(PKCE_PROCESSED_KEY)
  sessionStorage.removeItem(PKCE_TIMESTAMP_KEY)
}

type ClientRootLayoutProps = {
  children: ReactNode
}

export default function ClientRootLayout({ children }: ClientRootLayoutProps) {
  useEffect(() => {
    handlePkceCallbackFromUrl()

    const authClient = getAuthClient()

    void authClient.auth.getSession().then(async ({ data }) => {
      await syncDataClientSession(data.session ?? null)
    })

    const {
      data: { subscription },
    } = authClient.auth.onAuthStateChange((_event, session) => {
      void syncDataClientSession(session ?? null)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
