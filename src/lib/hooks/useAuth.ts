// src/lib/hooks/useAuth.ts
"use client"

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { authClient } from '@/lib/supabase/auth-client'
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

    // Listen to Platform auth changes
    const { data: authListener } = authClient.auth.onAuthStateChange(
      async (event, session) => {
        console.log('🔐 Auth event:', event)
        if (event === 'SIGNED_IN' && session) {
          await fetchUserProfile(session.user.id, session.user.email)
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
      
      // Check session in Platform Supabase (authClient)
      console.log('🔍 Getting session from authClient...')
      const { data: { session }, error: sessionError } = await authClient.auth.getSession()
      
      console.log('🔍 Session result:', { 
        hasSession: !!session, 
        hasError: !!sessionError,
        userId: session?.user?.id 
      })
      
      if (sessionError) {
        console.error('❌ Session error:', sessionError)
      }
      
      if (session?.user) {
        console.log('✅ Found session in Platform Supabase:', session.user.id)
        console.log('✅ User email:', session.user.email)
        await fetchUserProfile(session.user.id, session.user.email || '')
      } else {
        console.log('❌ No session found, checking pathname:', pathname)
        if (!pathname?.startsWith('/login')) {
          console.log('🔄 Redirecting to Platform login...')
          if (typeof window !== 'undefined') {
            window.location.href = 'https://iamcfo.com/login'
          }
        }
      }
    } catch (error) {
      console.error('❌ Auth check error:', error)
    } finally {
      console.log('✅ Auth check complete, setting loading to false')
      setLoading(false)
    }
  }

  async function fetchUserProfile(userId: string, userEmail: string) {
    try {
      console.log('🔍 Fetching profile for:', userId, userEmail)
      
      // First check Platform Supabase users table using authClient
      const { data: platformUser } = await authClient
        .from('users')
        .select('id, email, name, role, organization_id')
        .eq('id', userId)
        .maybeSingle()

      if (platformUser) {
        console.log('✅ Found user in Platform:', platformUser.name, platformUser.role)
        
        // If employee, also verify they exist in Client Supabase
        if (platformUser.role === 'employee') {
          const clientSupabase = createClient()
          const { data: employeeData } = await clientSupabase
            .from('employees')
            .select('user_id, email, first_name, last_name, organization_id')
            .eq('user_id', userId)
            .eq('is_active', true)
            .maybeSingle()

          if (!employeeData) {
            console.error('❌ Employee not found in Client database')
            throw new Error('Employee record not found')
          }
          
          console.log('✅ Verified employee in Client database')
        }
        
        setUser(platformUser as AuthUser)
        return
      }

      console.error('❌ User not found in Platform')
      throw new Error('User profile not found')

    } catch (error) {
      console.error('❌ Error fetching user profile:', error)
      setUser(null)
      if (typeof window !== 'undefined') {
        window.location.href = 'https://iamcfo.com/login'
      }
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
    await authClient.auth.signOut()
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
