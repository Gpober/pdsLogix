'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, AlertTriangle, DollarSign, Clock, TrendingUp } from 'lucide-react'
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
  current: number
  days_30: number
  days_60: number
  days_90: number
  over_90: number
  total: number
}

interface ARDetail {
  invoice_date: string
  invoice_number: string
  amount: number
  days_outstanding: number
  aging_bucket: string
}

export default function MobileARAgingPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [arDetails, setARDetails] = useState<ARDetail[]>([])
  
  const [totalAR, setTotalAR] = useState(0)
  const [totalCurrent, setTotalCurrent] = useState(0)
  const [totalOverdue, setTotalOverdue] = useState(0)

  useEffect(() => {
    if (!selectedCustomer) {
      loadARData()
    }
  }, [])

  const loadARData = async () => {
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

      // Get A/R data
      const { data: arData, error: arError } = await supabase
        .from('ar_aging')
        .select('*')
        .eq('company_id', userAccount.company_id)
        .order('customer_name', { ascending: true })

      if (arError) {
        console.error('A/R error:', arError)
        return
      }

      // Aggregate by customer
      const customerMap = new Map<string, Customer>()
      let totalARAmount = 0
      let totalCurrentAmount = 0
      let totalOverdueAmount = 0

      arData?.forEach(row => {
        const customerId = row.customer_id || 'unknown'
        const customerName = row.customer_name || 'Unknown Customer'
        const current = Number(row.current || 0)
        const days30 = Number(row.days_30 || 0)
        const days60 = Number(row.days_60 || 0)
        const days90 = Number(row.days_90 || 0)
        const over90 = Number(row.over_90 || 0)
        const total = current + days30 + days60 + days90 + over90

        totalARAmount += total
        totalCurrentAmount += current
        totalOverdueAmount += (days30 + days60 + days90 + over90)

        if (!customerMap.has(customerId)) {
          customerMap.set(customerId, {
            id: customerId,
            name: customerName,
            current: 0,
            days_30: 0,
            days_60: 0,
            days_90: 0,
            over_90: 0,
            total: 0
          })
        }

        const customer = customerMap.get(customerId)!
        customer.current += current
        customer.days_30 += days30
        customer.days_60 += days60
        customer.days_90 += days90
        customer.over_90 += over90
        customer.total += total
      })

      setTotalAR(totalARAmount)
      setTotalCurrent(totalCurrentAmount)
      setTotalOverdue(totalOverdueAmount)
      setCustomers(Array.from(customerMap.values()).sort((a, b) => b.total - a.total))

    } catch (error) {
      console.error('Error loading A/R:', error)
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

      const { data: arData, error } = await supabase
        .from('ar_aging')
        .select('*')
        .eq('company_id', userAccount.company_id)
        .eq('customer_id', customer.id)
        .order('invoice_date', { ascending: false })

      if (error) {
        console.error('Error loading detail:', error)
        return
      }

      const details: ARDetail[] = arData?.map(row => {
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
          invoice_date: new Date(row.invoice_date).toLocaleDateString(),
          invoice_number: row.invoice_number || 'N/A',
          amount: Number(row.current || row.days_30 || row.days_60 || row.days_90 || row.over_90 || 0),
          days_outstanding: daysOutstanding,
          aging_bucket: agingBucket
        }
      }) || []

      setARDetails(details)
      setSelectedCustomer(customer)

    } catch (error) {
      console.error('Error loading customer detail:', error)
    } finally {
      setLoading(false)
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
      default: return BRAND_COLORS.gray[700]
    }
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
            Invoice Details
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
              gap: '12px'
            }}>
              {arDetails.map((detail, index) => (
                <div
                  key={index}
                  style={{
                    padding: '16px',
                    background: BRAND_COLORS.gray[50],
                    borderRadius: '12px',
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
                        Invoice {detail.invoice_number}
                      </div>
                      <div style={{
                        fontSize: '12px',
                        color: BRAND_COLORS.gray[700]
                      }}>
                        {detail.invoice_date}
                      </div>
                    </div>
                    <div style={{
                      fontSize: '18px',
                      fontWeight: '700',
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
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      <ReportHeader
        title="A/R Aging"
        subtitle="Outstanding Receivables"
        showDateFilter={false}
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
              Loading A/R data...
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
              No A/R Data Found
            </div>
            <div style={{
              fontSize: '14px',
              color: BRAND_COLORS.gray[700]
            }}>
              No outstanding receivables at this time
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
              {/* Total A/R */}
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
                    color: BRAND_COLORS.gray[700],
                    fontWeight: '500'
                  }}>
                    Total Outstanding
                  </span>
                </div>
                <div style={{
                  fontSize: '28px',
                  fontWeight: '700',
                  color: BRAND_COLORS.primary
                }}>
                  {formatCurrency(totalAR)}
                </div>
              </div>

              {/* Current */}
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
                    Current (0-30 Days)
                  </span>
                </div>
                <div style={{
                  fontSize: '28px',
                  fontWeight: '700',
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
                boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
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
                    color: BRAND_COLORS.gray[700],
                    fontWeight: '500'
                  }}>
                    Overdue (30+ Days)
                  </span>
                </div>
                <div style={{
                  fontSize: '28px',
                  fontWeight: '700',
                  color: BRAND_COLORS.danger
                }}>
                  {formatCurrency(totalOverdue)}
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
                    alignItems: 'center',
                    marginBottom: '16px'
                  }}>
                    <div style={{
                      fontSize: '16px',
                      fontWeight: '600',
                      color: BRAND_COLORS.gray[900]
                    }}>
                      {customer.name}
                    </div>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <div style={{
                        fontSize: '18px',
                        fontWeight: '700',
                        color: BRAND_COLORS.primary
                      }}>
                        {formatCurrency(customer.total)}
                      </div>
                      <ChevronRight size={20} color={BRAND_COLORS.primary} />
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
                      <div style={{
                        color: BRAND_COLORS.gray[700],
                        marginBottom: '2px'
                      }}>
                        Current
                      </div>
                      <div style={{
                        color: BRAND_COLORS.success,
                        fontWeight: '600'
                      }}>
                        {formatCurrency(customer.current)}
                      </div>
                    </div>

                    <div style={{
                      background: `${BRAND_COLORS.primary}10`,
                      padding: '8px',
                      borderRadius: '8px'
                    }}>
                      <div style={{
                        color: BRAND_COLORS.gray[700],
                        marginBottom: '2px'
                      }}>
                        1-30 Days
                      </div>
                      <div style={{
                        color: BRAND_COLORS.primary,
                        fontWeight: '600'
                      }}>
                        {formatCurrency(customer.days_30)}
                      </div>
                    </div>

                    <div style={{
                      background: `${BRAND_COLORS.warning}10`,
                      padding: '8px',
                      borderRadius: '8px'
                    }}>
                      <div style={{
                        color: BRAND_COLORS.gray[700],
                        marginBottom: '2px'
                      }}>
                        31-60 Days
                      </div>
                      <div style={{
                        color: BRAND_COLORS.warning,
                        fontWeight: '600'
                      }}>
                        {formatCurrency(customer.days_60)}
                      </div>
                    </div>

                    <div style={{
                      background: `${BRAND_COLORS.danger}10`,
                      padding: '8px',
                      borderRadius: '8px'
                    }}>
                      <div style={{
                        color: BRAND_COLORS.gray[700],
                        marginBottom: '2px'
                      }}>
                        60+ Days
                      </div>
                      <div style={{
                        color: BRAND_COLORS.danger,
                        fontWeight: '600'
                      }}>
                        {formatCurrency(customer.days_90 + customer.over_90)}
                      </div>
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
