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

interface PLAccount {
  account: string
  parent_account: string
  sub_account: string | null
  is_sub_account: boolean
  amount: number
  category: 'INCOME' | 'EXPENSES'
  account_type: string
  transactions: any[]
}

interface CustomerPL {
  customer_id: string
  customer_name: string
  revenue: number
  cogs: number
  gross_profit: number
  gross_margin: number
}

// Date utilities
const getDateParts = (dateString: string) => {
  const dateOnly = dateString.split('T')[0]
  const [year, month, day] = dateOnly.split('-').map(Number)
  return { year, month, day, dateOnly }
}

const isDateInRange = (dateString: string, startDate: string, endDate: string): boolean => {
  const { dateOnly } = getDateParts(dateString)
  return dateOnly >= startDate && dateOnly <= endDate
}

// P&L Classification
const classifyPLAccount = (accountType: string, accountName: string, reportCategory: string) => {
  const typeLower = accountType?.toLowerCase() || ''
  const nameLower = accountName?.toLowerCase() || ''
  const categoryLower = reportCategory?.toLowerCase() || ''

  const isTransfer = categoryLower === 'transfer' || nameLower.includes('transfer')
  const isCashAccount = typeLower.includes('bank') || typeLower.includes('cash') || 
    nameLower.includes('checking') || nameLower.includes('savings') || nameLower.includes('cash')

  if (isCashAccount || isTransfer) return null

  const isIncomeAccount = typeLower === 'income' || typeLower === 'other income' || 
    typeLower.includes('income') || typeLower.includes('revenue')

  const isExpenseAccount = typeLower === 'expenses' || typeLower === 'other expense' || 
    typeLower === 'cost of goods sold' || typeLower.includes('expense')

  if (isIncomeAccount) return 'INCOME'
  if (isExpenseAccount) return 'EXPENSES'

  return null
}

// Process P&L Transactions
const processPLTransactions = async (transactions: any[]): Promise<PLAccount[]> => {
  const accountMap = new Map<string, PLAccount>()

  const accountGroups = new Map<string, any[]>()
  transactions.forEach((tx) => {
    const account = tx.account
    if (!accountGroups.has(account)) {
      accountGroups.set(account, [])
    }
    accountGroups.get(account)!.push(tx)
  })

  for (const [account, txList] of accountGroups.entries()) {
    const sampleTx = txList[0]
    const accountType = sampleTx.account_type
    const reportCategory = sampleTx.report_category

    let totalCredits = 0
    let totalDebits = 0

    txList.forEach((tx) => {
      const debitValue = tx.debit ? parseFloat(tx.debit.toString()) : 0
      const creditValue = tx.credit ? parseFloat(tx.credit.toString()) : 0

      if (!isNaN(debitValue) && debitValue > 0) {
        totalDebits += debitValue
      }
      if (!isNaN(creditValue) && creditValue > 0) {
        totalCredits += creditValue
      }
    })

    const classification = classifyPLAccount(accountType, account, reportCategory)
    if (!classification) continue

    let amount: number
    if (classification === 'INCOME') {
      amount = totalCredits - totalDebits
    } else {
      amount = totalDebits - totalCredits
    }

    if (Math.abs(amount) <= 0.01) continue

    let parentAccount: string
    let subAccount: string | null
    let isSubAccount: boolean

    if (account.includes(':')) {
      const parts = account.split(':')
      parentAccount = parts[0].trim()
      subAccount = parts[1]?.trim() || null
      isSubAccount = true
    } else {
      parentAccount = account
      subAccount = null
      isSubAccount = false
    }

    accountMap.set(account, {
      account,
      parent_account: parentAccount,
      sub_account: subAccount,
      is_sub_account: isSubAccount,
      amount,
      category: classification,
      account_type: accountType,
      transactions: txList
    })
  }

  const accounts = Array.from(accountMap.values())
  accounts.sort((a, b) => {
    if (a.category !== b.category) {
      return a.category === 'INCOME' ? -1 : 1
    }
    return a.account.localeCompare(b.account)
  })

  return accounts
}

