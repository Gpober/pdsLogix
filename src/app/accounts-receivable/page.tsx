"use client"

import { useState, useEffect, useMemo } from "react"
import { CreditCard, Clock, AlertTriangle, CheckCircle, RefreshCw, Search, Eye, DollarSign } from "lucide-react"
import { supabase } from "@/lib/supabaseClient"

// I AM CFO Brand Colors
const BRAND_COLORS = {
  primary: "#56B6E9",
  secondary: "#3A9BD1",
  tertiary: "#7CC4ED",
  accent: "#2E86C1",
  success: "#27AE60",
  warning: "#F39C12",
  danger: "#E74C3C",
}

interface ARRecord {
  customer: string
  balance: number
  lastInvoiceDate: string
  daysOutstanding: number
  status: 'current' | '30-60' | '60-90' | '90+'
  transactions: ARTransaction[]
  aging: {
    current: number
    days30: number
    days60: number
    days90: number
  }
}

interface ARTransaction {
  date: string
  entryNumber: string
  description: string
  debit: number
  credit: number
  balance: number
  invoiceNumber?: string | null
  isOpen: boolean
  originalAmount: number
  paidAmount: number
  remainingBalance: number
  type: 'invoice' | 'payment'
}

export default function AccountsReceivablePage() {
  const [selectedPeriod, setSelectedPeriod] = useState("Current")
  const [isLoading, setIsLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [arData, setArData] = useState<ARRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null)
  const [showTransactionModal, setShowTransactionModal] = useState(false)
  const [asOfDate, setAsOfDate] = useState(() => {
    const today = new Date()
    return today.toISOString().split('T')[0]
  })

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value)
  }

  const getDateParts = (dateString: string) => {
    if (!dateString) return { year: 0, month: 0, day: 0, dateStr: "" }
    
    const cleanDate = dateString.includes('T') ? dateString.split('T')[0] : dateString
    const [year, month, day] = cleanDate.split('-').map(Number)
    
    return {
      year: year || 0,
      month: month || 0,
      day: day || 0,
      dateStr: cleanDate
    }
  }

  const formatDateSafe = (dateStr: string): string => {
    if (!dateStr) return ""
    
    try {
      const { year, month, day } = getDateParts(dateStr)
      if (!year || !month || !day) return dateStr
      
      const date = new Date(year, month - 1, day)
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    } catch {
      return dateStr
    }
  }

  const calculateDaysOutstanding = (invoiceDate: string, asOfDate: string): number => {
    const { year: invYear, month: invMonth, day: invDay } = getDateParts(invoiceDate)
    const { year: asOfYear, month: asOfMonth, day: asOfDay } = getDateParts(asOfDate)
    
    const invoice = new Date(invYear, invMonth - 1, invDay)
    const asOf = new Date(asOfYear, asOfMonth - 1, asOfDay)
    
    const diffTime = Math.abs(asOf.getTime() - invoice.getTime())
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  }

  const getAgingStatus = (days: number): 'current' | '30-60' | '60-90' | '90+' => {
    if (days <= 30) return 'current'
    if (days <= 60) return '30-60'
    if (days <= 90) return '60-90'
    return '90+'
  }

  // Calculate aging breakdown for individual invoices based on as-of date
  const calculateAgingBreakdown = (invoices: ARTransaction[], asOfDate: string) => {
    const aging = { current: 0, days30: 0, days60: 0, days90: 0 }
    
    invoices.forEach(invoice => {
      const days = calculateDaysOutstanding(invoice.date, asOfDate)
      const amount = invoice.remainingBalance
      
      if (days <= 30) {
        aging.current += amount
      } else if (days <= 60) {
        aging.days30 += amount
      } else if (days <= 90) {
        aging.days60 += amount
      } else {
        aging.days90 += amount
      }
    })
    
    return aging
  }

  // Enhanced payment allocation with as-of date cutoff
  const allocatePaymentsToInvoices = (transactions: any[], asOfDate: string): ARTransaction[] => {
    // Filter transactions by as-of date first
    const filteredTransactions = transactions.filter(tx => {
      const txDate = getDateParts(tx.date).dateStr
      return txDate <= asOfDate
    })

    // Separate invoices and payments from filtered transactions
    const invoices = filteredTransactions
      .filter(tx => (Number(tx.debit) || 0) > 0) // Debits are invoices
      .map(tx => ({
        date: tx.date,
        entryNumber: tx.entry_number || "N/A",
        description: tx.memo || tx.account || "A/R Invoice",
        debit: Number(tx.debit) || 0,
        credit: 0,
        balance: Number(tx.debit) || 0,
        invoiceNumber: tx.number,
        isOpen: true,
        originalAmount: Number(tx.debit) || 0,
        paidAmount: 0,
        remainingBalance: Number(tx.debit) || 0,
        type: 'invoice' as const
      }))
      .sort((a, b) => a.date.localeCompare(b.date)) // Sort by date for FIFO

    const payments = filteredTransactions
      .filter(tx => (Number(tx.credit) || 0) > 0) // Credits are payments
      .map(tx => ({
        date: tx.date,
        entryNumber: tx.entry_number || "N/A",
        description: tx.memo || tx.account || "A/R Payment",
        debit: 0,
        credit: Number(tx.credit) || 0,
        balance: 0,
        invoiceNumber: null,
        isOpen: false,
        originalAmount: Number(tx.credit) || 0,
        paidAmount: Number(tx.credit) || 0,
        remainingBalance: 0,
        type: 'payment' as const
      }))
      .sort((a, b) => a.date.localeCompare(b.date))

    // Apply FIFO payment allocation
    let remainingPayment = 0
    const result: ARTransaction[] = []

    // Add all payments first to track total payment pool (only payments on or before as-of date)
    payments.forEach(payment => {
      remainingPayment += payment.credit
    })

    // Allocate payments to invoices using FIFO
    invoices.forEach(invoice => {
      if (remainingPayment > 0) {
        const paymentToApply = Math.min(remainingPayment, invoice.remainingBalance)
        invoice.paidAmount += paymentToApply
        invoice.remainingBalance -= paymentToApply
        invoice.isOpen = invoice.remainingBalance > 0
        remainingPayment -= paymentToApply
      }
      
      // Only include open invoices in the result
      if (invoice.isOpen) {
        result.push(invoice)
      }
    })

    return result.sort((a, b) => a.date.localeCompare(b.date))
  }

  const fetchARData = async () => {
    try {
      setIsLoading(true)
      setError(null)

      console.log(`🔍 Fetching A/R data from Supabase as of ${asOfDate}...`)

      // Query for all A/R account transactions
      const { data: transactions, error } = await supabase
        .from("journal_entry_lines")
        .select("*")
        .ilike("account_type", "%accounts receivable%")
        .order("date", { ascending: true })

      if (error) throw error

      console.log(`📊 Found ${transactions.length} A/R transactions`)

      // Group by customer and calculate balances with as-of date logic
      const customerMap = new Map<string, {
        transactions: any[]
        balance: number
        lastInvoiceDate: string
      }>()

      transactions.forEach((tx: any) => {
        const customer = tx.customer || tx.name || tx.vendor || "Unknown Customer"
        
        if (!customerMap.has(customer)) {
          customerMap.set(customer, {
            transactions: [],
            balance: 0,
            lastInvoiceDate: tx.date
          })
        }

        const customerData = customerMap.get(customer)!
        customerData.transactions.push(tx)
        
        // Update last invoice date if this is more recent and within as-of date
        const txDate = getDateParts(tx.date).dateStr
        if (txDate <= asOfDate && tx.date > customerData.lastInvoiceDate) {
          customerData.lastInvoiceDate = tx.date
        }
      })

      // Convert to ARRecord format and filter positive balances
      const arRecords: ARRecord[] = []
      
      customerMap.forEach((data, customer) => {
        // Process transactions with smart payment allocation and as-of date cutoff
        const openInvoices = allocatePaymentsToInvoices(data.transactions, asOfDate)
        const openBalance = openInvoices.reduce((sum, inv) => sum + inv.remainingBalance, 0)

        // Only include customers with open invoices
        if (openBalance > 0) {
          const lastInvoiceDate = openInvoices.length > 0 
            ? openInvoices[openInvoices.length - 1].date 
            : data.lastInvoiceDate
          
          const daysOutstanding = calculateDaysOutstanding(lastInvoiceDate, asOfDate)
          const status = getAgingStatus(daysOutstanding)
          const aging = calculateAgingBreakdown(openInvoices, asOfDate)

          arRecords.push({
            customer,
            balance: openBalance,
            lastInvoiceDate,
            daysOutstanding,
            status,
            transactions: openInvoices,
            aging
          })
        }
      })

      // Sort by balance descending
      arRecords.sort((a, b) => b.balance - a.balance)

      console.log(`✅ Processed ${arRecords.length} customers with outstanding A/R as of ${asOfDate}`)
      setArData(arRecords)
    } catch (err) {
      console.error("❌ Error fetching A/R data:", err)
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchARData()
  }, [asOfDate]) // Re-fetch when as-of date changes

  // Calculate summary statistics
  const arSummary = useMemo(() => {
    const totalAR = arData.reduce((sum, record) => sum + record.balance, 0)
    const current = arData.filter(r => r.status === 'current').reduce((sum, r) => sum + r.balance, 0)
    const days30 = arData.filter(r => r.status === '30-60').reduce((sum, r) => sum + r.balance, 0)
    const days60 = arData.filter(r => r.status === '60-90').reduce((sum, r) => sum + r.balance, 0)
    const days90 = arData.filter(r => r.status === '90+').reduce((sum, r) => sum + r.balance, 0)
    const pastDue = days30 + days60 + days90
    
    // Calculate weighted average DSO based on as-of date
    const totalDays = arData.reduce((sum, r) => sum + (r.daysOutstanding * r.balance), 0)
    const averageDSO = totalAR > 0 ? Math.round(totalDays / totalAR) : 0

    return {
      totalAR,
      current,
      days30,
      days60,
      days90,
      pastDue,
      averageDSO,
      customerCount: arData.length
    }
  }, [arData])

  // Filter data based on search and period
  const filteredData = useMemo(() => {
    let filtered = arData

    if (searchTerm) {
      filtered = filtered.filter(record => 
        record.customer.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    if (selectedPeriod !== "All") {
      filtered = filtered.filter(record => {
        if (selectedPeriod === "Current") return record.status === 'current'
        if (selectedPeriod === "30-60") return record.status === '30-60'
        if (selectedPeriod === "60-90") return record.status === '60-90'
        if (selectedPeriod === "90+") return record.status === '90+'
        return true
      })
    }

    return filtered
  }, [arData, searchTerm, selectedPeriod])

  const showCustomerTransactions = (customer: string) => {
    setSelectedCustomer(customer)
    setShowTransactionModal(true)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'current': return 'bg-green-100 text-green-800'
      case '30-60': return 'bg-yellow-100 text-yellow-800'
      case '60-90': return 'bg-orange-100 text-orange-800'
      case '90+': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const selectedCustomerData = selectedCustomer ? arData.find(r => r.customer === selectedCustomer) : null

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Accounts Receivable</h1>
              <p className="text-sm text-gray-600 mt-1">
                Manage customer invoices and track outstanding payments
              </p>
              <p className="text-xs text-blue-600 mt-1">
                💰 Real Supabase Integration - Connected to journal_entry_lines
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                onClick={fetchARData}
                disabled={isLoading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          {/* As of Date Header */}
          <div className="text-center">
            <h2 className="text-xl font-semibold text-gray-800">
              Accounts Receivable as of {formatDateSafe(asOfDate)}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Shows outstanding balances and aging based on transactions through the selected date
            </p>
          </div>

          {/* Error State */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-700">Error loading A/R data: {error}</p>
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin mr-2 text-blue-600" />
              <span className="text-gray-600">Loading accounts receivable data...</span>
            </div>
          )}

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div
              className="bg-white p-6 rounded-lg shadow-sm border-l-4"
              style={{ borderLeftColor: BRAND_COLORS.primary }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-gray-600 text-sm font-medium mb-2">Total A/R</div>
                  <div className="text-2xl font-bold text-gray-900">{formatCurrency(arSummary.totalAR)}</div>
                  <div className="text-xs text-gray-500 font-medium mt-1">
                    {arSummary.customerCount} customers
                  </div>
                </div>
                <DollarSign className="w-8 h-8" style={{ color: BRAND_COLORS.primary }} />
              </div>
            </div>

            <div
              className="bg-white p-6 rounded-lg shadow-sm border-l-4"
              style={{ borderLeftColor: BRAND_COLORS.success }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-gray-600 text-sm font-medium mb-2">Current</div>
                  <div className="text-2xl font-bold text-gray-900">{formatCurrency(arSummary.current)}</div>
                  <div className="text-xs text-green-600 font-medium mt-1">
                    {arSummary.totalAR > 0 ? Math.round((arSummary.current / arSummary.totalAR) * 100) : 0}% of total
                  </div>
                </div>
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
            </div>

            <div
              className="bg-white p-6 rounded-lg shadow-sm border-l-4"
              style={{ borderLeftColor: BRAND_COLORS.warning }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-gray-600 text-sm font-medium mb-2">Past Due</div>
                  <div className="text-2xl font-bold text-gray-900">{formatCurrency(arSummary.pastDue)}</div>
                  <div className="text-xs text-orange-600 font-medium mt-1">
                    {arSummary.totalAR > 0 ? Math.round((arSummary.pastDue / arSummary.totalAR) * 100) : 0}% of total
                  </div>
                </div>
                <AlertTriangle className="w-8 h-8 text-orange-500" />
              </div>
            </div>

            <div
              className="bg-white p-6 rounded-lg shadow-sm border-l-4"
              style={{ borderLeftColor: BRAND_COLORS.secondary }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-gray-600 text-sm font-medium mb-2">Avg DSO</div>
                  <div className="text-2xl font-bold text-gray-900">{arSummary.averageDSO}</div>
                  <div className="text-xs text-blue-600 font-medium mt-1">Days</div>
                </div>
                <Clock className="w-8 h-8" style={{ color: BRAND_COLORS.secondary }} />
              </div>
            </div>
          </div>

          {/* Aging Analysis */}
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Aging Analysis</h3>
              <div className="text-sm text-gray-600 mt-1">Breakdown by aging buckets as of {formatDateSafe(asOfDate)}</div>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600 mb-2">{formatCurrency(arSummary.current)}</div>
                  <div className="text-sm text-gray-600 mb-1">Current (0-30 days)</div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-green-500 h-2 rounded-full" 
                      style={{ width: `${arSummary.totalAR > 0 ? (arSummary.current / arSummary.totalAR) * 100 : 0}%` }}
                    ></div>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {arSummary.totalAR > 0 ? Math.round((arSummary.current / arSummary.totalAR) * 100) : 0}%
                  </div>
                </div>

                <div className="text-center">
                  <div className="text-3xl font-bold text-yellow-600 mb-2">{formatCurrency(arSummary.days30)}</div>
                  <div className="text-sm text-gray-600 mb-1">31-60 days</div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-yellow-500 h-2 rounded-full" 
                      style={{ width: `${arSummary.totalAR > 0 ? (arSummary.days30 / arSummary.totalAR) * 100 : 0}%` }}
                    ></div>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {arSummary.totalAR > 0 ? Math.round((arSummary.days30 / arSummary.totalAR) * 100) : 0}%
                  </div>
                </div>

                <div className="text-center">
                  <div className="text-3xl font-bold text-orange-600 mb-2">{formatCurrency(arSummary.days60)}</div>
                  <div className="text-sm text-gray-600 mb-1">61-90 days</div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-orange-500 h-2 rounded-full" 
                      style={{ width: `${arSummary.totalAR > 0 ? (arSummary.days60 / arSummary.totalAR) * 100 : 0}%` }}
                    ></div>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {arSummary.totalAR > 0 ? Math.round((arSummary.days60 / arSummary.totalAR) * 100) : 0}%
                  </div>
                </div>

                <div className="text-center">
                  <div className="text-3xl font-bold text-red-600 mb-2">{formatCurrency(arSummary.days90)}</div>
                  <div className="text-sm text-gray-600 mb-1">90+ days</div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-red-500 h-2 rounded-full" 
                      style={{ width: `${arSummary.totalAR > 0 ? (arSummary.days90 / arSummary.totalAR) * 100 : 0}%` }}
                    ></div>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {arSummary.totalAR > 0 ? Math.round((arSummary.days90 / arSummary.totalAR) * 100) : 0}%
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Filters and Search */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Search customers..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="sm:w-48">
                <select
                  value={selectedPeriod}
                  onChange={(e) => setSelectedPeriod(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="All">All Periods</option>
                  <option value="Current">Current (0-30)</option>
                  <option value="30-60">31-60 Days</option>
                  <option value="60-90">61-90 Days</option>
                  <option value="90+">90+ Days</option>
                </select>
              </div>
            </div>
          </div>

          {/* A/R Table */}
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Outstanding Receivables</h3>
              <div className="text-sm text-gray-600 mt-1">
                Showing {filteredData.length} of {arData.length} customers with outstanding balances as of {formatDateSafe(asOfDate)}
              </div>
            </div>

            {filteredData.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Customer
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Current (0-30)
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        31-60 Days
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        61-90 Days
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        90+ Days
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total Balance
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Last Invoice
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredData.map((record, index) => (
                      <tr key={`${record.customer}-${index}`} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {record.customer}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                          <span className={`font-medium ${record.aging.current > 0 ? 'text-green-600' : 'text-gray-300'}`}>
                            {record.aging.current > 0 ? formatCurrency(record.aging.current) : '-'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                          <span className={`font-medium ${record.aging.days30 > 0 ? 'text-yellow-600' : 'text-gray-300'}`}>
                            {record.aging.days30 > 0 ? formatCurrency(record.aging.days30) : '-'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                          <span className={`font-medium ${record.aging.days60 > 0 ? 'text-orange-600' : 'text-gray-300'}`}>
                            {record.aging.days60 > 0 ? formatCurrency(record.aging.days60) : '-'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                          <span className={`font-medium ${record.aging.days90 > 0 ? 'text-red-600' : 'text-gray-300'}`}>
                            {record.aging.days90 > 0 ? formatCurrency(record.aging.days90) : '-'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-gray-900">
                          {formatCurrency(record.balance)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDateSafe(record.lastInvoiceDate)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <button
                            onClick={() => showCustomerTransactions(record.customer)}
                            className="inline-flex items-center px-3 py-1 border border-transparent text-xs leading-4 font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                          >
                            <Eye className="w-3 h-3 mr-1" />
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center">
                <CreditCard className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">No accounts receivable found for the selected filters.</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Transaction Detail Modal */}
      {showTransactionModal && selectedCustomerData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-gray-200 flex-shrink-0">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Open Invoices - {selectedCustomerData.customer}
                  </h3>
                  <p className="text-sm text-gray-600">
                    Outstanding balance as of {formatDateSafe(asOfDate)}: {formatCurrency(selectedCustomerData.balance)} • {selectedCustomerData.transactions.length} open invoices
                  </p>
                </div>
                <button
                  onClick={() => setShowTransactionModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-auto p-6">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entry #</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Original</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Paid</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Remaining</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Days</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {selectedCustomerData.transactions.map((transaction, index) => {
                      const daysOld = calculateDaysOutstanding(transaction.date, asOfDate)
                      const agingStatus = getAgingStatus(daysOld)
                      
                      return (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                            {formatDateSafe(transaction.date)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                            {transaction.entryNumber}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                            {transaction.invoiceNumber || '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {transaction.description}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                            {formatCurrency(transaction.originalAmount)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-green-600">
                            {formatCurrency(transaction.paidAmount)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-red-600">
                            {formatCurrency(transaction.remainingBalance)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-center">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(agingStatus)}`}>
                              {daysOld} days
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
