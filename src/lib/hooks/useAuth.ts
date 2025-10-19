// src/lib/hooks/useAuth.ts
"use client"

import { useState, useEffect } from 'react'
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

// Define which routes each role can access
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

  useEffect(() => {
    checkAuth()

    const supabase = createClient()
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('🔐 Auth event:', event)
        if (event === 'SIGNED_IN' && session) {
          await loadUserFromSession(session)
        } else if (event === 'SIGNED_OUT') {
          setUser(null)
          if (typeof window !== 'undefined') {
            window.location.href = 'https://iamcfo.com/login'
          }
        }
      }
    )

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!loading && user && pathname) {
      console.log('🔒 Checking access:', { role: user.role, pathname })
      const hasAccess = checkRouteAccess(user.role, pathname)
      
      if (!hasAccess) {
        console.log('❌ Access denied, redirecting...')
        redirectToDefaultRoute(user.role)
      } else if (user.role === 'employee') {
        const isMobile = isMobileDevice()
        if (pathname === '/' || pathname === '/dashboard') {
          if (isMobile) {
            router.push('/mobile-dashboard/payroll/submit')
          } else {
            router.push('/payroll-submit')
          }
        }
      }
    }
  }, [pathname, user, loading])

  async function checkAuth() {
    try {
      console.log('🔍 Checking auth...')
      const supabase = createClient()
      
      const { data: { session } } = await supabase.auth.getSession()
      
      console.log('🔍 Session check:', { hasSession: !!session })
      
      if (session?.user) {
        console.log('✅ Found session for:', session.user.id)
        await loadUserFromSession(session)
      } else {
        console.log('❌ No session found')
        if (!pathname?.startsWith('/login')) {
          if (typeof window !== 'undefined') {
            window.location.href = 'https://iamcfo.com/login'
          }
        }
      }
    } catch (error) {
      console.error('❌ Auth check error:', error)
    } finally {
      console.log('✅ Auth check complete')
      setLoading(false)
    }
  }

  async function loadUserFromSession(session: any) {
    try {
      console.log('👤 Loading user from session')
      const supabase = createClient()
      
      // Fetch user profile with role from Platform database
      const { data: userData, error } = await supabase
        .from('users')
        .select('id, email, name, role, organization_id')
        .eq('id', session.user.id)
        .maybeSingle()

      if (error) {
        console.error('❌ Error loading user:', error)
        // Fall back to session data if database query fails
        const fallbackUser: AuthUser = {
          id: session.user.id,
          email: session.user.email || '',
          name: session.user.email || 'User',
          role: 'employee', // Default to employee if can't fetch
          organization_id: ''
        }
        console.log('⚠️ Using fallback user data')
        setUser(fallbackUser)
        return
      }

      if (userData) {
        console.log('✅ User loaded:', userData.email, userData.role)
        setUser(userData as AuthUser)
      } else {
        console.error('❌ User not found in database')
        throw new Error('User not found')
      }

    } catch (error) {
      console.error('❌ Error loading user from session:', error)
      setUser(null)
    }
  }

  function checkRouteAccess(role: UserRole, path: string): boolean {
    const allowedRoutes = ROLE_ROUTES[role]
    if (allowedRoutes.includes('*')) return true
    return allowedRoutes.some(route => {
      if (route === path) return true
      if (path.startsWith(route + '/')) return true
      return false
    })
  }

  function redirectToDefaultRoute(role: UserRole) {
    const allowedRoutes = ROLE_ROUTES[role]
    if (role === 'employee') {
      const isMobile = isMobileDevice()
      if (isMobile) {
        router.push('/mobile-dashboard/payroll/submit')
      } else {
        router.push('/payroll-submit')
      }
      return
    }
    const defaultRoute = allowedRoutes[0] === '*' ? '/' : allowedRoutes[0]
    router.push(defaultRoute)
  }

  function getFilteredNavigation(navigation: any[]) {
    if (!user) return []
    if (user.role === 'owner' || user.role === 'super_admin') {
      return navigation
    }
    const allowedRoutes = ROLE_ROUTES[user.role]
    return navigation.filter(item => {
      return allowedRoutes.some(route => {
        return item.href === route || item.href.startsWith(route + '/')
      })
    })
  }

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    setUser(null)
    if (typeof window !== 'undefined') {
      window.location.href = 'https://iamcfo.com/login'
    }
  }

  return {
    user,
    loading,
    signOut,
    checkRouteAccess,
    getFilteredNavigation,
  }
}