export default function MobilePLPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [customers, setCustomers] = useState<CustomerPL[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerPL | null>(null)
  
  // Filter states
  const [reportPeriod, setReportPeriod] = useState<'monthly' | 'custom' | 'ytd' | 'trailing12' | 'quarterly'>('monthly')
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [year, setYear] = useState(new Date().getFullYear())
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  useEffect(() => {
    if (!selectedCustomer) {
      loadPLData()
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
        startDate = `${year}-${String(qStartMonth).padStart(2, '0')}-01`

        const qEndMonth = qStartMonth + 2
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

  const loadPLData = async () => {
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

      // Fetch journal entry lines (same as desktop)
      const { data: allTransactions, error } = await supabase
        .from('journal_entry_lines')
        .select(`
          entry_number, 
          class, 
          date, 
          account, 
          account_type, 
          debit, 
          credit, 
          memo, 
          customer, 
          vendor, 
          name, 
          entry_bank_account, 
          normal_balance, 
          report_category,
          is_cash_account,
          detail_type,
          account_behavior
        `)
        .eq('company_id', userAccount.company_id)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true })

      if (error) throw error

      // Filter transactions using timezone-independent date comparison
      const filteredTransactions = allTransactions.filter((tx) => {
        return isDateInRange(tx.date, startDate, endDate)
      })

      // Filter for P&L accounts
      const plTransactions = filteredTransactions.filter((tx) => {
        const classification = classifyPLAccount(tx.account_type, tx.account, tx.report_category)
        return classification !== null
      })

      // Process transactions to get accounts
      const processedAccounts = await processPLTransactions(plTransactions)

      // Group by customer
      const customerMap = new Map<string, CustomerPL>()

      processedAccounts.forEach((account) => {
        account.transactions.forEach((tx) => {
          const customerId = tx.customer || 'No Customer'
          const customerName = tx.customer || 'No Customer'

          if (!customerMap.has(customerId)) {
            customerMap.set(customerId, {
              customer_id: customerId,
              customer_name: customerName,
              revenue: 0,
              cogs: 0,
              gross_profit: 0,
              gross_margin: 0
            })
          }

          const customer = customerMap.get(customerId)!
          const debitValue = tx.debit ? parseFloat(tx.debit.toString()) : 0
          const creditValue = tx.credit ? parseFloat(tx.credit.toString()) : 0

          if (account.category === 'INCOME') {
            customer.revenue += (creditValue - debitValue)
          } else if (account.account_type?.toLowerCase().includes('cost of goods sold')) {
            customer.cogs += (debitValue - creditValue)
          }
        })
      })

      // Calculate gross profit and margin
      const customerList = Array.from(customerMap.values()).map(customer => {
        customer.gross_profit = customer.revenue - customer.cogs
        customer.gross_margin = customer.revenue !== 0 ? customer.gross_profit / customer.revenue : 0
        return customer
      }).filter(customer => Math.abs(customer.revenue) > 0.01 || Math.abs(customer.cogs) > 0.01)

      setCustomers(customerList.sort((a, b) => b.revenue - a.revenue))

    } catch (error) {
      console.error('Error loading P&L data:', error)
      setCustomers([])
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
            {selectedCustomer.customer_name}
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
                {formatCurrency(selectedCustomer.revenue)}
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
                {formatCurrency(selectedCustomer.cogs)}
              </div>
            </div>

            {/* Gross Profit */}
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
                Gross Profit
              </div>
              <div style={{
                fontSize: '28px',
                fontWeight: '700',
                color: BRAND_COLORS.primary
              }}>
                {formatCurrency(selectedCustomer.gross_profit)}
              </div>
              <div style={{
                fontSize: '16px',
                fontWeight: '600',
                color: BRAND_COLORS.secondary,
                marginTop: '8px'
              }}>
                {formatPercent(selectedCustomer.gross_margin)} margin
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
            {customers.map((customer) => (
              <div
                key={customer.customer_id}
                onClick={() => setSelectedCustomer(customer)}
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
                      {customer.customer_name}
                    </h3>
                    <div style={{
                      fontSize: '14px',
                      fontWeight: '600',
                      color: customer.gross_profit >= 0 ? BRAND_COLORS.success : BRAND_COLORS.danger
                    }}>
                      {formatPercent(customer.gross_margin)} margin
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
                      Gross Profit
                    </div>
                    <div style={{
                      fontSize: '16px',
                      fontWeight: '700',
                      color: customer.gross_profit >= 0 ? BRAND_COLORS.primary : BRAND_COLORS.danger
                    }}>
                      {formatCurrency(customer.gross_profit)}
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
