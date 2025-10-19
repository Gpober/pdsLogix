// src/lib/hooks/useAuth.ts
"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, usePathname } from 'next/navigation'

export type UserRole = 'owner' | 'admin' | 'member' | 'super_admin' | 'employee'

export interface AuthUser {
  id: string
  email: string
  name: string
  role: UserRole
  organization_id: string
}

const ROLE_ROUTES: Record<UserRole, string[]> = {
  employee: ['/payroll-submit', '/mobile-dashboard'],
  member: ['/payroll-submit', '/mobile-dashboard', '/payroll', '/dashboard'],
  admin: ['/', '/balance-sheet', '/financials', '/cash-flow', '/accounts-receivable', '/accounts-payable', '/payroll', '/payroll-submit', '/mobile-dashboard', '/comparative-analysis', '/settings'],
  owner: ['*'],
  super_admin: ['*']
}

function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false
  const userAgent = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  const screenWidth = window.innerWidth < 768
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
  return hasTouch && (screenWidth || userAgent)
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()
  const supabase = useMemo(() => createClient(), [])
  const isMountedRef = useRef(true)
  const lastLoadedUserId = useRef<string | null>(null)

  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const loadUser = useCallback(
    async (userId: string) => {
      if (!userId) return

      if (lastLoadedUserId.current === userId) {
        setLoading(false)
        return
      }

      try {
        console.log('👤 Loading user:', userId)
        console.log('👤 About to query users table...')

        const { data, error } = await supabase
          .from('users')
          .select('id, email, name, role, organization_id')
          .eq('id', userId)
          .single()

        console.log('👤 Query complete:', { hasData: !!data, hasError: !!error })

        if (error) {
          console.error('❌ Query error:', error)
          throw error
        }

        if (data && isMountedRef.current) {
          console.log('✅ User loaded:', data.email, data.role)
          lastLoadedUserId.current = userId
          setUser(data as AuthUser)
          setLoading(false)
        } else if (isMountedRef.current) {
          console.error('❌ No data returned from query')
          setLoading(false)
        }
      } catch (error) {
        if (isMountedRef.current) {
          console.error('❌ Load user exception:', error)
          setLoading(false)
        }
      }
    },
    [supabase]
  )

  const handleAuthRedirect = useCallback(async () => {
    if (typeof window === 'undefined') return false

    const url = new URL(window.location.href)
    const code = url.searchParams.get('code')
    const error = url.searchParams.get('error')
    const errorDescription = url.searchParams.get('error_description')

    if (error || errorDescription) {
      console.error('❌ Auth redirect error:', { error, errorDescription })
    }

    if (!code) {
      return false
    }

    try {
      const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

      if (exchangeError) {
        throw exchangeError
      }

      url.searchParams.delete('code')
      url.searchParams.delete('state')
      url.searchParams.delete('error')
      url.searchParams.delete('error_description')

      const cleanUrl = `${url.pathname}${url.search}${url.hash}`
      window.history.replaceState({}, document.title, cleanUrl)

      if (data.session?.user) {
        await loadUser(data.session.user.id)
      }

      return true
    } catch (exchangeError) {
      console.error('❌ Failed to exchange auth code for session:', exchangeError)
      return false
    }
  }, [loadUser, supabase])

  const checkRouteAccess = useCallback((role: UserRole, path: string): boolean => {
    const allowedRoutes = ROLE_ROUTES[role]
    if (allowedRoutes.includes('*')) return true
    return allowedRoutes.some(route => route === path || path.startsWith(route + '/'))
  }, [])

  const redirectToDefaultRoute = useCallback(
    (role: UserRole) => {
      if (role === 'employee') {
        const isMobile = isMobileDevice()
        router.push(isMobile ? '/mobile-dashboard/payroll/submit' : '/payroll-submit')
        return
      }
      const allowedRoutes = ROLE_ROUTES[role]
      router.push(allowedRoutes[0] === '*' ? '/' : allowedRoutes[0])
    },
    [router]
  )

  useEffect(() => {
    let ignore = false

    const initializeSession = async () => {
      try {
        const handledRedirect = await handleAuthRedirect()

        if (handledRedirect) {
          return
        }

        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (ignore || !isMountedRef.current) return

        if (session?.user) {
          await loadUser(session.user.id)
        } else {
          setLoading(false)
          if (!pathname?.startsWith('/login')) {
            window.location.href = 'https://iamcfo.com/login'
          }
        }
      } catch (error) {
        if (!ignore && isMountedRef.current) {
          console.error('❌ Session initialization error:', error)
          setLoading(false)
        }
      }
    }

    initializeSession()

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMountedRef.current) return

      console.log('🔐 Auth event:', event)

      if (event === 'INITIAL_SESSION') {
        if (session?.user) {
          await loadUser(session.user.id)
        } else {
          setLoading(false)
        }
      }

      if (event === 'SIGNED_IN' && session?.user) {
        await loadUser(session.user.id)
      }

      if (event === 'TOKEN_REFRESHED' && session?.user) {
        await loadUser(session.user.id)
      }

      if (event === 'SIGNED_OUT') {
        lastLoadedUserId.current = null
        setUser(null)
        setLoading(false)
        window.location.href = 'https://iamcfo.com/login'
      }
    })

    return () => {
      ignore = true
      authListener?.subscription.unsubscribe()
    }
  }, [handleAuthRedirect, loadUser, pathname, supabase])

  useEffect(() => {
    if (!loading && user && pathname) {
      const hasAccess = checkRouteAccess(user.role, pathname)
      if (!hasAccess) {
        redirectToDefaultRoute(user.role)
      } else if (user.role === 'employee' && (pathname === '/' || pathname === '/dashboard')) {
        const isMobile = isMobileDevice()
        router.push(isMobile ? '/mobile-dashboard/payroll/submit' : '/payroll-submit')
      }
    }
  }, [pathname, user, loading, router, checkRouteAccess, redirectToDefaultRoute])

  const getFilteredNavigation = useCallback((navigation: any[]) => {
    if (!user) return []
    if (user.role === 'owner' || user.role === 'super_admin') return navigation
    const allowedRoutes = ROLE_ROUTES[user.role]
    return navigation.filter(item =>
      allowedRoutes.some(route => item.href === route || item.href.startsWith(route + '/'))
    )
  }, [user])

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
    window.location.href = 'https://iamcfo.com/login'
  }

  return { user, loading, signOut, checkRouteAccess, getFilteredNavigation }
}
