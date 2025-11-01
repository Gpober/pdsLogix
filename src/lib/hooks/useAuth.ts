// src/lib/hooks/useAuth.ts
// Simplified to 3 roles: super_admin, admin/owner, employee

"use client"

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, usePathname } from 'next/navigation'

export type UserRole = 'super_admin' | 'admin' | 'owner' | 'employee'

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
    '/payroll-submit',  // ONLY payroll submit - nothing else!
  ],
  admin: [
    // Admin has full access to organization (same as owner)
    '*'
  ],
  owner: [
    // Owner has full access to organization (same as admin)
    '*'
  ],
  super_admin: [
    // Super admin has full platform access
    '*'
  ]
}

// Improved mobile detection
function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false
  
  // Check user agent
  const userAgent = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  
  // Check screen size
  const screenSize = window.innerWidth <= 768
  
  // Check touch capability
  const touchCapable = 'ontouchstart' in window || navigator.maxTouchPoints > 0
  
  return userAgent || (screenSize && touchCapable)
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    checkUser()
    
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkUser()
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  async function checkUser() {
    try {
      const supabase = createClient()
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

      if (authError || !authUser) {
        setUser(null)
        setLoading(false)
        return
      }

      // Fetch user profile from users table
      const { data: userProfile, error: profileError } = await supabase
        .from('users')
        .select('id, email, name, role, organization_id')
        .eq('id', authUser.id)
        .single()

      if (profileError || !userProfile) {
        console.error('Error fetching user profile:', profileError)
        setUser(null)
        setLoading(false)
        return
      }

      setUser(userProfile as AuthUser)
      setLoading(false)

    } catch (error) {
      console.error('Error in checkUser:', error)
      setUser(null)
      setLoading(false)
    }
  }

  // Check if user can access a specific route
  function checkRouteAccess(route: string): boolean {
    if (!user) return false
    
    // Super admin, admin, and owner have access to everything
    if (user.role === 'super_admin' || user.role === 'admin' || user.role === 'owner') {
      return true
    }

    // Employees can only access payroll-submit
    if (user.role === 'employee') {
      return route === '/payroll-submit' || route.startsWith('/payroll-submit/')
    }

    return false
  }

  // Get navigation items filtered by user role
  function getFilteredNavigation(navigation: any[]): any[] {
    if (!user) return []
    
    // Super admin, admin, and owner see everything
    if (user.role === 'super_admin' || user.role === 'admin' || user.role === 'owner') {
      return navigation
    }

    // Employees only see payroll submit
    if (user.role === 'employee') {
      return navigation.filter(item => 
        item.href === '/payroll-submit' || item.href.startsWith('/payroll-submit/')
      )
    }

    return []
  }

  // Redirect user to appropriate page based on role
  function redirectToDefaultRoute() {
    if (!user) {
      router.push('/login')
      return
    }

    // Employees always go to payroll-submit
    if (user.role === 'employee') {
      router.push('/payroll-submit')
      return
    }

    // Admin, owner, super_admin go to dashboard
    router.push('/dashboard')
  }

  // Check if user has admin-level access (admin, owner, or super_admin)
  function isAdmin(): boolean {
    if (!user) return false
    return user.role === 'admin' || user.role === 'owner' || user.role === 'super_admin'
  }

  // Check if user is super admin
  function isSuperAdmin(): boolean {
    if (!user) return false
    return user.role === 'super_admin'
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
    redirectToDefaultRoute,
    isAdmin,
    isSuperAdmin,
    isMobile: isMobileDevice(),
  }
}
