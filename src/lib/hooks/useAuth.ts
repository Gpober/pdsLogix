// src/lib/hooks/useAuth.ts
import { useEffect, useState, useCallback } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { getAuthClient, getDataClient, syncDataClientSession } from '@/lib/supabase/client'
import { useRouter, usePathname } from 'next/navigation'

interface UserProfile {
  id: string
  email: string
  name: string | null
  role: 'super_admin' | 'owner' | 'employee'
  organization_id: string | null
}

interface NavigationItem {
  name: string
  href: string
  icon: any
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()

  const authClient = getAuthClient()
  const dataClient = getDataClient()

  const loadUserProfile = useCallback(async (userId: string) => {
    try {
      // Load user profile from PLATFORM Supabase (where users table exists)
      const { data, error } = await authClient
        .from('users')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) throw error
      setProfile(data)
      return data
    } catch (error) {
      console.error('Error loading user profile:', error)
      return null
    }
  }, [authClient])

  const handleAuthStateChange = useCallback(async (session: Session | null) => {
    if (session?.user) {
      setUser(session.user)
      await syncDataClientSession(session)
      const userProfile = await loadUserProfile(session.user.id)

      // Role-based redirects for employees
      if (userProfile?.role === 'employee') {
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
        if (pathname === '/login' || pathname === '/' || pathname === '/dashboard') {
          router.push(isMobile ? '/mobile-dashboard/payroll/submit' : '/payroll-submit')
        }
      }
    } else {
      setUser(null)
      setProfile(null)
      await syncDataClientSession(null)
    }
    setLoading(false)
  }, [loadUserProfile, router, pathname])

  useEffect(() => {
    // Get initial session
    authClient.auth.getSession().then(({ data: { session } }) => {
      handleAuthStateChange(session)
    })

    // Listen for auth changes
    const { data: { subscription } } = authClient.auth.onAuthStateChange((_event, session) => {
      handleAuthStateChange(session)
    })

    return () => subscription.unsubscribe()
  }, [authClient, handleAuthStateChange])

  const signOut = async () => {
    await authClient.auth.signOut()
    await syncDataClientSession(null)
    router.push('/login')
  }

  const getFilteredNavigation = useCallback((navigation: NavigationItem[]) => {
    if (!profile) return []
    
    if (profile.role === 'employee') {
      // Employees only see Payroll Submit
      return navigation.filter(item => item.href === '/payroll-submit')
    }
    
    // Super admins and owners see everything
    return navigation
  }, [profile])

  return {
    user,
    profile,
    loading,
    signOut,
    isAuthenticated: !!user,
    getFilteredNavigation,
  }
}
