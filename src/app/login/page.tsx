'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/supabase/auth-client'  // ✅ Use auth client for login
import { createClient } from '@/lib/supabase/client'      // For data queries

export default function ClientLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // ✅ Sign in with Platform/Auth Supabase
      const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
        email,
        password,
      })

      if (authError) {
        setError(authError.message)
        setLoading(false)
        return
      }

      if (!authData.user) {
        setError('Login failed. Please try again.')
        setLoading(false)
        return
      }

      console.log('✅ Authentication successful:', authData.user.id)

      // ✅ Now check if user is employee or admin/owner
      const clientSupabase = createClient()
      
      // First, try to find user in Platform users table (owners/admins)
      const { data: platformUser } = await authClient
        .from('users')
        .select('role, organization_id, organizations(subdomain, status)')
        .eq('id', authData.user.id)
        .maybeSingle()

      // Check if user is employee in Client database
      const { data: employeeData } = await clientSupabase
        .from('employees')
        .select('user_id, email, organization_id, is_active')
        .eq('user_id', authData.user.id)
        .eq('is_active', true)
        .maybeSingle()

      const currentSubdomain = typeof window !== 'undefined' 
        ? window.location.hostname.split('.')[0] 
        : ''

      // SUPER ADMIN BYPASS - Allow super admins into any client dashboard
      if (platformUser?.role === 'super_admin') {
        console.log('✅ Super admin access granted')
        router.push('/dashboard')
        return
      }

      // EMPLOYEE LOGIN
      if (employeeData) {
        console.log('✅ Employee login detected')
        
        // Check if employee's organization matches current subdomain
        const { data: orgData } = await authClient
          .from('organizations')
          .select('subdomain')
          .eq('id', employeeData.organization_id)
          .single()

        if (orgData?.subdomain !== currentSubdomain) {
          await authClient.auth.signOut()
          setError('Access denied. You do not have permission to access this dashboard.')
          setLoading(false)
          return
        }

        // Redirect employee based on device
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
        if (isMobile) {
          router.push('/mobile-dashboard/payroll/submit')
        } else {
          router.push('/payroll-submit')
        }
        return
      }

      // OWNER/ADMIN LOGIN
      if (platformUser) {
        const orgSubdomain = (platformUser as any).organizations?.subdomain
        const orgStatus = (platformUser as any).organizations?.status

        // Check if user belongs to THIS specific organization
        if (orgSubdomain !== currentSubdomain) {
          await authClient.auth.signOut()
          setError('Access denied. You do not have permission to access this dashboard.')
          setLoading(false)
          return
        }

        // Check if organization is suspended
        if (orgStatus === 'suspended' || orgStatus === 'cancelled') {
          await authClient.auth.signOut()
          setError('Your account has been suspended. Please contact support.')
          setLoading(false)
          return
        }

        // Success - redirect to dashboard
        router.push('/dashboard')
        return
      }

      // User not found in either database
      await authClient.auth.signOut()
      setError('User not found. Please contact support.')
      setLoading(false)

    } catch (err: any) {
      console.error('Login error:', err)
      setError('An unexpected error occurred. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="bg-white rounded-full p-3 shadow-lg">
            <svg className="h-12 w-12 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-bold text-gray-900">
          Welcome Back
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Sign in to access your CFO dashboard
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl sm:rounded-lg sm:px-10">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              <p className="text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <div className="mt-1">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="you@company.com"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <div className="mt-1">
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-sm">
                <a href="/forgot-password" className="font-medium text-blue-600 hover:text-blue-500">
                  Forgot your password?
                </a>
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </div>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">
                  Don't have an account?{' '}
                  <a href="/signup" className="font-medium text-blue-600 hover:text-blue-500">
                    Sign up
                  </a>
                </span>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-gray-500">
          Powered by <span className="font-semibold">I AM CFO</span>
        </p>
      </div>
    </div>
  )
}
