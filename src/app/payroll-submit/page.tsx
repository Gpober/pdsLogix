'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { supabase as dataSupabase } from '@/lib/supabaseClient'

type PayrollGroup = 'A' | 'B'
type CompensationType = 'hourly' | 'production'

type Employee = {
  id: string
  first_name: string
  last_name: string
  employee_code: string
  payroll_group: PayrollGroup
  compensation_type: CompensationType
  hourly_rate: number | null
  piece_rate: number | null
}

type EmployeeRow = Employee & {
  hours: string
  units: string
  notes: string
  amount: number
}

type Alert = { type: 'success' | 'error'; message: string }

// ============================================================================
// PAYROLL PERIOD CALCULATION FROM SELECTED PAY DATE
// ============================================================================

function parseLocalDate(dateStr: string): Date | null {
  const parts = dateStr.split('-').map(Number)
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    return null
  }

  const [year, month, day] = parts
  return new Date(year, month - 1, day)
}

function formatDisplayDate(dateStr: string, options?: Intl.DateTimeFormatOptions): string {
  const date = parseLocalDate(dateStr)
  if (!date) {
    return dateStr
  }

  return date.toLocaleDateString('en-US', options)
}

function calculatePayrollInfo(payDateStr: string): {
  payrollGroup: PayrollGroup
  periodStart: string
  periodEnd: string
} {
  // Parse date in local timezone to avoid timezone issues
  const payDate = parseLocalDate(payDateStr)
  if (!payDate) {
    return {
      payrollGroup: 'A',
      periodStart: payDateStr,
      periodEnd: payDateStr,
    }
  }
  
  // Period END is the Wednesday 9 days before pay date
  const periodEnd = new Date(payDate)
  periodEnd.setDate(payDate.getDate() - 9) // Wednesday, 9 days before Friday
  
  // Period START is 2 weeks (14 days) before period end
  const periodStart = new Date(periodEnd)
  periodStart.setDate(periodEnd.getDate() - 13) // 14 days total (including end date)
  
  // Determine payroll group based on which week
  // Using January 3, 2025 (first Friday of 2025) as Group A reference
  const referenceDate = new Date(2025, 0, 3) // January 3, 2025 = Group A
  const daysDifference = Math.floor((payDate.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24))
  const weeksDifference = Math.floor(daysDifference / 7)
  const payrollGroup: PayrollGroup = weeksDifference % 2 === 0 ? 'B' : 'A'
  
  // Format dates as YYYY-MM-DD in local timezone
  const formatDate = (date: Date) => {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  
  return {
    payrollGroup,
    periodStart: formatDate(periodStart),
    periodEnd: formatDate(periodEnd),
  }
}

function getNextFriday(): string {
  const today = new Date()
  const dayOfWeek = today.getDay()
  const daysUntilFriday = dayOfWeek <= 5 ? 5 - dayOfWeek : 6
  const nextFriday = new Date(today)
  nextFriday.setDate(today.getDate() + daysUntilFriday)
  
  const y = nextFriday.getFullYear()
  const m = String(nextFriday.getMonth() + 1).padStart(2, '0')
  const d = String(nextFriday.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatDateRange(startDate: string, endDate: string) {
  const start = parseLocalDate(startDate)
  const end = parseLocalDate(endDate)

  if (!start || !end) {
    return `${startDate} - ${endDate}`
  }

  const startFormatted = formatDisplayDate(startDate, { month: 'short', day: 'numeric', year: 'numeric' })
  const endFormatted = formatDisplayDate(endDate, { month: 'short', day: 'numeric', year: 'numeric' })
  return `${startFormatted} - ${endFormatted}`
}

export default function PayrollSubmit() {
  const router = useRouter()
  const [isInitializing, setIsInitializing] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [locationId, setLocationId] = useState<string | null>(null)
  const [locationName, setLocationName] = useState<string>('')
  const [payDate, setPayDate] = useState<string>('')
  const [payrollGroup, setPayrollGroup] = useState<PayrollGroup>('A')
  const [periodStart, setPeriodStart] = useState<string>('')
  const [periodEnd, setPeriodEnd] = useState<string>('')
  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [alert, setAlert] = useState<Alert | null>(null)

  // Initialize with next Friday
  useEffect(() => {
    const nextFriday = getNextFriday()
    setPayDate(nextFriday)
    const info = calculatePayrollInfo(nextFriday)
    setPayrollGroup(info.payrollGroup)
    setPeriodStart(info.periodStart)
    setPeriodEnd(info.periodEnd)
    console.log('📅 Desktop Payroll Info:', { payDate: nextFriday, ...info })
  }, [])

  // Recalculate when pay date changes
  function handlePayDateChange(newPayDate: string) {
    setPayDate(newPayDate)
    if (newPayDate) {
      const info = calculatePayrollInfo(newPayDate)
      setPayrollGroup(info.payrollGroup)
      setPeriodStart(info.periodStart)
      setPeriodEnd(info.periodEnd)
      console.log('📅 Updated Payroll Info:', { payDate: newPayDate, ...info })
    }
  }

  useEffect(() => { checkAuthAndLoadData() }, [])

  async function checkAuthAndLoadData() {
    try {
      const platformClient = createClient()
      const { data: { user }, error: authError } = await platformClient.auth.getUser()
      if (authError || !user) { router.replace('/login'); return }
      setUserId(user.id)
      const { data: userRecord, error: userError } = await platformClient.from('users').select('role, location_id').eq('id', user.id).single()
      if (userError || !userRecord) { router.replace('/login'); return }
      const role = userRecord.role as string
      const locId = userRecord.location_id as string
      setUserRole(role)
      setLocationId(locId)
      if (role !== 'employee' && role !== 'super_admin' && role !== 'admin' && role !== 'owner') { router.replace('/dashboard'); return }
      try {
        const { data: locationData } = await dataSupabase.from('locations').select('name').eq('id', locId).single()
        setLocationName(locationData?.name || 'Unknown Location')
      } catch (err) { setLocationName('Unknown Location') }
      setIsInitializing(false)
      await loadEmployees(locId)
    } catch (error) {
      console.error('Auth error:', error)
      router.replace('/login')
    }
  }

  async function loadEmployees(locId: string) {
    setIsLoading(true)
    try {
      const { data, error } = await dataSupabase.from('employees').select('*').eq('location_id', locId).eq('is_active', true).order('last_name', { ascending: true })
      if (error) throw error
      const rows: EmployeeRow[] = (data || []).map((emp: Employee) => ({ ...emp, hours: '', units: '', notes: '', amount: 0 }))
      setEmployees(rows)
    } catch (error) {
      console.error('Error loading employees:', error)
      showAlert('error', 'Failed to load employees')
    } finally { setIsLoading(false) }
  }

  const filteredEmployees = useMemo(() => employees.filter((emp) => emp.payroll_group === payrollGroup), [employees, payrollGroup])

  const totals = useMemo(() => {
    const hourlyEmployees = filteredEmployees.filter((emp) => emp.compensation_type === 'hourly')
    const productionEmployees = filteredEmployees.filter((emp) => emp.compensation_type === 'production')
    const totalHours = hourlyEmployees.reduce((sum, emp) => sum + (parseFloat(emp.hours) || 0), 0)
    const totalUnits = productionEmployees.reduce((sum, emp) => sum + (parseFloat(emp.units) || 0), 0)
    const totalAmount = filteredEmployees.reduce((sum, emp) => sum + emp.amount, 0)
    return { employees: filteredEmployees.length, hourlyCount: hourlyEmployees.length, productionCount: productionEmployees.length, totalHours, totalUnits, totalAmount }
  }, [filteredEmployees])

  function showAlert(type: 'success' | 'error', message: string) {
    setAlert({ type, message })
    if (type === 'success') setTimeout(() => setAlert(null), 5000)
  }

  function handleInputChange(employeeId: string, field: 'hours' | 'units' | 'notes', value: string) {
    setEmployees(employees.map((emp) => {
      if (emp.id !== employeeId) return emp
      const updated = { ...emp, [field]: value }
      if (field === 'hours' || field === 'units') {
        const numValue = parseFloat(value) || 0
        updated.amount = updated.compensation_type === 'hourly' ? numValue * (updated.hourly_rate || 0) : numValue * (updated.piece_rate || 0)
      }
      return updated
    }))
  }

  async function handleSubmit() {
    const employeesWithData = filteredEmployees.filter((emp) => emp.compensation_type === 'hourly' ? parseFloat(emp.hours) > 0 : parseFloat(emp.units) > 0)
    if (employeesWithData.length === 0) { showAlert('error', 'Please enter hours or units for at least one employee'); return }
    const hasInvalidHours = employeesWithData.some((emp) => {
      if (emp.compensation_type === 'hourly') {
        const hours = parseFloat(emp.hours)
        return hours < 0 || hours > 80
      }
      return false
    })
    if (hasInvalidHours) { showAlert('error', 'Hours must be between 0 and 80'); return }
    setIsSubmitting(true)
    try {
      const response = await fetch('/api/payroll/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location_id: locationId, pay_date: payDate, payroll_group: payrollGroup, submitted_by: userId,
          employees: employeesWithData.map((emp) => ({
            employee_id: emp.id,
            hours: emp.compensation_type === 'hourly' ? parseFloat(emp.hours) : null,
            units: emp.compensation_type === 'production' ? parseFloat(emp.units) : null,
            amount: emp.amount,
            notes: emp.notes || null,
          })),
        }),
      })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Submission failed')
      }
      const result = await response.json()
      showAlert('success', `✓ Payroll submitted! Submission #${result.submission_number}`)
      setEmployees(employees.map((emp) => ({ ...emp, hours: '', units: '', notes: '', amount: 0 })))
    } catch (error: any) {
      console.error('Submission error:', error)
      showAlert('error', error.message || 'Failed to submit payroll')
    } finally { setIsSubmitting(false) }
  }

  const handleKeyPress = useCallback((e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); handleSubmit() }
  }, [handleSubmit])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyPress)
    return () => document.removeEventListener('keydown', handleKeyPress)
  }, [handleKeyPress])

  async function handleSignOut() {
    const platformClient = createClient()
    await platformClient.auth.signOut()
    router.push('/login')
  }

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    )
  }

  const isEmployee = userRole === 'employee'

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {isEmployee && (
        <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-lg">P</span>
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white">Payroll Submit</h1>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{locationName}</p>
                </div>
              </div>
              <button onClick={handleSignOut} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition">Sign Out</button>
            </div>
          </div>
        </header>
      )}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {alert && (
          <div className={`mb-6 p-4 rounded-xl border flex items-start gap-3 ${alert.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'}`}>
            <p className={`flex-1 text-sm ${alert.type === 'success' ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}`}>{alert.message}</p>
            <button onClick={() => setAlert(null)} className={alert.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>✕</button>
          </div>
        )}

        {/* Pay Date Selector */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 mb-6 border border-gray-200 dark:border-gray-800">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Select Pay Date (Friday)
            </label>
            <input
              type="date"
              value={payDate}
              onChange={(e) => handlePayDateChange(e.target.value)}
              className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Pay Period Info Card */}
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-6 mb-6 text-white shadow-lg">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-sm font-medium text-blue-100 mb-1">Pay Period</h2>
              <p className="text-2xl font-bold mb-4">{periodStart && periodEnd ? formatDateRange(periodStart, periodEnd) : '-'}</p>
              <div className="flex items-center gap-3">
                <span className="bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full text-sm font-semibold">Payroll Group {payrollGroup}</span>
                <span className="text-blue-100 text-sm">Auto-calculated from pay date</span>
              </div>
            </div>
            <div className="text-right">
              <h2 className="text-sm font-medium text-blue-100 mb-1">Pay Date</h2>
              <p className="text-2xl font-bold">{
                payDate
                  ? formatDisplayDate(payDate, { month: 'short', day: 'numeric', year: 'numeric' })
                  : '-'
              }</p>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-800">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Total Employees</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{totals.employees}</p>
            <p className="text-xs text-gray-500 mt-1">Group {payrollGroup}</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-800">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Hourly Employees</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{totals.hourlyCount}</p>
            <p className="text-xs text-gray-500 mt-1">{totals.totalHours.toFixed(1)} hours</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-800">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Production Employees</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{totals.productionCount}</p>
            <p className="text-xs text-gray-500 mt-1">{totals.totalUnits.toFixed(0)} units</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-800">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Total Amount</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">${totals.totalAmount.toFixed(2)}</p>
            <p className="text-xs text-gray-500 mt-1">Before taxes</p>
          </div>
        </div>

        {/* Employee Table */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="mt-4 text-gray-600 dark:text-gray-400 text-sm">Loading employees...</p>
              </div>
            ) : filteredEmployees.length === 0 ? (
              <div className="text-center py-12"><p className="text-gray-600 dark:text-gray-400">No employees in Group {payrollGroup}</p></div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300">Employee</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300">Rate</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300">Hours / Units</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300">Amount</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300">Notes</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                  {filteredEmployees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">{emp.first_name} {emp.last_name}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">{emp.employee_code}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${emp.compensation_type === 'hourly' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'}`}>
                          {emp.compensation_type === 'hourly' ? 'Hourly' : 'Production'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">${emp.compensation_type === 'hourly' ? emp.hourly_rate?.toFixed(2) : emp.piece_rate?.toFixed(2)}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input type="number" step="0.01" min="0" max={emp.compensation_type === 'hourly' ? 80 : undefined} value={emp.compensation_type === 'hourly' ? emp.hours : emp.units} onChange={(e) => handleInputChange(emp.id, emp.compensation_type === 'hourly' ? 'hours' : 'units', e.target.value)} placeholder={emp.compensation_type === 'hourly' ? 'Hours' : 'Units'} className="w-24 px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 dark:text-white">${emp.amount.toFixed(2)}</td>
                      <td className="px-6 py-4">
                        <input type="text" value={emp.notes} onChange={(e) => handleInputChange(emp.id, 'notes', e.target.value)} placeholder="Optional notes" className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Submit Button */}
        <div className="mt-6 flex items-center justify-between">
          <p className="text-sm text-gray-600 dark:text-gray-400">Press <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded text-xs font-mono">Ctrl+Enter</kbd> to submit</p>
          <button onClick={handleSubmit} disabled={isSubmitting || totals.employees === 0} className={`inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold text-white shadow-sm transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${isSubmitting || totals.employees === 0 ? 'cursor-not-allowed bg-gray-400 dark:bg-gray-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
            {isSubmitting ? (<><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>Submitting...</>) : (<>Submit Payroll{totals.employees > 0 && <span className="ml-1 rounded-full bg-white/20 px-2 py-0.5 text-xs">{totals.employees}</span>}</>)}
          </button>
        </div>
      </main>
    </div>
  )
}
