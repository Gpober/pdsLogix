'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, TrendingUp, TrendingDown, DollarSign, Calendar } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { supabase } from '@/lib/supabaseClient'
import ReportHeader from '@/components/mobile-dashboard/ReportHeader'

// I AM CFO Brand Colors
const BRAND_COLORS = {
  primary: '#56B6E9',
  secondary: '#3A9BD1',
  tertiary: '#7CC4ED',
  accent: '#2E86C1',
  success: '#27AE60',
  danger: '#E74C3C',
  warning: '#F39C12',
  gray: {
    50: '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#D1D5DB',
    700: '#374151',
    800: '#1F2937',
    900: '#111827'
  }
}

interface Customer {
  id: string
  name: string
  total_inflows: number
  total_outflows: number
  net_cash_flow: number
}

interface CashFlowDetail {
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
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [cashFlowDetails, setCashFlowDetails] = useState<CashFlowDetail[]>([])
  
  const [totalInflows, setTotalInflows] = useState(0)
  const [totalOutflows, setTotalOutflows] = useState(0)
  const [netCashFlow, setNetCashFlow] = useState(0)
  
  // Filter states
  const [reportPeriod, setReportPeriod] = useState<'monthly' | 'custom' | 'ytd' | 'trailing12' | 'quarterly'>('monthly')
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [year, setYear] = useState(new Date().getFullYear())
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  useEffect(() => {
    if (!selectedCustomer) {
      loadCashFlowData()
    }
  }, [reportPeriod, month, year, customStart, customEnd])

  const getDateRange = () => {
    const now = new Date()
    let startDate = ''
    let endDate = ''

    switch (reportPeriod) {
      case 'monthly':
        startDate = `${year}-${String(month).padStart(2, '0')}-01`
        const lastDay = new Date(year, month, 0).getDate()
        endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`
        break
      
      case 'ytd':
        startDate = `${year}-01-01`
        endDate = `${year}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
        break
      
      case 'trailing12':
        const trailing = new Date(now.getFullYear(), now.getMonth() - 12, 1)
        startDate = `${trailing.getFullYear()}-${String(trailing.getMonth() + 1).padStart(2, '0')}-01`
        endDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
        break
      
      case 'quarterly':
        const quarter = Math.floor((month - 1) / 3)
        const qStartMonth = quarter * 3 + 1
        const qEndMonth = qStartMonth + 2
        startDate = `${year}-${String(qStartMonth).padStart(2, '0')}-01`
        const qLastDay = new Date(year, qEndMonth, 0).getDate()
        endDate = `${year}-${String(qEndMonth).padStart(2, '0')}-${qLastDay}`
        break
      
      case 'custom':
        startDate = customStart
        endDate = customEnd
        break
    }

    return { startDate, endDate }
  }

  const loadCashFlowData = async () => {
    try {
      setLoading(true)

      // Get auth user
      const authClient = createClient()
      const { data: { user }, error: authError } = await authClient.auth.getUser()
      
      if (authError || !user) {
        console.error('Auth error:', authError)
        router.push('/login')
        return
      }

      // Get company_id
      const { data: userAccount, error: accountError } = await supabase
        .from('user_accounts')
        .select('company_id')
        .eq('user_id', user.id)
        .single()

      if (accountError || !userAccount) {
        console.error('Company lookup error:', accountError)
        return
      }

      const { startDate, endDate } = getDateRange()

      // Get cash flow data
      const { data: cashFlowData, error: cashFlowError } = await supabase
        .from('cash_flow_statement')
        .select('*')
        .eq('company_id', userAccount.company_id)
        .gte('period_start', startDate)
        .lte('period_end', endDate)
        .order('period_start', { ascending: false })

      if (cashFlowError) {
        console.error('Cash flow error:', cashFlowError)
        return
      }

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
      console.error('Error loading cash flow:', error)
      setCustomers([])
    } finally {
      setLoading(false)
    }
  }

