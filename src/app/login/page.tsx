'use client'

import { useEffect } from 'react'

export default function ClientLoginPage() {
  useEffect(() => {
    // Redirect to platform login
    window.location.href = 'https://iamcfo.com/login'
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
