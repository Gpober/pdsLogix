'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { supabase as dataSupabase } from '@/lib/supabaseClient'
import { ChevronLeft, AlertTriangle, DollarSign, Clock, TrendingDown } from 'lucide-react'

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
    200: '#E2E8F0',
    300: '#CBD5E1',
    400: '#94A3B8',
    500: '#64748B',
    600: '#475569',
    700: '#334155',
    800: '#1E293B',
    900: '#0F172A'
  }
}

interface Vendor {
  id: string
  name: string
  current: number
  days_30: number
  days_60: number
  days_90: number
  over_90: number
  total: number
}

interface APDetail {
  bill_date: string
  bill_number: string
  amount: number
  days_outstanding: number
  aging_bucket: string
}

export default function MobileAPAgingPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'overview' | 'detail'>('overview')
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null)
  const [apDetails, setAPDetails] = useState<APDetail[]>([])
  const [totalAP, setTotalAP] = useState(0)
  const [totalCurrent, setTotalCurrent] = useState(0)
  const [totalOverdue, setTotalOverdue] = useState(0)

  useEffect(() => {
    if (view === 'overview') {
      loadAPOverview()
    }
  }, [view])

  const loadAPOverview = async () => {
    try {
      setLoading(true)
      console.log('📊 Loading A/P aging overview...')

      const supabase = createClient()
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      
      if (authError || !user) {
        console.error('❌ Auth error:', authError)
        router.push('/login')
        return
      }

      const { data: userAccount, error: accountError } = await dataSupabase
        .from('user_accounts')
        .select('company_id')
        .eq('user_id', user.id)
        .single()

      if (accountError || !userAccount) {
        console.error('❌ Company lookup error:', accountError)
        return
      }

      const { data: apData, error: apError } = await dataSupabase
        .from('ap_aging')
        .select('*')
        .eq('company_id', userAccount.company_id)
        .order('vendor_name', { ascending: true })

      if (apError) {
        console.error('❌ A/P error:', apError)
        return
      }

      console.log('✅ A/P data:', apData)

      const vendorMap = new Map<string, Vendor>()
      let totalAPAmount = 0
      let totalCurrentAmount = 0
      let totalOverdueAmount = 0

      apData?.forEach(row => {
        const vendorId = row.vendor_id || 'unknown'
        const vendorName = row.vendor_name || 'Unknown Vendor'
        const current = Number(row.current || 0)
        const days30 = Number(row.days_30 || 0)
        const days60 = Number(row.days_60 || 0)
        const days90 = Number(row.days_90 || 0)
        const over90 = Number(row.over_90 || 0)
        const total = current + days30 + days60 + days90 + over90

        totalAPAmount += total
        totalCurrentAmount += current
        totalOverdueAmount += (days30 + days60 + days90 + over90)

        if (!vendorMap.has(vendorId)) {
          vendorMap.set(vendorId, {
            id: vendorId,
            name: vendorName,
            current: 0,
            days_30: 0,
            days_60: 0,
            days_90: 0,
            over_90: 0,
            total: 0
          })
        }

        const vendor = vendorMap.get(vendorId)!
        vendor.current += current
        vendor.days_30 += days30
        vendor.days_60 += days60
        vendor.days_90 += days90
        vendor.over_90 += over90
        vendor.total += total
      })

      setTotalAP(totalAPAmount)
      setTotalCurrent(totalCurrentAmount)
      setTotalOverdue(totalOverdueAmount)
      setVendors(Array.from(vendorMap.values()).sort((a, b) => b.total - a.total))

    } catch (error) {
      console.error('❌ Error loading A/P:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadVendorDetail = async (vendor: Vendor) => {
    try {
      setLoading(true)
      console.log('📊 Loading vendor A/P detail...')

      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: userAccount } = await dataSupabase
        .from('user_accounts')
        .select('company_id')
        .eq('user_id', user.id)
        .single()

      if (!userAccount) return

      const { data: apData, error } = await dataSupabase
        .from('ap_aging')
        .select('*')
        .eq('company_id', userAccount.company_id)
        .eq('vendor_id', vendor.id)
        .order('bill_date', { ascending: false })

      if (error) {
        console.error('❌ Error loading detail:', error)
        return
      }

      const details: APDetail[] = apData?.map(row => {
        let agingBucket = 'Current'
        let daysOutstanding = 0

        if (row.over_90 > 0) {
          agingBucket = '90+ Days'
          daysOutstanding = 91
        } else if (row.days_90 > 0) {
          agingBucket = '61-90 Days'
          daysOutstanding = 75
        } else if (row.days_60 > 0) {
          agingBucket = '31-60 Days'
          daysOutstanding = 45
        } else if (row.days_30 > 0) {
          agingBucket = '1-30 Days'
          daysOutstanding = 15
        }

        return {
          bill_date: new Date(row.bill_date).toLocaleDateString(),
          bill_number: row.bill_number || 'N/A',
          amount: Number(row.current || row.days_30 || row.days_60 || row.days_90 || row.over_90 || 0),
          days_outstanding: daysOutstanding,
          aging_bucket: agingBucket
        }
      }) || []

      setAPDetails(details)
      setSelectedVendor(vendor)
      setView('detail')

    } catch (error) {
      console.error('❌ Error loading vendor detail:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    if (view === 'detail') {
      setView('overview')
      setSelectedVendor(null)
    } else {
      router.push('/mobile-dashboard')
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const getAgingColor = (bucket: string) => {
    switch (bucket) {
      case 'Current': return BRAND_COLORS.success
      case '1-30 Days': return BRAND_COLORS.primary
      case '31-60 Days': return BRAND_COLORS.warning
      case '61-90 Days': return '#FF6B35'
      case '90+ Days': return BRAND_COLORS.danger
      default: return BRAND_COLORS.gray[500]
    }
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: `linear-gradient(135deg, ${BRAND_COLORS.primary} 0%, ${BRAND_COLORS.secondary} 100%)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{
          background: 'white',
          borderRadius: '16px',
          padding: '32px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            border: `4px solid ${BRAND_COLORS.primary}`,
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
          <style jsx>{`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: `linear-gradient(135deg, ${BRAND_COLORS.primary} 0%, ${BRAND_COLORS.secondary} 100%)`,
      paddingBottom: '32px'
    }}>
      {/* Header */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.98)',
        backdropFilter: 'blur(10px)',
        borderBottom: `3px solid ${BRAND_COLORS.primary}`,
        padding: '20px',
        position: 'sticky',
        top: 0,
        zIndex: 10,
        boxShadow: '0 2px 20px rgba(0,0,0,0.1)'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px'
        }}>
          <button
            onClick={handleBack}
            style={{
              background: BRAND_COLORS.primary,
              border: 'none',
              borderRadius: '12px',
              width: '44px',
              height: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(86, 182, 233, 0.3)',
              transition: 'all 0.2s ease'
            }}
          >
            <ChevronLeft size={24} color="white" />
          </button>
          <div style={{ flex: 1 }}>
            <h1 style={{
              margin: 0,
              fontSize: '24px',
              fontWeight: 'bold',
              color: BRAND_COLORS.gray[900]
            }}>
              {view === 'detail' ? selectedVendor?.name : 'A/P Aging'}
            </h1>
            <p style={{
              margin: 0,
              fontSize: '14px',
              color: BRAND_COLORS.gray[600]
            }}>
              {view === 'detail' ? 'Bill Details' : 'Outstanding Payables'}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '20px' }}>
        {view === 'overview' ? (
          <>
            {/* Summary Cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr',
              gap: '16px',
              marginBottom: '24px'
            }}>
              {/* Total A/P */}
              <div style={{
                background: 'white',
                borderRadius: '16px',
                padding: '20px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: '8px'
                }}>
                  <div style={{
                    background: `${BRAND_COLORS.primary}20`,
                    borderRadius: '12px',
                    padding: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <DollarSign size={20} color={BRAND_COLORS.primary} />
                  </div>
                  <span style={{
                    fontSize: '14px',
                    color: BRAND_COLORS.gray[600],
                    fontWeight: '500'
                  }}>Total Outstanding</span>
                </div>
                <div style={{
                  fontSize: '28px',
                  fontWeight: 'bold',
                  color: BRAND_COLORS.primary
                }}>
                  {formatCurrency(totalAP)}
                </div>
              </div>

              {/* Current */}
              <div style={{
                background: 'white',
                borderRadius: '16px',
                padding: '20px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: '8px'
                }}>
                  <div style={{
                    background: `${BRAND_COLORS.success}20`,
                    borderRadius: '12px',
                    padding: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <TrendingDown size={20} color={BRAND_COLORS.success} />
                  </div>
                  <span style={{
                    fontSize: '14px',
                    color: BRAND_COLORS.gray[600],
                    fontWeight: '500'
                  }}>Current (0-30 Days)</span>
                </div>
                <div style={{
                  fontSize: '28px',
                  fontWeight: 'bold',
                  color: BRAND_COLORS.success
                }}>
                  {formatCurrency(totalCurrent)}
                </div>
              </div>

              {/* Overdue */}
              <div style={{
                background: 'white',
                borderRadius: '16px',
                padding: '20px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                border: `2px solid ${BRAND_COLORS.danger}`
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: '8px'
                }}>
                  <div style={{
                    background: `${BRAND_COLORS.danger}20`,
                    borderRadius: '12px',
                    padding: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <AlertTriangle size={20} color={BRAND_COLORS.danger} />
                  </div>
                  <span style={{
                    fontSize: '14px',
                    color: BRAND_COLORS.gray[600],
                    fontWeight: '500'
                  }}>Overdue (30+ Days)</span>
                </div>
                <div style={{
                  fontSize: '28px',
                  fontWeight: 'bold',
                  color: BRAND_COLORS.danger
                }}>
                  {formatCurrency(totalOverdue)}
                </div>
              </div>
            </div>

            {/* Vendor List */}
            <h2 style={{
              fontSize: '18px',
              fontWeight: 'bold',
              color: 'white',
              marginBottom: '16px',
              textShadow: '0 2px 4px rgba(0,0,0,0.2)'
            }}>
              By Vendor
            </h2>

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              {vendors.map(vendor => (
                <button
                  key={vendor.id}
                  onClick={() => loadVendorDetail(vendor)}
                  style={{
                    background: 'white',
                    border: 'none',
                    borderRadius: '16px',
                    padding: '20px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-4px)'
                    e.currentTarget.style.boxShadow = '0 8px 30px rgba(0,0,0,0.15)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.08)'
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '16px'
                  }}>
                    <div style={{
                      fontSize: '16px',
                      fontWeight: '600',
                      color: BRAND_COLORS.gray[900]
                    }}>
                      {vendor.name}
                    </div>
                    <div style={{
                      fontSize: '18px',
                      fontWeight: 'bold',
                      color: BRAND_COLORS.primary
                    }}>
                      {formatCurrency(vendor.total)}
                    </div>
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '8px',
                    fontSize: '12px'
                  }}>
                    <div style={{
                      background: `${BRAND_COLORS.success}10`,
                      padding: '8px',
                      borderRadius: '8px'
                    }}>
                      <div style={{ color: BRAND_COLORS.gray[600], marginBottom: '2px' }}>
                        Current
                      </div>
                      <div style={{ color: BRAND_COLORS.success, fontWeight: '600' }}>
                        {formatCurrency(vendor.current)}
                      </div>
                    </div>

                    <div style={{
                      background: `${BRAND_COLORS.primary}10`,
                      padding: '8px',
                      borderRadius: '8px'
                    }}>
                      <div style={{ color: BRAND_COLORS.gray[600], marginBottom: '2px' }}>
                        1-30 Days
                      </div>
                      <div style={{ color: BRAND_COLORS.primary, fontWeight: '600' }}>
                        {formatCurrency(vendor.days_30)}
                      </div>
                    </div>

                    <div style={{
                      background: `${BRAND_COLORS.warning}10`,
                      padding: '8px',
                      borderRadius: '8px'
                    }}>
                      <div style={{ color: BRAND_COLORS.gray[600], marginBottom: '2px' }}>
                        31-60 Days
                      </div>
                      <div style={{ color: BRAND_COLORS.warning, fontWeight: '600' }}>
                        {formatCurrency(vendor.days_60)}
                      </div>
                    </div>

                    <div style={{
                      background: `${BRAND_COLORS.danger}10`,
                      padding: '8px',
                      borderRadius: '8px'
                    }}>
                      <div style={{ color: BRAND_COLORS.gray[600], marginBottom: '2px' }}>
                        60+ Days
                      </div>
                      <div style={{ color: BRAND_COLORS.danger, fontWeight: '600' }}>
                        {formatCurrency(vendor.days_90 + vendor.over_90)}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            {/* Detail View */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              {apDetails.map((detail, index) => (
                <div
                  key={index}
                  style={{
                    background: 'white',
                    borderRadius: '16px',
                    padding: '20px',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                    borderLeft: `4px solid ${getAgingColor(detail.aging_bucket)}`
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'start',
                    marginBottom: '12px'
                  }}>
                    <div>
                      <div style={{
                        fontSize: '14px',
                        fontWeight: '600',
                        color: BRAND_COLORS.gray[900],
                        marginBottom: '4px'
                      }}>
                        Bill {detail.bill_number}
                      </div>
                      <div style={{
                        fontSize: '12px',
                        color: BRAND_COLORS.gray[600]
                      }}>
                        {detail.bill_date}
                      </div>
                    </div>
                    <div style={{
                      fontSize: '18px',
                      fontWeight: 'bold',
                      color: BRAND_COLORS.primary
                    }}>
                      {formatCurrency(detail.amount)}
                    </div>
                  </div>

                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    paddingTop: '12px',
                    borderTop: `1px solid ${BRAND_COLORS.gray[200]}`
                  }}>
                    <Clock size={14} color={getAgingColor(detail.aging_bucket)} />
                    <div style={{
                      fontSize: '13px',
                      color: getAgingColor(detail.aging_bucket),
                      fontWeight: '600'
                    }}>
                      {detail.aging_bucket}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
