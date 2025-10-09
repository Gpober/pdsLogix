'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { supabase as dataSupabase } from '@/lib/supabaseClient'

// ============================================================================
// TYPES
// ============================================================================

type PayrollGroup = 'A' | 'B'
type CompensationType = 'hourly' | 'production'

interface Employee {
  id: string
  employee_code: string
  full_name: string
  compensation_type: CompensationType
  hourly_rate: number | null
  piece_rate: number | null
  payroll_group: PayrollGroup
  active: boolean
}

interface PayrollEntry {
  hours: string
  units: string
  notes: string
}

interface Alert {
  type: 'success' | 'error' | 'info'
  message: string
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount)
}

const parseNumber = (value: string): number | null => {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const parsed = parseFloat(trimmed)
  return isFinite(parsed) ? parsed : null
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function PayrollSubmitPage() {
  const router = useRouter()
  const authClient = createClient() // Platform auth

  // Loading states
  const [isInitializing, setIsInitializing] = useState(true)
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Alert state
  const [alert, setAlert] = useState<Alert | null>(null)

  // User context
  const [userId, setUserId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [locationId, setLocationId] = useState<string | null>(null)
  const [locationName, setLocationName] = useState<string>('')

  // Payroll context
  const [payDate, setPayDate] = useState<string>(() => {
    const today = new Date()
    return today.toISOString().split('T')[0]
  })
  const [payrollGroup, setPayrollGroup] = useState<PayrollGroup | null>(null)

  // Employee data
  const [employees, setEmployees] = useState<Employee[]>([])
  const [entries, setEntries] = useState<Record<string, PayrollEntry>>({})

  // ============================================================================
  // INITIALIZATION - Use Platform Auth Client
  // ============================================================================

  useEffect(() => {
    let isMounted = true

    const initialize = async () => {
      try {
        // Get authenticated user from PLATFORM Supabase
        const { data: { user }, error: authError } = await authClient.auth.getUser()

        if (authError || !user) {
          router.replace('/login')
          return
        }

        // Get user role from PLATFORM Supabase
        const { data: userRecord, error: userError } = await authClient
          .from('users')
          .select('role')
          .eq('id', user.id)
          .single()

        if (userError) {
          console.error('Failed to load user role:', userError)
          if (isMounted) {
            setAlert({ 
              type: 'error', 
              message: 'Unable to verify your account. Please contact support.' 
            })
          }
          return
        }

        const role = userRecord?.role

        // Allow employees, admins, owners, and super_admin
        // (But layout will prevent non-employees from reaching dashboard)
        if (!role) {
          router.replace('/login')
          return
        }

        // Get user's assigned location from CLIENT Supabase
        const { data: locationAssignment, error: locationError } = await dataSupabase
          .from('user_locations')
          .select('location_id')
          .eq('user_id', user.id)
          .maybeSingle()

        if (locationError) {
          console.error('Failed to load location assignment:', locationError)
          if (isMounted) {
            setAlert({
              type: 'error',
              message: 'Unable to determine your assigned location.',
            })
          }
          return
        }

        if (!locationAssignment?.location_id) {
          if (isMounted) {
            setAlert({
              type: 'error',
              message: 'You do not have an assigned location. Please contact your administrator.',
            })
          }
          return
        }

        const locId = locationAssignment.location_id as string

        // Get location details from CLIENT Supabase
        const { data: locationDetails } = await dataSupabase
          .from('locations')
          .select('location_name')
          .eq('id', locId)
          .maybeSingle()

        if (isMounted) {
          setUserId(user.id)
          setUserRole(role)
          setLocationId(locId)
          setLocationName(locationDetails?.location_name || 'Unknown Location')
        }

      } catch (error) {
        console.error('Initialization error:', error)
        if (isMounted) {
          setAlert({
            type: 'error',
            message: 'An unexpected error occurred during initialization.',
          })
        }
      } finally {
        if (isMounted) {
          setIsInitializing(false)
        }
      }
    }

    initialize()

    return () => {
      isMounted = false
    }
  }, [router])

  // ============================================================================
  // PAYROLL GROUP CALCULATION - Use CLIENT Supabase
  // ============================================================================

  useEffect(() => {
    if (!payDate) {
      setPayrollGroup(null)
      return
    }

    let isMounted = true

    const fetchPayrollGroup = async () => {
      try {
        const { data, error } = await dataSupabase.rpc('get_payroll_group', {
          target_date: payDate,
        })

        if (error) {
          console.error('Failed to determine payroll group:', error)
          if (isMounted) {
            setAlert({
              type: 'error',
              message: 'Unable to determine payroll group for this date.',
            })
            setPayrollGroup(null)
          }
          return
        }

        if (isMounted) {
          if (data === 'A' || data === 'B') {
            setPayrollGroup(data)
          } else {
            setPayrollGroup(null)
          }
        }
      } catch (error) {
        console.error('Payroll group calculation error:', error)
        if (isMounted) {
          setAlert({
            type: 'error',
            message: 'Error calculating payroll group.',
          })
          setPayrollGroup(null)
        }
      }
    }

    fetchPayrollGroup()

    return () => {
      isMounted = false
    }
  }, [payDate])

  // ============================================================================
  // EMPLOYEE LOADING - Use CLIENT Supabase
  // ============================================================================

  useEffect(() => {
    if (!locationId || !payrollGroup) {
      setEmployees([])
      setEntries({})
      return
    }

    let isMounted = true

    const loadEmployees = async () => {
      setIsLoadingEmployees(true)
      try {
        const { data, error } = await dataSupabase
          .from('employees')
          .select('*')
          .eq('primary_location_id', locationId)
          .eq('payroll_group', payrollGroup)
          .eq('active', true)
          .order('full_name', { ascending: true })

        if (error) {
          console.error('Failed to load employees:', error)
          if (isMounted) {
            setAlert({
              type: 'error',
              message: 'Unable to load employees for this payroll period.',
            })
            setEmployees([])
          }
          return
        }

        if (isMounted) {
          setEmployees(data || [])
          setEntries({})
        }
      } catch (error) {
        console.error('Employee loading error:', error)
        if (isMounted) {
          setAlert({
            type: 'error',
            message: 'Error loading employee data.',
          })
          setEmployees([])
        }
      } finally {
        if (isMounted) {
          setIsLoadingEmployees(false)
        }
      }
    }

    loadEmployees()

    return () => {
      isMounted = false
    }
  }, [locationId, payrollGroup])

  // ============================================================================
  // ENTRY MANAGEMENT
  // ============================================================================

  const updateEntry = useCallback((employeeId: string, field: keyof PayrollEntry, value: string) => {
    setEntries(prev => ({
      ...prev,
      [employeeId]: {
        ...(prev[employeeId] || { hours: '', units: '', notes: '' }),
        [field]: value,
      },
    }))
  }, [])

  // ============================================================================
  // VALIDATION
  // ============================================================================

  const getValidationError = useCallback((employee: Employee): string | null => {
    const entry = entries[employee.id]
    if (!entry) return null

    if (employee.compensation_type === 'hourly') {
      const hours = parseNumber(entry.hours)
      if (hours === null) return null
      if (hours < 0) return 'Hours cannot be negative'
      if (hours > 80) return 'Maximum 80 hours per pay period'
      return null
    } else {
      const units = parseNumber(entry.units)
      if (units === null) return null
      if (units <= 0) return 'Units must be greater than 0'
      return null
    }
  }, [entries])

  const calculateAmount = useCallback((employee: Employee): number => {
    const entry = entries[employee.id]
    if (!entry) return 0

    const rate = employee.compensation_type === 'hourly'
      ? (employee.hourly_rate || 0)
      : (employee.piece_rate || 0)

    if (employee.compensation_type === 'hourly') {
      const hours = parseNumber(entry.hours)
      if (hours === null || hours < 0 || hours > 80) return 0
      return hours * rate
    } else {
      const units = parseNumber(entry.units)
      if (units === null || units <= 0) return 0
      return units * rate
    }
  }, [entries])

  // ============================================================================
  // TOTALS CALCULATION
  // ============================================================================

  const totals = useMemo(() => {
    let totalAmount = 0
    let employeeCount = 0

    employees.forEach(employee => {
      const error = getValidationError(employee)
      if (error) return

      const amount = calculateAmount(employee)
      if (amount > 0) {
        totalAmount += amount
        employeeCount += 1
      }
    })

    return { totalAmount, employeeCount }
  }, [employees, entries, calculateAmount, getValidationError])

  // ============================================================================
  // FORM SUBMISSION
  // ============================================================================

  const handleSubmit = async () => {
    if (!userId || !locationId || !payrollGroup) {
      setAlert({
        type: 'error',
        message: 'Missing required payroll information. Please refresh the page.',
      })
      return
    }

    const lines = employees
      .map(employee => {
        const entry = entries[employee.id]
        if (!entry) return null

        const error = getValidationError(employee)
        if (error) return null

        const amount = calculateAmount(employee)
        if (amount <= 0) return null

        if (employee.compensation_type === 'hourly') {
          const hours = parseNumber(entry.hours)
          if (hours === null || hours <= 0) return null

          return {
            employee_id: employee.id,
            hours_worked: hours,
            production_units: null,
            calculated_amount: amount,
            notes: entry.notes.trim() || null,
          }
        } else {
          const units = parseNumber(entry.units)
          if (units === null || units <= 0) return null

          return {
            employee_id: employee.id,
            hours_worked: null,
            production_units: units,
            calculated_amount: amount,
            notes: entry.notes.trim() || null,
          }
        }
      })
      .filter(Boolean)

    if (lines.length === 0) {
      setAlert({
        type: 'error',
        message: 'Please enter valid hours or units for at least one employee.',
      })
      return
    }

    const payload = {
      pay_date: payDate,
      payroll_group: payrollGroup,
      location_id: locationId,
      submitted_by: userId,
      total_amount: totals.totalAmount,
      lines,
    }

    setIsSubmitting(true)
    setAlert(null)

    try {
      const response = await fetch('/api/payroll/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || 'Failed to submit payroll')
      }

      const result = await response.json()

      setEntries({})
      setAlert({
        type: 'success',
        message: `Payroll submitted successfully! Submission #${result.submission_number || 'N/A'}`,
      })

      setTimeout(() => setAlert(null), 5000)

    } catch (error) {
      console.error('Payroll submission failed:', error)
      setAlert({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to submit payroll. Please try again.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ============================================================================
  // KEYBOARD SHORTCUTS
  // ============================================================================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (totals.employeeCount > 0 && !isSubmitting) {
          handleSubmit()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [totals.employeeCount, isSubmitting])

  // ============================================================================
  // SIGN OUT HANDLER (Only for employees)
  // ============================================================================

  const handleSignOut = async () => {
    await authClient.auth.signOut()
    router.push('/login')
  }

  // ============================================================================
  // RENDERING
  // ============================================================================

  if (isInitializing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
          <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
            Loading payroll system...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      
      {/* Simple Header - Only shown for employees */}
      {userRole === 'employee' && (
        <header className="border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
                <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Payroll System
                </h1>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {locationName}
                </p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Sign Out
            </button>
          </div>
        </header>
      )}

      {/* Main Content */}
      <div className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          
          {/* Page Title - Different for employees vs admins */}
          <div className="mb-6">
            {userRole === 'employee' ? (
              <div className="text-center">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Submit Payroll
                </h2>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  Enter hours and production data for your team
                </p>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
                    Payroll Submission
                  </h2>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    Viewing as {userRole} - Enter payroll data for {locationName}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
                  <div className="text-xs text-gray-600 dark:text-gray-400">Location</div>
                  <div className="font-semibold text-gray-900 dark:text-white">{locationName}</div>
                  {payrollGroup && (
                    <>
                      <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">Payroll Group</div>
                      <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                        Group {payrollGroup}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Alert */}
          {alert && (
            <div
              className={`mb-6 rounded-lg border px-4 py-3 ${
                alert.type === 'success'
                  ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-900/20 dark:text-green-400'
                  : alert.type === 'error'
                  ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-900/20 dark:text-red-400'
                  : 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-900/20 dark:text-blue-400'
              }`}
            >
              <div className="flex items-start">
                <span className="text-sm">{alert.message}</span>
                <button
                  onClick={() => setAlert(null)}
                  className="ml-auto text-sm font-semibold hover:opacity-70"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {/* Pay Date Selector */}
          <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <label className="block">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Select Pay Date
              </span>
              <input
                type="date"
                value={payDate}
                onChange={e => setPayDate(e.target.value)}
                className="mt-2 block w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white sm:w-auto"
              />
            </label>
            {payrollGroup && (
              <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                Payroll Group <strong className="text-blue-600 dark:text-blue-400">{payrollGroup}</strong> employees will be loaded for this date.
              </p>
            )}
          </div>

          {/* Employee Table */}
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
            {isLoadingEmployees ? (
              <div className="py-12 text-center">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
                <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">Loading employees...</p>
              </div>
            ) : employees.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-gray-600 dark:text-gray-400">
                  No employees found for {payrollGroup ? `Group ${payrollGroup}` : 'this selection'}.
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300">
                          Employee
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300">
                          Type
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300">
                          Rate
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300">
                          Hours / Units
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300">
                          Amount
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300">
                          Notes
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-800 dark:bg-gray-900">
                      {employees.map(employee => {
                        const entry = entries[employee.id] || { hours: '', units: '', notes: '' }
                        const error = getValidationError(employee)
                        const amount = calculateAmount(employee)
                        const rate = employee.compensation_type === 'hourly'
                          ? (employee.hourly_rate || 0)
                          : (employee.piece_rate || 0)

                        return (
                          <tr key={employee.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                            <td className="px-6 py-4">
                              <div className="text-sm font-medium text-gray-900 dark:text-white">
                                {employee.full_name}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {employee.employee_code}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span
                                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                                  employee.compensation_type === 'hourly'
                                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                                    : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                }`}
                              >
                                {employee.compensation_type === 'hourly' ? 'Hourly' : 'Production'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right text-sm tabular-nums text-gray-900 dark:text-white">
                              {formatCurrency(rate)}
                            </td>
                            <td className="px-6 py-4">
                              <input
                                type="number"
                                inputMode="decimal"
                                step={employee.compensation_type === 'hourly' ? '0.25' : '1'}
                                min="0"
                                max={employee.compensation_type === 'hourly' ? '80' : undefined}
                                placeholder={employee.compensation_type === 'hourly' ? 'Hours' : 'Units'}
                                value={employee.compensation_type === 'hourly' ? entry.hours : entry.units}
                                onChange={e => updateEntry(
                                  employee.id,
                                  employee.compensation_type === 'hourly' ? 'hours' : 'units',
                                  e.target.value
                                )}
                                className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                                  error
                                    ? 'border-red-300 focus:border-red-500 focus:ring-red-200 dark:border-red-700 dark:bg-gray-800'
                                    : 'border-gray-300 focus:border-blue-500 focus:ring-blue-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white'
                                }`}
                              />
                              {error && (
                                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right text-sm font-semibold tabular-nums text-gray-900 dark:text-white">
                              {formatCurrency(amount)}
                            </td>
                            <td className="px-6 py-4">
                              <input
                                type="text"
                                placeholder="Optional"
                                value={entry.notes}
                                onChange={e => updateEntry(employee.id, 'notes', e.target.value)}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Footer with Total */}
                <div className="border-t border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-800 dark:bg-gray-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {totals.employeeCount} {totals.employeeCount === 1 ? 'employee' : 'employees'} entered
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-500">
                        Press Ctrl+Enter to submit quickly
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-600 dark:text-gray-400">Total Amount</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">
                        {formatCurrency(totals.totalAmount)}
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Submit Button */}
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || totals.employeeCount === 0}
              className={`inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold text-white shadow-sm transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                isSubmitting || totals.employeeCount === 0
                  ? 'cursor-not-allowed bg-gray-400 dark:bg-gray-700'
                  : 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600'
              }`}
            >
              {isSubmitting ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-solid border-white border-r-transparent"></div>
                  Submitting...
                </>
              ) : (
                <>
                  Submit Payroll
                  {totals.employeeCount > 0 && (
                    <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">
                      {totals.employeeCount}
                    </span>
                  )}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}">
                          Employee
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300">
                          Type
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300">
                          Rate
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300
