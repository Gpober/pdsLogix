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
import { getAuthClient } from '@/lib/supabase/auth-client'

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
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    async function handleSessionTransfer() {
      try {
        console.log('🔍 SessionTransferHandler: Starting...')
        
        // Check if already transferred this page load
        if ((window as any).__sessionTransferred) {
          console.log('✅ Session already transferred')
          setReady(true)
          return
        }

        // Get hash from URL
        const hash = window.location.hash.substring(1)
        
        if (!hash) {
          console.log('✅ No hash in URL')
          setReady(true)
          return
        }

        console.log('📍 Found hash, parsing tokens...')

        // Parse hash parameters
        const params = new URLSearchParams(hash)
        const accessToken = params.get('access_token')
        const refreshToken = params.get('refresh_token')
        const isSuperAdmin = params.get('super_admin') === 'true'

        if (!accessToken || !refreshToken) {
          console.log('⚠️ No tokens in hash')
          setReady(true)
          return
        }

        console.log('🔑 Found tokens:', {
          accessTokenLength: accessToken.length,
          hasRefreshToken: !!refreshToken,
          isSuperAdmin
        })

        // Mark as transferred
        (window as any).__sessionTransferred = true

        // Clean URL FIRST
        console.log('🧹 Cleaning URL...')
        window.history.replaceState({}, '', window.location.pathname + window.location.search)

        // Get auth client (singleton)
        const authClient = getAuthClient()

        // Set session
        console.log('🔄 Setting session...')
        const { data, error } = await authClient.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })

        if (error) {
          console.error('❌ Session error:', error)
          setReady(true)
          return
        }

        if (!data.session) {
          console.error('❌ No session returned')
          setReady(true)
          return
        }

        console.log('✅ Session set:', {
          userId: data.user?.id,
          email: data.user?.email
        })

        // Store super admin flag
        if (isSuperAdmin) {
          console.log('🔐 Super admin access')
          sessionStorage.setItem('is_super_admin', 'true')
          
          console.log('🔄 Reloading...')
          window.location.reload()
          return
        }

        // Regular user - verify organization access
        const currentSubdomain = window.location.hostname.split('.')[0]
        console.log('🌐 Current subdomain:', currentSubdomain)

        // Import data client to check org
        const { getDataClient } = await import('@/lib/supabase/client')
        const dataClient = getDataClient()

        const { data: userData, error: userError } = await dataClient
          .from('profiles')
          .select('organization_id, organizations(subdomain)')
          .eq('id', data.user.id)
          .single()

        if (userError) {
          console.error('❌ User fetch error:', userError)
          setReady(true)
          return
        }

        const userSubdomain = (userData as any)?.organizations?.subdomain
        console.log('👤 User subdomain:', userSubdomain)

        if (userSubdomain === currentSubdomain) {
          console.log('✅ Access granted')
          console.log('🔄 Reloading...')
          window.location.reload()
          return
        }

        // Access denied
        console.error('❌ Access denied')
        alert('You do not have access to this organization')
        await authClient.auth.signOut()
        window.location.href = 'https://iamcfo.com/login'

      } catch (error) {
        console.error('💥 Transfer error:', error)
        setReady(true)
      }
    }

    handleSessionTransfer()
  }, []) // Empty deps - only run once

  if (!ready) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 font-semibold">Authenticating...</p>
        </div>
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

            {/* Mobile sidebar */}
            <div className={`fixed inset-0 z-50 lg:hidden ${sidebarOpen ? "block" : "hidden"}`}>
              <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setSidebarOpen(false)} />
              <div className="relative flex w-full max-w-xs flex-1 flex-col bg-white">
                <div className="absolute top-0 right-0 -mr-12 pt-2">
                  <button type="button" className="ml-1 flex h-10 w-10 items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white" onClick={() => setSidebarOpen(false)}>
                    <X className="h-6 w-6 text-white" />
                  </button>
                </div>
                <div className="flex flex-shrink-0 items-center justify-center px-4 py-4">
                  <IAMCFOLogo className="w-auto h-10" />
                </div>
                <div className="mt-5 h-0 flex-1 overflow-y-auto">
                  <nav className="space-y-1 px-2">
                    {filteredNavigation.map((item) => {
                      const isActive = pathname === item.href
                      return (
                        <Link key={item.name} href={item.href} className={`group flex items-center px-2 py-2 text-base font-medium rounded-md ${isActive ? "text-white" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`} style={{ backgroundColor: isActive ? BRAND_COLORS.primary : undefined }} onClick={() => setSidebarOpen(false)}>
                          <item.icon className={`mr-4 h-6 w-6 flex-shrink-0 ${isActive ? "text-white" : "text-gray-400 group-hover:text-gray-500"}`} />
                          {item.name}
                        </Link>
                      )
                    })}
                    <button onClick={signOut} className="w-full group flex items-center px-2 py-2 text-base font-medium rounded-md text-gray-600 hover:bg-gray-50 hover:text-gray-900">
                      <LogOut className="mr-4 h-6 w-6 flex-shrink-0 text-gray-400 group-hover:text-gray-500" />
                      Sign Out
                    </button>
                  </nav>
                </div>
                {user && (
                  <div className="flex-shrink-0 flex border-t border-gray-200 p-4">
                    <div className="flex-shrink-0 group block">
                      <div className="flex items-center">
                        <div className="ml-3">
                          <p className="text-sm font-medium text-gray-700">{user.name}</p>
                          <p className="text-xs font-medium text-gray-500 capitalize">{user.role}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Desktop sidebar */}
            <div className={`hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col transform transition-transform duration-300 ${sidebarVisible ? "translate-x-0" : "-translate-x-full"}`} onMouseEnter={() => setSidebarVisible(true)} onMouseLeave={() => setSidebarVisible(false)}>
              <div className="flex min-h-0 flex-1 flex-col bg-white border-r border-gray-200">
                <div className="flex flex-1 flex-col overflow-y-auto pt-5 pb-4">
                  <div className="flex flex-shrink-0 items-center justify-center px-4">
                    <IAMCFOLogo className="w-auto h-10" />
                  </div>
                  <nav className="mt-5 flex-1 space-y-1 px-2">
                    {filteredNavigation.map((item) => {
                      const isActive = pathname === item.href
                      return (
                        <Link key={item.name} href={item.href} className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md ${isActive ? "text-white" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`} style={{ backgroundColor: isActive ? BRAND_COLORS.primary : undefined }}>
                          <item.icon className={`mr-3 h-6 w-6 flex-shrink-0 ${isActive ? "text-white" : "text-gray-400 group-hover:text-gray-500"}`} />
                          {item.name}
                        </Link>
                      )
                    })}
                    <button onClick={signOut} className="w-full group flex items-center px-2 py-2 text-sm font-medium rounded-md text-gray-600 hover:bg-gray-50 hover:text-gray-900">
                      <LogOut className="mr-3 h-6 w-6 flex-shrink-0 text-gray-400 group-hover:text-gray-500" />
                      Sign Out
                    </button>
                  </nav>
                </div>
                {user && (
                  <div className="flex-shrink-0 flex border-t border-gray-200 p-4">
                    <div className="flex-shrink-0 group block w-full">
                      <div className="flex items-center">
                        <div>
                          <p className="text-sm font-medium text-gray-700">{user.name}</p>
                          <p className="text-xs font-medium text-gray-500 capitalize">{user.role}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

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
