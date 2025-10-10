'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { supabase as dataSupabase } from '@/lib/supabaseClient'
import { LogOut, DollarSign, Clock, Users, CheckCircle2, AlertCircle, X, Calendar } from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================

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

type Alert = {
  type: 'success' | 'error'
  message: string
}

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

function formatInputDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
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
  return {
    payrollGroup,
    periodStart: formatInputDate(periodStart),
    periodEnd: formatInputDate(periodEnd),
  }
}

function getNextFriday(): string {
  const today = new Date()
  const dayOfWeek = today.getDay()
  const daysUntilFriday = dayOfWeek <= 5 ? 5 - dayOfWeek : 6
  const nextFriday = new Date(today)
  nextFriday.setDate(today.getDate() + daysUntilFriday)

  return formatInputDate(nextFriday)
}

function formatDateRange(startDate: string, endDate: string): string {
  const start = parseLocalDate(startDate)
  const end = parseLocalDate(endDate)

  if (!start || !end) {
    return `${startDate} - ${endDate}`
  }

  const startMonth = formatDisplayDate(startDate, { month: 'short' })
  const startDay = start.getDate()
  const endMonth = formatDisplayDate(endDate, { month: 'short' })
  const endDay = end.getDate()

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay}-${endDay}`
  } else {
    return `${startMonth} ${startDay} - ${endMonth} ${endDay}`
  }
}

function generateFridayOptions(pastCount = 6, futureCount = 12) {
  const today = new Date()
  const dayOfWeek = today.getDay()
  const daysUntilNextFriday = (5 - dayOfWeek + 7) % 7
  const nextFriday = new Date(today)
  nextFriday.setDate(today.getDate() + daysUntilNextFriday)

  const startDate = new Date(nextFriday)
  startDate.setDate(nextFriday.getDate() - pastCount * 7)

  const options: { value: string; label: string }[] = []
  for (let i = 0; i <= pastCount + futureCount; i++) {
    const optionDate = new Date(startDate)
    optionDate.setDate(startDate.getDate() + i * 7)
    options.push({
      value: formatInputDate(optionDate),
      label: optionDate.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
    })
  }

  return options
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function MobilePayrollSubmit() {
  const router = useRouter()
  const [isInitializing, setIsInitializing] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Auth state
  const [userId, setUserId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [userName, setUserName] = useState<string>('')
  const [locationId, setLocationId] = useState<string | null>(null)
  const [locationName, setLocationName] = useState<string>('')

  // Form state
  const [payDate, setPayDate] = useState<string>('')
  const [payrollGroup, setPayrollGroup] = useState<PayrollGroup>('A')
  const [periodStart, setPeriodStart] = useState<string>('')
  const [periodEnd, setPeriodEnd] = useState<string>('')
  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeRow | null>(null)
  const [alert, setAlert] = useState<Alert | null>(null)

  const fridayOptions = useMemo(() => generateFridayOptions(), [])

  // ============================================================================
  // INITIALIZE WITH NEXT FRIDAY
  // ============================================================================

  useEffect(() => {
    if (fridayOptions.length === 0) {
      return
    }

    const nextFriday = getNextFriday()
    const defaultDate =
      fridayOptions.find((option) => option.value === nextFriday)?.value ??
      fridayOptions[fridayOptions.length - 1]?.value ??
      nextFriday

    setPayDate(defaultDate)
    const info = calculatePayrollInfo(defaultDate)
    setPayrollGroup(info.payrollGroup)
    setPeriodStart(info.periodStart)
    setPeriodEnd(info.periodEnd)
    console.log('📅 Initial Payroll Info:', { payDate: defaultDate, ...info })
  }, [fridayOptions])

  // ============================================================================
  // RECALCULATE WHEN PAY DATE CHANGES
  // ============================================================================

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

  // ============================================================================
  // AUTH & INITIALIZATION
  // ============================================================================

  useEffect(() => {
    checkAuthAndLoadData()
  }, [])

  async function checkAuthAndLoadData() {
    try {
      console.log('🔍 Mobile Payroll: Starting auth check...')
      
      const platformClient = createClient()
      const { data: { user }, error: authError } = await platformClient.auth.getUser()

      if (authError || !user) {
        console.log('❌ Mobile Payroll: No user found, redirecting to login')
        router.replace('/login')
        return
      }

      setUserId(user.id)
      console.log('✅ Mobile Payroll: User authenticated:', user.email)

      const { data: userRecord, error: userError } = await platformClient
        .from('users')
        .select('role, full_name, location_id')
        .eq('id', user.id)
        .single()

      if (userError) {
        console.error('❌ Mobile Payroll: User record error:', userError)
        setIsInitializing(false)
        showAlert('error', 'Failed to load user data. Please refresh.')
        return
      }

      if (!userRecord) {
        console.error('❌ Mobile Payroll: No user record found')
        router.replace('/login')
        return
      }

      const role = userRecord.role as string
      const locId = userRecord.location_id as string

      console.log('✅ Mobile Payroll: User role:', role, 'Location ID:', locId)

      setUserRole(role)
      setUserName(userRecord.full_name || user.email || 'User')
      setLocationId(locId)

      if (role !== 'employee' && role !== 'super_admin' && role !== 'admin' && role !== 'owner') {
        console.log('❌ Mobile Payroll: Access denied for role:', role)
        router.replace('/dashboard')
        return
      }
      
      console.log('✅ Mobile Payroll: Access granted for role:', role)

      try {
        const { data: locationData, error: locError } = await dataSupabase
          .from('locations')
          .select('name')
          .eq('id', locId)
          .single()

        if (locError) {
          console.warn('⚠️ Mobile Payroll: Location fetch failed:', locError)
          setLocationName('Unknown Location')
        } else {
          setLocationName(locationData?.name || 'Unknown Location')
          console.log('✅ Mobile Payroll: Location name:', locationData?.name)
        }
      } catch (err) {
        console.warn('⚠️ Mobile Payroll: Location fetch error:', err)
        setLocationName('Unknown Location')
      }

      setIsInitializing(false)
      console.log('✅ Mobile Payroll: Initialization complete, loading employees...')
      await loadEmployees(locId)
    } catch (error) {
      console.error('❌ Mobile Payroll: Critical error:', error)
      setIsInitializing(false)
      showAlert('error', 'Something went wrong. Please try again.')
    }
  }

  async function loadEmployees(locId: string) {
    setIsLoading(true)
    try {
      const { data, error } = await dataSupabase
        .from('employees')
        .select('*')
        .eq('location_id', locId)
        .eq('is_active', true)
        .order('last_name', { ascending: true })

      if (error) throw error

      const rows: EmployeeRow[] = (data || []).map((emp: Employee) => ({
        ...emp,
        hours: '',
        units: '',
        notes: '',
        amount: 0,
      }))

      setEmployees(rows)
      console.log('✅ Mobile Payroll: Loaded', rows.length, 'employees')
    } catch (error) {
      console.error('❌ Mobile Payroll: Error loading employees:', error)
      showAlert('error', 'Failed to load employees')
    } finally {
      setIsLoading(false)
    }
  }

  // ============================================================================
  // FILTERING & CALCULATIONS
  // ============================================================================

  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => emp.payroll_group === payrollGroup)
  }, [employees, payrollGroup])

  const totals = useMemo(() => {
    const hourlyEmployees = filteredEmployees.filter(
      (emp) => emp.compensation_type === 'hourly'
    )
    const productionEmployees = filteredEmployees.filter(
      (emp) => emp.compensation_type === 'production'
    )

    const totalHours = hourlyEmployees.reduce((sum, emp) => {
      const hours = parseFloat(emp.hours) || 0
      return sum + hours
    }, 0)

    const totalUnits = productionEmployees.reduce((sum, emp) => {
      const units = parseFloat(emp.units) || 0
      return sum + units
    }, 0)

    const totalAmount = filteredEmployees.reduce((sum, emp) => sum + emp.amount, 0)

    return {
      employees: filteredEmployees.length,
      hourlyCount: hourlyEmployees.length,
      productionCount: productionEmployees.length,
      totalHours,
      totalUnits,
      totalAmount,
    }
  }, [filteredEmployees])

  // ============================================================================
  // HANDLERS
  // ============================================================================

  function showAlert(type: 'success' | 'error', message: string) {
    setAlert({ type, message })
    if (type === 'success') {
      setTimeout(() => setAlert(null), 5000)
    }
  }

  function handleEmployeeSelect(emp: EmployeeRow) {
    setSelectedEmployee(emp)
  }

  function handleInputChange(field: 'hours' | 'units' | 'notes', value: string) {
    if (!selectedEmployee) return

    const updated = { ...selectedEmployee, [field]: value }

    if (field === 'hours' || field === 'units') {
      const numValue = parseFloat(value) || 0
      if (updated.compensation_type === 'hourly') {
        updated.amount = numValue * (updated.hourly_rate || 0)
      } else {
        updated.amount = numValue * (updated.piece_rate || 0)
      }
    }

    setSelectedEmployee(updated)
    setEmployees(
      employees.map((emp) => (emp.id === updated.id ? updated : emp))
    )
  }

  function handleSaveEmployee() {
    setSelectedEmployee(null)
  }

  async function handleSubmit() {
    const employeesWithData = filteredEmployees.filter((emp) => {
      if (emp.compensation_type === 'hourly') {
        return parseFloat(emp.hours) > 0
      } else {
        return parseFloat(emp.units) > 0
      }
    })

    if (employeesWithData.length === 0) {
      showAlert('error', 'Please enter hours or units for at least one employee')
      return
    }

    const hasInvalidHours = employeesWithData.some((emp) => {
      if (emp.compensation_type === 'hourly') {
        const hours = parseFloat(emp.hours)
        return hours < 0 || hours > 80
      }
      return false
    })

    if (hasInvalidHours) {
      showAlert('error', 'Hours must be between 0 and 80')
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch('/api/payroll/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location_id: locationId,
          pay_date: payDate,
          payroll_group: payrollGroup,
          submitted_by: userId,
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

      setEmployees(
        employees.map((emp) => ({
          ...emp,
          hours: '',
          units: '',
          notes: '',
          amount: 0,
        }))
      )
    } catch (error: any) {
      console.error('Submission error:', error)
      showAlert('error', error.message || 'Failed to submit payroll')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleSignOut() {
    const platformClient = createClient()
    await platformClient.auth.signOut()
    router.push('/login')
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400"></div>
          <p className="mt-4 text-blue-100">Loading...</p>
        </div>
      </div>
    )
  }

  // Employee Detail Modal
  if (selectedEmployee) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4">
        <div className="max-w-lg mx-auto pt-6">
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => setSelectedEmployee(null)}
              className="text-blue-100 text-sm font-medium"
            >
              ← Back
            </button>
            <h2 className="text-white text-lg font-semibold">Enter Hours</h2>
            <div className="w-12" />
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 mb-6 border border-white/20">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-white text-xl font-bold">
                  {selectedEmployee.first_name} {selectedEmployee.last_name}
                </h3>
                <p className="text-blue-200 text-sm">{selectedEmployee.employee_code}</p>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  selectedEmployee.compensation_type === 'hourly'
                    ? 'bg-blue-500/20 text-blue-200'
                    : 'bg-purple-500/20 text-purple-200'
                }`}
              >
                {selectedEmployee.compensation_type === 'hourly' ? 'Hourly' : 'Production'}
              </span>
            </div>

            <div className="bg-white/5 rounded-xl p-4">
              <p className="text-blue-200 text-sm mb-1">Rate</p>
              <p className="text-white text-2xl font-bold">
                ${selectedEmployee.compensation_type === 'hourly'
                  ? selectedEmployee.hourly_rate?.toFixed(2)
                  : selectedEmployee.piece_rate?.toFixed(2)}
                <span className="text-blue-200 text-sm font-normal ml-2">
                  {selectedEmployee.compensation_type === 'hourly' ? '/ hour' : '/ unit'}
                </span>
              </p>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 mb-6 border border-white/20">
            <label className="block mb-4">
              <span className="text-blue-200 text-sm font-medium mb-2 block">
                {selectedEmployee.compensation_type === 'hourly' ? 'Hours Worked' : 'Units Produced'}
              </span>
              <input
                type="number"
                step="0.01"
                value={selectedEmployee.compensation_type === 'hourly' ? selectedEmployee.hours : selectedEmployee.units}
                onChange={(e) =>
                  handleInputChange(
                    selectedEmployee.compensation_type === 'hourly' ? 'hours' : 'units',
                    e.target.value
                  )
                }
                className="w-full px-4 py-4 text-2xl font-bold bg-white/5 border-2 border-white/20 rounded-xl text-white placeholder-blue-300/50 focus:outline-none focus:border-blue-400 focus:bg-white/10 transition"
                placeholder="0"
              />
            </label>

            <label className="block mb-6">
              <span className="text-blue-200 text-sm font-medium mb-2 block">Notes (optional)</span>
              <textarea
                value={selectedEmployee.notes}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                rows={3}
                className="w-full px-4 py-3 bg-white/5 border-2 border-white/20 rounded-xl text-white placeholder-blue-300/50 focus:outline-none focus:border-blue-400 focus:bg-white/10 transition resize-none"
                placeholder="Add any notes..."
              />
            </label>

            <div className="bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-xl p-4">
              <p className="text-blue-200 text-sm mb-1">Total Amount</p>
              <p className="text-white text-3xl font-bold">
                ${selectedEmployee.amount.toFixed(2)}
              </p>
            </div>
          </div>

          <button
            onClick={handleSaveEmployee}
            className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold py-4 rounded-xl shadow-lg hover:shadow-xl transition-all"
          >
            Save & Continue
          </button>
        </div>
      </div>
    )
  }

  // Main List View
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <div className="bg-white/10 backdrop-blur-md border-b border-white/20 sticky top-0 z-50">
        <div className="max-w-lg mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-white text-xl font-bold">Payroll Submit</h1>
              <p className="text-blue-200 text-sm">{locationName}</p>
            </div>
            <button
              onClick={handleSignOut}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition"
            >
              <LogOut className="w-5 h-5 text-blue-200" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 pb-32">
        {alert && (
          <div
            className={`mb-4 p-4 rounded-xl flex items-start gap-3 ${
              alert.type === 'success'
                ? 'bg-green-500/20 border border-green-400/30'
                : 'bg-red-500/20 border border-red-400/30'
            }`}
          >
            {alert.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-green-300 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-300 flex-shrink-0 mt-0.5" />
            )}
            <p className={`flex-1 text-sm ${alert.type === 'success' ? 'text-green-100' : 'text-red-100'}`}>
              {alert.message}
            </p>
            <button onClick={() => setAlert(null)}>
              <X className={`w-5 h-5 ${alert.type === 'success' ? 'text-green-300' : 'text-red-300'}`} />
            </button>
          </div>
        )}

        {/* Pay Date Selector */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 mb-4 border border-white/20">
          <div className="max-w-xs w-full mx-auto">
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2 justify-center">
                <Calendar className="w-4 h-4 text-blue-300" />
                <span className="text-blue-200 text-sm font-medium">Select Pay Date (Friday)</span>
              </div>
              <select
                value={payDate}
                onChange={(e) => handlePayDateChange(e.target.value)}
                className="w-full px-4 py-2 text-base font-semibold bg-white/5 border border-white/20 rounded-xl text-white focus:outline-none focus:border-blue-400 focus:bg-white/10 transition"
              >
                {fridayOptions.map((option) => (
                  <option key={option.value} value={option.value} className="bg-slate-900 text-white">
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-3 mb-4">
              <div>
                <span className="text-blue-200 text-xs font-medium uppercase tracking-wide block text-center">
                  Payroll Type
                </span>
                <div className="mt-1 w-full px-4 py-2 text-base font-semibold bg-white/5 border border-white/20 rounded-xl text-white text-center">
                  Payroll Group {payrollGroup}
                </div>
                <p className="text-blue-200 text-xs mt-1 text-center">Auto-calculated from pay date</p>
              </div>
              <div>
                <span className="text-blue-200 text-xs font-medium uppercase tracking-wide block text-center">
                  Payroll Period
                </span>
                <div className="mt-1 w-full px-4 py-2 text-base font-semibold bg-white/5 border border-white/20 rounded-xl text-white text-center">
                  {periodStart && periodEnd ? formatDateRange(periodStart, periodEnd) : '-'}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white/5 rounded-lg p-3 text-center">
                <Users className="w-4 h-4 text-blue-300 mx-auto mb-1" />
                <p className="text-white text-lg font-bold">{totals.employees}</p>
                <p className="text-blue-200 text-xs">Employees</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3 text-center">
                <Clock className="w-4 h-4 text-blue-300 mx-auto mb-1" />
                <p className="text-white text-lg font-bold">{totals.totalHours.toFixed(1)}</p>
                <p className="text-blue-200 text-xs">Hours</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3 text-center">
                <DollarSign className="w-4 h-4 text-blue-300 mx-auto mb-1" />
                <p className="text-white text-lg font-bold">${totals.totalAmount.toFixed(0)}</p>
                <p className="text-blue-200 text-xs">Total</p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {isLoading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
              <p className="mt-4 text-blue-200 text-sm">Loading employees...</p>
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-blue-300/50 mx-auto mb-4" />
              <p className="text-blue-200">No employees in Group {payrollGroup}</p>
            </div>
          ) : (
            filteredEmployees.map((emp) => (
              <button
                key={emp.id}
                onClick={() => handleEmployeeSelect(emp)}
                className="w-full bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20 hover:bg-white/15 transition text-left"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="text-white font-semibold">
                      {emp.first_name} {emp.last_name}
                    </h3>
                    <p className="text-blue-200 text-sm">{emp.employee_code}</p>
                  </div>
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-semibold ${
                      emp.compensation_type === 'hourly'
                        ? 'bg-blue-500/20 text-blue-200'
                        : 'bg-purple-500/20 text-purple-200'
                    }`}
                  >
                    {emp.compensation_type === 'hourly' ? 'Hourly' : 'Production'}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-sm">
                    <span className="text-blue-200">
                      {emp.compensation_type === 'hourly' ? 'Hours: ' : 'Units: '}
                    </span>
                    <span className="text-white font-semibold">
                      {emp.compensation_type === 'hourly'
                        ? emp.hours || '0'
                        : emp.units || '0'}
                    </span>
                  </div>
                  <div className="text-white font-bold text-lg">
                    ${emp.amount.toFixed(2)}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-slate-900 via-slate-900/95 to-transparent p-4 border-t border-white/10">
        <div className="max-w-lg mx-auto">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || totals.employees === 0}
            className="w-full bg-gradient-to-r from-blue-500 to-blue-600 disabled:from-gray-600 disabled:to-gray-700 text-white font-semibold py-4 rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                Submitting...
              </span>
            ) : (
              `Submit Payroll (${totals.employees} employees)`
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
