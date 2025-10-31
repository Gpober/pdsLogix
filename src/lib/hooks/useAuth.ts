// src/lib/hooks/useAuth.ts
import { useEffect, useState, useCallback } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { getAuthClient, getDataClient, syncDataClientSession } from '@/lib/supabase/client'
import { useRouter, usePathname } from 'next/navigation'

interface UserProfile {
  id: string
  email: string
  name: string | null
  role: 'super_admin' | 'owner' | 'admin' | 'member' | 'employee'
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
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  const loadUserProfile = useCallback(async (userId: string) => {
    try {
      console.log('📋 Loading user profile for:', userId)
      
      // Check if super admin flag is set in sessionStorage (from login transfer)
      const superAdminFlag = sessionStorage.getItem('is_super_admin') === 'true'
      
      // Get auth client inside the function
      const authClient = getAuthClient()
      
      // Load user profile from PLATFORM Supabase (where users table exists)
      const { data, error } = await authClient
        .from('users')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) {
        console.error('❌ Error loading profile:', error)
        throw error
      }

      // Simplified console.log to avoid minification issues
      console.log('✅ Profile loaded:', data.email, data.role, 'Super admin:', superAdminFlag)

      // Set super admin flag based on role OR sessionStorage flag
      const isSuper = data.role === 'super_admin' || superAdminFlag
      setIsSuperAdmin(isSuper)

      if (isSuper) {
        console.log('🔐 Super admin access granted')
      }

      setProfile(data)
      return data
    } catch (error) {
      console.error('❌ Error loading user profile:', error)
      return null
    }
  }, []) // Remove authClient from dependencies

  const handleAuthStateChange = useCallback(async (session: Session | null) => {
    if (session?.user) {
      setUser(session.user)
      await syncDataClientSession(session)
      const userProfile = await loadUserProfile(session.user.id)
      
      // Check if super admin
      const superAdminFlag = sessionStorage.getItem('is_super_admin') === 'true'
      const isSuper = userProfile?.role === 'super_admin' || superAdminFlag
      
      // Super admins skip employee redirects
      if (isSuper) {
        console.log('🔐 Super admin - no redirects applied')
        return
      }
      
      // Role-based redirects for employees ONLY
      if (userProfile?.role === 'employee') {
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
        
        // Check if user is NOT already on a payroll page
        const isOnPayrollPage = pathname?.includes('/payroll')
        
        if (!isOnPayrollPage) {
          // Redirect to appropriate payroll page based on device
          const targetPath = isMobile ? '/mobile-dashboard/payroll/submit' : '/payroll-submit'
          console.log('👷 Redirecting employee to:', targetPath, 'Mobile:', isMobile)
          router.push(targetPath)
        }
      }
    } else {
      setUser(null)
      setProfile(null)
      setIsSuperAdmin(false)
      await syncDataClientSession(null)
    }
    setLoading(false)
  }, [loadUserProfile, router, pathname]) // Remove authClient from dependencies

  useEffect(() => {
    const authClient = getAuthClient()
    
    // Get initial session
    authClient.auth.getSession().then(({ data: { session } }) => {
      handleAuthStateChange(session)
    })

    // Listen for auth changes
    const { data: { subscription } } = authClient.auth.onAuthStateChange((_event, session) => {
      handleAuthStateChange(session)
    })

    return () => subscription.unsubscribe()
  }, [handleAuthStateChange])

  const signOut = async () => {
    const authClient = getAuthClient()
    await authClient.auth.signOut()
    await syncDataClientSession(null)
    sessionStorage.removeItem('is_super_admin')
    router.push('/login')
  }

  const getFilteredNavigation = useCallback((navigation: NavigationItem[]) => {
    if (!profile) return []
    
    // Super admins see EVERYTHING
    if (profile.role === 'super_admin' || isSuperAdmin) {
      console.log('🔐 Super admin - showing all navigation')
      return navigation
    }
    
    // Owners see everything
    if (profile.role === 'owner') {
      return navigation
    }

    // Admins see everything except super admin specific items
    if (profile.role === 'admin') {
      return navigation
    }

    // Members see most things
    if (profile.role === 'member') {
      return navigation.filter(item => 
        item.href !== '/settings' // Example: hide settings from members
      )
    }
    
    // Employees only see Payroll Submit
    if (profile.role === 'employee') {
      return navigation.filter(item => item.href === '/payroll-submit')
    }
    
    // Default: show everything
    return navigation
  }, [profile, isSuperAdmin])

  // Helper function to check if user can approve payroll
  const canApprovePayroll = useCallback(() => {
    if (!profile) return false
    
    // Super admins, owners, and admins can approve payroll
    const approvalRoles = ['super_admin', 'owner', 'admin']
    return approvalRoles.includes(profile.role) || isSuperAdmin
  }, [profile, isSuperAdmin])

  // Helper function to check if user can submit payroll
  const canSubmitPayroll = useCallback(() => {
    if (!profile) return false
    
    // All roles except super_admin can submit payroll
    // (super admins typically just approve, not submit)
    return true // Everyone can submit
  }, [profile])

  return {
    user,
    profile,
    loading,
    isSuperAdmin, // ✅ NEW: Expose super admin flag
    signOut,
    isAuthenticated: !!user,
    getFilteredNavigation,
    canApprovePayroll, // ✅ NEW: Helper for payroll approval access
    canSubmitPayroll, // ✅ NEW: Helper for payroll submission access
  }
}
