'use client'
import { useEffect } from 'react'

export default function ClientLoginPage() {
  useEffect(() => {
    // Get the full current URL (the client subdomain page they were trying to access)
    const currentUrl = window.location.href.split('#')[0] // Remove any hash
    const returnTo = encodeURIComponent(currentUrl)
    
    // Redirect to platform login WITH returnTo parameter
    window.location.href = `https://iamcfo.com/login?returnTo=${returnTo}`
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Redirecting to login...</p>
      </div>
    </div>
  )
}
