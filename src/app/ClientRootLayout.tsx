"use client"

import type React from "react"
import { Inter } from "next/font/google"
import "./globals.css"
import { useState, useEffect } from "react"
import {
  BarChart3,
  DollarSign,
  TrendingUp,
  CreditCard,
  FileText,
  Users,
  Menu,
  X,
  BarChart2,
  Settings,
  Wallet,
  ClipboardCheck,
  LogOut,
} from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import Image from "next/image"
import LoadingScreenSpinner from './LoadingScreen'
import { useAuth } from '@/lib/hooks/useAuth'
import { handlePkceCallbackFromUrl } from '@/lib/supabase/pkce-callback-handler'
import { createClient } from '@/lib/supabase/client'

const inter = Inter({ subsets: ["latin"] })

const BRAND_COLORS = {
  primary: "#56B6E9",
  secondary: "#3A9BD1",
  tertiary: "#7CC4ED",
  accent: "#2E86C1",
  success: "#27AE60",
  warning: "#F39C12",
  danger: "#E74C3C",
  gray: {
    50: "#F8FAFC",
    100: "#F1F5F9",
    200: "#E2E8F0",
    300: "#CBD5E1",
    400: "#94A3B8",
    500: "#64748B",
    600: "#475569",
    700: "#334155",
    800: "#1E293B",
    900: "#0F172A",
  },
}

const IAMCFOLogo = ({ className = "w-auto h-14" }) => (
  <div className={`flex items-center justify-center ${className}`}>
    <Image
      src="/iamcfo-logo.jpg"
      alt="I AM CFO Logo"
      width={220}
      height={56}
      className="object-contain"
      priority
    />
  </div>
)

const navigation = [
  { name: "Overview", href: "/", icon: BarChart3 },
  { name: "Balance Sheet", href: "/balance-sheet", icon: FileText },
  { name: "P&L", href: "/financials", icon: TrendingUp },
  { name: "Cash Flow", href: "/cash-flow", icon: DollarSign },
  { name: "A/R", href: "/accounts-receivable", icon: CreditCard },
  { name: "A/P", href: "/accounts-payable", icon: Users },
  { name: "Payroll", href: "/payroll", icon: Wallet },
  { name: "Payroll Submit", href: "/payroll-submit", icon: ClipboardCheck },
  { name: "Comparative Analysis", href: "/comparative-analysis", icon: BarChart2 },
  { name: "Settings", href: "/settings", icon: Settings },
]

