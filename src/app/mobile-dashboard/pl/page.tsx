'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
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

interface PropertySummary {
  name: string
  revenue: number
  cogs: number
  expenses: number
  netIncome: number
}

interface JournalRow {
  account: string
  account_type: string | null
  debit: number | null
  credit: number | null
  customer: string | null
  date: string
}

export default function MobilePLPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [properties, setProperties] = useState<PropertySummary[]>([])
  const [selectedProperty, setSelectedProperty] = useState<PropertySummary | null>(null)
  
  // Filter states
  const [reportPeriod, setReportPeriod] = useState<'monthly' | 'custom' | 'ytd' | 'trailing12' | 'quarterly'>('monthly')
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [year, setYear] = useState(new Date().getFullYear())
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  const getDateRange = () => {
    const makeUTCDate = (y: number, m: number, d: number) =>
      new Date(Date.UTC(y, m, d))
    const y = year
    const m = month

    if (reportPeriod === 'custom' && customStart && customEnd) {
      return { start: customStart, end: customEnd }
    }
    if (reportPeriod === 'monthly') {
      const startDate = makeUTCDate(y, m - 1, 1)
      const endDate = makeUTCDate(y, m, 0)
      return {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0]
      }
    }
    if (reportPeriod === 'quarterly') {
      const qStart = Math.floor((m - 1) / 3) * 3
      const startDate = makeUTCDate(y, qStart, 1)
      const endDate = makeUTCDate(y, qStart + 3, 0)
      return {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0]
      }
    }
    if (reportPeriod === 'ytd') {
      const startDate = makeUTCDate(y, 0, 1)
      const endDate = makeUTCDate(y, m, 0)
      return {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0]
      }
    }
    if (reportPeriod === 'trailing12') {
      const endDate = makeUTCDate(y, m, 0)
      const startDate = makeUTCDate(y, m - 11, 1)
      return {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0]
      }
    }
    return { start: `${y}-01-01`, end: `${y}-12-31` }
  }

  useEffect(() => {
    loadPLData()
  }, [reportPeriod, month, year, customStart, customEnd])

  const loadPLData = async () => {
    try {
      setLoading(true)
      console.log('📊 Loading P&L data...')

      const { start, end } = getDateRange()
      console.log('📅 Date range:', start, 'to', end)

      // Use exact same query as working mobile dashboard
      const selectColumns = 'account_type, report_category, normal_balance, debit, credit, customer, date, entry_bank_account, is_cash_account'

      const { data, error } = await supabase
        .from('journal_entry_lines')
        .select(selectColumns)
        .gte('date', start)
        .lte('date', end)

      if (error) {
        console.error('❌ Query error:', error)
        throw error
      }

      console.log('✅ Fetched transactions:', data?.length || 0)

      const map: Record<string, PropertySummary> = {}

      // Use exact same logic as working mobile dashboard
      ;((data as JournalRow[]) || []).forEach((row) => {
        const customer = row.customer || 'General'
        if (!map[customer]) {
          map[customer] = {
            name: customer,
            revenue: 0,
            cogs: 0,
            expenses: 0,
            netIncome: 0
          }
        }

        const debit = Number(row.debit) || 0
        const credit = Number(row.credit) || 0

        const t = (row.account_type || '').toLowerCase()
        if (t.includes('income') || t.includes('revenue')) {
          map[customer].revenue = (map[customer].revenue || 0) + (credit - debit)
        } else if (t.includes('cost of goods sold') || t.includes('cogs')) {
          const amt = debit - credit
          map[customer].cogs = (map[customer].cogs || 0) + amt
        } else if (t.includes('expense')) {
          const amt = debit - credit
          map[customer].expenses = (map[customer].expenses || 0) + amt
        }
        map[customer].netIncome = (map[customer].revenue || 0) - (map[customer].cogs || 0) - (map[customer].expenses || 0)
      })

      // Filter out customers with no activity
      const list = Object.values(map).filter((p) => {
        return (p.revenue || 0) !== 0 || (p.cogs || 0) !== 0 || (p.expenses || 0) !== 0 || (p.netIncome || 0) !== 0
      })

      // Add "General" if it exists but wasn't included
      const finalList = map['General'] && !list.find((p) => p.name === 'General')
        ? [...list, map['General']]
        : list

      console.log('✅ Final customer list:', finalList.length)
      console.log('📊 Sample customer:', finalList[0])

      setProperties(finalList.sort((a, b) => b.revenue - a.revenue))

    } catch (error) {
      console.error('❌ Error loading P&L data:', error)
      setProperties([])
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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  const formatPercent = (value: number) => {
    return `${(value * 100).toFixed(1)}%`
  }

  if (selectedProperty) {
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
            onClick={() => setSelectedProperty(null)}
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
            {selectedProperty.name}
          </h2>

          <p style={{
            fontSize: '14px',
            color: BRAND_COLORS.gray[700],
            marginBottom: '24px'
          }}>
            Detailed P&L Statement
          </p>

          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            {/* Revenue */}
            <div style={{
              padding: '16px',
              background: BRAND_COLORS.gray[50],
              borderRadius: '12px'
            }}>
              <div style={{
                fontSize: '14px',
                fontWeight: '500',
                color: BRAND_COLORS.gray[700],
                marginBottom: '8px'
              }}>
                Revenue
              </div>
              <div style={{
                fontSize: '24px',
                fontWeight: '700',
                color: BRAND_COLORS.success
              }}>
                {formatCurrency(selectedProperty.revenue)}
              </div>
            </div>

            {/* COGS */}
            <div style={{
              padding: '16px',
              background: BRAND_COLORS.gray[50],
              borderRadius: '12px'
            }}>
              <div style={{
                fontSize: '14px',
                fontWeight: '500',
                color: BRAND_COLORS.gray[700],
                marginBottom: '8px'
              }}>
                Cost of Goods Sold
              </div>
              <div style={{
                fontSize: '24px',
                fontWeight: '700',
                color: BRAND_COLORS.danger
              }}>
                {formatCurrency(selectedProperty.cogs)}
              </div>
            </div>

            {/* Expenses */}
            <div style={{
              padding: '16px',
              background: BRAND_COLORS.gray[50],
              borderRadius: '12px'
            }}>
              <div style={{
                fontSize: '14px',
                fontWeight: '500',
                color: BRAND_COLORS.gray[700],
                marginBottom: '8px'
              }}>
                Expenses
              </div>
              <div style={{
                fontSize: '24px',
                fontWeight: '700',
                color: BRAND_COLORS.warning
              }}>
                {formatCurrency(selectedProperty.expenses)}
              </div>
            </div>

            {/* Net Income */}
            <div style={{
              padding: '16px',
              background: `linear-gradient(135deg, ${BRAND_COLORS.primary}15 0%, ${BRAND_COLORS.secondary}15 100%)`,
              borderRadius: '12px',
              border: `2px solid ${BRAND_COLORS.primary}`
            }}>
              <div style={{
                fontSize: '14px',
                fontWeight: '500',
                color: BRAND_COLORS.gray[700],
                marginBottom: '8px'
              }}>
                Net Income
              </div>
              <div style={{
                fontSize: '28px',
                fontWeight: '700',
                color: selectedProperty.netIncome >= 0 ? BRAND_COLORS.primary : BRAND_COLORS.danger
              }}>
                {formatCurrency(selectedProperty.netIncome)}
              </div>
              <div style={{
                fontSize: '16px',
                fontWeight: '600',
                color: BRAND_COLORS.secondary,
                marginTop: '8px'
              }}>
                {formatPercent(selectedProperty.revenue !== 0 ? selectedProperty.netIncome / selectedProperty.revenue : 0)} margin
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <ReportHeader
        title="P&L Statement"
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
              Loading P&L data...
            </div>
          </div>
        ) : properties.length === 0 ? (
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
              No P&L Data Found
            </div>
            <div style={{
              fontSize: '14px',
              color: BRAND_COLORS.gray[700]
            }}>
              Try adjusting your date filters
            </div>
          </div>
        ) : (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            {properties.map((customer) => (
              <div
                key={customer.name}
                onClick={() => setSelectedProperty(customer)}
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
                  <div>
                    <h3 style={{
                      fontSize: '18px',
                      fontWeight: '700',
                      color: BRAND_COLORS.gray[900],
                      marginBottom: '4px'
                    }}>
                      {customer.name}
                    </h3>
                    <div style={{
                      fontSize: '14px',
                      fontWeight: '600',
                      color: customer.netIncome >= 0 ? BRAND_COLORS.success : BRAND_COLORS.danger
                    }}>
                      {formatPercent(customer.revenue !== 0 ? customer.netIncome / customer.revenue : 0)} margin
                    </div>
                  </div>
                  <ChevronRight size={24} color={BRAND_COLORS.primary} />
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '12px'
                }}>
                  <div>
                    <div style={{
                      fontSize: '12px',
                      fontWeight: '500',
                      color: BRAND_COLORS.gray[700],
                      marginBottom: '4px'
                    }}>
                      Revenue
                    </div>
                    <div style={{
                      fontSize: '16px',
                      fontWeight: '700',
                      color: BRAND_COLORS.success
                    }}>
                      {formatCurrency(customer.revenue)}
                    </div>
                  </div>

                  <div>
                    <div style={{
                      fontSize: '12px',
                      fontWeight: '500',
                      color: BRAND_COLORS.gray[700],
                      marginBottom: '4px'
                    }}>
                      Net Income
                    </div>
                    <div style={{
                      fontSize: '16px',
                      fontWeight: '700',
                      color: customer.netIncome >= 0 ? BRAND_COLORS.primary : BRAND_COLORS.danger
                    }}>
                      {formatCurrency(customer.netIncome)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
