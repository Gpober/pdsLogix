'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { supabase as dataSupabase } from '@/lib/supabaseClient'
import { ChevronLeft, TrendingUp, TrendingDown, DollarSign, Calendar } from 'lucide-react'

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

interface Customer {
  id: string
  name: string
  total_inflows: number
  total_outflows: number
  net_cash_flow: number
}

interface CashFlowData {
  customer_id: string
  customer_name: string
  period: string
  cash_inflows: number
  cash_outflows: number
  net_cash_flow: number
}

export default function MobileCashFlowPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'overview' | 'detail'>('overview')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [cashFlowDetails, setCashFlowDetails] = useState<CashFlowData[]>([])
  const [totalInflows, setTotalInflows] = useState(0)
  const [totalOutflows, setTotalOutflows] = useState(0)
  const [netCashFlow, setNetCashFlow] = useState(0)

  useEffect(() => {
    if (view === 'overview') {
      loadCashFlowOverview()
    }
  }, [view])

  const loadCashFlowOverview = async () => {
    try {
      setLoading(true)
      console.log('📊 Loading cash flow overview...')

      // Get auth user
      const supabase = createClient()
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      
      if (authError || !user) {
        console.error('❌ Auth error:', authError)
        router.push('/login')
        return
      }

      // Get company_id from user_accounts
      const { data: userAccount, error: accountError } = await dataSupabase
        .from('user_accounts')
        .select('company_id')
        .eq('user_id', user.id)
        .single()

      if (accountError || !userAccount) {
        console.error('❌ Company lookup error:', accountError)
        return
      }

      // Get cash flow data
      const { data: cashFlowData, error: cashFlowError } = await dataSupabase
        .from('cash_flow_statement')
        .select('*')
        .eq('company_id', userAccount.company_id)
        .order('period_start', { ascending: false })

      if (cashFlowError) {
        console.error('❌ Cash flow error:', cashFlowError)
        return
      }

      console.log('✅ Cash flow data:', cashFlowData)

      // Aggregate by customer
      const customerMap = new Map<string, Customer>()
      let totalIn = 0
      let totalOut = 0

      cashFlowData?.forEach(row => {
        const customerId = row.customer_id || 'unknown'
        const customerName = row.customer_name || 'Unknown Customer'
        const inflows = Number(row.operating_activities_inflows || 0)
        const outflows = Number(row.operating_activities_outflows || 0)

        totalIn += inflows
        totalOut += outflows

        if (!customerMap.has(customerId)) {
          customerMap.set(customerId, {
            id: customerId,
            name: customerName,
            total_inflows: 0,
            total_outflows: 0,
            net_cash_flow: 0
          })
        }

        const customer = customerMap.get(customerId)!
        customer.total_inflows += inflows
        customer.total_outflows += outflows
        customer.net_cash_flow = customer.total_inflows - customer.total_outflows
      })

      setTotalInflows(totalIn)
      setTotalOutflows(totalOut)
      setNetCashFlow(totalIn - totalOut)
      setCustomers(Array.from(customerMap.values()).sort((a, b) => 
        Math.abs(b.net_cash_flow) - Math.abs(a.net_cash_flow)
      ))

    } catch (error) {
      console.error('❌ Error loading cash flow:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadCustomerDetail = async (customer: Customer) => {
    try {
      setLoading(true)
      console.log('📊 Loading customer cash flow detail...')

      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: userAccount } = await dataSupabase
        .from('user_accounts')
        .select('company_id')
        .eq('user_id', user.id)
        .single()

      if (!userAccount) return

      const { data: cashFlowData, error } = await dataSupabase
        .from('cash_flow_statement')
        .select('*')
        .eq('company_id', userAccount.company_id)
        .eq('customer_id', customer.id)
        .order('period_start', { ascending: false })

      if (error) {
        console.error('❌ Error loading detail:', error)
        return
      }

      const details: CashFlowData[] = cashFlowData?.map(row => ({
        customer_id: row.customer_id,
        customer_name: row.customer_name,
        period: `${new Date(row.period_start).toLocaleDateString()} - ${new Date(row.period_end).toLocaleDateString()}`,
        cash_inflows: Number(row.operating_activities_inflows || 0),
        cash_outflows: Number(row.operating_activities_outflows || 0),
        net_cash_flow: Number(row.operating_activities_inflows || 0) - Number(row.operating_activities_outflows || 0)
      })) || []

      setCashFlowDetails(details)
      setSelectedCustomer(customer)
      setView('detail')

    } catch (error) {
      console.error('❌ Error loading customer detail:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    if (view === 'detail') {
      setView('overview')
      setSelectedCustomer(null)
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
              {view === 'detail' ? selectedCustomer?.name : 'Cash Flow'}
            </h1>
            <p style={{
              margin: 0,
              fontSize: '14px',
              color: BRAND_COLORS.gray[600]
            }}>
              {view === 'detail' ? 'Period Details' : 'By Customer'}
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
              {/* Total Inflows */}
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
                    <TrendingUp size={20} color={BRAND_COLORS.success} />
                  </div>
                  <span style={{
                    fontSize: '14px',
                    color: BRAND_COLORS.gray[600],
                    fontWeight: '500'
                  }}>Total Inflows</span>
                </div>
                <div style={{
                  fontSize: '28px',
                  fontWeight: 'bold',
                  color: BRAND_COLORS.success
                }}>
                  {formatCurrency(totalInflows)}
                </div>
              </div>

              {/* Total Outflows */}
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
                    background: `${BRAND_COLORS.danger}20`,
                    borderRadius: '12px',
                    padding: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <TrendingDown size={20} color={BRAND_COLORS.danger} />
                  </div>
                  <span style={{
                    fontSize: '14px',
                    color: BRAND_COLORS.gray[600],
                    fontWeight: '500'
                  }}>Total Outflows</span>
                </div>
                <div style={{
                  fontSize: '28px',
                  fontWeight: 'bold',
                  color: BRAND_COLORS.danger
                }}>
                  {formatCurrency(totalOutflows)}
                </div>
              </div>

              {/* Net Cash Flow */}
              <div style={{
                background: 'white',
                borderRadius: '16px',
                padding: '20px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                border: `2px solid ${netCashFlow >= 0 ? BRAND_COLORS.success : BRAND_COLORS.danger}`
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: '8px'
                }}>
                  <div style={{
                    background: `${netCashFlow >= 0 ? BRAND_COLORS.success : BRAND_COLORS.danger}20`,
                    borderRadius: '12px',
                    padding: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <DollarSign size={20} color={netCashFlow >= 0 ? BRAND_COLORS.success : BRAND_COLORS.danger} />
                  </div>
                  <span style={{
                    fontSize: '14px',
                    color: BRAND_COLORS.gray[600],
                    fontWeight: '500'
                  }}>Net Cash Flow</span>
                </div>
                <div style={{
                  fontSize: '28px',
                  fontWeight: 'bold',
                  color: netCashFlow >= 0 ? BRAND_COLORS.success : BRAND_COLORS.danger
                }}>
                  {formatCurrency(netCashFlow)}
                </div>
              </div>
            </div>

            {/* Customer List */}
            <h2 style={{
              fontSize: '18px',
              fontWeight: 'bold',
              color: 'white',
              marginBottom: '16px',
              textShadow: '0 2px 4px rgba(0,0,0,0.2)'
            }}>
              By Customer
            </h2>

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              {customers.map(customer => (
                <button
                  key={customer.id}
                  onClick={() => loadCustomerDetail(customer)}
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
                    fontSize: '16px',
                    fontWeight: '600',
                    color: BRAND_COLORS.gray[900],
                    marginBottom: '12px'
                  }}>
                    {customer.name}
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '12px',
                    fontSize: '13px'
                  }}>
                    <div>
                      <div style={{ color: BRAND_COLORS.gray[600], marginBottom: '4px' }}>
                        Inflows
                      </div>
                      <div style={{
                        color: BRAND_COLORS.success,
                        fontWeight: '600'
                      }}>
                        {formatCurrency(customer.total_inflows)}
                      </div>
                    </div>

                    <div>
                      <div style={{ color: BRAND_COLORS.gray[600], marginBottom: '4px' }}>
                        Outflows
                      </div>
                      <div style={{
                        color: BRAND_COLORS.danger,
                        fontWeight: '600'
                      }}>
                        {formatCurrency(customer.total_outflows)}
                      </div>
                    </div>
                  </div>

                  <div style={{
                    marginTop: '12px',
                    paddingTop: '12px',
                    borderTop: `1px solid ${BRAND_COLORS.gray[200]}`
                  }}>
                    <div style={{ color: BRAND_COLORS.gray[600], marginBottom: '4px', fontSize: '13px' }}>
                      Net Cash Flow
                    </div>
                    <div style={{
                      fontSize: '18px',
                      fontWeight: 'bold',
                      color: customer.net_cash_flow >= 0 ? BRAND_COLORS.success : BRAND_COLORS.danger
                    }}>
                      {formatCurrency(customer.net_cash_flow)}
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
              {cashFlowDetails.map((detail, index) => (
                <div
                  key={index}
                  style={{
                    background: 'white',
                    borderRadius: '16px',
                    padding: '20px',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '16px'
                  }}>
                    <Calendar size={16} color={BRAND_COLORS.gray[600]} />
                    <div style={{
                      fontSize: '14px',
                      color: BRAND_COLORS.gray[600],
                      fontWeight: '500'
                    }}>
                      {detail.period}
                    </div>
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '12px',
                    fontSize: '13px',
                    marginBottom: '12px'
                  }}>
                    <div>
                      <div style={{ color: BRAND_COLORS.gray[600], marginBottom: '4px' }}>
                        Inflows
                      </div>
                      <div style={{
                        color: BRAND_COLORS.success,
                        fontWeight: '600',
                        fontSize: '16px'
                      }}>
                        {formatCurrency(detail.cash_inflows)}
                      </div>
                    </div>

                    <div>
                      <div style={{ color: BRAND_COLORS.gray[600], marginBottom: '4px' }}>
                        Outflows
                      </div>
                      <div style={{
                        color: BRAND_COLORS.danger,
                        fontWeight: '600',
                        fontSize: '16px'
                      }}>
                        {formatCurrency(detail.cash_outflows)}
                      </div>
                    </div>
                  </div>

                  <div style={{
                    paddingTop: '12px',
                    borderTop: `1px solid ${BRAND_COLORS.gray[200]}`
                  }}>
                    <div style={{ color: BRAND_COLORS.gray[600], marginBottom: '4px', fontSize: '13px' }}>
                      Net Cash Flow
                    </div>
                    <div style={{
                      fontSize: '20px',
                      fontWeight: 'bold',
                      color: detail.net_cash_flow >= 0 ? BRAND_COLORS.success : BRAND_COLORS.danger
                    }}>
                      {formatCurrency(detail.net_cash_flow)}
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
