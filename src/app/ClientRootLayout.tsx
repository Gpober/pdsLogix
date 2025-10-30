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

// 🚨 CAPTURE HASH IMMEDIATELY
let CAPTURED_HASH = ''
let HASH_CAPTURED = false

if (typeof window !== 'undefined' && !HASH_CAPTURED) {
  CAPTURED_HASH = window.location.hash.substring(1)
  HASH_CAPTURED = true
  console.log('🔒 CAPTURED HASH ON LOAD:', CAPTURED_HASH.substring(0, 100))
}

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

function SessionTransferHandler({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const [debugLog, setDebugLog] = useState<string[]>([])
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const log = (msg: string) => {
    console.log(`🔍 ${msg}`)
    setDebugLog(prev => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`])
  }

  useEffect(() => {
    async function handleSessionTransfer() {
      log(`=== SESSION TRANSFER START ===`)
      log(`Pathname: ${pathname}`)
      
      // Check if we just transferred
      const justTransferred = sessionStorage.getItem('session_transferred')
      log(`Just transferred flag: ${justTransferred || 'null'}`)
      
      if (justTransferred) {
        log('✅ Previously transferred - clearing flag and proceeding')
        sessionStorage.removeItem('session_transferred')
        CAPTURED_HASH = ''
        setReady(true)
        return
      }

      try {
        log(`Captured hash length: ${CAPTURED_HASH.length}`)
        log(`Hash preview: ${CAPTURED_HASH.substring(0, 150)}...`)
        
        if (!CAPTURED_HASH) {
          log('⚠️ No hash - proceeding normally')
          setReady(true)
          return
        }

        const params = new URLSearchParams(CAPTURED_HASH)
        const accessToken = params.get('access_token')
        const refreshToken = params.get('refresh_token')
        const isSuperAdmin = params.get('super_admin') === 'true'

        log(`Access token: ${accessToken ? `YES (${accessToken.length} chars)` : 'NO'}`)
        log(`Refresh token: ${refreshToken ? `YES (${refreshToken.length} chars)` : 'NO'}`)
        log(`Super admin: ${isSuperAdmin}`)

        if (accessToken && refreshToken) {
          log('🚀 Setting session...')
          
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })

          if (error) {
            log(`❌ setSession FAILED: ${error.message}`)
            console.error('Full error:', error)
            setReady(true)
            return
          }

          log(`✅ Session set! User: ${data.user?.email}`)

          // Verify
          const { data: checkData } = await supabase.auth.getSession()
          log(`Session verified: ${checkData.session ? 'YES' : 'NO'}`)

          // Clean URL
          window.history.replaceState({}, document.title, window.location.pathname)
          log('URL cleaned')

          const currentSubdomain = window.location.hostname.split('.')[0]
          log(`Subdomain: ${currentSubdomain}`)
          
          if (isSuperAdmin) {
            log('👑 SUPER ADMIN - GRANTED')
            sessionStorage.setItem('session_transferred', 'true')
            sessionStorage.setItem('super_admin_access', 'true')
            
            // If on /login, redirect to dashboard
            if (pathname === '/login') {
              log('Redirecting from /login to /')
              window.location.href = '/'
            } else {
              log('Reloading page...')
              window.location.reload()
            }
            return
          }

          log('Checking user org...')
          
          const { data: userData, error: userError } = await supabase
            .from('users')
            .select('organization_id, organizations(subdomain)')
            .eq('id', data.user.id)
            .single()

          if (userError) {
            log(`❌ User data error: ${userError.message}`)
            setReady(true)
            return
          }

          const userSubdomain = (userData as any)?.organizations?.subdomain
          log(`User subdomain: ${userSubdomain}`)

          if (userSubdomain === currentSubdomain) {
            log('✅ User belongs here')
            sessionStorage.setItem('session_transferred', 'true')
            
            if (pathname === '/login') {
              log('Redirecting from /login to /')
              window.location.href = '/'
            } else {
              log('Reloading...')
              window.location.reload()
            }
            return
          }

          log('❌ Wrong org')
          alert('You do not have access to this organization')
          await supabase.auth.signOut()
          window.location.href = 'https://iamcfo.com/login'
          return
        }

        log('⚠️ No tokens in hash')
        setReady(true)
      } catch (error) {
        log(`❌ Exception: ${error}`)
        console.error('Exception:', error)
        setReady(true)
      }
    }

    handleSessionTransfer()
  }, [pathname, router, supabase])

  const showDebug = debugLog.length > 0

  if (!ready) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 font-semibold">Authenticating...</p>
        </div>
        
        {showDebug && (
          <div className="fixed top-4 left-4 right-4 bg-black text-white p-4 rounded-lg max-h-[90vh] overflow-auto text-xs font-mono shadow-2xl z-50">
            <div className="font-bold mb-2 text-yellow-300 text-lg">🔍 DEBUG LOG</div>
            <div className="space-y-1">
              {debugLog.map((log, i) => (
                <div key={i} className={
                  log.includes('❌') ? 'text-red-400 font-bold' :
                  log.includes('✅') || log.includes('SUCCESS') ? 'text-green-400 font-bold' :
                  log.includes('👑') ? 'text-purple-400 font-bold' :
                  'text-gray-300'
                }>{log}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return <>{children}</>
}

export default function ClientRootLayout({ children }: { children: React.ReactNode }) {
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

            {/* Rest of your sidebar code... */}
            
            <main className="flex-1">{children}</main>
          </div>
        </SessionTransferHandler>
      </body>
    </html>
  )
}
