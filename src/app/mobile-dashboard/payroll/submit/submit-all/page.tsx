'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getAuthClient } from '@/lib/supabase/auth-client'
import { getDataClient, syncDataClientSession } from '@/lib/supabase/client'
import { ChevronDown, DollarSign, Users, Calendar, MapPin, CheckCircle2, AlertCircle, RefreshCw, ArrowLeft } from 'lucide-react'

// I AM CFO Brand Colors
const BRAND_COLORS = {
  primary: '#56B6E9',
  secondary: '#3A9BD1',
  success: '#27AE60',
  warning: '#F39C12',
  danger: '#E74C3C',
}

type PayrollGroup = 'A' | 'B'

type Location = {
  id: string
  name: string
}

type Employee = {
  id: string
  first_name: string
  last_name: string
  email: string | null
  payroll_group: PayrollGroup
  compensation_type: 'hourly' | 'production' | 'fixed'
  hourly_rate: number | null
  piece_rate: number | null
  fixed_pay: number | null
  location_id: string
}

type EmployeeRow = Employee & {
  hours: string
  units: string
  count: string
  adjustment: string
  notes: string
  amount: number
}

type Alert = {
  type: 'success' | 'error'
  message: string
}

// Helper functions
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

function calculatePayrollInfo(payDateStr: string): {
  payrollGroup: PayrollGroup
  periodStart: string
  periodEnd: string
} {
  const payDate = new Date(payDateStr)
  const periodEnd = new Date(payDate)
  periodEnd.setDate(payDate.getDate() - 9)
  const periodStart = new Date(periodEnd)
  periodStart.setDate(periodEnd.getDate() - 13)

  const PAYROLL_REFERENCE_DATE = new Date(2025, 0, 3)
  const MS_PER_WEEK = 1000 * 60 * 60 * 24 * 7
  const payDateUTC = Date.UTC(payDate.getFullYear(), payDate.getMonth(), payDate.getDate())
  const referenceDateUTC = Date.UTC(
    PAYROLL_REFERENCE_DATE.getFullYear(),
    PAYROLL_REFERENCE_DATE.getMonth(),
    PAYROLL_REFERENCE_DATE.getDate()
  )
  const weeksDifference = Math.round((payDateUTC - referenceDateUTC) / MS_PER_WEEK)
  const parity = ((weeksDifference % 2) + 2) % 2
  const payrollGroup: PayrollGroup = parity === 0 ? 'A' : 'B'

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

function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export default function MultiLocationPayrollSubmit() {
  const router = useRouter()
  const authClient = useMemo(() => getAuthClient(), [])
  const dataSupabase = useMemo(() => getDataClient(), [])
  
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [subdomainOrgId, setSubdomainOrgId] = useState<string | null>(null)
  
  const [locations, setLocations] = useState<Location[]>([])
  const [selectedLocationId, setSelectedLocationId] = useState<string>('all')
  const [showLocationPicker, setShowLocationPicker] = useState(false)
  
  const [payDate, setPayDate] = useState<string>(getNextFriday())
  const [payrollGroup, setPayrollGroup] = useState<PayrollGroup>('A')
  const [periodStart, setPeriodStart] = useState<string>('')
  const [periodEnd, setPeriodEnd] = useState<string>('')
  
  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [alert, setAlert] = useState<Alert | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Initialize pay date and period
  useEffect(() => {
    const nextFriday = getNextFriday()
    setPayDate(nextFriday)
    const info = calculatePayrollInfo(nextFriday)
    setPayrollGroup(info.payrollGroup)
    setPeriodStart(info.periodStart)
    setPeriodEnd(info.periodEnd)
  }, [])

  // Get subdomain organization
  useEffect(() => {
    const getOrgFromSubdomain = async () => {
      const hostname = window.location.hostname
      const parts = hostname.split('.')

      if (parts.length >= 3) {
        const subdomain = parts[0]
        console.log('🌐 Detected subdomain:', subdomain)

        const { data: { session } } = await authClient.auth.getSession()
        if (!session) return

        await syncDataClientSession(session)

        const { data: org, error } = await dataSupabase
          .from('organizations')
          .select('id')
          .eq('subdomain', subdomain)
          .single()

        if (!error && org) {
          console.log('🏢 Found organization for subdomain:', org.id)
          setSubdomainOrgId(org.id)
        }
      }
    }

    getOrgFromSubdomain()
  }, [authClient, dataSupabase])

  // Auth check - super_admin only
  useEffect(() => {
    const checkAuth = async () => {
      console.log('🔍 Starting auth check...')
      
      let session = null
      const { data: { session: platformSession } } = await authClient.auth.getSession()
      
      if (platformSession?.user) {
        session = platformSession
      } else {
        const { data: { session: clientSession } } = await dataSupabase.auth.getSession()
        if (clientSession?.user) {
          session = clientSession
        }
      }

      if (!session?.user) {
        console.log('❌ No session found')
        router.push('/login')
        return
      }

      await syncDataClientSession(session)
      setUserId(session.user.id)

      const { data: userData, error } = await authClient
        .from('users')
        .select('role, organization_id')
        .eq('id', session.user.id)
        .single()

      if (error || !userData) {
        console.error('❌ User error:', error)
        router.push('/dashboard')
        return
      }

      setUserRole(userData.role)
      setOrganizationId(userData.organization_id)

      // Only allow super_admin
      if (userData.role !== 'super_admin') {
        console.log('⛔ Access denied - not super_admin')
        router.push('/dashboard')
        return
      }

      console.log('✅ Super admin access granted')
      setLoading(false)
    }

    checkAuth()
  }, [authClient, dataSupabase, router])

  // Load all locations for the organization
  useEffect(() => {
    const loadLocations = async () => {
      const effectiveOrgId = userRole === 'super_admin' ? subdomainOrgId : organizationId

      if (!effectiveOrgId) return

      const { data, error } = await dataSupabase
        .from('locations')
        .select('id, name')
        .eq('organization_id', effectiveOrgId)
        .order('name')

      if (error) {
        console.error('Error loading locations:', error)
        return
      }

      console.log('📍 Loaded locations:', data)
      setLocations(data || [])
    }

    if (userRole && (subdomainOrgId || organizationId)) {
      loadLocations()
    }
  }, [userRole, subdomainOrgId, organizationId, dataSupabase])

  // Load employees based on selected location(s) and payroll group
  useEffect(() => {
    const loadEmployees = async () => {
      if (!locations.length) return

      let query = dataSupabase
        .from('employees')
        .select('*')
        .eq('is_archived', false)
        .eq('payroll_group', payrollGroup)
        .order('last_name')

      // Filter by location
      if (selectedLocationId === 'all') {
        query = query.in('location_id', locations.map(l => l.id))
      } else {
        query = query.eq('location_id', selectedLocationId)
      }

      const { data, error } = await query

      if (error) {
        console.error('Error loading employees:', error)
        showAlert('error', 'Failed to load employees')
        return
      }

      const employeeRows: EmployeeRow[] = (data || []).map((emp: Employee) => ({
        ...emp,
        hours: '',
        units: '',
        count: '1',
        adjustment: '0',
        notes: '',
        amount: 0,
      }))

      console.log(`📋 Loaded ${employeeRows.length} employees for group ${payrollGroup}`)
      setEmployees(employeeRows)
    }

    loadEmployees()
  }, [selectedLocationId, locations, payrollGroup, dataSupabase])

  function showAlert(type: Alert['type'], message: string) {
    setAlert({ type, message })
    setTimeout(() => setAlert(null), 5000)
  }

  const totals = useMemo(() => {
    const employeesWithData = employees.filter(emp => {
      if (emp.compensation_type === 'hourly') return parseFloat(emp.hours || '0') > 0
      if (emp.compensation_type === 'production') return parseFloat(emp.units || '0') > 0
      if (emp.compensation_type === 'fixed') return parseFloat(emp.count || '0') > 0
      return false
    })

    const totalAmount = employeesWithData.reduce((sum, emp) => sum + emp.amount, 0)

    // Group by location
    const byLocation = new Map<string, { count: number; amount: number }>()
    employeesWithData.forEach(emp => {
      const existing = byLocation.get(emp.location_id) || { count: 0, amount: 0 }
      byLocation.set(emp.location_id, {
        count: existing.count + 1,
        amount: existing.amount + emp.amount
      })
    })

    return {
      employees: employeesWithData.length,
      totalAmount,
      locationBreakdown: byLocation
    }
  }, [employees])

  const locationName = useMemo(() => {
    if (selectedLocationId === 'all') return 'All Locations'
    return locations.find(l => l.id === selectedLocationId)?.name || 'Select Location'
  }, [selectedLocationId, locations])

  function handleEmployeeUpdate(employeeId: string, field: string, value: string) {
    setEmployees(prev => prev.map(emp => {
      if (emp.id !== employeeId) return emp

      const updated = { ...emp, [field]: value }

      // Recalculate amount
      if (emp.compensation_type === 'hourly') {
        const hours = parseFloat(field === 'hours' ? value : updated.hours) || 0
        updated.amount = hours * (emp.hourly_rate || 0)
      } else if (emp.compensation_type === 'production') {
        const units = parseFloat(field === 'units' ? value : updated.units) || 0
        updated.amount = units * (emp.piece_rate || 0)
      } else if (emp.compensation_type === 'fixed') {
        const count = parseFloat(field === 'count' ? value : updated.count) || 0
        const adjustment = parseFloat(field === 'adjustment' ? value : updated.adjustment) || 0
        const baseAmount = count * (emp.fixed_pay || 0)
        updated.amount = baseAmount + adjustment
      }

      return updated
    }))
  }

  async function handleSubmit() {
    if (!userId) {
      showAlert('error', 'Missing user ID')
      return
    }

    const effectiveOrgId = userRole === 'super_admin' ? subdomainOrgId : organizationId
    if (!effectiveOrgId) {
      showAlert('error', 'Missing organization ID')
      return
    }

    const employeesWithData = employees.filter(emp => {
      if (emp.compensation_type === 'hourly') return parseFloat(emp.hours || '0') > 0
      if (emp.compensation_type === 'production') return parseFloat(emp.units || '0') > 0
      if (emp.compensation_type === 'fixed') return parseFloat(emp.count || '0') > 0
      return false
    })

    if (employeesWithData.length === 0) {
      showAlert('error', 'Please enter payroll data for at least one employee')
      return
    }

    setIsSubmitting(true)
    try {
      // Group employees by location
      const employeesByLocation = new Map<string, EmployeeRow[]>()
      employeesWithData.forEach(emp => {
        const list = employeesByLocation.get(emp.location_id) || []
        list.push(emp)
        employeesByLocation.set(emp.location_id, list)
      })

      // Create submissions for each location
      for (const [locationId, locationEmployees] of employeesByLocation) {
        const totalAmount = locationEmployees.reduce((sum, emp) => sum + emp.amount, 0)

        const { data: submission, error: submissionError } = await dataSupabase
          .from('payroll_submissions')
          .insert({
            organization_id: effectiveOrgId,
            location_id: locationId,
            pay_date: payDate,
            payroll_group: payrollGroup,
            period_start: periodStart,
            period_end: periodEnd,
            total_amount: totalAmount,
            employee_count: locationEmployees.length,
            submitted_by: userId,
            status: 'pending',
          })
          .select()
          .single()

        if (submissionError) throw submissionError

        const details = locationEmployees.map(emp => ({
          organization_id: effectiveOrgId,
          submission_id: submission.id,
          employee_id: emp.id,
          hours: emp.compensation_type === 'hourly' ? parseFloat(emp.hours) : null,
          units: emp.compensation_type === 'production' ? parseFloat(emp.units) : null,
          fixed_count: emp.compensation_type === 'fixed' ? parseFloat(emp.count) : null,
          adjustment_amount: emp.compensation_type === 'fixed' ? parseFloat(emp.adjustment) : null,
          amount: emp.amount,
          notes: emp.notes || null,
        }))

        const { error: detailsError } = await dataSupabase
          .from('payroll_entries')
          .insert(details)

        if (detailsError) throw detailsError
      }

      showAlert('success', `✅ Submitted payroll for ${employeesByLocation.size} location(s)!`)
      
      // Reset form
      setEmployees(prev => prev.map(emp => ({
        ...emp,
        hours: '',
        units: '',
        count: '1',
        adjustment: '0',
        notes: '',
        amount: 0,
      })))

    } catch (error: any) {
      console.error('Submit error:', error)
      showAlert('error', error.message || 'Failed to submit payroll')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 pb-32">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-500 p-6 shadow-lg sticky top-0 z-50">
        <div className="flex items-center gap-4 mb-4">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition"
          >
            <ArrowLeft className="w-6 h-6 text-white" />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white">Multi-Location Payroll</h1>
            <p className="text-blue-100 text-sm">Submit payroll for multiple locations</p>
          </div>
        </div>

        {/* Filters */}
        <div className="space-y-3">
          {/* Location Selector */}
          <div className="relative">
            <button
              onClick={() => setShowLocationPicker(!showLocationPicker)}
              className="w-full bg-white/10 backdrop-blur-md rounded-xl px-4 py-3 text-left border border-white/20 hover:bg-white/15 transition flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-blue-200" />
                <span className="text-white font-medium">{locationName}</span>
              </div>
              <ChevronDown className="w-5 h-5 text-blue-200" />
            </button>

            {showLocationPicker && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-200 max-h-64 overflow-y-auto z-50">
                <button
                  onClick={() => {
                    setSelectedLocationId('all')
                    setShowLocationPicker(false)
                  }}
                  className={`w-full px-4 py-3 text-left hover:bg-blue-50 transition ${
                    selectedLocationId === 'all' ? 'bg-blue-100 font-semibold' : ''
                  }`}
                >
                  <span className="text-gray-900">All Locations</span>
                  <span className="text-gray-500 text-sm ml-2">({locations.length})</span>
                </button>
                {locations.map((loc) => (
                  <button
                    key={loc.id}
                    onClick={() => {
                      setSelectedLocationId(loc.id)
                      setShowLocationPicker(false)
                    }}
                    className={`w-full px-4 py-3 text-left hover:bg-blue-50 transition ${
                      selectedLocationId === loc.id ? 'bg-blue-100 font-semibold' : ''
                    }`}
                  >
                    <span className="text-gray-900">{loc.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Payroll Group Selector */}
          <div className="flex gap-2">
            <button
              onClick={() => setPayrollGroup('A')}
              className={`flex-1 py-3 px-4 rounded-xl font-semibold transition ${
                payrollGroup === 'A'
                  ? 'bg-white text-blue-600'
                  : 'bg-white/10 text-white border border-white/20'
              }`}
            >
              Group A
            </button>
            <button
              onClick={() => setPayrollGroup('B')}
              className={`flex-1 py-3 px-4 rounded-xl font-semibold transition ${
                payrollGroup === 'B'
                  ? 'bg-white text-blue-600'
                  : 'bg-white/10 text-white border border-white/20'
              }`}
            >
              Group B
            </button>
          </div>

          {/* Pay Date */}
          <div className="bg-white/10 backdrop-blur-md rounded-xl px-4 py-3 border border-white/20">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-200" />
              <div>
                <div className="text-blue-200 text-xs">Pay Date</div>
                <div className="text-white font-semibold">{payDate}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Alert */}
      {alert && (
        <div
          className={`mx-4 mt-4 p-4 rounded-xl flex items-start gap-3 ${
            alert.type === 'success'
              ? 'bg-green-500/20 border border-green-400/40'
              : 'bg-red-500/20 border border-red-400/40'
          }`}
        >
          {alert.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-green-300 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-300 flex-shrink-0 mt-0.5" />
          )}
          <p className={`text-sm ${alert.type === 'success' ? 'text-green-100' : 'text-red-100'}`}>
            {alert.message}
          </p>
        </div>
      )}

      {/* Summary */}
      <div className="p-4">
        <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-blue-200 text-sm">Employees</div>
              <div className="text-white text-2xl font-bold">{totals.employees}</div>
            </div>
            <div>
              <div className="text-blue-200 text-sm">Total Amount</div>
              <div className="text-white text-2xl font-bold">{formatCurrency(totals.totalAmount)}</div>
            </div>
          </div>

          {/* Location Breakdown */}
          {selectedLocationId === 'all' && totals.locationBreakdown.size > 0 && (
            <div className="mt-4 pt-4 border-t border-white/20">
              <div className="text-blue-200 text-sm mb-2">By Location:</div>
              {Array.from(totals.locationBreakdown).map(([locId, data]) => {
                const location = locations.find(l => l.id === locId)
                return (
                  <div key={locId} className="flex justify-between items-center py-1">
                    <span className="text-white text-sm">{location?.name}</span>
                    <span className="text-blue-200 text-sm">
                      {data.count} employees • {formatCurrency(data.amount)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Employee List */}
      <div className="p-4 space-y-3">
        <h2 className="text-white font-semibold text-lg mb-2">
          Employees - Group {payrollGroup}
        </h2>

        {employees.length === 0 ? (
          <div className="bg-white/5 rounded-xl p-8 text-center">
            <Users className="w-12 h-12 text-white/30 mx-auto mb-2" />
            <p className="text-white/60">No employees found for this selection</p>
          </div>
        ) : (
          employees.map((emp) => {
            const location = locations.find(l => l.id === emp.location_id)
            return (
              <div
                key={emp.id}
                className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="text-white font-semibold">
                      {emp.first_name} {emp.last_name}
                    </h3>
                    {selectedLocationId === 'all' && (
                      <p className="text-blue-300 text-xs mt-1">📍 {location?.name}</p>
                    )}
                  </div>
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-semibold ${
                      emp.compensation_type === 'hourly'
                        ? 'bg-blue-500/20 text-blue-200'
                        : emp.compensation_type === 'production'
                        ? 'bg-purple-500/20 text-purple-200'
                        : 'bg-green-500/20 text-green-200'
                    }`}
                  >
                    {emp.compensation_type === 'hourly'
                      ? 'Hourly'
                      : emp.compensation_type === 'production'
                      ? 'Production'
                      : 'Fixed'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {emp.compensation_type === 'hourly' && (
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Hours"
                      value={emp.hours}
                      onChange={(e) => handleEmployeeUpdate(emp.id, 'hours', e.target.value)}
                      className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/40"
                    />
                  )}
                  {emp.compensation_type === 'production' && (
                    <input
                      type="number"
                      step="1"
                      placeholder="Units"
                      value={emp.units}
                      onChange={(e) => handleEmployeeUpdate(emp.id, 'units', e.target.value)}
                      className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/40"
                    />
                  )}
                  {emp.compensation_type === 'fixed' && (
                    <>
                      <input
                        type="number"
                        step="1"
                        placeholder="Count"
                        value={emp.count}
                        onChange={(e) => handleEmployeeUpdate(emp.id, 'count', e.target.value)}
                        className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/40"
                      />
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Adjustment"
                        value={emp.adjustment}
                        onChange={(e) => handleEmployeeUpdate(emp.id, 'adjustment', e.target.value)}
                        className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/40"
                      />
                    </>
                  )}
                  <div className="col-span-2 text-right">
                    <span className="text-white font-bold text-lg">
                      {formatCurrency(emp.amount)}
                    </span>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Submit Button */}
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-slate-900 via-slate-900/95 to-transparent p-4 border-t border-white/10">
        <button
          onClick={handleSubmit}
          disabled={isSubmitting || totals.employees === 0}
          className="w-full bg-gradient-to-r from-green-500 to-green-600 disabled:from-gray-600 disabled:to-gray-700 text-white font-semibold py-4 rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin" />
              Submitting...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              Submit Payroll for {totals.locationBreakdown.size} Location(s)
            </span>
          )}
        </button>
      </div>
    </div>
  )
}
