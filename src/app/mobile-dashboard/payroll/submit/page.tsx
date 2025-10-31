'use client'

import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
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
  count: string
  adjustment: string
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

const MS_PER_DAY = 1000 * 60 * 60 * 24
const MS_PER_WEEK = MS_PER_DAY * 7
const PAYROLL_REFERENCE_DATE = new Date(2025, 0, 3)

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

  const payDateUTC = Date.UTC(payDate.getFullYear(), payDate.getMonth(), payDate.getDate())
  const referenceDateUTC = Date.UTC(
    PAYROLL_REFERENCE_DATE.getFullYear(),
    PAYROLL_REFERENCE_DATE.getMonth(),
    PAYROLL_REFERENCE_DATE.getDate(),
  )
  const weeksDifference = Math.round((payDateUTC - referenceDateUTC) / MS_PER_WEEK)
  const parity = ((weeksDifference % 2) + 2) % 2
  const payrollGroup: PayrollGroup = parity === 0 ? 'A' : 'B'

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
  const [isSyncingProduction, setIsSyncingProduction] = useState(false)
  const [showAddEmployee, setShowAddEmployee] = useState(false)
  
  // ✅ Auto-save states
  const [draftSubmissionId, setDraftSubmissionId] = useState<string | null>(null)
  const [rejectedSubmissionId, setRejectedSubmissionId] = useState<string | null>(null)
  const [rejectionNote, setRejectionNote] = useState<string | null>(null)
  const [isAutoSaving, setIsAutoSaving] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  // Track submission status to prevent duplicates and lock UI
  const [submissionStatus, setSubmissionStatus] = useState<'none' | 'draft' | 'pending' | 'approved' | 'rejected'>('none')
  const [submittedAt, setSubmittedAt] = useState<string | null>(null)
  const [submittedBy, setSubmittedBy] = useState<string | null>(null)
  
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
        
        if (!session) {
          console.log('No session found, redirecting to login')
          router.push('/login')
          return
        }

        setUserId(session.user.id)
        setUserName(session.user.email || 'User')

        const { data: locationManagers, error: locError } = await dataSupabase
          .from('location_managers')
          .select('location_id, locations(id, name)')
          .eq('user_id', session.user.id)

        if (locError) {
          console.error('Error loading locations:', locError)
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
      } finally {
        setLoading(false)
      }
    }

    checkSession()
  }, [authClient, dataSupabase, router])

  // ✅ FIXED: Check for draft/rejected submissions ONLY when pay date or payroll group changes
  // Removed employees.length from dependencies to prevent race condition
  useEffect(() => {
    if (selectedLocationId && payDate && payrollGroup && employees.length > 0) {
      loadExistingSubmission(selectedLocationId)
    }
  }, [selectedLocationId, payDate, payrollGroup]) // ← Removed employees.length!

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
        count: '1',
        adjustment: '0',
        notes: '',
        amount: 0,
      }))

      setEmployees(employeeRows)
      
      // ✅ Load draft/rejected submission AFTER employees are loaded
      if (payDate) {
        await loadExistingSubmission(locationId)
      }
      
    } catch (error) {
      console.error('Error loading employees:', error)
      showAlert('error', 'Failed to load employees')
    }
  }

  async function loadExistingSubmission(locationId: string) {
    try {
      console.log('🔍 Loading existing submission for:', { locationId, payDate, payrollGroup })
      
      // Check for ANY existing submission (not just draft/rejected)
      const { data: submissions, error } = await dataSupabase
        .from('payroll_submissions')
        .select('*, payroll_entries(*)')
        .eq('location_id', locationId)
        .eq('pay_date', payDate)
        .order('created_at', { ascending: false })
        .limit(1)

      if (error) throw error

      if (submissions && submissions.length > 0) {
        const submission = submissions[0]
        console.log('✅ Found submission:', submission.status, submission.id)
        
        setSubmissionStatus(submission.status)
        setSubmittedAt(submission.submitted_at)
        setSubmittedBy(submission.submitted_by)
        
        if (submission.status === 'rejected') {
          setRejectedSubmissionId(submission.id)
          setRejectionNote(submission.rejection_note)
          setDraftSubmissionId(null)
          
          showAlert('error', `⚠️ Payroll was rejected: "${submission.rejection_note}"\nPlease make corrections and resubmit.`)
        } else if (submission.status === 'draft') {
          setDraftSubmissionId(submission.id)
          setRejectedSubmissionId(null)
          setRejectionNote(null)
          setLastSavedAt(new Date(submission.updated_at || submission.created_at))
          console.log('📝 Draft loaded, ID:', submission.id)
        } else if (submission.status === 'pending' || submission.status === 'approved') {
          setDraftSubmissionId(null)
          setRejectedSubmissionId(null)
          setRejectionNote(null)
        }

        // Load employee data from entries
        const entries = submission.payroll_entries || []
        console.log('📊 Loading', entries.length, 'entries for', employees.length, 'employees')
        
        setEmployees(prevEmployees => {
          return prevEmployees.map(emp => {
            const entry = entries.find((e: any) => e.employee_id === emp.id)
            if (entry) {
              console.log('✅ Restored data for:', emp.first_name, emp.last_name, { hours: entry.hours, units: entry.units })
              return {
                ...emp,
                hours: entry.hours?.toString() || '',
                units: entry.units?.toString() || '',
                count: entry.count?.toString() || '1',
                adjustment: entry.adjustment?.toString() || '0',
                notes: entry.notes || '',
                amount: entry.amount || 0,
              }
            }
            return emp
          })
        })
      } else {
        console.log('ℹ️ No existing submission found')
        setSubmissionStatus('none')
        setSubmittedAt(null)
        setSubmittedBy(null)
        setDraftSubmissionId(null)
        setRejectedSubmissionId(null)
        setRejectionNote(null)
      }
    } catch (error) {
      console.error('Error loading submission:', error)
    }
  }

  // ✅ Auto-save function (debounced)
  const autoSaveDraft = useCallback(async (employeesData: EmployeeRow[]) => {
    if (!selectedLocationId || !userId) return

    const employeesWithData = employeesData.filter(emp => {
      if (emp.compensation_type === 'hourly') return parseFloat(emp.hours || '0') > 0
      if (emp.compensation_type === 'production') return parseFloat(emp.units || '0') > 0
      if (emp.compensation_type === 'fixed') return parseFloat(emp.count || '0') > 0
      return false
    })

    if (employeesWithData.length === 0) {
      // No data to save, clear any existing draft
      return
    }

    setIsAutoSaving(true)
    try {
      // Get organization_id
      const { data: locationData, error: locationError } = await dataSupabase
        .from('locations')
        .select('organization_id')
        .eq('id', selectedLocationId)
        .single()

      if (locationError || !locationData?.organization_id) {
        throw new Error('Failed to get organization ID')
      }

      const organizationId = locationData.organization_id
      const totalAmount = employeesWithData.reduce((sum, emp) => sum + emp.amount, 0)

      const existingSubmissionId = draftSubmissionId || rejectedSubmissionId

      if (existingSubmissionId) {
        // UPDATE existing submission as draft
        const { error: updateError } = await dataSupabase
          .from('payroll_submissions')
          .update({
            status: 'draft',
            total_amount: totalAmount,
            employee_count: employeesWithData.length,
            submitted_by: userId,
            rejected_by: null,
            rejected_at: null,
            rejection_note: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingSubmissionId)

        if (updateError) throw updateError

        // Delete old entries
        await dataSupabase
          .from('payroll_entries')
          .delete()
          .eq('submission_id', existingSubmissionId)

        // Insert updated entries
        const details = employeesWithData.map(emp => ({
          organization_id: organizationId,
          submission_id: existingSubmissionId,
          employee_id: emp.id,
          hours: emp.compensation_type === 'hourly' ? parseFloat(emp.hours) : null,
          units: emp.compensation_type === 'production' ? parseFloat(emp.units) : null,
          count: emp.compensation_type === 'fixed' ? parseFloat(emp.count) : null,
          adjustment: emp.compensation_type === 'fixed' ? parseFloat(emp.adjustment) : null,
          amount: emp.amount,
          notes: emp.notes || null,
          status: 'draft',
        }))

        const { error: detailsError } = await dataSupabase
          .from('payroll_entries')
          .insert(details)

        if (detailsError) throw detailsError

        setDraftSubmissionId(existingSubmissionId)
        setRejectedSubmissionId(null)
        setRejectionNote(null)

      } else {
        // CREATE new draft submission
        const { data: submission, error: submissionError } = await dataSupabase
          .from('payroll_submissions')
          .insert({
            organization_id: organizationId,
            location_id: selectedLocationId,
            pay_date: payDate,
            payroll_group: payrollGroup,
            period_start: periodStart,
            period_end: periodEnd,
            total_amount: totalAmount,
            employee_count: employeesWithData.length,
            submitted_by: userId,
            status: 'draft',
          })
          .select()
          .single()

        if (submissionError) throw submissionError

        const details = employeesWithData.map(emp => ({
          organization_id: organizationId,
          submission_id: submission.id,
          employee_id: emp.id,
          hours: emp.compensation_type === 'hourly' ? parseFloat(emp.hours) : null,
          units: emp.compensation_type === 'production' ? parseFloat(emp.units) : null,
          count: emp.compensation_type === 'fixed' ? parseFloat(emp.count) : null,
          adjustment: emp.compensation_type === 'fixed' ? parseFloat(emp.adjustment) : null,
          amount: emp.amount,
          notes: emp.notes || null,
          status: 'draft',
        }))

        const { error: detailsError } = await dataSupabase
          .from('payroll_entries')
          .insert(details)

        if (detailsError) throw detailsError

        setDraftSubmissionId(submission.id)
      }

      setLastSavedAt(new Date())
      
    } catch (error: any) {
      console.error('Auto-save error:', error)
      // Silent fail - don't show alert to user since auto-save is background
    } finally {
      setIsAutoSaving(false)
    }
  }, [selectedLocationId, userId, payDate, payrollGroup, periodStart, periodEnd, draftSubmissionId, rejectedSubmissionId, dataSupabase])

  // ✅ Manual Save Draft (with user feedback)
  async function handleSaveDraft() {
    if (!selectedLocationId || !userId) return

    const employeesWithData = employees.filter(emp => {
      if (emp.compensation_type === 'hourly') return parseFloat(emp.hours || '0') > 0
      if (emp.compensation_type === 'production') return parseFloat(emp.units || '0') > 0
      if (emp.compensation_type === 'fixed') return parseFloat(emp.count || '0') > 0
      return false
    })

    if (employeesWithData.length === 0) {
      showAlert('error', 'Please enter payroll data for at least one employee before saving')
      return
    }

    setIsAutoSaving(true)
    try {
      // Get organization_id
      const { data: locationData, error: locationError } = await dataSupabase
        .from('locations')
        .select('organization_id')
        .eq('id', selectedLocationId)
        .single()

      if (locationError || !locationData?.organization_id) {
        throw new Error('Failed to get organization ID')
      }

      const organizationId = locationData.organization_id
      const totalAmount = employeesWithData.reduce((sum, emp) => sum + emp.amount, 0)

      const existingSubmissionId = draftSubmissionId || rejectedSubmissionId

      if (existingSubmissionId) {
        // UPDATE existing submission as draft
        const { error: updateError } = await dataSupabase
          .from('payroll_submissions')
          .update({
            status: 'draft',
            total_amount: totalAmount,
            employee_count: employeesWithData.length,
            submitted_by: userId,
            rejected_by: null,
            rejected_at: null,
            rejection_note: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingSubmissionId)

        if (updateError) throw updateError

        // Delete old entries
        await dataSupabase
          .from('payroll_entries')
          .delete()
          .eq('submission_id', existingSubmissionId)

        // Insert updated entries
        const details = employeesWithData.map(emp => ({
          organization_id: organizationId,
          submission_id: existingSubmissionId,
          employee_id: emp.id,
          hours: emp.compensation_type === 'hourly' ? parseFloat(emp.hours) : null,
          units: emp.compensation_type === 'production' ? parseFloat(emp.units) : null,
          count: emp.compensation_type === 'fixed' ? parseFloat(emp.count) : null,
          adjustment: emp.compensation_type === 'fixed' ? parseFloat(emp.adjustment) : null,
          amount: emp.amount,
          notes: emp.notes || null,
          status: 'draft',
        }))

        const { error: detailsError } = await dataSupabase
          .from('payroll_entries')
          .insert(details)

        if (detailsError) throw detailsError

        setDraftSubmissionId(existingSubmissionId)
        setRejectedSubmissionId(null)
        setRejectionNote(null)

      } else {
        // CREATE new draft submission
        const { data: submission, error: submissionError } = await dataSupabase
          .from('payroll_submissions')
          .insert({
            organization_id: organizationId,
            location_id: selectedLocationId,
            pay_date: payDate,
            payroll_group: payrollGroup,
            period_start: periodStart,
            period_end: periodEnd,
            total_amount: totalAmount,
            employee_count: employeesWithData.length,
            submitted_by: userId,
            status: 'draft',
          })
          .select()
          .single()

        if (submissionError) throw submissionError

        const details = employeesWithData.map(emp => ({
          organization_id: organizationId,
          submission_id: submission.id,
          employee_id: emp.id,
          hours: emp.compensation_type === 'hourly' ? parseFloat(emp.hours) : null,
          units: emp.compensation_type === 'production' ? parseFloat(emp.units) : null,
          count: emp.compensation_type === 'fixed' ? parseFloat(emp.count) : null,
          adjustment: emp.compensation_type === 'fixed' ? parseFloat(emp.adjustment) : null,
          amount: emp.amount,
          notes: emp.notes || null,
          status: 'draft',
        }))

        const { error: detailsError } = await dataSupabase
          .from('payroll_entries')
          .insert(details)

        if (detailsError) throw detailsError

        setDraftSubmissionId(submission.id)
      }

      setLastSavedAt(new Date())
      showAlert('success', '💾 Draft saved successfully!')
      
    } catch (error: any) {
      console.error('Save draft error:', error)
      showAlert('error', error.message || 'Failed to save draft')
    } finally {
      setIsAutoSaving(false)
    }
  }

  // ✅ Trigger auto-save with debounce
  const triggerAutoSave = useCallback(() => {
    // Clear existing timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current)
    }

    // Set new timeout (2 seconds after last change)
    autoSaveTimeoutRef.current = setTimeout(() => {
      autoSaveDraft(employees)
    }, 2000)
  }, [employees, autoSaveDraft])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current)
      }
    }
  }, [])

  function showAlert(type: Alert['type'], message: string) {
    setAlert({ type, message })
    setTimeout(() => setAlert(null), 5000)
  }

  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => emp.payroll_group === payrollGroup)
  }, [employees, payrollGroup])

  const hasProductionEmployees = useMemo(() => {
    return filteredEmployees.some(emp => emp.compensation_type === 'production')
  }, [filteredEmployees])

  const hasProductionEmployeesWithEmails = useMemo(() => {
    return filteredEmployees.some(
      emp => emp.compensation_type === 'production' && emp.email
    )
  }, [filteredEmployees])

  const totals = useMemo(() => {
    const employeesWithHours = filteredEmployees.filter(emp => {
      if (emp.compensation_type === 'hourly') return parseFloat(emp.hours || '0') > 0
      if (emp.compensation_type === 'production') return parseFloat(emp.units || '0') > 0
      if (emp.compensation_type === 'fixed') return parseFloat(emp.count || '0') > 0
      return false
    })
    const total = employeesWithHours.reduce((sum, emp) => sum + emp.amount, 0)
    return {
      employees: employeesWithHours.length,
      total,
    }
  }, [filteredEmployees])

  function calculateAmount(emp: Partial<EmployeeRow>): number {
    const hours = parseFloat(emp.hours || '0')
    const units = parseFloat(emp.units || '0')
    const count = parseFloat(emp.count || '0')
    const adjustment = parseFloat(emp.adjustment || '0')

    if (emp.compensation_type === 'hourly') {
      return hours * (emp.hourly_rate || 0)
    } else if (emp.compensation_type === 'production') {
      return units * (emp.piece_rate || 0)
    } else if (emp.compensation_type === 'fixed') {
      return count * (emp.fixed_pay || 0) + adjustment
    }
    return 0
  }

  function handleEmployeeChange(employeeId: string, field: keyof EmployeeRow, value: string) {
    setEmployees((prev) => {
      const updated = prev.map((emp) => {
        if (emp.id === employeeId) {
          const updatedEmp = { ...emp, [field]: value }
          updatedEmp.amount = calculateAmount(updatedEmp)
          return updatedEmp
        }
        return emp
      })
      return updated
    })
    
    // Trigger auto-save
    triggerAutoSave()
  }

  function handleEmployeeSelect(employee: EmployeeRow) {
    setSelectedEmployee(employee)
  }

  function closeEmployeeModal() {
    setSelectedEmployee(null)
  }

  function handleTouchStart(e: React.TouchEvent, employeeId: string) {
    const touch = e.touches[0]
    setTouchStart({ x: touch.clientX, y: touch.clientY })
    setSwipedEmployeeId(employeeId)
    setTouchOffset(0)
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!touchStart) return
    const touch = e.touches[0]
    const deltaX = touchStart.x - touch.clientX
    const deltaY = Math.abs(touchStart.y - touch.clientY)
    
    if (deltaY > 30) return
    if (deltaX > 0 && deltaX < 150) {
      setTouchOffset(-deltaX)
    }
  }

  function handleTouchEnd() {
    if (Math.abs(touchOffset) < 75) {
      setTouchOffset(0)
      setSwipedEmployeeId(null)
    } else {
      setTouchOffset(-150)
    }
    setTouchStart(null)
  }

  async function handleArchiveEmployee(employeeId: string) {
    if (!confirm('Are you sure you want to archive this employee?')) return
    
    try {
      const { error } = await dataSupabase
        .from('employees')
        .update({ is_active: false })
        .eq('id', employeeId)
      
      if (error) throw error
      
      setEmployees(prev => prev.filter(emp => emp.id !== employeeId))
      setSwipedEmployeeId(null)
      setTouchOffset(0)
      showAlert('success', 'Employee archived')
    } catch (error: any) {
      showAlert('error', error.message || 'Failed to archive employee')
    }
  }

  async function handleAddEmployee() {
    if (!selectedLocationId) return
    if (!newEmployee.first_name || !newEmployee.last_name) {
      showAlert('error', 'Please enter first and last name')
      return
    }

    try {
      const { data: locationData } = await dataSupabase
        .from('locations')
        .select('organization_id')
        .eq('id', selectedLocationId)
        .single()

      if (!locationData) throw new Error('Location not found')

      const employeeData: any = {
        organization_id: locationData.organization_id,
        location_id: selectedLocationId,
        first_name: newEmployee.first_name,
        last_name: newEmployee.last_name,
        email: newEmployee.email || null,
        payroll_group: newEmployee.payroll_group,
        compensation_type: newEmployee.compensation_type,
        is_active: true,
      }

      if (newEmployee.compensation_type === 'hourly') {
        employeeData.hourly_rate = parseFloat(newEmployee.hourly_rate) || 0
      } else if (newEmployee.compensation_type === 'production') {
        employeeData.piece_rate = parseFloat(newEmployee.piece_rate) || 0
      } else if (newEmployee.compensation_type === 'fixed') {
        employeeData.fixed_pay = parseFloat(newEmployee.fixed_pay) || 0
      }

      const { data, error } = await dataSupabase
        .from('employees')
        .insert(employeeData)
        .select()
        .single()

      if (error) throw error

      const newEmployeeRow: EmployeeRow = {
        ...data,
        hours: '',
        units: '',
        count: '1',
        adjustment: '0',
        notes: '',
        amount: 0,
      }

      setEmployees((prev) => [...prev, newEmployeeRow])
      setShowAddEmployee(false)
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
      showAlert('success', 'Employee added successfully')
    } catch (error: any) {
      showAlert('error', error.message || 'Failed to add employee')
    }
  }

  async function handleSyncConnecteam() {
    if (!selectedLocationId) return
    
    setIsSyncingConnecteam(true)
    try {
      const employeeEmails = filteredEmployees
        .filter(emp => emp.email)
        .map(emp => emp.email as string)

      if (employeeEmails.length === 0) {
        showAlert('error', 'No employees with email addresses to sync')
        return
      }

      const startDate = periodStart
      const endDate = periodEnd

      const response = await fetch('/api/connecteam/time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeEmails,
          startDate,
          endDate,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Sync failed')
      }

      const data = await response.json()
      const hoursMap = data.hoursMap as { [email: string]: number }

      setEmployees(prev =>
        prev.map(emp => {
          if (emp.email && hoursMap[emp.email] !== undefined) {
            const hours = hoursMap[emp.email].toString()
            const updatedEmp = { ...emp, hours }
            updatedEmp.amount = calculateAmount(updatedEmp)
            return updatedEmp
          }
          return emp
        })
      )

      showAlert('success', `✅ Synced hours for ${Object.keys(hoursMap).length} employees`)
      triggerAutoSave()
    } catch (error: any) {
      console.error('Sync error:', error)
      showAlert('error', error.message || 'Failed to sync with Connecteam')
    } finally {
      setIsSyncingConnecteam(false)
    }
  }

  async function handleSyncProduction() {
    if (!selectedLocationId) return
    
    setIsSyncingProduction(true)
    try {
      const employeeEmails = filteredEmployees
        .filter(emp => emp.email && emp.compensation_type === 'production')
        .map(emp => emp.email as string)

      if (employeeEmails.length === 0) {
        showAlert('error', 'No production employees with email addresses to sync')
        return
      }

      const location = availableLocations.find(loc => loc.id === selectedLocationId)
      const locationName = location?.name

      if (!locationName) {
        showAlert('error', 'Location name not found')
        return
      }

      const startDate = periodStart
      const endDate = periodEnd

      const response = await fetch('/api/connecteam/production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeEmails,
          locationName,
          startDate,
          endDate,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Production sync failed')
      }

      const data = await response.json()
      const unitsMap = data.unitsMap as { [email: string]: number }

      setEmployees(prev =>
        prev.map(emp => {
          if (emp.email && unitsMap[emp.email] !== undefined) {
            const units = unitsMap[emp.email].toString()
            const updatedEmp = { ...emp, units }
            updatedEmp.amount = calculateAmount(updatedEmp)
            return updatedEmp
          }
          return emp
        })
      )

      showAlert('success', `✅ Synced production for ${Object.keys(unitsMap).length} employees`)
      triggerAutoSave()
    } catch (error: any) {
      console.error('Production sync error:', error)
      showAlert('error', error.message || 'Failed to sync production data')
    } finally {
      setIsSyncingProduction(false)
    }
  }

  async function handleSubmit() {
    if (!selectedLocationId || !userId) return

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
      const { data: locationData, error: locationError } = await dataSupabase
        .from('locations')
        .select('organization_id')
        .eq('id', selectedLocationId)
        .single()

      if (locationError || !locationData?.organization_id) {
        throw new Error('Failed to get organization ID')
      }

      const organizationId = locationData.organization_id
      const totalAmount = employeesWithData.reduce((sum, emp) => sum + emp.amount, 0)

      const existingSubmissionId = draftSubmissionId || rejectedSubmissionId

      if (existingSubmissionId) {
        const { error: updateError } = await dataSupabase
          .from('payroll_submissions')
          .update({
            status: 'pending',
            total_amount: totalAmount,
            employee_count: employeesWithData.length,
            submitted_by: userId,
            submitted_at: new Date().toISOString(),
            rejected_by: null,
            rejected_at: null,
            rejection_note: null,
          })
          .eq('id', existingSubmissionId)

        if (updateError) throw updateError

        await dataSupabase
          .from('payroll_entries')
          .delete()
          .eq('submission_id', existingSubmissionId)

        const details = employeesWithData.map(emp => ({
          organization_id: organizationId,
          submission_id: existingSubmissionId,
          employee_id: emp.id,
          hours: emp.compensation_type === 'hourly' ? parseFloat(emp.hours) : null,
          units: emp.compensation_type === 'production' ? parseFloat(emp.units) : null,
          count: emp.compensation_type === 'fixed' ? parseFloat(emp.count) : null,
          adjustment: emp.compensation_type === 'fixed' ? parseFloat(emp.adjustment) : null,
          amount: emp.amount,
          notes: emp.notes || null,
          status: 'pending',
        }))

        const { error: detailsError } = await dataSupabase
          .from('payroll_entries')
          .insert(details)

        if (detailsError) throw detailsError
      } else {
        const { data: submission, error: submissionError } = await dataSupabase
          .from('payroll_submissions')
          .insert({
            organization_id: organizationId,
            location_id: selectedLocationId,
            pay_date: payDate,
            payroll_group: payrollGroup,
            period_start: periodStart,
            period_end: periodEnd,
            total_amount: totalAmount,
            employee_count: employeesWithData.length,
            submitted_by: userId,
            submitted_at: new Date().toISOString(),
            status: 'pending',
          })
          .select()
          .single()

        if (submissionError) throw submissionError

        const details = employeesWithData.map(emp => ({
          organization_id: organizationId,
          submission_id: submission.id,
          employee_id: emp.id,
          hours: emp.compensation_type === 'hourly' ? parseFloat(emp.hours) : null,
          units: emp.compensation_type === 'production' ? parseFloat(emp.units) : null,
          count: emp.compensation_type === 'fixed' ? parseFloat(emp.count) : null,
          adjustment: emp.compensation_type === 'fixed' ? parseFloat(emp.adjustment) : null,
          amount: emp.amount,
          notes: emp.notes || null,
          status: 'pending',
        }))

        const { error: detailsError } = await dataSupabase
          .from('payroll_entries')
          .insert(details)

        if (detailsError) throw detailsError
      }

      setSubmissionStatus('pending')
      setSubmittedAt(new Date().toISOString())
      setSubmittedBy(userId)
      setDraftSubmissionId(null)
      setRejectedSubmissionId(null)
      setRejectionNote(null)

      showAlert('success', '✅ Payroll submitted for approval!')
    } catch (error: any) {
      console.error('Submit error:', error)
      showAlert('error', error.message || 'Failed to submit payroll')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleUpdateEmployee() {
    if (!editingEmployee || !selectedLocationId) return
    
    try {
      const updateData: any = {
        first_name: editingEmployee.first_name,
        last_name: editingEmployee.last_name,
        email: editingEmployee.email || null,
        payroll_group: editingEmployee.payroll_group,
        compensation_type: editingEmployee.compensation_type,
      }

      if (editingEmployee.compensation_type === 'hourly') {
        updateData.hourly_rate = editingEmployee.hourly_rate
        updateData.piece_rate = null
        updateData.fixed_pay = null
      } else if (editingEmployee.compensation_type === 'production') {
        updateData.piece_rate = editingEmployee.piece_rate
        updateData.hourly_rate = null
        updateData.fixed_pay = null
      } else if (editingEmployee.compensation_type === 'fixed') {
        updateData.fixed_pay = editingEmployee.fixed_pay
        updateData.hourly_rate = null
        updateData.piece_rate = null
      }

      const { error } = await dataSupabase
        .from('employees')
        .update(updateData)
        .eq('id', editingEmployee.id)

      if (error) throw error

      setEmployees(prev =>
        prev.map(emp => {
          if (emp.id === editingEmployee.id) {
            const updated = { ...emp, ...updateData }
            updated.amount = calculateAmount(updated)
            return updated
          }
          return emp
        })
      )

      setShowEditEmployee(false)
      setEditingEmployee(null)
      showAlert('success', 'Employee updated successfully')
      triggerAutoSave()
    } catch (error: any) {
      showAlert('error', error.message || 'Failed to update employee')
    }
  }

  async function handleLogout() {
    await authClient.auth.signOut()
    router.push('/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white"></div>
      </div>
    )
  }

  if (showLocationPicker) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 max-w-md w-full border border-white/20">
          <h2 className="text-2xl font-bold text-white mb-6 text-center">Select Location</h2>
          {availableLocations.length === 0 ? (
            <p className="text-white/70 text-center">No locations available</p>
          ) : (
            <div className="space-y-3">
              {availableLocations.map((loc) => (
                <button
                  key={loc.id}
                  onClick={async () => {
                    setSelectedLocationId(loc.id)
                    setShowLocationPicker(false)
                    await loadEmployees(loc.id)
                  }}
                  className="w-full bg-white/5 hover:bg-white/20 border border-white/20 text-white font-semibold py-4 px-6 rounded-xl transition text-left"
                >
                  <MapPin className="w-5 h-5 inline mr-2" />
                  {loc.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 pb-32">
      {alert && (
        <div
          className={`fixed top-4 left-4 right-4 z-50 p-4 rounded-xl shadow-lg backdrop-blur-md ${
            alert.type === 'success'
              ? 'bg-green-500/90 text-white'
              : 'bg-red-500/90 text-white'
          }`}
        >
          <div className="flex items-start gap-3">
            {alert.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            )}
            <p className="flex-1 whitespace-pre-line">{alert.message}</p>
            <button onClick={() => setAlert(null)}>
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {selectedEmployee && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 flex items-end justify-center">
          <div className="bg-gradient-to-b from-slate-800 to-slate-900 rounded-t-3xl w-full max-w-lg border-t border-white/20 max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-slate-800/95 backdrop-blur-sm border-b border-white/10 p-4 flex items-center justify-between">
              <h3 className="text-xl font-bold text-white">
                {selectedEmployee.first_name} {selectedEmployee.last_name}
              </h3>
              <button
                onClick={closeEmployeeModal}
                className="p-2 hover:bg-white/10 rounded-full transition"
              >
                <X className="w-6 h-6 text-white" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <div className="flex items-center gap-3 mb-3">
                  <Users className="w-5 h-5 text-blue-300" />
                  <span className="text-white font-semibold">Employee Info</span>
                </div>
                <div className="space-y-2 text-sm">
                  {selectedEmployee.email && (
                    <p className="text-blue-200">{selectedEmployee.email}</p>
                  )}
                  <p className="text-white/70">
                    Group: <span className="text-white font-medium">{selectedEmployee.payroll_group}</span>
                  </p>
                  <p className="text-white/70">
                    Type: <span className="text-white font-medium capitalize">{selectedEmployee.compensation_type}</span>
                  </p>
                  {selectedEmployee.compensation_type === 'hourly' && (
                    <p className="text-white/70">
                      Rate: <span className="text-white font-medium">{formatCurrency(selectedEmployee.hourly_rate)}/hr</span>
                    </p>
                  )}
                  {selectedEmployee.compensation_type === 'production' && (
                    <p className="text-white/70">
                      Rate: <span className="text-white font-medium">{formatCurrency(selectedEmployee.piece_rate)}/unit</span>
                    </p>
                  )}
                  {selectedEmployee.compensation_type === 'fixed' && (
                    <p className="text-white/70">
                      Pay: <span className="text-white font-medium">{formatCurrency(selectedEmployee.fixed_pay)}</span>
                    </p>
                  )}
                </div>
              </div>

              {selectedEmployee.compensation_type === 'hourly' && (
                <div>
                  <label className="block text-white/70 mb-2 font-medium">Hours Worked</label>
                  <input
                    type="number"
                    step="0.25"
                    value={selectedEmployee.hours}
                    onChange={(e) => handleEmployeeChange(selectedEmployee.id, 'hours', e.target.value)}
                    disabled={submissionStatus === 'pending' || submissionStatus === 'approved'}
                    className="w-full bg-white/10 border border-white/20 rounded-xl p-4 text-white text-lg focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="0"
                  />
                </div>
              )}

              {selectedEmployee.compensation_type === 'production' && (
                <div>
                  <label className="block text-white/70 mb-2 font-medium">Units Completed</label>
                  <input
                    type="number"
                    step="1"
                    value={selectedEmployee.units}
                    onChange={(e) => handleEmployeeChange(selectedEmployee.id, 'units', e.target.value)}
                    disabled={submissionStatus === 'pending' || submissionStatus === 'approved'}
                    className="w-full bg-white/10 border border-white/20 rounded-xl p-4 text-white text-lg focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="0"
                  />
                </div>
              )}

              {selectedEmployee.compensation_type === 'fixed' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-white/70 mb-2 font-medium">Count</label>
                    <input
                      type="number"
                      step="1"
                      value={selectedEmployee.count}
                      onChange={(e) => handleEmployeeChange(selectedEmployee.id, 'count', e.target.value)}
                      disabled={submissionStatus === 'pending' || submissionStatus === 'approved'}
                      className="w-full bg-white/10 border border-white/20 rounded-xl p-4 text-white text-lg focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
                      placeholder="1"
                    />
                  </div>
                  <div>
                    <label className="block text-white/70 mb-2 font-medium">Adjustment</label>
                    <input
                      type="number"
                      step="0.01"
                      value={selectedEmployee.adjustment}
                      onChange={(e) => handleEmployeeChange(selectedEmployee.id, 'adjustment', e.target.value)}
                      disabled={submissionStatus === 'pending' || submissionStatus === 'approved'}
                      className="w-full bg-white/10 border border-white/20 rounded-xl p-4 text-white text-lg focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
                      placeholder="0"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-white/70 mb-2 font-medium">Notes (Optional)</label>
                <textarea
                  value={selectedEmployee.notes}
                  onChange={(e) => handleEmployeeChange(selectedEmployee.id, 'notes', e.target.value)}
                  disabled={submissionStatus === 'pending' || submissionStatus === 'approved'}
                  className="w-full bg-white/10 border border-white/20 rounded-xl p-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[100px] disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="Add any notes about this payroll entry..."
                />
              </div>

              <div className="bg-blue-500/20 rounded-xl p-4 border border-blue-400/30">
                <div className="flex items-center justify-between">
                  <span className="text-blue-200 font-medium">Total Amount:</span>
                  <span className="text-2xl font-bold text-white">
                    {formatCurrency(selectedEmployee.amount)}
                  </span>
                </div>
              </div>

              <button
                onClick={closeEmployeeModal}
                className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold py-4 rounded-xl hover:from-blue-600 hover:to-blue-700 transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddEmployee && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 flex items-end justify-center">
          <div className="bg-gradient-to-b from-slate-800 to-slate-900 rounded-t-3xl w-full max-w-lg border-t border-white/20 max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-slate-800/95 backdrop-blur-sm border-b border-white/10 p-4 flex items-center justify-between">
              <h3 className="text-xl font-bold text-white">Add New Employee</h3>
              <button
                onClick={() => {
                  setShowAddEmployee(false)
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
                }}
                className="p-2 hover:bg-white/10 rounded-full transition"
              >
                <X className="w-6 h-6 text-white" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-white/70 mb-2 font-medium">First Name *</label>
                <input
                  type="text"
                  value={newEmployee.first_name}
                  onChange={(e) => setNewEmployee({ ...newEmployee, first_name: e.target.value })}
                  className="w-full bg-white/10 border border-white/20 rounded-xl p-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="John"
                />
              </div>

              <div>
                <label className="block text-white/70 mb-2 font-medium">Last Name *</label>
                <input
                  type="text"
                  value={newEmployee.last_name}
                  onChange={(e) => setNewEmployee({ ...newEmployee, last_name: e.target.value })}
                  className="w-full bg-white/10 border border-white/20 rounded-xl p-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="Doe"
                />
              </div>

              <div>
                <label className="block text-white/70 mb-2 font-medium">Email</label>
                <input
                  type="email"
                  value={newEmployee.email}
                  onChange={(e) => setNewEmployee({ ...newEmployee, email: e.target.value })}
                  className="w-full bg-white/10 border border-white/20 rounded-xl p-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="john.doe@example.com"
                />
              </div>

              <div>
                <label className="block text-white/70 mb-2 font-medium">Payroll Group</label>
                <select
                  value={newEmployee.payroll_group}
                  onChange={(e) => setNewEmployee({ ...newEmployee, payroll_group: e.target.value as PayrollGroup })}
                  className="w-full bg-white/10 border border-white/20 rounded-xl p-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <option value="A">Group A</option>
                  <option value="B">Group B</option>
                </select>
              </div>

              <div>
                <label className="block text-white/70 mb-2 font-medium">Compensation Type</label>
                <select
                  value={newEmployee.compensation_type}
                  onChange={(e) => setNewEmployee({ ...newEmployee, compensation_type: e.target.value as CompensationType })}
                  className="w-full bg-white/10 border border-white/20 rounded-xl p-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <option value="hourly">Hourly</option>
                  <option value="production">Production</option>
                  <option value="fixed">Fixed</option>
                </select>
              </div>

              {newEmployee.compensation_type === 'hourly' && (
                <div>
                  <label className="block text-white/70 mb-2 font-medium">Hourly Rate ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newEmployee.hourly_rate}
                    onChange={(e) => setNewEmployee({ ...newEmployee, hourly_rate: e.target.value })}
                    className="w-full bg-white/10 border border-white/20 rounded-xl p-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="15.00"
                  />
                </div>
              )}

              {newEmployee.compensation_type === 'production' && (
                <div>
                  <label className="block text-white/70 mb-2 font-medium">Piece Rate ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newEmployee.piece_rate}
                    onChange={(e) => setNewEmployee({ ...newEmployee, piece_rate: e.target.value })}
                    className="w-full bg-white/10 border border-white/20 rounded-xl p-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="2.50"
                  />
                </div>
              )}

              {newEmployee.compensation_type === 'fixed' && (
                <div>
                  <label className="block text-white/70 mb-2 font-medium">Fixed Pay ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newEmployee.fixed_pay}
                    onChange={(e) => setNewEmployee({ ...newEmployee, fixed_pay: e.target.value })}
                    className="w-full bg-white/10 border border-white/20 rounded-xl p-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="1000.00"
                  />
                </div>
              )}

              <button
                onClick={handleAddEmployee}
                className="w-full bg-gradient-to-r from-green-500 to-green-600 text-white font-semibold py-4 rounded-xl hover:from-green-600 hover:to-green-700 transition"
              >
                Add Employee
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditEmployee && editingEmployee && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 flex items-end justify-center">
          <div className="bg-gradient-to-b from-slate-800 to-slate-900 rounded-t-3xl w-full max-w-lg border-t border-white/20 max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-slate-800/95 backdrop-blur-sm border-b border-white/10 p-4 flex items-center justify-between">
              <h3 className="text-xl font-bold text-white">Edit Employee</h3>
              <button
                onClick={() => {
                  setShowEditEmployee(false)
                  setEditingEmployee(null)
                }}
                className="p-2 hover:bg-white/10 rounded-full transition"
              >
                <X className="w-6 h-6 text-white" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-white/70 mb-2 font-medium">First Name</label>
                <input
                  type="text"
                  value={editingEmployee.first_name}
                  onChange={(e) => setEditingEmployee({ ...editingEmployee, first_name: e.target.value })}
                  className="w-full bg-white/10 border border-white/20 rounded-xl p-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              <div>
                <label className="block text-white/70 mb-2 font-medium">Last Name</label>
                <input
                  type="text"
                  value={editingEmployee.last_name}
                  onChange={(e) => setEditingEmployee({ ...editingEmployee, last_name: e.target.value })}
                  className="w-full bg-white/10 border border-white/20 rounded-xl p-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              <div>
                <label className="block text-white/70 mb-2 font-medium">Email</label>
                <input
                  type="email"
                  value={editingEmployee.email || ''}
                  onChange={(e) => setEditingEmployee({ ...editingEmployee, email: e.target.value })}
                  className="w-full bg-white/10 border border-white/20 rounded-xl p-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              <div>
                <label className="block text-white/70 mb-2 font-medium">Payroll Group</label>
                <select
                  value={editingEmployee.payroll_group}
                  onChange={(e) => setEditingEmployee({ ...editingEmployee, payroll_group: e.target.value as PayrollGroup })}
                  className="w-full bg-white/10 border border-white/20 rounded-xl p-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <option value="A">Group A</option>
                  <option value="B">Group B</option>
                </select>
              </div>

              <div>
                <label className="block text-white/70 mb-2 font-medium">Compensation Type</label>
                <select
                  value={editingEmployee.compensation_type}
                  onChange={(e) => setEditingEmployee({ ...editingEmployee, compensation_type: e.target.value as CompensationType })}
                  className="w-full bg-white/10 border border-white/20 rounded-xl p-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <option value="hourly">Hourly</option>
                  <option value="production">Production</option>
                  <option value="fixed">Fixed</option>
                </select>
              </div>

              {editingEmployee.compensation_type === 'hourly' && (
                <div>
                  <label className="block text-white/70 mb-2 font-medium">Hourly Rate ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingEmployee.hourly_rate || ''}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, hourly_rate: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-white/10 border border-white/20 rounded-xl p-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
              )}

              {editingEmployee.compensation_type === 'production' && (
                <div>
                  <label className="block text-white/70 mb-2 font-medium">Piece Rate ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingEmployee.piece_rate || ''}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, piece_rate: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-white/10 border border-white/20 rounded-xl p-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
              )}

              {editingEmployee.compensation_type === 'fixed' && (
                <div>
                  <label className="block text-white/70 mb-2 font-medium">Fixed Pay ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingEmployee.fixed_pay || ''}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, fixed_pay: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-white/10 border border-white/20 rounded-xl p-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
              )}

              <button
                onClick={handleUpdateEmployee}
                className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold py-4 rounded-xl hover:from-blue-600 hover:to-blue-700 transition"
              >
                Update Employee
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="p-4 max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Payroll Submission</h1>
            <p className="text-blue-200 text-sm mt-1">{userName}</p>
          </div>
          <button
            onClick={handleLogout}
            className="p-3 bg-white/10 hover:bg-white/20 rounded-full transition"
          >
            <LogOut className="w-5 h-5 text-white" />
          </button>
        </div>

        {submissionStatus === 'pending' && (
          <div className="bg-yellow-500/20 border border-yellow-500/40 rounded-xl p-4 mb-4">
            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-yellow-300 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-yellow-100 font-semibold">Pending Approval</p>
                <p className="text-yellow-200/80 text-sm mt-1">
                  Your payroll submission is awaiting approval. You cannot make changes until it is approved or rejected.
                </p>
              </div>
            </div>
          </div>
        )}

        {submissionStatus === 'approved' && (
          <div className="bg-green-500/20 border border-green-500/40 rounded-xl p-4 mb-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-300 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-green-100 font-semibold">Approved ✓</p>
                <p className="text-green-200/80 text-sm mt-1">
                  This payroll has been approved and can no longer be edited.
                </p>
              </div>
            </div>
          </div>
        )}

        {rejectionNote && (
          <div className="bg-red-500/20 border border-red-500/40 rounded-xl p-4 mb-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-300 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-red-100 font-semibold">Rejected - Please Correct</p>
                <p className="text-red-200/80 text-sm mt-1">{rejectionNote}</p>
              </div>
            </div>
          </div>
        )}

        {selectedLocationId && (
          <>
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20">
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="w-5 h-5 text-blue-300" />
                <h2 className="text-white font-semibold">
                  {availableLocations.find((loc) => loc.id === selectedLocationId)?.name}
                </h2>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-white/70 mb-2 text-sm">Pay Date (Friday)</label>
                  <div className="relative">
                    <select
                      value={payDate}
                      onChange={(e) => {
                        const newPayDate = e.target.value
                        setPayDate(newPayDate)
                        const info = calculatePayrollInfo(newPayDate)
                        setPayrollGroup(info.payrollGroup)
                        setPeriodStart(info.periodStart)
                        setPeriodEnd(info.periodEnd)
                      }}
                      disabled={submissionStatus === 'pending' || submissionStatus === 'approved'}
                      className="w-full bg-white/10 border border-white/20 rounded-xl p-3 text-white appearance-none focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {fridayOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/50 pointer-events-none" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                    <p className="text-white/70 text-xs mb-1">Payroll Group</p>
                    <p className="text-white font-semibold text-lg">{payrollGroup}</p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                    <p className="text-white/70 text-xs mb-1">Pay Period</p>
                    <p className="text-white font-semibold text-sm">
                      {formatDateRange(periodStart, periodEnd)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-green-300" />
                  <h2 className="text-white font-semibold">Summary</h2>
                </div>
                {lastSavedAt && (
                  <div className="flex items-center gap-2 text-xs text-blue-300">
                    <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></div>
                    Saved {formatTimeAgo(lastSavedAt)}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                  <p className="text-white/70 text-xs mb-1">Employees</p>
                  <p className="text-white font-bold text-2xl">{totals.employees}</p>
                </div>
                <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                  <p className="text-white/70 text-xs mb-1">Total Payroll</p>
                  <p className="text-white font-bold text-2xl">{formatCurrency(totals.total)}</p>
                </div>
              </div>
            </div>

            {filteredEmployees.length === 0 ? (
              <div className="text-center py-12">
                <Users className="w-16 h-16 text-white/30 mx-auto mb-4" />
                <p className="text-white/70">No employees in Group {payrollGroup}</p>
                <p className="text-white/50 text-sm mt-2">
                  Add employees or check the other payroll group
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-blue-300" />
                    <h2 className="text-white font-semibold">Employees (Group {payrollGroup})</h2>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {hasProductionEmployees && (
                      <div className="flex flex-col items-end gap-1">
                        <button
                          onClick={handleSyncProduction}
                          disabled={isSyncingProduction || !hasProductionEmployeesWithEmails || submissionStatus === 'pending' || submissionStatus === 'approved'}
                          className="flex items-center gap-2 px-3 py-1.5 bg-purple-500/20 hover:bg-purple-500/30 disabled:bg-purple-500/10 text-purple-200 disabled:text-purple-300/50 text-xs font-medium rounded-lg border border-purple-400/30 disabled:border-purple-400/10 transition disabled:cursor-not-allowed"
                        >
                          {isSyncingProduction ? (
                            <>
                              <RefreshCw className="w-4 h-4 animate-spin" />
                              Syncing...
                            </>
                          ) : (
                            <>
                              <Hash className="w-4 h-4" />
                              Sync Production
                            </>
                          )}
                        </button>
                        {!hasProductionEmployeesWithEmails && (
                          <p className="mt-1 text-[10px] text-indigo-100/70 text-right">
                            Add an email to each production employee to sync automatically.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {filteredEmployees.map((emp) => {
                  const isSwiped = swipedEmployeeId === emp.id
                  const offset = isSwiped ? touchOffset : 0

                  return (
                    <div key={emp.id} className="relative overflow-hidden">
                      <div className="absolute right-0 top-0 bottom-0 w-[150px] flex items-center justify-end gap-2 pr-4 bg-red-500/20 border-r border-white/20 rounded-r-xl">
                        <button
                          onClick={() => {
                            setEditingEmployee(emp)
                            setShowEditEmployee(true)
                          }}
                          className="px-3 py-2 bg-blue-500/40 hover:bg-blue-500/60 rounded-lg text-white text-sm font-medium transition"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleArchiveEmployee(emp.id)}
                          className="px-3 py-2 bg-red-500/40 hover:bg-red-500/60 rounded-lg text-white text-sm font-medium transition"
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
                                : 'Fixed: '}
                            </span>
                            <span className="text-white font-semibold">
                              {emp.compensation_type === 'hourly'
                                ? emp.hours || '0'
                                : emp.compensation_type === 'production'
                                ? emp.units || '0'
                                : '1'}
                            </span>
                          </div>
                          <div className="text-white font-bold text-lg">
                            {formatCurrency(emp.amount)}
                          </div>
                        </div>
                      </button>
                    </div>
                  )
                })}
              </div>
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
          </>
        )}
      </div>

      {selectedLocationId && (
        <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-slate-900 via-slate-900/95 to-transparent p-4 border-t border-white/10">
          <div className="max-w-lg mx-auto space-y-2">
            
            {/* Action Buttons: Save Draft + Submit */}
            <div className="grid grid-cols-2 gap-3">
              {/* Save Draft Button */}
              <button
                onClick={handleSaveDraft}
                disabled={isAutoSaving || totals.employees === 0 || submissionStatus === 'pending' || submissionStatus === 'approved'}
                className="bg-white/10 hover:bg-white/20 border border-white/30 text-white font-semibold py-4 rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isAutoSaving ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    Saving...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    💾 Save Draft
                  </span>
                )}
              </button>

              {/* Submit Button */}
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || totals.employees === 0 || submissionStatus === 'pending' || submissionStatus === 'approved'}
                className="bg-gradient-to-r from-blue-500 to-blue-600 disabled:from-gray-600 disabled:to-gray-700 text-white font-semibold py-4 rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    {rejectedSubmissionId ? 'Resubmitting...' : 'Submitting...'}
                  </span>
                ) : submissionStatus === 'pending' ? (
                  <span className="flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-5 h-5" />
                    Submitted
                  </span>
                ) : submissionStatus === 'approved' ? (
                  <span className="flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-5 h-5" />
                    Approved
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    {rejectedSubmissionId ? '🔄 Resubmit' : '✅ Submit'}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ✅ Helper function for time ago formatting
function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000)
  
  if (seconds < 10) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
