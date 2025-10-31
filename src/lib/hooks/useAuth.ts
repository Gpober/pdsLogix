// src/lib/hooks/useAuth.ts
import { useEffect, useState, useCallback, useRef } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { getAuthClient, syncDataClientSession } from '@/lib/supabase/client'
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
  const initializedRef = useRef(false)

  const loadUserProfile = useCallback(async (userId: string) => {
    try {
      console.log('Loading user profile for:', userId)
      
      const superAdminFlag = sessionStorage.getItem('is_super_admin') === 'true'
      const authClient = getAuthClient()
      
      const { data, error } = await authClient
        .from('users')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) {
        console.error('Error loading profile:', error)
        throw error
      }

      console.log('Profile loaded:', data.email, data.role, 'Super admin:', superAdminFlag)

      const isSuper = data.role === 'super_admin' || superAdminFlag
      setIsSuperAdmin(isSuper)

      if (isSuper) {
        console.log('Super admin access granted')
      }

      setProfile(data)
      return data
    } catch (error) {
      console.error('Error loading user profile:', error)
      return null
    }
  }, [])

  useEffect(() => {
    // Prevent double initialization
    if (initializedRef.current) return
    initializedRef.current = true

    const authClient = getAuthClient()
    
    async function handleAuthStateChange(session: Session | null) {
      if (session?.user) {
        setUser(session.user)
        await syncDataClientSession(session)
        const userProfile = await loadUserProfile(session.user.id)
        
        const superAdminFlag = sessionStorage.getItem('is_super_admin') === 'true'
        const isSuper = userProfile?.role === 'super_admin' || superAdminFlag
        
        if (isSuper) {
          console.log('Super admin - no redirects applied')
          setLoading(false)
          return
        }
        
        if (userProfile?.role === 'employee') {
          const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
          const isOnPayrollPage = pathname?.includes('/payroll')
          
          if (!isOnPayrollPage) {
            const targetPath = isMobile ? '/mobile-dashboard/payroll/submit' : '/payroll-submit'
            console.log('Redirecting employee to:', targetPath)
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
    }

    // Get initial session
    authClient.auth.getSession().then(({ data: { session } }) => {
      handleAuthStateChange(session)
    })

    // Listen for auth changes
    const { data: { subscription } } = authClient.auth.onAuthStateChange((_event, session) => {
      handleAuthStateChange(session)
    })

    return () => {
      subscription.unsubscribe()
      initializedRef.current = false
    }
  }, [loadUserProfile, router, pathname])

  const signOut = async () => {
    const authClient = getAuthClient()
    await authClient.auth.signOut()
    await syncDataClientSession(null)
    sessionStorage.removeItem('is_super_admin')
    router.push('/login')
  }

  const getFilteredNavigation = useCallback((navigation: NavigationItem[]) => {
    if (!profile) return []
    
    if (profile.role === 'super_admin' || isSuperAdmin) {
      console.log('Super admin - showing all navigation')
      return navigation
    }
    
    if (profile.role === 'owner') {
      return navigation
    }

    if (profile.role === 'admin') {
      return navigation
    }

    if (profile.role === 'member') {
      return navigation.filter(item => item.href !== '/settings')
    }
    
    if (profile.role === 'employee') {
      return navigation.filter(item => item.href === '/payroll-submit')
    }
    
    return navigation
  }, [profile, isSuperAdmin])

  const canApprovePayroll = useCallback(() => {
    if (!profile) return false
    const approvalRoles = ['super_admin', 'owner', 'admin']
    return approvalRoles.includes(profile.role) || isSuperAdmin
  }, [profile, isSuperAdmin])

  const canSubmitPayroll = useCallback(() => {
    if (!profile) return false
    return true
  }, [profile])

  return {
    user,
    profile,
    loading,
    isSuperAdmin,
    signOut,
    isAuthenticated: !!user,
    getFilteredNavigation,
    canApprovePayroll,
    canSubmitPayroll,
  }
}
