'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getAuthClient } from '@/lib/supabase/auth-client'
import { getDataClient, syncDataClientSession } from '@/lib/supabase/client'
import { LogOut, DollarSign, Clock, Users, CheckCircle2, AlertCircle, X, Calendar, MapPin, ChevronDown, RefreshCw, Hash } from 'lucide-react'

// Types
type PayrollGroup = 'A' | 'B'
type CompensationType = 'hourly' | 'production' | 'fixed'

type Employee = {
  id: string
  first_name: string
  last_name: string
  email: string | null
  payroll_group: PayrollGroup
  compensation_type: CompensationType
  hourly_rate: number | null
  piece_rate: number | null
  fixed_pay: number | null
}

type EmployeeRow = Employee & {
  hours: string
  units: string
  adjustment: string  // NEW: For deductions/bonuses on fixed-pay employees
  notes: string
  amount: number
}

type Location = {
  id: string
  name: string
}

type Alert = {
  type: 'success' | 'error'
  message: string
}

// Date helper functions
function parseLocalDate(dateStr: string): Date | null {
  const parts = dateStr.split('-').map(Number)
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) return null
  const [year, month, day] = parts
  return new Date(year, month - 1, day)
}

function formatInputDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatCurrency(
  value: number | string | null | undefined,
  fractionDigits = 2,
): string {
  const numericValue =
    typeof value === 'string'
      ? Number.parseFloat(value)
      : typeof value === 'number'
      ? value
      : 0

  const safeValue = Number.isFinite(numericValue) ? numericValue : 0

  return safeValue.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })
}

