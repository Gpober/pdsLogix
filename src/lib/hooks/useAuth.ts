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
  const [sessionChecked, setSessionChecked] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('🔐 Auth event:', event)
        if (event === 'SIGNED_IN' && session) {
          console.log('✅ Signed in, loading user profile')
          setSessionChecked(true)
          await loadUser(session.user.id)
        } else if (event === 'SIGNED_OUT') {
          setUser(null)
          window.location.href = 'https://iamcfo.com/login'
        } else if (event === 'INITIAL_SESSION' && session) {
          console.log('✅ Initial session found, loading user')
          setSessionChecked(true)
          await loadUser(session.user.id)
        } else if (event === 'INITIAL_SESSION' && !session) {
          console.log('⚠️ Initial session check complete, no session found')
          setSessionChecked(true)
          setLoading(false)
          if (!pathname?.startsWith('/login')) {
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
      const hasAccess = checkRouteAccess(user.role, pathname)
      if (!hasAccess) {
        redirectToDefaultRoute(user.role)
      } else if (user.role === 'employee' && (pathname === '/' || pathname === '/dashboard')) {
        const isMobile = isMobileDevice()
        router.push(isMobile ? '/mobile-dashboard/payroll/submit' : '/payroll-submit')
      }
    }
  }, [pathname, user, loading])

  async function checkSession() {
    try {
      console.log('🔍 Checking session...')
      const { data: { session } } = await supabase.auth.getSession()
      
      if (session?.user) {
        console.log('✅ Session found, loading user')
        await loadUser(session.user.id)
      } else {
        console.log('❌ No session')
        if (!pathname?.startsWith('/login')) {
          window.location.href = 'https://iamcfo.com/login'
        }
      }
    } catch (error) {
      console.error('❌ Session check error:', error)
    } finally {
      setLoading(false)
    }
  }

  async function loadUser(userId: string) {
    try {
      console.log('👤 Loading user:', userId)
      
      const { data, error } = await supabase
        .from('users')
        .select('id, email, name, role, organization_id')
        .eq('id', userId)
        .single()
      
      if (error) throw error
      
      if (data) {
        console.log('✅ User loaded:', data.role)
        setUser(data as AuthUser)
        setLoading(false)
      }
    } catch (error) {
      console.error('❌ Load user error:', error)
      setLoading(false)
    }
  }

  function checkRouteAccess(role: UserRole, path: string): boolean {
    const allowedRoutes = ROLE_ROUTES[role]
    if (allowedRoutes.includes('*')) return true
    return allowedRoutes.some(route => route === path || path.startsWith(route + '/'))
  }

  function redirectToDefaultRoute(role: UserRole) {
    if (role === 'employee') {
      const isMobile = isMobileDevice()
      router.push(isMobile ? '/mobile-dashboard/payroll/submit' : '/payroll-submit')
      return
    }
    const allowedRoutes = ROLE_ROUTES[role]
    router.push(allowedRoutes[0] === '*' ? '/' : allowedRoutes[0])
  }

  function getFilteredNavigation(navigation: any[]) {
    if (!user) return []
    if (user.role === 'owner' || user.role === 'super_admin') return navigation
    const allowedRoutes = ROLE_ROUTES[user.role]
    return navigation.filter(item => 
      allowedRoutes.some(route => item.href === route || item.href.startsWith(route + '/'))
    )
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
    window.location.href = 'https://iamcfo.com/login'
  }

  return { user, loading, signOut, checkRouteAccess, getFilteredNavigation }
}
