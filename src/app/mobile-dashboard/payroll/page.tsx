'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { supabase as dataSupabase } from '@/lib/supabaseClient'
import { ChevronLeft, AlertCircle, CheckCircle, Clock, XCircle, FileDown, Send } from 'lucide-react'

// I AM CFO Brand Colors
const BRAND_COLORS = {
  primary: '#56B6E9',
  secondary: '#3A9BD1',
  tertiary: '#7CC4ED',
  accent: '#2E86C1',
  success: '#27AE60',
  warning: '#F39C12',
  danger: '#E74C3C',
  gray: {
    50: '#F8FAFC',
    100: '#F1F5F9',
    200: '#E2E8F0'
  }
}

interface LocationStatus {
  location_id: string
  location_name: string
  submission_id?: string
  pay_date: string
  payroll_group: 'A' | 'B'
  period_start: string
  period_end: string
  status: 'approved' | 'pending' | 'rejected' | 'not_submitted'
  total_amount?: number
  employee_count?: number
  submitted_by?: string
  submitted_at?: string
}

export default function MobilePayrollOverview() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [locations, setLocations] = useState<LocationStatus[]>([])
  const [userRole, setUserRole] = useState<string | null>(null)
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [summaryStats, setSummaryStats] = useState({
    totalLocations: 0,
    totalAmount: 0,
    approvedCount: 0,
    pendingCount: 0,
    notSubmittedCount: 0
  })

  useEffect(() => {
    loadPayrollStatus()
  }, [])

  const loadPayrollStatus = async () => {
    try {
      console.log('🔍 Loading payroll status...')
      setLoading(true)

      // Get authenticated user
      const platformClient = createClient()
      const { data: { user }, error: authError } = await platformClient.auth.getUser()

      if (authError || !user) {
        console.error('❌ Auth error:', authError)
        router.push('/login')
        return
      }

      console.log('✅ User authenticated:', user.email)

      // Get user role and organization from platform Supabase
      const { data: userData, error: userError } = await platformClient
        .from('users')
        .select('role, organization_id')
        .eq('id', user.id)
        .single()

      if (userError || !userData) {
        console.error('❌ User data error:', userError)
        return
      }

      console.log('✅ User role:', userData.role)
      setUserRole(userData.role)
      setOrganizationId(userData.organization_id)

      // Get locations from client data Supabase
      const { data: locationsData, error: locationsError } = await dataSupabase
        .from('locations')
        .select('id, name')
        .eq('organization_id', userData.organization_id)

      if (locationsError) {
        console.error('❌ Locations error:', locationsError)
        return
      }

      console.log('✅ Loaded locations:', locationsData?.length)

      // Get next Friday as default pay date
      const nextFriday = getNextFriday()
      const { payrollGroup, periodStart, periodEnd } = calculatePayrollInfo(nextFriday)

      // Get submissions for this pay period
      const { data: submissionsData, error: submissionsError } = await dataSupabase
        .from('payroll_submissions')
        .select(`
          id,
          location_id,
          pay_date,
          payroll_group,
          period_start,
          period_end,
          total_amount,
          employee_count,
          status,
          submitted_by,
          submitted_at
        `)
        .eq('organization_id', userData.organization_id)
        .eq('pay_date', nextFriday)

      if (submissionsError) {
        console.error('❌ Submissions error:', submissionsError)
      }

      console.log('✅ Loaded submissions:', submissionsData?.length || 0)

      // Build location status array
      const locationStatuses: LocationStatus[] = (locationsData || []).map((location) => {
        const submission = submissionsData?.find(s => s.location_id === location.id)

        if (submission) {
          return {
            location_id: location.id,
            location_name: location.name,
            submission_id: submission.id,
            pay_date: submission.pay_date,
            payroll_group: submission.payroll_group as 'A' | 'B',
            period_start: submission.period_start,
            period_end: submission.period_end,
            status: submission.status as 'approved' | 'pending' | 'rejected',
            total_amount: submission.total_amount,
            employee_count: submission.employee_count,
            submitted_by: submission.submitted_by,
            submitted_at: submission.submitted_at
          }
        } else {
          return {
            location_id: location.id,
            location_name: location.name,
            pay_date: nextFriday,
            payroll_group: payrollGroup,
            period_start: periodStart,
            period_end: periodEnd,
            status: 'not_submitted'
          }
        }
      })

      setLocations(locationStatuses)

      // Calculate summary stats
      const stats = {
        totalLocations: locationStatuses.length,
        totalAmount: locationStatuses.reduce((sum, loc) => sum + (loc.total_amount || 0), 0),
        approvedCount: locationStatuses.filter(loc => loc.status === 'approved').length,
        pendingCount: locationStatuses.filter(loc => loc.status === 'pending').length,
        notSubmittedCount: locationStatuses.filter(loc => loc.status === 'not_submitted').length
      }
      setSummaryStats(stats)

      console.log('✅ Summary stats:', stats)

    } catch (error) {
      console.error('❌ Error loading payroll status:', error)
    } finally {
      setLoading(false)
    }
  }

  const getNextFriday = () => {
    const today = new Date()
    const dayOfWeek = today.getDay()
    const daysUntilFriday = dayOfWeek <= 5 ? 5 - dayOfWeek : 7 - dayOfWeek + 5
    const nextFriday = new Date(today)
    nextFriday.setDate(today.getDate() + daysUntilFriday)
    
    const year = nextFriday.getFullYear()
    const month = String(nextFriday.getMonth() + 1).padStart(2, '0')
    const day = String(nextFriday.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const calculatePayrollInfo = (payDateStr: string) => {
    const [year, month, day] = payDateStr.split('-').map(Number)
    const payDate = new Date(year, month - 1, day)
    
    // Period end: 9 days before pay date (Wednesday)
    const periodEndDate = new Date(payDate)
    periodEndDate.setDate(payDate.getDate() - 9)
    
    // Period start: 14 days before period end (Thursday)
    const periodStartDate = new Date(periodEndDate)
    periodStartDate.setDate(periodEndDate.getDate() - 13)
    
    // Determine payroll group (alternating A/B weekly)
    const referenceDate = new Date(2025, 0, 3) // Jan 3, 2025 = Group A
    const weeksDiff = Math.floor((payDate.getTime() - referenceDate.getTime()) / (7 * 24 * 60 * 60 * 1000))
    const payrollGroup: 'A' | 'B' = weeksDiff % 2 === 0 ? 'A' : 'B'
    
    const formatDate = (date: Date) => {
      const y = date.getFullYear()
      const m = String(date.getMonth() + 1).padStart(2, '0')
      const d = String(date.getDate()).padStart(2, '0')
      return `${y}-${m}-${d}`
    }
    
    return {
      payrollGroup,
      periodStart: formatDate(periodStartDate),
      periodEnd: formatDate(periodEndDate)
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00Z')
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      timeZone: 'UTC'
    })
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return BRAND_COLORS.success
      case 'pending': return BRAND_COLORS.warning
      case 'rejected': return '#f97316' // orange
      case 'not_submitted': return BRAND_COLORS.danger
      default: return BRAND_COLORS.gray[200]
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return CheckCircle
      case 'pending': return Clock
      case 'rejected': return XCircle
      case 'not_submitted': return AlertCircle
      default: return AlertCircle
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'approved': return 'Approved'
      case 'pending': return 'Pending Approval'
      case 'rejected': return 'Needs Changes'
      case 'not_submitted': return 'Not Submitted'
      default: return 'Unknown'
    }
  }

  const handleCardClick = (location: LocationStatus) => {
    if (location.status === 'not_submitted' || location.status === 'rejected') {
      // Route to submit page
      router.push(`/mobile-dashboard/payroll/submit?location=${location.location_id}`)
    } else if (location.status === 'pending' && (userRole === 'super_admin' || userRole === 'admin')) {
      // Route to approve page
      router.push(`/mobile-dashboard/payroll/approve/${location.submission_id}`)
    } else if (location.status === 'approved') {
      // Route to view/export page
      router.push(`/mobile-dashboard/payroll/view/${location.submission_id}`)
    }
  }

  const getActionText = (location: LocationStatus) => {
    if (location.status === 'not_submitted' || location.status === 'rejected') {
      return 'Submit Hours'
    } else if (location.status === 'pending' && (userRole === 'super_admin' || userRole === 'admin')) {
      return 'Review & Approve'
    } else if (location.status === 'approved') {
      return 'View & Export'
    }
    return 'View Details'
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: BRAND_COLORS.gray[50],
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: `4px solid ${BRAND_COLORS.gray[200]}`,
            borderTop: `4px solid ${BRAND_COLORS.primary}`,
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px'
          }} />
          <p style={{ color: BRAND_COLORS.accent, fontSize: '14px' }}>Loading payroll...</p>
        </div>
        <style jsx>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    )
  }

  return (
    <div style={{ 
      minHeight: '100vh',
      background: BRAND_COLORS.gray[50],
      padding: '16px',
      paddingBottom: '80px'
    }}>
      <style jsx>{`
        @keyframes slideDown {
          0% {
            opacity: 0;
            transform: translateY(-10px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      {/* Header */}
      <header style={{
        background: `linear-gradient(135deg, ${BRAND_COLORS.primary}, ${BRAND_COLORS.secondary})`,
        borderRadius: '16px',
        padding: '20px',
        marginBottom: '24px',
        color: 'white',
        boxShadow: `0 8px 32px ${BRAND_COLORS.primary}33`
      }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
          <button
            onClick={() => router.push('/mobile-dashboard')}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              borderRadius: '8px',
              padding: '8px',
              color: 'white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <ChevronLeft size={24} />
          </button>
          <h1 style={{ 
            fontSize: '24px', 
            fontWeight: 'bold', 
            margin: '0 auto',
            textAlign: 'center',
            flex: 1
          }}>
            Payroll Overview
          </h1>
        </div>

        {/* Summary Stats */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.15)',
          borderRadius: '12px',
          padding: '16px',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.2)'
        }}>
          <div style={{ textAlign: 'center', marginBottom: '12px' }}>
            <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '4px' }}>
              Total Payroll Amount
            </div>
            <div style={{ fontSize: '28px', fontWeight: 'bold' }}>
              {formatCurrency(summaryStats.totalAmount)}
            </div>
          </div>
          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(3, 1fr)', 
            gap: '12px',
            textAlign: 'center'
          }}>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                {summaryStats.approvedCount}
              </div>
              <div style={{ fontSize: '11px', opacity: 0.9 }}>Approved</div>
            </div>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                {summaryStats.pendingCount}
              </div>
              <div style={{ fontSize: '11px', opacity: 0.9 }}>Pending</div>
            </div>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                {summaryStats.notSubmittedCount}
              </div>
              <div style={{ fontSize: '11px', opacity: 0.9 }}>Not Submitted</div>
            </div>
          </div>
        </div>
      </header>

      {/* Location Cards */}
      <div style={{ display: 'grid', gap: '16px' }}>
        {locations.map((location) => {
          const StatusIcon = getStatusIcon(location.status)
          const statusColor = getStatusColor(location.status)

          return (
            <div
              key={location.location_id}
              onClick={() => handleCardClick(location)}
              style={{
                background: 'white',
                borderRadius: '16px',
                padding: '20px',
                border: `3px solid ${statusColor}`,
                boxShadow: `0 4px 16px ${statusColor}30`,
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                position: 'relative',
                overflow: 'hidden'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)'
                e.currentTarget.style.boxShadow = `0 8px 24px ${statusColor}40`
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = `0 4px 16px ${statusColor}30`
              }}
            >
              {/* Status Badge */}
              <div style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                background: statusColor,
                borderRadius: '20px',
                padding: '6px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: `0 2px 8px ${statusColor}40`
              }}>
                <StatusIcon size={14} style={{ color: 'white' }} />
                <span style={{ 
                  fontSize: '11px', 
                  fontWeight: '700', 
                  color: 'white',
                  textTransform: 'uppercase'
                }}>
                  {getStatusText(location.status)}
                </span>
              </div>

              {/* Location Name */}
              <h3 style={{ 
                fontSize: '20px', 
                fontWeight: 'bold', 
                marginBottom: '12px',
                color: BRAND_COLORS.accent,
                paddingRight: '120px'
              }}>
                {location.location_name}
              </h3>

              {/* Pay Period Info */}
              <div style={{
                background: BRAND_COLORS.gray[50],
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '12px'
              }}>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: '1fr 1fr',
                  gap: '12px',
                  fontSize: '12px'
                }}>
                  <div>
                    <div style={{ color: '#64748b', marginBottom: '4px' }}>Pay Date</div>
                    <div style={{ fontWeight: '700', color: BRAND_COLORS.accent }}>
                      {formatDate(location.pay_date)}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: '#64748b', marginBottom: '4px' }}>Group</div>
                    <div style={{ 
                      fontWeight: '700', 
                      color: BRAND_COLORS.accent,
                      fontSize: '14px'
                    }}>
                      Group {location.payroll_group}
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: `1px solid ${BRAND_COLORS.gray[200]}` }}>
                  <div style={{ color: '#64748b', fontSize: '11px', marginBottom: '4px' }}>
                    Pay Period
                  </div>
                  <div style={{ fontWeight: '600', color: BRAND_COLORS.accent, fontSize: '13px' }}>
                    {formatDate(location.period_start)} - {formatDate(location.period_end)}
                  </div>
                </div>
              </div>

              {/* Submission Details */}
              {location.status !== 'not_submitted' && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '12px',
                  marginBottom: '12px'
                }}>
                  <div style={{
                    background: `${BRAND_COLORS.success}10`,
                    borderRadius: '8px',
                    padding: '10px',
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: BRAND_COLORS.success }}>
                      {formatCurrency(location.total_amount || 0)}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                      Total Amount
                    </div>
                  </div>
                  <div style={{
                    background: `${BRAND_COLORS.primary}10`,
                    borderRadius: '8px',
                    padding: '10px',
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: BRAND_COLORS.primary }}>
                      {location.employee_count || 0}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                      Employees
                    </div>
                  </div>
                </div>
              )}

              {/* Action Button */}
              <button
                style={{
                  width: '100%',
                  padding: '14px',
                  background: `linear-gradient(135deg, ${statusColor}, ${statusColor}dd)`,
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: `0 4px 12px ${statusColor}30`
                }}
              >
                {location.status === 'approved' ? (
                  <>
                    <FileDown size={18} />
                    {getActionText(location)}
                  </>
                ) : location.status === 'not_submitted' || location.status === 'rejected' ? (
                  <>
                    <Send size={18} />
                    {getActionText(location)}
                  </>
                ) : (
                  <>
                    <CheckCircle size={18} />
                    {getActionText(location)}
                  </>
                )}
              </button>

              {/* Submission Info */}
              {location.submitted_at && (
                <div style={{
                  marginTop: '12px',
                  fontSize: '11px',
                  color: '#94a3b8',
                  textAlign: 'center'
                }}>
                  Submitted {new Date(location.submitted_at).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Empty State */}
      {locations.length === 0 && (
        <div style={{
          background: 'white',
          borderRadius: '16px',
          padding: '40px 20px',
          textAlign: 'center',
          border: `2px dashed ${BRAND_COLORS.gray[200]}`
        }}>
          <AlertCircle size={48} style={{ color: BRAND_COLORS.gray[200], marginBottom: '16px' }} />
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: BRAND_COLORS.accent, marginBottom: '8px' }}>
            No Locations Found
          </h3>
          <p style={{ fontSize: '14px', color: '#64748b' }}>
            Add locations to start managing payroll submissions
          </p>
        </div>
      )}
    </div>
  )
}