  const loadCustomerDetail = async (customer: Customer) => {
    try {
      setLoading(true)

      const authClient = createClient()
      const { data: { user } } = await authClient.auth.getUser()
      if (!user) return

      const { data: userAccount } = await supabase
        .from('user_accounts')
        .select('company_id')
        .eq('user_id', user.id)
        .single()

      if (!userAccount) return

      const { startDate, endDate } = getDateRange()

      const { data: cashFlowData, error } = await supabase
        .from('cash_flow_statement')
        .select('*')
        .eq('company_id', userAccount.company_id)
        .eq('customer_id', customer.id)
        .gte('period_start', startDate)
        .lte('period_end', endDate)
        .order('period_start', { ascending: false })

      if (error) {
        console.error('Error loading detail:', error)
        return
      }

      const details: CashFlowDetail[] = cashFlowData?.map(row => ({
        customer_id: row.customer_id,
        customer_name: row.customer_name,
        period: `${new Date(row.period_start).toLocaleDateString()} - ${new Date(row.period_end).toLocaleDateString()}`,
        cash_inflows: Number(row.operating_activities_inflows || 0),
        cash_outflows: Number(row.operating_activities_outflows || 0),
        net_cash_flow: Number(row.operating_activities_inflows || 0) - Number(row.operating_activities_outflows || 0)
      })) || []

      setCashFlowDetails(details)
      setSelectedCustomer(customer)

    } catch (error) {
      console.error('Error loading customer detail:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleFiltersChange = (filters: any) => {
    setReportPeriod(filters.reportPeriod)
    setMonth(filters.month)
    setYear(filters.year)
    setCustomStart(filters.customStart)
    setCustomEnd(filters.customEnd)
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  if (selectedCustomer) {
    return (
      <div style={{
        minHeight: '100vh',
        background: `linear-gradient(135deg, ${BRAND_COLORS.primary} 0%, ${BRAND_COLORS.secondary} 100%)`,
        padding: '20px'
      }}>
        <div style={{
          background: 'white',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
        }}>
          <button
            onClick={() => setSelectedCustomer(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              background: BRAND_COLORS.gray[100],
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '500',
              color: BRAND_COLORS.gray[700],
              cursor: 'pointer',
              marginBottom: '24px'
            }}
          >
            ← Back to Customers
          </button>

          <h2 style={{
            fontSize: '24px',
            fontWeight: '700',
            color: BRAND_COLORS.gray[900],
            marginBottom: '8px'
          }}>
            {selectedCustomer.name}
          </h2>

          <p style={{
            fontSize: '14px',
            color: BRAND_COLORS.gray[700],
            marginBottom: '24px'
          }}>
            Cash Flow Details
          </p>

          {loading ? (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              padding: '40px'
            }}>
              <div style={{
                fontSize: '16px',
                color: BRAND_COLORS.gray[700]
              }}>
                Loading details...
              </div>
            </div>
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}>
              {cashFlowDetails.map((detail, index) => (
                <div
                  key={index}
                  style={{
                    padding: '16px',
                    background: BRAND_COLORS.gray[50],
                    borderRadius: '12px',
                    border: `1px solid ${BRAND_COLORS.gray[200]}`
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '16px'
                  }}>
                    <Calendar size={16} color={BRAND_COLORS.gray[700]} />
                    <div style={{
                      fontSize: '14px',
                      fontWeight: '600',
                      color: BRAND_COLORS.gray[700]
                    }}>
                      {detail.period}
                    </div>
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '12px',
                    marginBottom: '12px'
                  }}>
                    <div>
                      <div style={{
                        fontSize: '12px',
                        fontWeight: '500',
                        color: BRAND_COLORS.gray[700],
                        marginBottom: '4px'
                      }}>
                        Inflows
                      </div>
                      <div style={{
                        fontSize: '18px',
                        fontWeight: '700',
                        color: BRAND_COLORS.success
                      }}>
                        {formatCurrency(detail.cash_inflows)}
                      </div>
                    </div>

                    <div>
                      <div style={{
                        fontSize: '12px',
                        fontWeight: '500',
                        color: BRAND_COLORS.gray[700],
                        marginBottom: '4px'
                      }}>
                        Outflows
                      </div>
                      <div style={{
                        fontSize: '18px',
                        fontWeight: '700',
                        color: BRAND_COLORS.danger
                      }}>
                        {formatCurrency(detail.cash_outflows)}
                      </div>
                    </div>
                  </div>

                  <div style={{
                    paddingTop: '12px',
                    borderTop: `1px solid ${BRAND_COLORS.gray[200]}`
                  }}>
                    <div style={{
                      fontSize: '12px',
                      fontWeight: '500',
                      color: BRAND_COLORS.gray[700],
                      marginBottom: '4px'
                    }}>
                      Net Cash Flow
                    </div>
                    <div style={{
                      fontSize: '20px',
                      fontWeight: '700',
                      color: detail.net_cash_flow >= 0 ? BRAND_COLORS.success : BRAND_COLORS.danger
                    }}>
                      {formatCurrency(detail.net_cash_flow)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      <ReportHeader
        title="Cash Flow"
        subtitle="By Customer"
        showDateFilter={true}
        reportPeriod={reportPeriod}
        month={month}
        year={year}
        customStart={customStart}
        customEnd={customEnd}
        onFiltersChange={handleFiltersChange}
      />

      <div style={{
        minHeight: '100vh',
        background: `linear-gradient(135deg, ${BRAND_COLORS.primary} 0%, ${BRAND_COLORS.secondary} 100%)`,
        padding: '20px',
        paddingTop: '80px'
      }}>
        {loading ? (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '50vh'
          }}>
            <div style={{
              fontSize: '18px',
              fontWeight: '600',
              color: 'white'
            }}>
              Loading cash flow data...
            </div>
          </div>
        ) : customers.length === 0 ? (
          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '40px',
            textAlign: 'center',
            boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
          }}>
            <div style={{
              fontSize: '18px',
              fontWeight: '600',
              color: BRAND_COLORS.gray[700],
              marginBottom: '8px'
            }}>
              No Cash Flow Data Found
            </div>
            <div style={{
              fontSize: '14px',
              color: BRAND_COLORS.gray[700]
            }}>
              Try adjusting your date filters
            </div>
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr',
              gap: '12px',
              marginBottom: '24px'
            }}>
              {/* Total Inflows */}
              <div style={{
                background: 'white',
                borderRadius: '16px',
                padding: '20px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
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
                    color: BRAND_COLORS.gray[700],
                    fontWeight: '500'
                  }}>
                    Total Inflows
                  </span>
                </div>
                <div style={{
                  fontSize: '28px',
                  fontWeight: '700',
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
                boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
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
                    color: BRAND_COLORS.gray[700],
                    fontWeight: '500'
                  }}>
                    Total Outflows
                  </span>
                </div>
                <div style={{
                  fontSize: '28px',
                  fontWeight: '700',
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
                boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
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
                    color: BRAND_COLORS.gray[700],
                    fontWeight: '500'
                  }}>
                    Net Cash Flow
                  </span>
                </div>
                <div style={{
                  fontSize: '28px',
                  fontWeight: '700',
                  color: netCashFlow >= 0 ? BRAND_COLORS.success : BRAND_COLORS.danger
                }}>
                  {formatCurrency(netCashFlow)}
                </div>
              </div>
            </div>

            {/* Customer List */}
            <h2 style={{
              fontSize: '18px',
              fontWeight: '700',
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
                <div
                  key={customer.id}
                  onClick={() => loadCustomerDetail(customer)}
                  style={{
                    background: 'white',
                    borderRadius: '16px',
                    padding: '20px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '16px'
                  }}>
                    <h3 style={{
                      fontSize: '18px',
                      fontWeight: '700',
                      color: BRAND_COLORS.gray[900],
                      margin: 0
                    }}>
                      {customer.name}
                    </h3>
                    <ChevronRight size={24} color={BRAND_COLORS.primary} />
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '12px',
                    marginBottom: '12px'
                  }}>
                    <div>
                      <div style={{
                        fontSize: '12px',
                        fontWeight: '500',
                        color: BRAND_COLORS.gray[700],
                        marginBottom: '4px'
                      }}>
                        Inflows
                      </div>
                      <div style={{
                        fontSize: '16px',
                        fontWeight: '700',
                        color: BRAND_COLORS.success
                      }}>
                        {formatCurrency(customer.total_inflows)}
                      </div>
                    </div>

                    <div>
                      <div style={{
                        fontSize: '12px',
                        fontWeight: '500',
                        color: BRAND_COLORS.gray[700],
                        marginBottom: '4px'
                      }}>
                        Outflows
                      </div>
                      <div style={{
                        fontSize: '16px',
                        fontWeight: '700',
                        color: BRAND_COLORS.danger
                      }}>
                        {formatCurrency(customer.total_outflows)}
                      </div>
                    </div>
                  </div>

                  <div style={{
                    paddingTop: '12px',
                    borderTop: `1px solid ${BRAND_COLORS.gray[200]}`
                  }}>
                    <div style={{
                      fontSize: '12px',
                      fontWeight: '500',
                      color: BRAND_COLORS.gray[700],
                      marginBottom: '4px'
                    }}>
                      Net Cash Flow
                    </div>
                    <div style={{
                      fontSize: '20px',
                      fontWeight: '700',
                      color: customer.net_cash_flow >= 0 ? BRAND_COLORS.success : BRAND_COLORS.danger
                    }}>
                      {formatCurrency(customer.net_cash_flow)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  )
}
