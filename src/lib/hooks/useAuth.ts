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
      const { data, error } = await dataClient
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
  }, [dataClient])

  const handleAuthStateChange = useCallback(async (session: Session | null) => {
    if (session?.user) {
      setUser(session.user)
      await syncDataClientSession(session)
      const userProfile = await loadUserProfile(session.user.id)

      // Role-based redirects for employees
      if (userProfile?.role === 'employee') {
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
        if (pathname === '/login' || pathname === '/') {
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

  return {
    user,
    profile,
    loading,
    signOut,
    isAuthenticated: !!user,
  }
}


// ============================================
// USAGE EXAMPLES
// ============================================

/*
// In any component that needs auth:
import { getAuthClient } from '@/lib/supabase/client'

const authClient = getAuthClient()
await authClient.auth.signInWithPassword({ email, password })

// In any component that needs data:
import { getDataClient } from '@/lib/supabase/client'

const dataClient = getDataClient()
const { data } = await dataClient.from('employees').select('*')

// In login/signup flows:
import { getAuthClient, syncDataClientSession } from '@/lib/supabase/client'

const authClient = getAuthClient()
const { data } = await authClient.auth.signUp({ email, password })
if (data.session) {
  await syncDataClientSession(data.session)
}
