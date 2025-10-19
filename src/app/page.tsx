'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getAuthClient } from '@/lib/supabase/auth-client'
import { syncDataClientSession } from '@/lib/supabase/client'

export default function HomePage() {
  const router = useRouter()
  const authClient = getAuthClient()

  useEffect(() => {
    checkAuthAndRedirect()
  }, [])

  async function checkAuthAndRedirect() {
    const { data: { session } } = await authClient.auth.getSession()

    await syncDataClientSession(session ?? null)

    if (!session) {
      // User is not logged in, redirect to login
      router.push('/login')
      return
    }

    // User is logged in - check if super admin or regular user
    const { data: userData } = await authClient
      .from('users')
      .select('role, organization_id')
      .eq('id', session.user.id)
      .single()

    if (userData?.role === 'super_admin') {
      // Super admin - go straight to dashboard
      router.push('/dashboard')
    } else if (userData?.organization_id) {
      // Regular user - go to dashboard
      router.push('/dashboard')
    } else {
      // Something's wrong - send to login
      router.push('/login')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <p className="mt-4 text-gray-600">Loading...</p>
      </div>
    </div>
  )
}
