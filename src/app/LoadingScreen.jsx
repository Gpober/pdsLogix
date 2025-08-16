'use client'

import Image from 'next/image'

const LoadingScreenSpinner = () => {
  return (
    <div className="fixed inset-0 bg-white flex flex-col items-center justify-center z-50">
      <div className="flex flex-col items-center space-y-8">
        {/* I AM CFO Logo */}
        <div className="relative">
          <Image
            src="/iamcfo-logo.jpg"
            alt="I AM CFO"
            width={220}
            height={88}
            className="object-contain"
            priority
          />
        </div>
        
        {/* Circular Spinner matching your brand colors */}
        <div className="relative">
          <div className="w-12 h-12 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin"></div>
        </div>
        
        {/* Loading Text */}
        <div className="text-center">
          <p className="text-gray-700 text-xl font-semibold">I AM CFO</p>
          <p className="text-gray-500 text-sm mt-1">Loading...</p>
        </div>
      </div>
    </div>
  )
}

export default LoadingScreenSpinner
