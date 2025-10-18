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
  employee: [
    '/payroll-submit',
    '/mobile-dashboard',
  ],
  member: [
    '/payroll-submit',
    '/mobile-dashboard',
    '/payroll',
    '/dashboard',
  ],
  admin: [
    // Admins can access most routes
    '/',
    '/balance-sheet',
    '/financials',
    '/cash-flow',
    '/accounts-receivable',
    '/accounts-payable',
    '/payroll',
    '/payroll-submit',
    '/mobile-dashboard',
    '/comparative-analysis',
    '/settings',
  ],
  owner: [
    // Owners have full access
    '*'
  ],
  super_admin: [
    // Super admins have full access
    '*'
  ]
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
        if (event === 'SIGNED_IN' && session) {
          await fetchUserProfile(session.user.id)
        } else if (event === 'SIGNED_OUT') {
          setUser(null)
          router.push('/login')
        }
      }
    )

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [])

  // Check route access whenever pathname changes
  useEffect(() => {
    if (!loading && user && pathname) {
      console.log('🔒 Checking access:', { role: user.role, pathname })
      const hasAccess = checkRouteAccess(user.role, pathname)
      console.log('🔒 Has access:', hasAccess)
      if (!hasAccess) {
        console.log('❌ Access denied, redirecting...')
        redirectToDefaultRoute(user.role)
      }
    }
  }, [pathname, user, loading])

  async function checkAuth() {
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      
      if (session?.user) {
        await fetchUserProfile(session.user.id)
      } else if (!pathname?.startsWith('/login')) {
        router.push('/login')
      }
    } catch (error) {
      console.error('Auth check error:', error)
    } finally {
      setLoading(false)
    }
  }

  async function fetchUserProfile(userId: string) {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('users')
        .select('id, email, name, role, organization_id')
        .eq('id', userId)
        .single()

      if (error) throw error

      if (data) {
        console.log('✅ User profile loaded:', { name: data.name, role: data.role })
        setUser(data as AuthUser)
      }
    } catch (error) {
      console.error('Error fetching user profile:', error)
      setUser(null)
    }
  }

  function checkRouteAccess(role: UserRole, path: string): boolean {
    const allowedRoutes = ROLE_ROUTES[role]
    
    // Full access roles
    if (allowedRoutes.includes('*')) {
      return true
    }

    // Check if current path matches any allowed route
    return allowedRoutes.some(route => {
      if (route === path) return true
      // Allow sub-routes (e.g., /mobile-dashboard/payroll/submit)
      if (path.startsWith(route + '/')) return true
      return false
    })
  }

  function redirectToDefaultRoute(role: UserRole) {
    const allowedRoutes = ROLE_ROUTES[role]
    const defaultRoute = allowedRoutes[0] === '*' ? '/' : allowedRoutes[0]
    router.push(defaultRoute)
  }

  function getFilteredNavigation(navigation: any[]) {
    if (!user) return []

    // Full access for owners and super_admins
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
    router.push('/login')
  }

  return {
    user,
    loading,
    signOut,
    checkRouteAccess,
    getFilteredNavigation,
  }
}
