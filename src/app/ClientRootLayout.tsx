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
import { usePathname } from "next/navigation"
import Image from "next/image"
import LoadingScreenSpinner from './LoadingScreen'
import { useAuth } from '@/lib/hooks/useAuth'

const inter = Inter({ subsets: ["latin"] })

// I AM CFO Brand Colors
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

// I AM CFO Logo Component
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
  {
    name: "Comparative Analysis",
    href: "/comparative-analysis",
    icon: BarChart2,
  },
  { name: "Settings", href: "/settings", icon: Settings },
]

export default function ClientRootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarVisible, setSidebarVisible] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const pathname = usePathname()
  const { user, loading: authLoading, signOut, getFilteredNavigation } = useAuth()

  // Get filtered navigation based on user role
  const filteredNavigation = user ? getFilteredNavigation(navigation) : []

  // Loading effect on app initialization
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false)
    }, 1500) // 1.5 seconds loading

    return () => clearTimeout(timer)
  }, [])

  // Show loading screen during initialization or auth loading
  if (isLoading || authLoading) {
    return (
      <html lang="en">
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
          <link rel="icon" type="image/png" href="/favicon.png" />
          <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
          <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
          <meta name="mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
          <meta name="apple-mobile-web-app-title" content="I AM CFO" />
          <meta name="theme-color" content="#56B6E9" />
        </head>
        <body className={inter.className}>
          <LoadingScreenSpinner />
        </body>
      </html>
    )
  }

  // Render mobile dashboard without global navigation - FULLSCREEN MODE
  if (pathname?.startsWith("/mobile-dashboard")) {
    return (
      <html lang="en">
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
          <link rel="icon" type="image/png" href="/favicon.png" />
          <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
          <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
          <meta name="mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
          <meta name="apple-mobile-web-app-title" content="I AM CFO" />
          <meta name="theme-color" content="#56B6E9" />
        </head>
        <body className={inter.className}>{children}</body>
      </html>
    )
  }

  if (pathname === "/login") {
    return (
      <html lang="en">
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
          <link rel="icon" type="image/png" href="/favicon.png" />
          <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
          <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
          <meta name="mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
          <meta name="apple-mobile-web-app-title" content="I AM CFO" />
          <meta name="theme-color" content="#56B6E9" />
        </head>
        <body className={inter.className}>{children}</body>
      </html>
    )
  }

  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
        <link rel="icon" type="image/png" href="/favicon.png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="I AM CFO" />
        <meta name="theme-color" content="#56B6E9" />
      </head>
      <body className={inter.className}>
        <div className="min-h-screen bg-gray-50">
          {/* Hover area to reveal sidebar */}
          <div
            className="hidden lg:block fixed inset-y-0 left-0 w-2 z-40"
            onMouseEnter={() => setSidebarVisible(true)}
          />

          {/* Mobile sidebar */}
          <div className={`fixed inset-0 z-50 lg:hidden ${sidebarOpen ? "block" : "hidden"}`}>
            <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setSidebarOpen(false)} />
            <div className="relative flex w-full max-w-xs flex-1 flex-col bg-white">
              <div className="absolute top-0 right-0 -mr-12 pt-2">
                <button
                  type="button"
                  className="ml-1 flex h-10 w-10 items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
                  onClick={() => setSidebarOpen(false)}
                >
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
                      <Link
                        key={item.name}
                        href={item.href}
                        className={`group flex items-center px-2 py-2 text-base font-medium rounded-md ${
                          isActive ? "text-white" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                        }`}
                        style={{
                          backgroundColor: isActive ? BRAND_COLORS.primary : undefined,
                        }}
                        onClick={() => setSidebarOpen(false)}
                      >
                        <item.icon
                          className={`mr-4 h-6 w-6 flex-shrink-0 ${
                            isActive ? "text-white" : "text-gray-400 group-hover:text-gray-500"
                          }`}
                        />
                        {item.name}
                      </Link>
                    )
                  })}
                  
                  {/* Sign Out Button */}
                  <button
                    onClick={signOut}
                    className="w-full group flex items-center px-2 py-2 text-base font-medium rounded-md text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  >
                    <LogOut className="mr-4 h-6 w-6 flex-shrink-0 text-gray-400 group-hover:text-gray-500" />
                    Sign Out
                  </button>
                </nav>
              </div>
              
              {/* User Info */}
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
          <div
            className={`hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col transform transition-transform duration-300 ${sidebarVisible ? "translate-x-0" : "-translate-x-full"}`}
            onMouseEnter={() => setSidebarVisible(true)}
            onMouseLeave={() => setSidebarVisible(false)}
          >
            <div className="flex min-h-0 flex-1 flex-col bg-white border-r border-gray-200">
              <div className="flex flex-1 flex-col overflow-y-auto pt-5 pb-4">
                <div className="flex flex-shrink-0 items-center justify-center px-4">
                  <IAMCFOLogo className="w-auto h-10" />
                </div>
                <nav className="mt-5 flex-1 space-y-1 px-2">
                  {filteredNavigation.map((item) => {
                    const isActive = pathname === item.href
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md ${
                          isActive ? "text-white" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                        }`}
                        style={{
                          backgroundColor: isActive ? BRAND_COLORS.primary : undefined,
                        }}
                      >
                        <item.icon
                          className={`mr-3 h-6 w-6 flex-shrink-0 ${
                            isActive ? "text-white" : "text-gray-400 group-hover:text-gray-500"
                          }`}
                        />
                        {item.name}
                      </Link>
                    )
                  })}
                  
                  {/* Sign Out Button */}
                  <button
                    onClick={signOut}
                    className="w-full group flex items-center px-2 py-2 text-sm font-medium rounded-md text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  >
                    <LogOut className="mr-3 h-6 w-6 flex-shrink-0 text-gray-400 group-hover:text-gray-500" />
                    Sign Out
                  </button>
                </nav>
              </div>
              
              {/* User Info */}
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

          {/* Main content */}
          <div className={`flex flex-col flex-1 transition-all duration-300 ${sidebarVisible ? "lg:pl-64" : ""}`}>
            {/* Mobile header */}
            <div className="sticky top-0 z-10 bg-white pl-1 pt-1 sm:pl-3 sm:pt-3 lg:hidden">
              <button
                type="button"
                className="-ml-0.5 -mt-0.5 inline-flex h-12 w-12 items-center justify-center rounded-md text-gray-500 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset"
                style={
                  {
                    "--tw-ring-color": BRAND_COLORS.primary + "33",
                  } as React.CSSProperties
                }
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="h-6 w-6" />
              </button>
            </div>

            <main className="flex-1">{children}</main>
          </div>
        </div>
      </body>
    </html>
  )
}
