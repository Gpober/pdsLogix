'use client'

import { LogOut } from 'lucide-react'

export default function MobilePayrollSubmitTest() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      {/* Header */}
      <div className="bg-white/10 backdrop-blur-md border-b border-white/20 sticky top-0 z-50">
        <div className="max-w-lg mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-white text-xl font-bold">Payroll Submit TEST</h1>
              <p className="text-blue-200 text-sm">Test Location</p>
            </div>
            <button className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition">
              <LogOut className="w-5 h-5 text-blue-200" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4">
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20">
          <h2 className="text-white text-2xl font-bold mb-4">✅ Page Loaded Successfully!</h2>
          <p className="text-blue-200 mb-4">
            If you can see this, the page file is in the right place and loading correctly.
          </p>
          <div className="bg-white/5 rounded-xl p-4 space-y-2">
            <p className="text-white"><strong>File location:</strong> app/mobile-payroll-submit/page.tsx</p>
            <p className="text-white"><strong>URL:</strong> /mobile-payroll-submit</p>
            <p className="text-green-300"><strong>Status:</strong> Working! 🎉</p>
          </div>
        </div>
      </div>
    </div>
  )
}
