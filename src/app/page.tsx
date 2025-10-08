'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function HomePage() {
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    checkAuthAndRedirect()
  }, [])

  async function checkAuthAndRedirect() {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (session) {
      // User is logged in, redirect to dashboard
      router.push('/dashboard')
    } else {
      // User is not logged in, redirect to login
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