function calculatePayrollInfo(payDateStr: string): {
  payrollGroup: PayrollGroup
  periodStart: string
  periodEnd: string
} {
  const payDate = parseLocalDate(payDateStr)
  if (!payDate) {
    return { payrollGroup: 'A', periodStart: payDateStr, periodEnd: payDateStr }
  }
  
  const periodEnd = new Date(payDate)
  periodEnd.setDate(payDate.getDate() - 9)
  
  const periodStart = new Date(periodEnd)
  periodStart.setDate(periodEnd.getDate() - 13)
  
  const referenceDate = new Date(2025, 0, 3)
  const daysDifference = Math.floor((payDate.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24))
  const weeksDifference = Math.floor(daysDifference / 7)
  const payrollGroup: PayrollGroup = weeksDifference % 2 === 0 ? 'B' : 'A'
  
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
  if (!start || !end) return `${startDate} - ${endDate}`

  const startMonth = start.toLocaleDateString('en-US', { month: 'short' })
  const startDay = start.getDate()
  const endMonth = end.toLocaleDateString('en-US', { month: 'short' })
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

export default function MobilePayrollSubmit() {
  const router = useRouter()
  const authClient = useMemo(() => getAuthClient(), [])
  const dataSupabase = useMemo(() => getDataClient(), [])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [userName, setUserName] = useState<string>('')
  const [availableLocations, setAvailableLocations] = useState<Location[]>([])
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null)
  const [showLocationPicker, setShowLocationPicker] = useState(false)
  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeRow | null>(null)
  const [payDate, setPayDate] = useState<string>('')
  const [payrollGroup, setPayrollGroup] = useState<PayrollGroup>('A')
  const [periodStart, setPeriodStart] = useState<string>('')
  const [periodEnd, setPeriodEnd] = useState<string>('')
  const [alert, setAlert] = useState<Alert | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSyncingConnecteam, setIsSyncingConnecteam] = useState(false)
  const [showAddEmployee, setShowAddEmployee] = useState(false)
  const [showEditEmployee, setShowEditEmployee] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)
  const [swipedEmployeeId, setSwipedEmployeeId] = useState<string | null>(null)
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null)
  const [touchOffset, setTouchOffset] = useState(0)
  const [newEmployee, setNewEmployee] = useState({
    first_name: '',
    last_name: '',
    email: '',
    payroll_group: 'A' as PayrollGroup,
    compensation_type: 'hourly' as CompensationType,
    hourly_rate: '',
    piece_rate: '',
    fixed_pay: '',
  })

  const fridayOptions = useMemo(() => generateFridayOptions(), [])

  // Initialize pay date
  useEffect(() => {
    if (fridayOptions.length === 0) return
    const nextFriday = getNextFriday()
    const defaultDate = fridayOptions.find((option) => option.value === nextFriday)?.value ?? fridayOptions[fridayOptions.length - 1]?.value ?? nextFriday
    setPayDate(defaultDate)
    const info = calculatePayrollInfo(defaultDate)
    setPayrollGroup(info.payrollGroup)
    setPeriodStart(info.periodStart)
    setPeriodEnd(info.periodEnd)
  }, [fridayOptions])

  // Auth check
  useEffect(() => {
    async function checkSession() {
      try {
        const { data: { session }, error } = await authClient.auth.getSession()
        
        // Only redirect if there's truly no session
        if (!session) {
          console.log('No session found, redirecting to login')
          router.push('/login')
          return
        }

        setUserId(session.user.id)
        setUserName(session.user.email || 'User')

        // FIX 1: Use location_managers table (not user_locations)
        const { data: locationManagers, error: locError } = await dataSupabase
          .from('location_managers')
          .select('location_id, locations(id, name)')
          .eq('user_id', session.user.id)

        if (locError) {
          console.error('Error loading locations:', locError)
          // Don't throw - just log and continue
        }

        const locations = locationManagers
          ?.map((lm: any) => lm.locations)
          .filter(Boolean) as Location[]

        console.log('Loaded locations for user:', locations)
        setAvailableLocations(locations || [])

        if (locations && locations.length === 1) {
          setSelectedLocationId(locations[0].id)
          await loadEmployees(locations[0].id)
        } else if (locations && locations.length > 1) {
          setShowLocationPicker(true)
        } else {
          console.warn('No locations found for user')
          setShowLocationPicker(true)
        }
      } catch (error) {
        console.error('Auth error:', error)
        // FIX 2: Don't redirect on error - just finish loading
      } finally {
        setLoading(false)
      }
    }

    checkSession()
  }, [authClient, dataSupabase, router])

  async function loadEmployees(locationId: string) {
    try {
      const { data, error } = await dataSupabase
        .from('employees')
        .select('*')
        .eq('location_id', locationId)
        .eq('is_active', true)
        .order('first_name')

      if (error) throw error

      const employeeRows: EmployeeRow[] = (data || []).map((emp: Employee) => ({
        ...emp,
        hours: '',
        units: '',
        adjustment: '0',
        notes: '',
        amount: emp.compensation_type === 'fixed' ? emp.fixed_pay || 0 : 0,
      }))

      setEmployees(employeeRows)
    } catch (error) {
      console.error('Error loading employees:', error)
      showAlert('error', 'Failed to load employees')
    }
  }

  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => emp.payroll_group === payrollGroup)
  }, [employees, payrollGroup])

  function hasPayrollData(emp: EmployeeRow): boolean {
    if (emp.compensation_type === 'hourly') return Number.parseFloat(emp.hours || '0') > 0
    if (emp.compensation_type === 'production') return Number.parseFloat(emp.units || '0') > 0
    if (emp.compensation_type === 'fixed') {
      const adjustmentValue = Number.parseFloat(emp.adjustment || '0') || 0
      const basePay = emp.fixed_pay || 0
      return emp.amount !== 0 || adjustmentValue !== 0 || basePay > 0
    }
    return false
  }

  const totals = useMemo(() => {
    const employeesWithData = filteredEmployees.filter(hasPayrollData)

    const totalHours = filteredEmployees
      .filter(emp => emp.compensation_type === 'hourly')
      .reduce((sum, emp) => sum + parseFloat(emp.hours || '0'), 0)

    const totalAmount = filteredEmployees.reduce((sum, emp) => sum + emp.amount, 0)

    return {
      employees: employeesWithData.length,
      totalHours,
      totalAmount,
    }
  }, [filteredEmployees])

  const selectedEmployeeAdjustment =
    selectedEmployee ? Number.parseFloat(selectedEmployee.adjustment || '0') || 0 : 0

  function showAlert(type: 'success' | 'error', message: string) {
    setAlert({ type, message })
    setTimeout(() => setAlert(null), 4000)
  }

  function handlePayDateChange(newDate: string) {
    setPayDate(newDate)
    const info = calculatePayrollInfo(newDate)
    setPayrollGroup(info.payrollGroup)
    setPeriodStart(info.periodStart)
    setPeriodEnd(info.periodEnd)
  }

  function handleEmployeeSelect(emp: EmployeeRow) {
    setSelectedEmployee({ ...emp })
  }

  function handleInputChange(field: 'hours' | 'units' | 'adjustment' | 'notes', value: string) {
    if (!selectedEmployee) return

    const updated = { ...selectedEmployee, [field]: value }

    // Calculate amount based on compensation type
    if (selectedEmployee.compensation_type === 'hourly') {
      const hours = parseFloat(field === 'hours' ? value : updated.hours) || 0
      updated.amount = hours * (selectedEmployee.hourly_rate || 0)
    } else if (selectedEmployee.compensation_type === 'production') {
      const units = parseFloat(field === 'units' ? value : updated.units) || 0
      updated.amount = units * (selectedEmployee.piece_rate || 0)
    } else if (selectedEmployee.compensation_type === 'fixed') {
      const adjustment = parseFloat(field === 'adjustment' ? value : updated.adjustment) || 0
      const baseAmount = selectedEmployee.fixed_pay || 0
      updated.amount = baseAmount + adjustment
    }

    setSelectedEmployee(updated)
  }

  function handleSaveEmployee() {
    if (!selectedEmployee) return

    // Validate input based on compensation type
    if (selectedEmployee.compensation_type === 'hourly' && parseFloat(selectedEmployee.hours || '0') <= 0) {
      showAlert('error', 'Please enter hours worked')
      return
    }
    if (selectedEmployee.compensation_type === 'production' && parseFloat(selectedEmployee.units || '0') <= 0) {
      showAlert('error', 'Please enter units produced')
      return
    }
    const updatedEmployees = employees.map(emp =>
      emp.id === selectedEmployee.id ? selectedEmployee : emp
    )
    setEmployees(updatedEmployees)
    setSelectedEmployee(null)
    
    showAlert('success', `✓ ${selectedEmployee.first_name} ${selectedEmployee.last_name} updated!`)
  }

  async function handleSyncConnecteam() {
    if (!selectedLocationId) return

    setIsSyncingConnecteam(true)
    try {
      const response = await fetch('/api/connecteam/sync-hours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location_id: selectedLocationId,
          period_start: periodStart,
          period_end: periodEnd,
        }),
      })

      if (!response.ok) throw new Error('Failed to sync from Connecteam')

      const result = await response.json()
      
      if (result.synced_hours) {
        const updatedEmployees = employees.map(emp => {
          const syncedHours = result.synced_hours.find((sh: any) => 
            sh.email?.toLowerCase() === emp.email?.toLowerCase()
          )
          if (syncedHours && emp.compensation_type === 'hourly') {
            const hours = syncedHours.total_hours.toString()
            return {
              ...emp,
              hours,
              amount: parseFloat(hours) * (emp.hourly_rate || 0)
            }
          }
          return emp
        })
        
        setEmployees(updatedEmployees)
        showAlert('success', `✓ Synced hours for ${result.synced_count} employees from Connecteam!`)
      }
    } catch (error: any) {
      console.error('Connecteam sync error:', error)
      showAlert('error', error.message || 'Failed to sync from Connecteam')
    } finally {
      setIsSyncingConnecteam(false)
    }
  }

  async function handleSubmit() {
    if (!selectedLocationId || !userId) {
      showAlert('error', 'Missing required data')
      return
    }

    const employeesToSubmit = filteredEmployees.filter(hasPayrollData)

    if (employeesToSubmit.length === 0) {
      showAlert('error', 'Please enter payroll data for at least one employee')
      return
    }

    setIsSubmitting(true)
    try {
      const totalAmount = employeesToSubmit.reduce((sum, emp) => sum + emp.amount, 0)

      const { data: submission, error: submissionError } = await dataSupabase
        .from('payroll_submissions')
        .insert({
          location_id: selectedLocationId,
          pay_date: payDate,
          payroll_group: payrollGroup,
          period_start: periodStart,
          period_end: periodEnd,
          total_amount: totalAmount,
          employee_count: employeesToSubmit.length,
          submitted_by: userId,
          status: 'pending',
        })
        .select()
        .single()

      if (submissionError) throw submissionError

      const details = employeesToSubmit.map(emp => ({
        submission_id: submission.id,
        employee_id: emp.id,
        hours: emp.compensation_type === 'hourly' ? parseFloat(emp.hours) : null,
        units: emp.compensation_type === 'production' ? parseFloat(emp.units) : null,
        count: emp.compensation_type === 'fixed' ? 1 : null,
        adjustment: emp.compensation_type === 'fixed' ? parseFloat(emp.adjustment) : null,
        amount: emp.amount,
        notes: emp.notes || null,
      }))

      const { error: detailsError } = await dataSupabase
        .from('payroll_submission_details')
        .insert(details)

      if (detailsError) throw detailsError

      showAlert('success', '✓ Payroll submitted successfully!')
      
      await loadEmployees(selectedLocationId)
      
    } catch (error: any) {
      console.error('Submit error:', error)
      showAlert('error', error.message || 'Failed to submit payroll')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleSignOut() {
    await authClient.auth.signOut()
    await syncDataClientSession(null)
    router.push('/login')
  }

  async function handleAddEmployee() {
    if (!selectedLocationId) {
      showAlert('error', 'Please select a location first')
      return
    }

    if (!newEmployee.first_name || !newEmployee.last_name) {
      showAlert('error', 'Please fill in all required fields')
      return
    }

    if (newEmployee.compensation_type === 'hourly' && !newEmployee.hourly_rate) {
      showAlert('error', 'Please enter hourly rate')
      return
    }

    if (newEmployee.compensation_type === 'production' && !newEmployee.piece_rate) {
      showAlert('error', 'Please enter piece rate')
      return
    }

    if (newEmployee.compensation_type === 'fixed' && !newEmployee.fixed_pay) {
      showAlert('error', 'Please enter fixed pay amount')
      return
    }

    try {
      const { data, error } = await dataSupabase
        .from('employees')
        .insert([
          {
            organization_id: 'ba5ac7ab-ff03-42c8-9e63-3a5a444449ca',
            location_id: selectedLocationId,
            first_name: newEmployee.first_name,
            last_name: newEmployee.last_name,
            email: newEmployee.email || null,
            payroll_group: newEmployee.payroll_group,
            compensation_type: newEmployee.compensation_type,
            hourly_rate: newEmployee.compensation_type === 'hourly' ? parseFloat(newEmployee.hourly_rate) : null,
            piece_rate: newEmployee.compensation_type === 'production' ? parseFloat(newEmployee.piece_rate) : null,
            fixed_pay: newEmployee.compensation_type === 'fixed' ? parseFloat(newEmployee.fixed_pay) : null,
            is_active: true,
            hire_date: new Date().toISOString().split('T')[0],
          },
        ])
        .select()

      if (error) throw error

      showAlert('success', `✓ Employee ${newEmployee.first_name} ${newEmployee.last_name} added!`)
      
      setNewEmployee({
        first_name: '',
        last_name: '',
        email: '',
        payroll_group: 'A',
        compensation_type: 'hourly',
        hourly_rate: '',
        piece_rate: '',
        fixed_pay: '',
      })
      
      setShowAddEmployee(false)
      
      if (selectedLocationId) {
        await loadEmployees(selectedLocationId)
      }
    } catch (error: any) {
      console.error('Error adding employee:', error)
      showAlert('error', error.message || 'Failed to add employee')
    }
  }

  async function handleEditEmployee() {
    if (!editingEmployee) return

    try {
      const { error } = await dataSupabase
        .from('employees')
        .update({
          first_name: editingEmployee.first_name,
          last_name: editingEmployee.last_name,
          email: editingEmployee.email,
          payroll_group: editingEmployee.payroll_group,
          compensation_type: editingEmployee.compensation_type,
          hourly_rate: editingEmployee.compensation_type === 'hourly' ? editingEmployee.hourly_rate : null,
          piece_rate: editingEmployee.compensation_type === 'production' ? editingEmployee.piece_rate : null,
          fixed_pay: editingEmployee.compensation_type === 'fixed' ? editingEmployee.fixed_pay : null,
        })
        .eq('id', editingEmployee.id)

      if (error) throw error

      showAlert('success', '✓ Employee updated!')
      setShowEditEmployee(false)
      setEditingEmployee(null)
      
      if (selectedLocationId) {
        await loadEmployees(selectedLocationId)
      }
    } catch (error: any) {
      console.error('Error updating employee:', error)
      showAlert('error', error.message || 'Failed to update employee')
    }
  }

  async function handleArchiveEmployee(employeeId: string) {
    try {
      const { error } = await dataSupabase
        .from('employees')
        .update({ is_active: false })
        .eq('id', employeeId)

      if (error) throw error

      showAlert('success', '✓ Employee archived!')
      setSwipedEmployeeId(null)
      
      if (selectedLocationId) {
        await loadEmployees(selectedLocationId)
      }
    } catch (error: any) {
      console.error('Error archiving employee:', error)
      showAlert('error', error.message || 'Failed to archive employee')
    }
  }

  function handleTouchStart(e: React.TouchEvent, empId: string) {
    setTouchStart({
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    })
    setSwipedEmployeeId(empId)
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!touchStart) return

    const currentX = e.touches[0].clientX
    const currentY = e.touches[0].clientY
    const deltaX = currentX - touchStart.x
    const deltaY = currentY - touchStart.y

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      e.preventDefault()
      const offset = Math.max(-150, Math.min(0, deltaX))
      setTouchOffset(offset)
    }
  }

  function handleTouchEnd() {
    if (touchOffset < -75) {
      setTouchOffset(-150)
    } else {
      setTouchOffset(0)
      setSwipedEmployeeId(null)
    }
    setTouchStart(null)
  }

  const selectedLocationName = useMemo(() => {
    const location = availableLocations.find(loc => loc.id === selectedLocationId)
    return location?.name || 'Select Location'
  }, [availableLocations, selectedLocationId])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400"></div>
          <p className="mt-4 text-blue-100">Loading...</p>
        </div>
      </div>
    )
  }

  if (showLocationPicker && availableLocations.length > 1) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4 flex items-center justify-center">
        <div className="w-full max-w-md">
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20">
            <div className="text-center mb-6">
              <MapPin className="w-12 h-12 text-blue-300 mx-auto mb-4" />
              <h2 className="text-white text-2xl font-bold mb-2">Select Location</h2>
              <p className="text-blue-200 text-sm">Choose which location to submit payroll for</p>
            </div>

            <div className="space-y-3">
              {availableLocations.map((location) => (
                <button
                  key={location.id}
                  onClick={async () => {
                    setSelectedLocationId(location.id)
                    setShowLocationPicker(false)
                    await loadEmployees(location.id)
                  }}
                  className="w-full bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl p-4 text-white font-medium transition text-left"
                >
                  {location.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (showEditEmployee && editingEmployee) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4">
        <div className="max-w-lg mx-auto pt-6">
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => {
                setShowEditEmployee(false)
                setEditingEmployee(null)
              }}
              className="text-blue-100 text-sm font-medium"
            >
              ← Back
            </button>
            <h2 className="text-white text-lg font-semibold">Edit Employee</h2>
            <div className="w-12" />
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 mb-6 border border-white/20 space-y-4">
            <div>
              <label className="text-blue-200 text-sm font-medium mb-2 block">First Name</label>
              <input
                type="text"
                value={editingEmployee.first_name}
                onChange={(e) => setEditingEmployee({ ...editingEmployee, first_name: e.target.value })}
                className="w-full px-4 py-3 bg-white/5 border-2 border-white/20 rounded-xl text-white focus:outline-none focus:border-blue-400 focus:bg-white/10 transition"
              />
            </div>

            <div>
              <label className="text-blue-200 text-sm font-medium mb-2 block">Last Name</label>
              <input
                type="text"
                value={editingEmployee.last_name}
                onChange={(e) => setEditingEmployee({ ...editingEmployee, last_name: e.target.value })}
                className="w-full px-4 py-3 bg-white/5 border-2 border-white/20 rounded-xl text-white focus:outline-none focus:border-blue-400 focus:bg-white/10 transition"
              />
            </div>

            <div>
              <label className="text-blue-200 text-sm font-medium mb-2 block">Email</label>
              <input
                type="email"
                value={editingEmployee.email || ''}
                onChange={(e) => setEditingEmployee({ ...editingEmployee, email: e.target.value })}
                className="w-full px-4 py-3 bg-white/5 border-2 border-white/20 rounded-xl text-white focus:outline-none focus:border-blue-400 focus:bg-white/10 transition"
                placeholder="employee@example.com"
              />
            </div>

            <div>
              <label className="text-blue-200 text-sm font-medium mb-2 block">Payroll Group</label>
              <select
                value={editingEmployee.payroll_group}
                onChange={(e) => setEditingEmployee({ ...editingEmployee, payroll_group: e.target.value as PayrollGroup })}
                className="w-full px-4 py-3 bg-white/5 border-2 border-white/20 rounded-xl text-white focus:outline-none focus:border-blue-400 focus:bg-white/10 transition"
              >
                <option value="A" className="bg-slate-900">Group A</option>
                <option value="B" className="bg-slate-900">Group B</option>
              </select>
            </div>

            <div>
              <label className="text-blue-200 text-sm font-medium mb-2 block">Compensation Type</label>
              <select
                value={editingEmployee.compensation_type}
                onChange={(e) => setEditingEmployee({ ...editingEmployee, compensation_type: e.target.value as CompensationType })}
                className="w-full px-4 py-3 bg-white/5 border-2 border-white/20 rounded-xl text-white focus:outline-none focus:border-blue-400 focus:bg-white/10 transition"
              >
                <option value="hourly" className="bg-slate-900">Hourly</option>
                <option value="production" className="bg-slate-900">Production</option>
                <option value="fixed" className="bg-slate-900">Fixed Pay</option>
              </select>
            </div>

            {editingEmployee.compensation_type === 'hourly' ? (
              <div>
                <label className="text-blue-200 text-sm font-medium mb-2 block">Hourly Rate ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={editingEmployee.hourly_rate || ''}
                  onChange={(e) => setEditingEmployee({ ...editingEmployee, hourly_rate: parseFloat(e.target.value) || null })}
                  className="w-full px-4 py-3 bg-white/5 border-2 border-white/20 rounded-xl text-white focus:outline-none focus:border-blue-400 focus:bg-white/10 transition"
                />
              </div>
            ) : editingEmployee.compensation_type === 'production' ? (
              <div>
                <label className="text-blue-200 text-sm font-medium mb-2 block">Piece Rate ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={editingEmployee.piece_rate || ''}
                  onChange={(e) => setEditingEmployee({ ...editingEmployee, piece_rate: parseFloat(e.target.value) || null })}
                  className="w-full px-4 py-3 bg-white/5 border-2 border-white/20 rounded-xl text-white focus:outline-none focus:border-blue-400 focus:bg-white/10 transition"
                />
              </div>
            ) : (
              <div>
                <label className="text-blue-200 text-sm font-medium mb-2 block">Fixed Pay Amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={editingEmployee.fixed_pay || ''}
                  onChange={(e) => setEditingEmployee({ ...editingEmployee, fixed_pay: parseFloat(e.target.value) || null })}
                  className="w-full px-4 py-3 bg-white/5 border-2 border-white/20 rounded-xl text-white focus:outline-none focus:border-blue-400 focus:bg-white/10 transition"
                />
              </div>
            )}
          </div>

          <button
            onClick={handleEditEmployee}
            className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold py-4 rounded-xl shadow-lg hover:shadow-xl transition-all"
          >
            Save Changes
          </button>
        </div>
      </div>
    )
  }

  if (showAddEmployee) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4">
        <div className="max-w-lg mx-auto pt-6">
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => setShowAddEmployee(false)}
              className="text-blue-100 text-sm font-medium"
            >
              ← Back
            </button>
            <h2 className="text-white text-lg font-semibold">Add Employee</h2>
            <div className="w-12" />
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 mb-6 border border-white/20 space-y-4">
            <div>
              <label className="text-blue-200 text-sm font-medium mb-2 block">First Name *</label>
              <input
                type="text"
                value={newEmployee.first_name}
                onChange={(e) => setNewEmployee({ ...newEmployee, first_name: e.target.value })}
                className="w-full px-4 py-3 bg-white/5 border-2 border-white/20 rounded-xl text-white placeholder-blue-300/50 focus:outline-none focus:border-blue-400 focus:bg-white/10 transition"
                placeholder="John"
              />
            </div>

            <div>
              <label className="text-blue-200 text-sm font-medium mb-2 block">Last Name *</label>
              <input
                type="text"
                value={newEmployee.last_name}
                onChange={(e) => setNewEmployee({ ...newEmployee, last_name: e.target.value })}
                className="w-full px-4 py-3 bg-white/5 border-2 border-white/20 rounded-xl text-white placeholder-blue-300/50 focus:outline-none focus:border-blue-400 focus:bg-white/10 transition"
                placeholder="Doe"
              />
            </div>

            <div>
              <label className="text-blue-200 text-sm font-medium mb-2 block">Email (for Connecteam sync)</label>
              <input
                type="email"
                value={newEmployee.email}
                onChange={(e) => setNewEmployee({ ...newEmployee, email: e.target.value })}
                className="w-full px-4 py-3 bg-white/5 border-2 border-white/20 rounded-xl text-white placeholder-blue-300/50 focus:outline-none focus:border-blue-400 focus:bg-white/10 transition"
                placeholder="john.doe@example.com"
              />
            </div>

            <div>
              <label className="text-blue-200 text-sm font-medium mb-2 block">Payroll Group *</label>
              <select
                value={newEmployee.payroll_group}
                onChange={(e) => setNewEmployee({ ...newEmployee, payroll_group: e.target.value as PayrollGroup })}
                className="w-full px-4 py-3 bg-white/5 border-2 border-white/20 rounded-xl text-white focus:outline-none focus:border-blue-400 focus:bg-white/10 transition"
              >
                <option value="A" className="bg-slate-900">Group A</option>
                <option value="B" className="bg-slate-900">Group B</option>
              </select>
            </div>

            <div>
              <label className="text-blue-200 text-sm font-medium mb-2 block">Compensation Type *</label>
              <select
                value={newEmployee.compensation_type}
                onChange={(e) => setNewEmployee({ ...newEmployee, compensation_type: e.target.value as CompensationType })}
                className="w-full px-4 py-3 bg-white/5 border-2 border-white/20 rounded-xl text-white focus:outline-none focus:border-blue-400 focus:bg-white/10 transition"
              >
                <option value="hourly" className="bg-slate-900">Hourly</option>
                <option value="production" className="bg-slate-900">Production</option>
                <option value="fixed" className="bg-slate-900">Fixed Pay</option>
              </select>
            </div>

            {newEmployee.compensation_type === 'hourly' ? (
              <div>
                <label className="text-blue-200 text-sm font-medium mb-2 block">Hourly Rate * ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={newEmployee.hourly_rate}
                  onChange={(e) => setNewEmployee({ ...newEmployee, hourly_rate: e.target.value })}
                  className="w-full px-4 py-3 bg-white/5 border-2 border-white/20 rounded-xl text-white placeholder-blue-300/50 focus:outline-none focus:border-blue-400 focus:bg-white/10 transition"
                  placeholder="25.00"
                />
              </div>
            ) : newEmployee.compensation_type === 'production' ? (
              <div>
                <label className="text-blue-200 text-sm font-medium mb-2 block">Piece Rate * ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={newEmployee.piece_rate}
                  onChange={(e) => setNewEmployee({ ...newEmployee, piece_rate: e.target.value })}
                  className="w-full px-4 py-3 bg-white/5 border-2 border-white/20 rounded-xl text-white placeholder-blue-300/50 focus:outline-none focus:border-blue-400 focus:bg-white/10 transition"
                  placeholder="5.00"
                />
              </div>
            ) : (
              <div>
                <label className="text-blue-200 text-sm font-medium mb-2 block">Fixed Pay Amount * ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={newEmployee.fixed_pay}
                  onChange={(e) => setNewEmployee({ ...newEmployee, fixed_pay: e.target.value })}
                  className="w-full px-4 py-3 bg-white/5 border-2 border-white/20 rounded-xl text-white placeholder-blue-300/50 focus:outline-none focus:border-blue-400 focus:bg-white/10 transition"
                  placeholder="750.00"
                />
              </div>
            )}
          </div>

          <button
            onClick={handleAddEmployee}
            className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold py-4 rounded-xl shadow-lg hover:shadow-xl transition-all"
          >
            Add Employee
          </button>
        </div>
      </div>
    )
  }

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
            <h2 className="text-white text-lg font-semibold">Enter Payroll</h2>
            <div className="w-12" />
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 mb-6 border border-white/20">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-white text-xl font-bold">
                  {selectedEmployee.first_name} {selectedEmployee.last_name}
                </h3>
                {selectedEmployee.email && (
                  <p className="text-blue-300 text-sm mt-1">{selectedEmployee.email}</p>
                )}
              </div>
              <span
                className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  selectedEmployee.compensation_type === 'hourly'
                    ? 'bg-blue-500/20 text-blue-200'
                    : selectedEmployee.compensation_type === 'production'
                    ? 'bg-purple-500/20 text-purple-200'
                    : 'bg-green-500/20 text-green-200'
                }`}
              >
                {selectedEmployee.compensation_type === 'hourly' ? 'Hourly' : selectedEmployee.compensation_type === 'production' ? 'Production' : 'Fixed Pay'}
              </span>
            </div>

            <div className="bg-white/5 rounded-xl p-4">
              <p className="text-blue-200 text-sm mb-1">
                {selectedEmployee.compensation_type === 'fixed' ? 'Fixed Amount' : 'Rate'}
              </p>
              <p className="text-white text-2xl font-bold">
                {formatCurrency(
                  selectedEmployee.compensation_type === 'fixed'
                    ? selectedEmployee.fixed_pay
                    : selectedEmployee.compensation_type === 'hourly'
                    ? selectedEmployee.hourly_rate
                    : selectedEmployee.piece_rate,
                )}
                {selectedEmployee.compensation_type !== 'fixed' && (
                  <span className="text-blue-200 text-sm font-normal ml-2">
                    {selectedEmployee.compensation_type === 'hourly' ? '/ hour' : '/ unit'}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 mb-6 border border-white/20">
            {selectedEmployee.compensation_type === 'hourly' && (
              <>
                <label className="block mb-4">
                  <span className="text-blue-200 text-sm font-medium mb-2 block flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Hours Worked
                  </span>
                  <input
                    type="number"
                    step="0.25"
                    value={selectedEmployee.hours}
                    onChange={(e) => handleInputChange('hours', e.target.value)}
                    className="w-full px-4 py-4 text-2xl font-bold bg-white/5 border-2 border-white/20 rounded-xl text-white placeholder-blue-300/50 focus:outline-none focus:border-blue-400 focus:bg-white/10 transition"
                    placeholder="0"
                    autoFocus
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
              </>
            )}

            {selectedEmployee.compensation_type === 'production' && (
              <>
                <label className="block mb-4">
                  <span className="text-blue-200 text-sm font-medium mb-2 block flex items-center gap-2">
                    <Hash className="w-4 h-4" />
                    Units Produced
                  </span>
                  <input
                    type="number"
                    step="1"
                    value={selectedEmployee.units}
                    onChange={(e) => handleInputChange('units', e.target.value)}
                    className="w-full px-4 py-4 text-2xl font-bold bg-white/5 border-2 border-white/20 rounded-xl text-white placeholder-blue-300/50 focus:outline-none focus:border-blue-400 focus:bg-white/10 transition"
                    placeholder="0"
                    autoFocus
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
              </>
            )}

            {selectedEmployee.compensation_type === 'fixed' && (
              <>
                <div className="text-center mb-6">
                  <div className="bg-gradient-to-br from-green-500/10 to-blue-500/10 rounded-xl p-6 border border-green-400/20">
                    <p className="text-green-200 text-sm mb-2">Base Fixed Pay</p>
                    <p className="text-white text-4xl font-bold mb-1">
                      {formatCurrency(selectedEmployee.fixed_pay)}
                    </p>
                    <p className="text-blue-300 text-xs">per pay period</p>
                  </div>
                </div>

                <p className="text-blue-200 text-sm mb-4 text-center">
                  Fixed pay is automatically limited to one pay period. Use adjustments for any bonuses or deductions.
                </p>

                <label className="block mb-4">
                  <span className="text-blue-200 text-sm font-medium mb-2 block flex items-center gap-2">
                    <DollarSign className="w-4 h-4" />
                    Adjustment (+ bonus / - deduction)
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    value={selectedEmployee.adjustment}
                    onChange={(e) => handleInputChange('adjustment', e.target.value)}
                    className="w-full px-4 py-4 text-2xl font-bold bg-white/5 border-2 border-white/20 rounded-xl text-white placeholder-blue-300/50 focus:outline-none focus:border-blue-400 focus:bg-white/10 transition"
                    placeholder="0.00"
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleInputChange('adjustment', '-100')}
                      className="flex-1 px-3 py-2 bg-red-500/20 border border-red-400/30 rounded-lg text-red-200 text-sm hover:bg-red-500/30 transition"
                    >
                      -$100 (Missed Day)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInputChange('adjustment', '-200')}
                      className="flex-1 px-3 py-2 bg-red-500/20 border border-red-400/30 rounded-lg text-red-200 text-sm hover:bg-red-500/30 transition"
                    >
                      -$200 (2 Days)
                    </button>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleInputChange('adjustment', '100')}
                      className="flex-1 px-3 py-2 bg-green-500/20 border border-green-400/30 rounded-lg text-green-200 text-sm hover:bg-green-500/30 transition"
                    >
                      +$100 (Bonus)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInputChange('adjustment', '0')}
                      className="flex-1 px-3 py-2 bg-blue-500/20 border border-blue-400/30 rounded-lg text-blue-200 text-sm hover:bg-blue-500/30 transition"
                    >
                      Clear
                    </button>
                  </div>
                </label>

                <label className="block mb-6">
                  <span className="text-blue-200 text-sm font-medium mb-2 block">Notes (optional)</span>
                  <textarea
                    value={selectedEmployee.notes}
                    onChange={(e) => handleInputChange('notes', e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 bg-white/5 border-2 border-white/20 rounded-xl text-white placeholder-blue-300/50 focus:outline-none focus:border-blue-400 focus:bg-white/10 transition resize-none"
                    placeholder="e.g., Missed Monday due to illness"
                  />
                </label>
              </>
            )}

            <div className="bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-xl p-4">
              <p className="text-blue-200 text-sm mb-1">Total Amount</p>
              <p className="text-white text-3xl font-bold">
                {formatCurrency(selectedEmployee.amount)}
              </p>
              {selectedEmployee.compensation_type === 'fixed' && (
                <div className="text-blue-300 text-xs mt-2 space-y-1">
                  <div className="flex justify-between">
                    <span>Base:</span>
                    <span>{formatCurrency(selectedEmployee.fixed_pay)}</span>
                  </div>
                  {parseFloat(selectedEmployee.adjustment || '0') !== 0 && (
                    <div className="flex justify-between">
                      <span>Adjustment:</span>
                      <span className={parseFloat(selectedEmployee.adjustment) > 0 ? 'text-green-300' : 'text-red-300'}>
                        {`${selectedEmployeeAdjustment > 0 ? '+' : ''}${formatCurrency(
                          selectedEmployeeAdjustment,
                        )}`}
                      </span>
                    </div>
                  )}
                </div>
              )}
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <div className="bg-white/10 backdrop-blur-md border-b border-white/20 sticky top-0 z-50">
        <div className="max-w-lg mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h1 className="text-white text-xl font-bold">Payroll Submit</h1>
              {availableLocations.length > 1 ? (
                <button
                  onClick={() => {
                    setShowLocationPicker(true)
                    setSelectedLocationId(null)
                    setEmployees([])
                  }}
                  className="flex items-center gap-2 text-blue-200 text-sm hover:text-blue-100 transition"
                >
                  <MapPin className="w-4 h-4" />
                  <span>{selectedLocationName}</span>
                  <ChevronDown className="w-4 h-4" />
                </button>
              ) : (
                <p className="text-blue-200 text-sm">{selectedLocationName}</p>
              )}
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
            <button
              onClick={() => setAlert(null)}
              className="text-white/50 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {selectedLocationId && (
          <>
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 mb-6 border border-white/20">
              <div className="space-y-4 mb-6">
                <div className="flex items-center gap-2 mb-2">
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
                  <p className="text-white text-lg font-bold">{formatCurrency(totals.totalAmount, 0)}</p>
                  <p className="text-blue-200 text-xs">Total</p>
                </div>
              </div>
            </div>

            {filteredEmployees.length > 0 && (
              <button
                onClick={handleSyncConnecteam}
                disabled={isSyncingConnecteam}
                className="w-full mb-3 bg-gradient-to-r from-purple-500 to-purple-600 disabled:from-gray-600 disabled:to-gray-700 text-white font-semibold py-3 px-4 rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSyncingConnecteam ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    Syncing from Connecteam...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-5 h-5" />
                    Sync Hours from Connecteam
                  </>
                )}
              </button>
            )}

            <div className="space-y-3">
              {filteredEmployees.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="w-12 h-12 text-blue-300/50 mx-auto mb-4" />
                  <p className="text-blue-200">No employees in Group {payrollGroup}</p>
                </div>
              ) : (
                filteredEmployees.map((emp) => {
                  const isSwiped = swipedEmployeeId === emp.id
                  const offset = isSwiped ? touchOffset : 0
                  
                  return (
                    <div key={emp.id} className="relative overflow-hidden rounded-xl">
                      <div className="absolute inset-y-0 right-0 flex">
                        <button
                          onClick={() => {
                            setEditingEmployee(emp)
                            setShowEditEmployee(true)
                            setSwipedEmployeeId(null)
                            setTouchOffset(0)
                          }}
                          className="w-[75px] bg-blue-500 flex items-center justify-center text-white font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleArchiveEmployee(emp.id)}
                          className="w-[75px] bg-red-500 flex items-center justify-center text-white font-medium"
                        >
                          Archive
                        </button>
                      </div>

                      <button
                        onTouchStart={(e) => handleTouchStart(e, emp.id)}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                        onClick={() => {
                          if (Math.abs(offset) < 10) {
                            handleEmployeeSelect(emp)
                          }
                        }}
                        style={{
                          transform: `translateX(${offset}px)`,
                          transition: touchStart ? 'none' : 'transform 0.3s ease',
                        }}
                        className="w-full bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20 hover:bg-white/15 transition text-left relative"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <h3 className="text-white font-semibold">
                              {emp.first_name} {emp.last_name}
                            </h3>
                            {emp.email && (
                              <p className="text-blue-300 text-xs mt-1">{emp.email}</p>
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
                            {emp.compensation_type === 'hourly' ? 'Hourly' : emp.compensation_type === 'production' ? 'Production' : 'Fixed'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="text-sm">
                            <span className="text-blue-200">
                              {emp.compensation_type === 'hourly'
                                ? 'Hours: '
                                : emp.compensation_type === 'production'
                                ? 'Units: '
                                : 'Adjustment: '}
                            </span>
                            <span className="text-white font-semibold">
                              {emp.compensation_type === 'hourly'
                                ? emp.hours || '0'
                                : emp.compensation_type === 'production'
                                ? emp.units || '0'
                                : formatCurrency(Number.parseFloat(emp.adjustment || '0') || 0)}
                            </span>
                          </div>
                          <div className="text-white font-bold text-lg">
                            {formatCurrency(emp.amount)}
                          </div>
                        </div>
                      </button>
                    </div>
                  )
                })
              )}
              
              <button
                onClick={() => setShowAddEmployee(true)}
                className="w-full bg-white/5 border-2 border-dashed border-white/20 hover:border-blue-400 hover:bg-white/10 rounded-xl p-4 text-center transition-all group"
              >
                <div className="flex items-center justify-center gap-2 text-blue-200 group-hover:text-blue-100">
                  <Users className="w-5 h-5" />
                  <span className="font-medium">Add New Employee</span>
                </div>
              </button>
            </div>
          </>
        )}
      </div>

      {selectedLocationId && (
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
      )}
    </div>
  )
}
