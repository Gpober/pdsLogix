"use client"

import { useState, useEffect, useMemo } from "react"
import React from "react"
import { CreditCard, Clock, AlertTriangle, CheckCircle, RefreshCw, Search, DollarSign, ChevronDown, ChevronRight } from "lucide-react"
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
  invoiceCount: number
  aging: {
    current: number
    days30: number
    days60: number
    days90: number
  }
  invoices: ARInvoice[]
  payments: ARPayment[]
  totalPayments: number
}

interface ARParentGroup {
  parentCustomer: string
  totalBalance: number
  totalInvoiceCount: number
  totalAging: {
    current: number
    days30: number
    days60: number
    days90: number
  }
  totalPayments: number
  subCustomers: ARRecord[]
  isExpanded: boolean
}

interface ARInvoice {
  id: number
  date: string
  type: string
  number: string
  customer: string
  location: string
  due_date: string
  amount: number
  open_balance: number
  days_outstanding: number
  aging_bucket: string
}

interface ARPayment {
  invoiceNumber: string
  paymentDate: string
  amount: number
}

export default function AccountsReceivablePage() {
  const [selectedPeriod, setSelectedPeriod] = useState("All")
  const [isLoading, setIsLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [arData, setArData] = useState<ARRecord[]>([])
  const [arGroupedData, setArGroupedData] = useState<ARParentGroup[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null)
  const [showTransactionModal, setShowTransactionModal] = useState(false)
  const [selectedAgingFilter, setSelectedAgingFilter] = useState<string | undefined>(undefined)
  const [selectedJournalEntry, setSelectedJournalEntry] = useState<any>(null)
  const [showJournalModal, setShowJournalModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedPaymentCustomer, setSelectedPaymentCustomer] = useState<string | null>(null)
  const [selectedPayments, setSelectedPayments] = useState<ARPayment[]>([])

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

  const calculateDaysOutstanding = (dueDate: string): number => {
    if (!dueDate) return 0
    
    const { year, month, day } = getDateParts(dueDate)
    const due = new Date(year, month - 1, day)
    const today = new Date()
    
    const diffTime = today.getTime() - due.getTime()
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  }

  const getAgingBucket = (daysOutstanding: number): string => {
    if (daysOutstanding <= 0) return 'current'
    if (daysOutstanding <= 30) return 'current'
    if (daysOutstanding <= 60) return '31-60'
    if (daysOutstanding <= 90) return '61-90'
    return '90+'
  }

  // Parse customer name to get parent and sub customer
  const parseCustomerName = (fullCustomerName: string) => {
    if (fullCustomerName.includes(':')) {
      const [parent, sub] = fullCustomerName.split(':', 2)
      return {
        parent: parent.trim(),
        sub: sub.trim(),
        fullName: fullCustomerName
      }
    }
    return {
      parent: fullCustomerName,
      sub: null,
      fullName: fullCustomerName
    }
  }

  // Group customers by parent with expand/collapse
  const groupCustomersByParent = (customers: ARRecord[]): ARParentGroup[] => {
    const parentGroups = new Map<string, ARParentGroup>()

    customers.forEach(customer => {
      const { parent, sub } = parseCustomerName(customer.customer)
      
      if (!parentGroups.has(parent)) {
        parentGroups.set(parent, {
          parentCustomer: parent,
          totalBalance: 0,
          totalInvoiceCount: 0,
          totalAging: { current: 0, days30: 0, days60: 0, days90: 0 },
          totalPayments: 0,
          subCustomers: [],
          isExpanded: false
        })
      }

      const group = parentGroups.get(parent)!
      
      // Add to sub customers
      group.subCustomers.push(customer)
      
      // Aggregate totals
      group.totalBalance += customer.balance
      group.totalInvoiceCount += customer.invoiceCount
      group.totalAging.current += customer.aging.current
      group.totalAging.days30 += customer.aging.days30
      group.totalAging.days60 += customer.aging.days60
      group.totalAging.days90 += customer.aging.days90
      group.totalPayments += customer.totalPayments
    })

    // Sort sub customers within each group
    parentGroups.forEach(group => {
      group.subCustomers.sort((a, b) => b.balance - a.balance)
    })

    // Convert to array and sort by total balance
    return Array.from(parentGroups.values()).sort((a, b) => b.totalBalance - a.totalBalance)
  }

  const toggleParentExpansion = (parentCustomer: string) => {
    setArGroupedData(prev => 
      prev.map(group => 
        group.parentCustomer === parentCustomer 
          ? { ...group, isExpanded: !group.isExpanded }
          : group
      )
    )
  }

  const fetchARData = async () => {
    try {
      setIsLoading(true)
      setError(null)

      console.log("🔍 Fetching A/R data from ar_aging_detail table...")

      // Query the new ar_aging_detail table
      const { data: arDetails, error } = await supabase
        .from("ar_aging_detail")
        .select("*")
        .gt("open_balance", 0) // Only records with outstanding balances
        .order("customer", { ascending: true })
        .order("due_date", { ascending: true })

      if (error) throw error

      console.log(`📊 Found ${arDetails.length} A/R detail records`)

      // Group by customer and calculate aging
      const customerMap = new Map<string, {
        invoices: ARInvoice[]
        payments: ARPayment[]
        balance: number
        totalPayments: number
        aging: { current: number, days30: number, days60: number, days90: number }
      }>()

      arDetails.forEach((record: any) => {
        const customer = record.customer
        
        if (!customerMap.has(customer)) {
          customerMap.set(customer, {
            invoices: [],
            payments: [],
            balance: 0,
            totalPayments: 0,
            aging: { current: 0, days30: 0, days60: 0, days90: 0 }
          })
        }

        const customerData = customerMap.get(customer)!
        
        // Calculate days outstanding and aging bucket
        const daysOutstanding = calculateDaysOutstanding(record.due_date)
        const agingBucket = getAgingBucket(daysOutstanding)
        
        const invoice: ARInvoice = {
          id: record.id,
          date: record.date,
          type: record.type || 'Invoice',
          number: record.number || '',
          customer: record.customer,
          location: record.location || '',
          due_date: record.due_date,
          amount: Number(record.amount) || 0,
          open_balance: Number(record.open_balance) || 0,
          days_outstanding: daysOutstanding,
          aging_bucket: agingBucket
        }
        
        customerData.invoices.push(invoice)
        customerData.balance += invoice.open_balance
        
        // Add to appropriate aging bucket
        switch (agingBucket) {
          case 'current':
            customerData.aging.current += invoice.open_balance
            break
          case '31-60':
            customerData.aging.days30 += invoice.open_balance
            break
          case '61-90':
            customerData.aging.days60 += invoice.open_balance
            break
          case '90+':
            customerData.aging.days90 += invoice.open_balance
            break
        }
      })

      // Fetch payment details and aggregate by customer
      const { data: paymentDetails, error: paymentError } = await supabase
        .from("ar_payment_detail")
        .select("*")

      if (paymentError) {
        console.error("Error fetching payment data:", paymentError)
      } else if (paymentDetails) {
        paymentDetails.forEach((record: any) => {
          const customer = record.customer
          if (!customerMap.has(customer)) {
            customerMap.set(customer, {
              invoices: [],
              payments: [],
              balance: 0,
              totalPayments: 0,
              aging: { current: 0, days30: 0, days60: 0, days90: 0 }
            })
          }
          const customerData = customerMap.get(customer)!
          const payment: ARPayment = {
            invoiceNumber: record.invoice_number || '',
            paymentDate: record.payment_date,
            amount: Number(record.applied_amount) || 0
          }
          customerData.payments.push(payment)
          customerData.totalPayments += payment.amount
        })
      }

      // Convert to ARRecord format
      const arRecords: ARRecord[] = []
      
      customerMap.forEach((data, customer) => {
        arRecords.push({
          customer,
          balance: data.balance,
          invoiceCount: data.invoices.length,
          aging: data.aging,
          invoices: data.invoices,
          payments: data.payments,
          totalPayments: data.totalPayments
        })
      })

      // Sort by balance descending
      arRecords.sort((a, b) => b.balance - a.balance)

      console.log(`✅ Processed ${arRecords.length} customers with outstanding A/R`)
      setArData(arRecords)
      
      // Group by parent customers
      const groupedData = groupCustomersByParent(arRecords)
      setArGroupedData(groupedData)
    } catch (err) {
      console.error("❌ Error fetching A/R data:", err)
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchARData()
  }, [])

  // Calculate summary statistics
  const arSummary = useMemo(() => {
    const totalAR = arData.reduce((sum, record) => sum + record.balance, 0)
    const current = arData.reduce((sum, record) => sum + record.aging.current, 0)
    const days30 = arData.reduce((sum, record) => sum + record.aging.days30, 0)
    const days60 = arData.reduce((sum, record) => sum + record.aging.days60, 0)
    const days90 = arData.reduce((sum, record) => sum + record.aging.days90, 0)
    const pastDue = days30 + days60 + days90
    
    // Calculate weighted average DSO
    const totalDays = arData.reduce((sum, record) => {
      return sum + record.invoices.reduce((invSum, inv) => {
        return invSum + (inv.days_outstanding * inv.open_balance)
      }, 0)
    }, 0)
    const averageDSO = totalAR > 0 ? Math.round(totalDays / totalAR) : 0

    return {
      totalAR,
      current,
      days30,
      days60,
      days90,
      pastDue,
      averageDSO,
      customerCount: arData.length,
      totalInvoices: arData.reduce((sum, record) => sum + record.invoiceCount, 0)
    }
  }, [arData])

  // Filter data based on search and period
  const filteredData = useMemo(() => {
    let filtered = arGroupedData

    if (searchTerm) {
      filtered = filtered
        .map(group => {
          // Check if parent name matches or any sub-customer matches
          const parentMatches = group.parentCustomer.toLowerCase().includes(searchTerm.toLowerCase())
          const matchingSubCustomers = group.subCustomers.filter(sub => 
            sub.customer.toLowerCase().includes(searchTerm.toLowerCase())
          )
          
          if (parentMatches || matchingSubCustomers.length > 0) {
            // If parent matches, show all sub-customers
            // If only some sub-customers match, show only those
            return {
              ...group,
              subCustomers: parentMatches ? group.subCustomers : matchingSubCustomers,
              // Recalculate totals if we're filtering sub-customers
              ...(parentMatches ? {} : {
                totalBalance: matchingSubCustomers.reduce((sum, sub) => sum + sub.balance, 0),
                totalInvoiceCount: matchingSubCustomers.reduce((sum, sub) => sum + sub.invoiceCount, 0),
                totalAging: {
                  current: matchingSubCustomers.reduce((sum, sub) => sum + sub.aging.current, 0),
                  days30: matchingSubCustomers.reduce((sum, sub) => sum + sub.aging.days30, 0),
                  days60: matchingSubCustomers.reduce((sum, sub) => sum + sub.aging.days60, 0),
                  days90: matchingSubCustomers.reduce((sum, sub) => sum + sub.aging.days90, 0),
                }
              })
            }
          }
          return null
        })
        .filter(group => group !== null) as ARParentGroup[]
    }

    if (selectedPeriod !== "All") {
      filtered = filtered.filter(group => {
        if (selectedPeriod === "Current") return group.totalAging.current > 0
        if (selectedPeriod === "30-60") return group.totalAging.days30 > 0
        if (selectedPeriod === "60-90") return group.totalAging.days60 > 0
        if (selectedPeriod === "90+") return group.totalAging.days90 > 0
        return true
      })
    }

    return filtered
  }, [arGroupedData, searchTerm, selectedPeriod])

  // Calculate totals for the bottom row
  const tableTotals = useMemo(() => {
    return filteredData.reduce((totals, group) => ({
      current: totals.current + group.totalAging.current,
      days30: totals.days30 + group.totalAging.days30,
      days60: totals.days60 + group.totalAging.days60,
      days90: totals.days90 + group.totalAging.days90,
      totalBalance: totals.totalBalance + group.totalBalance,
      totalInvoices: totals.totalInvoices + group.totalInvoiceCount,
      totalPayments: totals.totalPayments + group.totalPayments
    }), {
      current: 0,
      days30: 0,
      days60: 0,
      days90: 0,
      totalBalance: 0,
      totalInvoices: 0,
      totalPayments: 0
    })
  }, [filteredData])

  const showCustomerTransactions = (customer: string, agingFilter?: string) => {
    setSelectedCustomer(customer)
    setSelectedAgingFilter(agingFilter)
    setShowTransactionModal(true)
  }

  const showJournalEntry = async (invoiceNumber: string) => {
    if (!invoiceNumber) return
    
    try {
      // Fetch the complete journal entry using the invoice number
      const { data: journalEntry, error } = await supabase
        .from("journal_entry_lines")
        .select("*")
        .eq("number", invoiceNumber)
        .order("line_number", { ascending: true })

      if (error) throw error
      
      if (journalEntry && journalEntry.length > 0) {
        setSelectedJournalEntry(journalEntry)
        setShowJournalModal(true)
      } else {
        console.log("No journal entry found for invoice number:", invoiceNumber)
      }
    } catch (err) {
      console.error("Error fetching journal entry:", err)
    }
  }

  const showParentTransactions = (parentCustomer: string, agingFilter?: string) => {
    // Find all invoices for this parent (including all sub-customers)
    const parentGroup = arGroupedData.find(group => group.parentCustomer === parentCustomer)
    if (parentGroup) {
      // We'll show transactions for the parent as a special case
      setSelectedCustomer(`${parentCustomer} (All Locations)`)
      setSelectedAgingFilter(agingFilter)
      setShowTransactionModal(true)
    }
  }

  const showCustomerPayments = (customer: string) => {
    const record = arData.find(r => r.customer === customer)
    if (record) {
      setSelectedPaymentCustomer(customer)
      setSelectedPayments(record.payments)
      setShowPaymentModal(true)
    }
  }

  const showParentPayments = (parentCustomer: string) => {
    const parentGroup = arGroupedData.find(g => g.parentCustomer === parentCustomer)
    if (parentGroup) {
      const allPayments = parentGroup.subCustomers.reduce((acc: ARPayment[], sub) => acc.concat(sub.payments), [])
      setSelectedPaymentCustomer(`${parentCustomer} (All Locations)`)
      setSelectedPayments(allPayments)
      setShowPaymentModal(true)
    }
  }

  // Filter invoices based on aging filter
  const getFilteredInvoices = (invoices: ARInvoice[], agingFilter?: string) => {
    if (!agingFilter || agingFilter === 'all') return invoices
    
    return invoices.filter(invoice => invoice.aging_bucket === agingFilter)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'current': return 'bg-green-100 text-green-800'
      case '31-60': return 'bg-yellow-100 text-yellow-800'
      case '61-90': return 'bg-orange-100 text-orange-800'
      case '90+': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const selectedCustomerData = selectedCustomer ? (() => {
    // Handle parent customer (All Locations) case
    if (selectedCustomer.includes('(All Locations)')) {
      const parentName = selectedCustomer.replace(' (All Locations)', '')
      const parentGroup = arGroupedData.find(group => group.parentCustomer === parentName)
      if (parentGroup) {
        // Combine all invoices from sub-customers
        const allInvoices = parentGroup.subCustomers.reduce((acc: ARInvoice[], subCustomer) => {
          return acc.concat(subCustomer.invoices)
        }, [])
        
        return {
          customer: selectedCustomer,
          balance: parentGroup.totalBalance,
          invoiceCount: parentGroup.totalInvoiceCount,
          aging: parentGroup.totalAging,
          invoices: allInvoices
        }
      }
    }
    
    // Handle individual customer case
    return arData.find(r => r.customer === selectedCustomer)
  })() : null
  
  const filteredInvoices = selectedCustomerData ? getFilteredInvoices(selectedCustomerData.invoices, selectedAgingFilter) : []

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex-1 text-center">
              <h1 className="text-2xl font-bold text-gray-900 text-center">Accounts Receivable</h1>
              <p className="text-sm text-gray-600 mt-1 text-center">
                Real-time A/R aging from imported aging detail reports
              </p>
              <p className="text-xs text-blue-600 mt-1 text-center">
                📊 Connected to ar_aging_detail table • Synced hourly
              </p>
            </div>
            <button
              onClick={fetchARData}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 mt-4 sm:mt-0"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
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
                    {arSummary.customerCount} customers • {arSummary.totalInvoices} invoices
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
              <h3 className="text-lg font-semibold text-gray-900 text-center">Aging Analysis</h3>
              <div className="text-sm text-gray-600 mt-1 text-center">Current aging breakdown from latest imported data</div>
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
              <h3 className="text-lg font-semibold text-gray-900 text-center">Outstanding Receivables</h3>
              <div className="text-sm text-gray-600 mt-1 text-center">
                Showing {filteredData.length} of {arGroupedData.length} customer groups • Click any amount to drill down
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
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Payments
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Invoices
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredData.map((group, groupIndex) => (
                      <React.Fragment key={group.parentCustomer}>
                        {/* Parent Row */}
                        <tr className="hover:bg-gray-50 bg-gray-25">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                            <div className="flex items-center">
                              {group.subCustomers.length > 1 ? (
                                <button
                                  onClick={() => toggleParentExpansion(group.parentCustomer)}
                                  className="mr-2 p-1 hover:bg-gray-200 rounded"
                                >
                                  {group.isExpanded ? (
                                    <ChevronDown className="w-4 h-4 text-gray-500" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4 text-gray-500" />
                                  )}
                                </button>
                              ) : (
                                <div className="w-6 mr-2"></div>
                              )}
                              {group.parentCustomer}
                              {group.subCustomers.length > 1 && (
                                <span className="ml-2 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                                  {group.subCustomers.length} locations
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                            {group.totalAging.current > 0 ? (
                              <button
                                onClick={() => showParentTransactions(group.parentCustomer, 'current')}
                                className="font-bold text-green-600 hover:text-green-800 hover:underline cursor-pointer"
                              >
                                {formatCurrency(group.totalAging.current)}
                              </button>
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                            {group.totalAging.days30 > 0 ? (
                              <button
                                onClick={() => showParentTransactions(group.parentCustomer, '31-60')}
                                className="font-bold text-yellow-600 hover:text-yellow-800 hover:underline cursor-pointer"
                              >
                                {formatCurrency(group.totalAging.days30)}
                              </button>
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                            {group.totalAging.days60 > 0 ? (
                              <button
                                onClick={() => showParentTransactions(group.parentCustomer, '61-90')}
                                className="font-bold text-orange-600 hover:text-orange-800 hover:underline cursor-pointer"
                              >
                                {formatCurrency(group.totalAging.days60)}
                              </button>
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                            {group.totalAging.days90 > 0 ? (
                              <button
                                onClick={() => showParentTransactions(group.parentCustomer, '90+')}
                                className="font-bold text-red-600 hover:text-red-800 hover:underline cursor-pointer"
                              >
                                {formatCurrency(group.totalAging.days90)}
                              </button>
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                            <button
                              onClick={() => showParentTransactions(group.parentCustomer, 'all')}
                              className="font-bold text-gray-900 hover:text-blue-600 hover:underline cursor-pointer text-lg"
                            >
                              {formatCurrency(group.totalBalance)}
                            </button>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                            {group.totalPayments > 0 ? (
                              <button
                                onClick={() => showParentPayments(group.parentCustomer)}
                                className="font-bold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                              >
                                {formatCurrency(group.totalPayments)}
                              </button>
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-bold text-gray-700">
                            {group.totalInvoiceCount}
                          </td>
                        </tr>

                        {/* Sub Customer Rows (when expanded and has multiple sub-customers) */}
                        {group.isExpanded && group.subCustomers.length > 1 && group.subCustomers.map((subCustomer, subIndex) => {
                          const { sub } = parseCustomerName(subCustomer.customer)
                          const displayName = sub || subCustomer.customer
                          
                          return (
                            <tr key={`${group.parentCustomer}-${subIndex}`} className="hover:bg-blue-25 bg-blue-50">
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                                <div className="flex items-center">
                                  <div className="w-6"></div> {/* Spacer for alignment */}
                                  <span className="text-blue-700">↳ {displayName}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                                {subCustomer.aging.current > 0 ? (
                                  <button
                                    onClick={() => showCustomerTransactions(subCustomer.customer, 'current')}
                                    className="font-medium text-green-600 hover:text-green-800 hover:underline cursor-pointer"
                                  >
                                    {formatCurrency(subCustomer.aging.current)}
                                  </button>
                                ) : (
                                  <span className="text-gray-300">-</span>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                                {subCustomer.aging.days30 > 0 ? (
                                  <button
                                    onClick={() => showCustomerTransactions(subCustomer.customer, '31-60')}
                                    className="font-medium text-yellow-600 hover:text-yellow-800 hover:underline cursor-pointer"
                                  >
                                    {formatCurrency(subCustomer.aging.days30)}
                                  </button>
                                ) : (
                                  <span className="text-gray-300">-</span>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                                {subCustomer.aging.days60 > 0 ? (
                                  <button
                                    onClick={() => showCustomerTransactions(subCustomer.customer, '61-90')}
                                    className="font-medium text-orange-600 hover:text-orange-800 hover:underline cursor-pointer"
                                  >
                                    {formatCurrency(subCustomer.aging.days60)}
                                  </button>
                                ) : (
                                  <span className="text-gray-300">-</span>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                                {subCustomer.aging.days90 > 0 ? (
                                  <button
                                    onClick={() => showCustomerTransactions(subCustomer.customer, '90+')}
                                    className="font-medium text-red-600 hover:text-red-800 hover:underline cursor-pointer"
                                  >
                                    {formatCurrency(subCustomer.aging.days90)}
                                  </button>
                                ) : (
                                  <span className="text-gray-300">-</span>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                                <button
                                  onClick={() => showCustomerTransactions(subCustomer.customer, 'all')}
                                  className="font-medium text-gray-900 hover:text-blue-600 hover:underline cursor-pointer"
                                >
                                  {formatCurrency(subCustomer.balance)}
                                </button>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                                {subCustomer.totalPayments > 0 ? (
                                  <button
                                    onClick={() => showCustomerPayments(subCustomer.customer)}
                                    className="font-medium text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                                  >
                                    {formatCurrency(subCustomer.totalPayments)}
                                  </button>
                                ) : (
                                  <span className="text-gray-300">-</span>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-600">
                                {subCustomer.invoiceCount}
                              </td>
                            </tr>
                          )
                        })}
                      </React.Fragment>
                    ))}
                  </tbody>
                  
                  {/* Totals Footer */}
                  <tfoot className="bg-gray-100 border-t-2 border-gray-300">
                    <tr>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                        TOTALS ({filteredData.length} groups)
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-green-700">
                        {formatCurrency(tableTotals.current)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-yellow-700">
                        {formatCurrency(tableTotals.days30)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-orange-700">
                        {formatCurrency(tableTotals.days60)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-red-700">
                        {formatCurrency(tableTotals.days90)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-gray-900 text-lg">
                        {formatCurrency(tableTotals.totalBalance)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-blue-700">
                        {formatCurrency(tableTotals.totalPayments)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-bold text-gray-700">
                        {tableTotals.totalInvoices}
                      </td>
                    </tr>
                  </tfoot>
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

      {/* Invoice Detail Modal */}
      {showTransactionModal && selectedCustomerData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-5xl w-full max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-gray-200 flex-shrink-0">
              <div className="flex justify-between items-center">
                <div className="flex-1 text-center">
                  <h3 className="text-lg font-semibold text-gray-900 text-center">
                    {selectedAgingFilter && selectedAgingFilter !== 'all'
                      ? `${selectedAgingFilter === 'current' ? 'Current (0-30)' :
                          selectedAgingFilter === '31-60' ? '31-60 Days' :
                          selectedAgingFilter === '61-90' ? '61-90 Days' :
                          '90+ Days'} Invoices - ${selectedCustomerData.customer}`
                      : `All Outstanding Invoices - ${selectedCustomerData.customer}`
                    }
                  </h3>
                  <p className="text-sm text-gray-600 text-center">
                    {selectedAgingFilter && selectedAgingFilter !== 'all'
                      ? `Showing ${filteredInvoices.length} invoices in this aging category • Total: ${formatCurrency(filteredInvoices.reduce((sum, inv) => sum + inv.open_balance, 0))}`
                      : `Outstanding balance: ${formatCurrency(selectedCustomerData.balance)} • ${selectedCustomerData.invoiceCount} invoices`
                    }
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
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Number</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Open Balance</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Days</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredInvoices.map((invoice, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {formatDateSafe(invoice.date)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                          {invoice.type}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          {invoice.number ? (
                            <button
                              onClick={() => showJournalEntry(invoice.number)}
                              className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                            >
                              {invoice.number}
                            </button>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {invoice.location || '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                          {formatDateSafe(invoice.due_date)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                          {formatCurrency(invoice.amount)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-red-600">
                          {formatCurrency(invoice.open_balance)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-center">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(invoice.aging_bucket)}`}>
                            {invoice.days_outstanding} days
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Detail Modal */}
      {showPaymentModal && selectedPayments.length > 0 && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-gray-200 flex-shrink-0">
              <div className="flex justify-between items-center">
                <h3 className="flex-1 text-lg font-semibold text-gray-900 text-center">
                  Payments - {selectedPaymentCustomer}
                </h3>
                <button
                  onClick={() => setShowPaymentModal(false)}
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
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {selectedPayments.map((payment, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {formatDateSafe(payment.paymentDate)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                          {payment.invoiceNumber || '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                          {formatCurrency(payment.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Journal Entry Detail Modal */}
      {showJournalModal && selectedJournalEntry && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-6xl w-full max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-gray-200 flex-shrink-0">
              <div className="flex justify-between items-center">
                <div className="flex-1 text-center">
                  <h3 className="text-lg font-semibold text-gray-900 text-center">
                    Journal Entry Details
                  </h3>
                  <p className="text-sm text-gray-600 text-center">
                    Invoice #{selectedJournalEntry[0]?.number} • Entry #{selectedJournalEntry[0]?.entry_number} • Date: {formatDateSafe(selectedJournalEntry[0]?.date)} • {selectedJournalEntry.length} lines
                  </p>
                </div>
                <button
                  onClick={() => setShowJournalModal(false)}
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
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Line</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Account</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Debit</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Credit</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {selectedJournalEntry.map((line: any, index: number) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          {line.line_number || index + 1}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          <div>
                            <div className="font-medium">{line.account_type || line.account}</div>
                            {line.account_code && (
                              <div className="text-xs text-gray-500">{line.account_code}</div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {line.memo || line.description || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {line.customer || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {line.vendor || line.name || '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right">
                          {line.debit > 0 ? (
                            <span className="font-medium text-gray-900">
                              {formatCurrency(line.debit)}
                            </span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right">
                          {line.credit > 0 ? (
                            <span className="font-medium text-gray-900">
                              {formatCurrency(line.credit)}
                            </span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td colSpan={5} className="px-4 py-3 text-sm font-medium text-gray-900">
                        Totals:
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-bold text-gray-900">
                        {formatCurrency(selectedJournalEntry.reduce((sum: number, line: any) => sum + (line.debit || 0), 0))}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-bold text-gray-900">
                        {formatCurrency(selectedJournalEntry.reduce((sum: number, line: any) => sum + (line.credit || 0), 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