// ✅ Component that handles session transfer BEFORE anything else
function SessionTransferHandler({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const [debugLog, setDebugLog] = useState<string[]>([])
  const pathname = usePathname()
  const supabase = createClient()

  const log = (msg: string) => {
    console.log(`🔍 ${msg}`)
    setDebugLog(prev => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`])
  }

  useEffect(() => {
    async function handleSessionTransfer() {
      log(`Starting session transfer handler`)
      log(`Pathname: ${pathname}`)
      log(`Full URL: ${window.location.href}`)
      
      // Skip if on login page
      if (pathname === '/login') {
        log('Skipping - on login page')
        setReady(true)
        return
      }

      try {
        // Check for session in URL hash
        const hash = window.location.hash.substring(1)
        log(`URL hash length: ${hash.length}`)
        log(`URL hash (first 100 chars): ${hash.substring(0, 100)}`)
        
        if (!hash) {
          log('No hash in URL - proceeding normally')
          setReady(true)
          return
        }

        const params = new URLSearchParams(hash)
        const accessToken = params.get('access_token')
        const refreshToken = params.get('refresh_token')
        const isSuperAdmin = params.get('super_admin') === 'true'

        log(`Has access_token: ${!!accessToken}`)
        log(`Access token length: ${accessToken?.length || 0}`)
        log(`Has refresh_token: ${!!refreshToken}`)
        log(`Refresh token length: ${refreshToken?.length || 0}`)
        log(`Is super_admin flag: ${isSuperAdmin}`)

        if (accessToken && refreshToken) {
          log('✅ Found tokens in hash - attempting to set session')
          
          // Set the session SYNCHRONOUSLY before anything else loads
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })

          if (error) {
            log(`❌ Failed to set session: ${error.message}`)
            console.error('Session set error:', error)
            setReady(true)
            return
          }

          log(`✅ Session set successfully!`)
          log(`User email: ${data.user?.email}`)
          log(`User ID: ${data.user?.id}`)

          // Verify the session was actually saved
          const { data: checkData } = await supabase.auth.getSession()
          log(`Session verification: ${!!checkData.session}`)
          log(`Verified email: ${checkData.session?.user?.email}`)

          // Clean up URL
          log('Cleaning URL hash...')
          window.history.replaceState({}, document.title, window.location.pathname)
          log('URL hash cleaned')

          // Verify access
          const currentSubdomain = window.location.hostname.split('.')[0]
          log(`Current subdomain: ${currentSubdomain}`)
          
          if (isSuperAdmin) {
            log('✅ Super admin detected - granting access')
            sessionStorage.setItem('session_transferred', 'true')
            sessionStorage.setItem('super_admin_access', 'true')
            log('Reloading page in 1 second...')
            setTimeout(() => {
              window.location.reload()
            }, 1000)
            return
          }

          log('Regular user - checking org access...')
          
          // Regular user - check org access
          const { data: userData, error: userError } = await supabase
            .from('users')
            .select('organization_id, organizations(subdomain)')
            .eq('id', data.user.id)
            .single()

          if (userError) {
            log(`❌ Error fetching user data: ${userError.message}`)
            setReady(true)
            return
          }

          const userSubdomain = (userData as any)?.organizations?.subdomain
          log(`User's subdomain: ${userSubdomain}`)

          if (userSubdomain === currentSubdomain) {
            log('✅ User belongs to this org')
            sessionStorage.setItem('session_transferred', 'true')
            log('Reloading page in 1 second...')
            setTimeout(() => {
              window.location.reload()
            }, 1000)
            return
          }

          // No access
          log('❌ User does not belong to this org')
          alert('You do not have access to this organization')
          await supabase.auth.signOut()
          window.location.href = 'https://iamcfo.com/login'
          return
        }

        log('No valid tokens in hash - proceeding normally')
        setReady(true)
      } catch (error) {
        log(`❌ Exception: ${error}`)
        console.error('Session transfer error:', error)
        setReady(true)
      }
    }

    // Check if we just transferred (prevents infinite reload)
    const justTransferred = sessionStorage.getItem('session_transferred')
    log(`Just transferred flag: ${justTransferred}`)
    
    if (justTransferred) {
      log('Session was just transferred - clearing flag and proceeding')
      sessionStorage.removeItem('session_transferred')
      setReady(true)
      return
    }

    handleSessionTransfer()
  }, [pathname, supabase])

  // Show debug log on screen
  const showDebug = debugLog.length > 0

  if (!ready) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Processing authentication...</p>
        </div>
        
        {showDebug && (
          <div className="fixed top-4 right-4 bg-black text-white p-4 rounded-lg max-w-2xl max-h-[80vh] overflow-auto text-xs font-mono shadow-2xl z-50">
            <div className="font-bold mb-2 text-yellow-300">🔍 DEBUG LOG (Session Transfer)</div>
            <div className="space-y-1">
              {debugLog.map((log, i) => (
                <div key={i} className={
                  log.includes('❌') ? 'text-red-400' :
                  log.includes('✅') ? 'text-green-400' :
                  'text-gray-300'
                }>{log}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      {children}
      {showDebug && (
        <div className="fixed bottom-4 right-4 bg-black text-white p-4 rounded-lg max-w-2xl max-h-96 overflow-auto text-xs font-mono shadow-2xl z-50">
          <div className="font-bold mb-2 text-yellow-300">🔍 DEBUG LOG (After Transfer)</div>
          <div className="space-y-1">
            {debugLog.map((log, i) => (
              <div key={i} className={
                log.includes('❌') ? 'text-red-400' :
                log.includes('✅') ? 'text-green-400' :
                'text-gray-300'
              }>{log}</div>
            ))}
          </div>
          <button 
            onClick={() => setDebugLog([])}
            className="mt-2 px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs"
          >
            Clear Log
          </button>
        </div>
      )}
    </>
  )
}

export default function ClientRootLayout({ children }: { children: React.ReactNode }) {
  // ✅ Handle PKCE callback
  handlePkceCallbackFromUrl()

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarVisible, setSidebarVisible] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const pathname = usePathname()
  const { user, loading: authLoading, signOut, getFilteredNavigation } = useAuth()

  const filteredNavigation = user ? getFilteredNavigation(navigation) : []

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 1500)
    return () => clearTimeout(timer)
  }, [])

  if (isLoading || authLoading) {
    return (
      <html lang="en">
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
          <link rel="icon" type="image/png" href="/favicon.png" />
          <meta name="theme-color" content="#56B6E9" />
        </head>
        <body className={inter.className}>
          <SessionTransferHandler>
            <LoadingScreenSpinner />
          </SessionTransferHandler>
        </body>
      </html>
    )
  }

  if (pathname?.startsWith("/mobile-dashboard") || pathname === "/login") {
    return (
      <html lang="en">
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
          <link rel="icon" type="image/png" href="/favicon.png" />
        </head>
        <body className={inter.className}>
          <SessionTransferHandler>
            {children}
          </SessionTransferHandler>
        </body>
      </html>
    )
  }

  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
        <link rel="icon" type="image/png" href="/favicon.png" />
      </head>
      <body className={inter.className}>
        <SessionTransferHandler>
          <div className="min-h-screen bg-gray-50">
            <div className="hidden lg:block fixed inset-y-0 left-0 w-2 z-40" onMouseEnter={() => setSidebarVisible(true)} />

            {/* Sidebar code unchanged... */}
            <div className={`flex flex-col flex-1 transition-all duration-300 ${sidebarVisible ? "lg:pl-64" : ""}`}>
              <div className="sticky top-0 z-10 bg-white pl-1 pt-1 sm:pl-3 sm:pt-3 lg:hidden">
                <button type="button" className="-ml-0.5 -mt-0.5 inline-flex h-12 w-12 items-center justify-center rounded-md text-gray-500 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset" onClick={() => setSidebarOpen(true)}>
                  <Menu className="h-6 w-6" />
                </button>
              </div>
              <main className="flex-1">{children}</main>
            </div>
          </div>
        </SessionTransferHandler>
      </body>
    </html>
  )
}
