"use client"

import { useState, useEffect, useMemo } from "react"
import React from "react"
import { FileText, Clock, AlertTriangle, CheckCircle, RefreshCw, Search, DollarSign, ChevronDown, ChevronRight } from "lucide-react"
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

interface APInvoice {
  id: number
  date: string | null
  type: string | null
  number: string | null
  vendor: string
  due_date: string | null
  amount: number
  open_balance: number
  days_outstanding: number
  aging_bucket: "current" | "31-60" | "61-90" | "90+"
}

interface APRecord {
  vendor: string
  balance: number
  billCount: number
  aging: {
    current: number
    days30: number
    days60: number
    days90: number
  }
  bills: APInvoice[]
}

interface APParentGroup {
  parentVendor: string
  totalBalance: number
  totalBillCount: number
  totalAging: {
    current: number
    days30: number
    days60: number
    days90: number
  }
  subVendors: APRecord[]
  isExpanded: boolean
}

export default function AccountsPayablePage() {
  const [selectedPeriod, setSelectedPeriod] = useState("All")
  const [isLoading, setIsLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [apData, setApData] = useState<APRecord[]>([])
  const [apGroupedData, setApGroupedData] = useState<APParentGroup[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selectedVendor, setSelectedVendor] = useState<string | null>(null)
  const [showTransactionModal, setShowTransactionModal] = useState(false)
  const [selectedAgingFilter, setSelectedAgingFilter] = useState<string | undefined>(undefined)

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value || 0)

  const getDateParts = (dateString?: string | null) => {
    if (!dateString) return { year: 0, month: 0, day: 0, dateStr: "" }
    const cleanDate = dateString.includes("T") ? dateString.split("T")[0] : dateString
    const [year, month, day] = cleanDate.split("-").map(Number)
    return { year: year || 0, month: month || 0, day: day || 0, dateStr: cleanDate }
  }

  const formatDateSafe = (dateStr?: string | null): string => {
    if (!dateStr) return ""
    try {
      const { year, month, day } = getDateParts(dateStr)
      if (!year || !month || !day) return dateStr
      const date = new Date(year, month - 1, day)
      return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
    } catch {
      return dateStr || ""
    }
  }

  // prefer computing from due_date so it works even if 'past_due' is null
  const calculateDaysOutstanding = (dueDate?: string | null): number => {
    if (!dueDate) return 0
    const { year, month, day } = getDateParts(dueDate)
    if (!year || !month || !day) return 0
    const due = new Date(year, month - 1, day)
    const today = new Date()
    const diffTime = today.getTime() - due.getTime()
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  }

  const getAgingBucket = (daysOutstanding: number): APInvoice["aging_bucket"] => {
    if (daysOutstanding <= 0) return "current"
    if (daysOutstanding <= 30) return "current"
    if (daysOutstanding <= 60) return "31-60"
    if (daysOutstanding <= 90) return "61-90"
    return "90+"
  }

  // Parse vendor "Parent: Sub" -> group by Parent
  const parseVendorName = (full: string) => {
    if (full.includes(":")) {
      const [parent, sub] = full.split(":", 2)
      return { parent: parent.trim(), sub: sub.trim(), full }
    }
    return { parent: full, sub: null as string | null, full }
  }

  const groupVendorsByParent = (vendors: APRecord[]): APParentGroup[] => {
    const parentGroups = new Map<string, APParentGroup>()
    vendors.forEach((vendorRow) => {
      const { parent } = parseVendorName(vendorRow.vendor)
      if (!parentGroups.has(parent)) {
        parentGroups.set(parent, {
          parentVendor: parent,
          totalBalance: 0,
          totalBillCount: 0,
          totalAging: { current: 0, days30: 0, days60: 0, days90: 0 },
          subVendors: [],
          isExpanded: false,
        })
      }
      const group = parentGroups.get(parent)!
      group.subVendors.push(vendorRow)
      group.totalBalance += vendorRow.balance
      group.totalBillCount += vendorRow.billCount
      group.totalAging.current += vendorRow.aging.current
      group.totalAging.days30 += vendorRow.aging.days30
      group.totalAging.days60 += vendorRow.aging.days60
      group.totalAging.days90 += vendorRow.aging.days90
    })
    parentGroups.forEach((g) => g.subVendors.sort((a, b) => b.balance - a.balance))
    return Array.from(parentGroups.values()).sort((a, b) => b.totalBalance - a.totalBalance)
  }

  const toggleParentExpansion = (parentVendor: string) => {
    setApGroupedData((prev) =>
      prev.map((g) => (g.parentVendor === parentVendor ? { ...g, isExpanded: !g.isExpanded } : g))
    )
  }

  const fetchAPData = async () => {
    try {
      setIsLoading(true)
      setError(null)

      // Pull open AP items
      const { data, error } = await supabase
        .from("ap_aging")
        .select("*")
        .gt("open_balance", 0)
        .order("vendor", { ascending: true })
        .order("due_date", { ascending: true })

      if (error) throw error

      const vendorMap = new Map<
        string,
        { bills: APInvoice[]; balance: number; aging: APRecord["aging"] }
      >()

      ;(data || []).forEach((row: any) => {
        const vendor = row.vendor as string
        if (!vendor) return

        if (!vendorMap.has(vendor)) {
          vendorMap.set(vendor, {
            bills: [],
            balance: 0,
            aging: { current: 0, days30: 0, days60: 0, days90: 0 },
          })
        }
        const slot = vendorMap.get(vendor)!

        // Prefer computing days from due_date; if you want to use row.past_due, replace next line with:
        // const days = typeof row.past_due === "number" ? row.past_due : calculateDaysOutstanding(row.due_date)
        const days = calculateDaysOutstanding(row.due_date)
        const bucket = getAgingBucket(days)

        const bill: APInvoice = {
          id: row.id,
          date: row.date ?? null,
          type: row.type ?? "Bill",
          number: row.number ?? "",
          vendor,
          due_date: row.due_date ?? null,
          amount: Number(row.amount) || 0,
          open_balance: Number(row.open_balance) || 0,
          days_outstanding: days,
          aging_bucket: bucket,
        }

        slot.bills.push(bill)
        slot.balance += bill.open_balance
        switch (bucket) {
          case "current":
            slot.aging.current += bill.open_balance
            break
          case "31-60":
            slot.aging.days30 += bill.open_balance
            break
          case "61-90":
            slot.aging.days60 += bill.open_balance
            break
          case "90+":
            slot.aging.days90 += bill.open_balance
            break
        }
      })

      const records: APRecord[] = []
      vendorMap.forEach((v, vendor) => {
        records.push({
          vendor,
          balance: v.balance,
          billCount: v.bills.length,
          aging: v.aging,
          bills: v.bills,
        })
      })

      records.sort((a, b) => b.balance - a.balance)
      setApData(records)
      setApGroupedData(groupVendorsByParent(records))
    } catch (e: any) {
      setError(e?.message || "Failed to load A/P data")
      console.error(e)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchAPData()
  }, [])

  // Summary
  const apSummary = useMemo(() => {
    const totalAP = apData.reduce((s, r) => s + r.balance, 0)
    const current = apData.reduce((s, r) => s + r.aging.current, 0)
    const days30 = apData.reduce((s, r) => s + r.aging.days30, 0)
    const days60 = apData.reduce((s, r) => s + r.aging.days60, 0)
    const days90 = apData.reduce((s, r) => s + r.aging.days90, 0)
    const pastDue = days30 + days60 + days90

    // Weighted avg days outstanding over OPEN balances
    const totalDays = apData.reduce((sum, r) => {
      return (
        sum +
        r.bills.reduce((sub, b) => sub + b.days_outstanding * b.open_balance, 0)
      )
    }, 0)
    const avgDays = totalAP > 0 ? Math.round(totalDays / totalAP) : 0

    return {
      totalAP,
      current,
      days30,
      days60,
      days90,
      pastDue,
      averageDaysOutstanding: avgDays,
      vendorCount: apData.length,
      totalBills: apData.reduce((s, r) => s + r.billCount, 0),
    }
  }, [apData])

  // Filters
  const filteredData = useMemo(() => {
    let groups = apGroupedData

    if (searchTerm) {
      groups = groups
        .map((g) => {
          const parentMatches = g.parentVendor.toLowerCase().includes(searchTerm.toLowerCase())
          const matchingSubs = g.subVendors.filter((s) =>
            s.vendor.toLowerCase().includes(searchTerm.toLowerCase())
          )
          if (parentMatches || matchingSubs.length) {
            return {
              ...g,
              subVendors: parentMatches ? g.subVendors : matchingSubs,
              ...(parentMatches
                ? {}
                : {
                    totalBalance: matchingSubs.reduce((sum, s) => sum + s.balance, 0),
                    totalBillCount: matchingSubs.reduce((sum, s) => sum + s.billCount, 0),
                    totalAging: {
                      current: matchingSubs.reduce((sum, s) => sum + s.aging.current, 0),
                      days30: matchingSubs.reduce((sum, s) => sum + s.aging.days30, 0),
                      days60: matchingSubs.reduce((sum, s) => sum + s.aging.days60, 0),
                      days90: matchingSubs.reduce((sum, s) => sum + s.aging.days90, 0),
                    },
                  }),
            }
          }
          return null
        })
        .filter(Boolean) as APParentGroup[]
    }

    if (selectedPeriod !== "All") {
      groups = groups.filter((g) => {
        if (selectedPeriod === "Current") return g.totalAging.current > 0
        if (selectedPeriod === "30-60") return g.totalAging.days30 > 0
        if (selectedPeriod === "60-90") return g.totalAging.days60 > 0
        if (selectedPeriod === "90+") return g.totalAging.days90 > 0
        return true
      })
    }

    return groups
  }, [apGroupedData, searchTerm, selectedPeriod])

  const tableTotals = useMemo(
    () =>
      filteredData.reduce(
        (t, g) => ({
          current: t.current + g.totalAging.current,
          days30: t.days30 + g.totalAging.days30,
          days60: t.days60 + g.totalAging.days60,
          days90: t.days90 + g.totalAging.days90,
          totalBalance: t.totalBalance + g.totalBalance,
          totalBills: t.totalBills + g.totalBillCount,
        }),
        { current: 0, days30: 0, days60: 0, days90: 0, totalBalance: 0, totalBills: 0 }
      ),
    [filteredData]
  )

  const getStatusColor = (status: string) => {
    switch (status) {
      case "current":
        return "bg-green-100 text-green-800"
      case "31-60":
        return "bg-yellow-100 text-yellow-800"
      case "61-90":
        return "bg-orange-100 text-orange-800"
      case "90+":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const showVendorTransactions = (vendor: string, agingFilter?: APInvoice["aging_bucket"] | "all") => {
    setSelectedVendor(vendor)
    setSelectedAgingFilter(agingFilter)
    setShowTransactionModal(true)
  }

  const parseSubName = (full: string) => {
    const { sub } = parseVendorName(full)
    return sub || full
  }

  const selectedVendorData = selectedVendor
    ? (() => {
        // parent "All Locations"
        if (selectedVendor.includes("(All Locations)")) {
          const parent = selectedVendor.replace(" (All Locations)", "")
          const group = apGroupedData.find((g) => g.parentVendor === parent)
          if (group) {
            const allBills = group.subVendors.flatMap((s) => s.bills)
            return {
              vendor: selectedVendor,
              balance: group.totalBalance,
              billCount: group.totalBillCount,
              aging: group.totalAging,
              bills: allBills,
            }
          }
        }
        return apData.find((r) => r.vendor === selectedVendor) || null
      })()
    : null

  const getFilteredBills = (bills: APInvoice[], filter?: string) => {
    if (!filter || filter === "all") return bills
    return bills.filter((b) => b.aging_bucket === filter)
  }

  const filteredBills = selectedVendorData
    ? getFilteredBills(selectedVendorData.bills, selectedAgingFilter)
    : []

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Accounts Payable</h1>
              <p className="text-sm text-gray-600 mt-1">Real-time A/P aging from imported vendor bills</p>
              <p className="text-xs text-blue-600 mt-1">📊 Connected to ap_aging table • Synced hourly</p>
            </div>
            <button
              onClick={fetchAPData}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-700">Error loading A/P data: {error}</p>
            </div>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin mr-2 text-blue-600" />
              <span className="text-gray-600">Loading accounts payable data...</span>
            </div>
          )}

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-lg shadow-sm border-l-4" style={{ borderLeftColor: BRAND_COLORS.primary }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-gray-600 text-sm font-medium mb-2">Total A/P</div>
                  <div className="text-2xl font-bold text-gray-900">{formatCurrency(apSummary.totalAP)}</div>
                  <div className="text-xs text-gray-500 font-medium mt-1">
                    {apSummary.vendorCount} vendors • {apSummary.totalBills} bills
                  </div>
                </div>
                <DollarSign className="w-8 h-8" style={{ color: BRAND_COLORS.primary }} />
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border-l-4" style={{ borderLeftColor: BRAND_COLORS.success }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-gray-600 text-sm font-medium mb-2">Current</div>
                  <div className="text-2xl font-bold text-gray-900">{formatCurrency(apSummary.current)}</div>
                  <div className="text-xs text-green-600 font-medium mt-1">
                    {apSummary.totalAP > 0 ? Math.round((apSummary.current / apSummary.totalAP) * 100) : 0}% of total
                  </div>
                </div>
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border-l-4" style={{ borderLeftColor: BRAND_COLORS.warning }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-gray-600 text-sm font-medium mb-2">Past Due</div>
                  <div className="text-2xl font-bold text-gray-900">{formatCurrency(apSummary.pastDue)}</div>
                  <div className="text-xs text-orange-600 font-medium mt-1">
                    {apSummary.totalAP > 0 ? Math.round((apSummary.pastDue / apSummary.totalAP) * 100) : 0}% of total
                  </div>
                </div>
                <AlertTriangle className="w-8 h-8 text-orange-500" />
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border-l-4" style={{ borderLeftColor: BRAND_COLORS.secondary }}>
              <div classNameName="flex items-center justify-between">
                <div>
                  <div className="text-gray-600 text-sm font-medium mb-2">Avg Days Outstanding</div>
                  <div className="text-2xl font-bold text-gray-900">{apSummary.averageDaysOutstanding}</div>
                  <div className="text-xs text-blue-600 font-medium mt-1">Days</div>
                </div>
                <Clock className="w-8 h-8" style={{ color: BRAND_COLORS.secondary }} />
              </div>
            </div>
          </div>

          {/* Aging Analysis */}
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Aging Analysis (A/P)</h3>
              <div className="text-sm text-gray-600 mt-1">Current aging breakdown from latest imported data</div>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600 mb-2">{formatCurrency(apSummary.current)}</div>
                  <div className="text-sm text-gray-600 mb-1">Current (0-30 days)</div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-green-500 h-2 rounded-full" style={{ width: `${apSummary.totalAP > 0 ? (apSummary.current / apSummary.totalAP) * 100 : 0}%` }}></div>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {apSummary.totalAP > 0 ? Math.round((apSummary.current / apSummary.totalAP) * 100) : 0}%
                  </div>
                </div>

                <div className="text-center">
                  <div className="text-3xl font-bold text-yellow-600 mb-2">{formatCurrency(apSummary.days30)}</div>
                  <div className="text-sm text-gray-600 mb-1">31-60 days</div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-yellow-500 h-2 rounded-full" style={{ width: `${apSummary.totalAP > 0 ? (apSummary.days30 / apSummary.totalAP) * 100 : 0}%` }}></div>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {apSummary.totalAP > 0 ? Math.round((apSummary.days30 / apSummary.totalAP) * 100) : 0}%
                  </div>
                </div>

                <div className="text-center">
                  <div className="text-3xl font-bold text-orange-600 mb-2">{formatCurrency(apSummary.days60)}</div>
                  <div className="text-sm text-gray-600 mb-1">61-90 days</div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-orange-500 h-2 rounded-full" style={{ width: `${apSummary.totalAP > 0 ? (apSummary.days60 / apSummary.totalAP) * 100 : 0}%` }}></div>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {apSummary.totalAP > 0 ? Math.round((apSummary.days60 / apSummary.totalAP) * 100) : 0}%
                  </div>
                </div>

                <div className="text-center">
                  <div className="text-3xl font-bold text-red-600 mb-2">{formatCurrency(apSummary.days90)}</div>
                  <div className="text-sm text-gray-600 mb-1">90+ days</div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-red-500 h-2 rounded-full" style={{ width: `${apSummary.totalAP > 0 ? (apSummary.days90 / apSummary.totalAP) * 100 : 0}%` }}></div>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {apSummary.totalAP > 0 ? Math.round((apSummary.days90 / apSummary.totalAP) * 100) : 0}%
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Search vendors..."
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

          {/* A/P Table */}
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Outstanding Payables</h3>
              <div className="text-sm text-gray-600 mt-1">
                Showing {filteredData.length} of {apGroupedData.length} vendor groups • Click any amount to drill down
              </div>
            </div>

            {filteredData.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Current (0-30)</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">31-60 Days</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">61-90 Days</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">90+ Days</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Balance</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Bills</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredData.map((group) => (
                      <React.Fragment key={group.parentVendor}>
                        {/* Parent Row */}
                        <tr className="hover:bg-gray-50 bg-gray-25">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                            <div className="flex items-center">
                              {group.subVendors.length > 1 ? (
                                <button
                                  onClick={() => toggleParentExpansion(group.parentVendor)}
                                  className="mr-2 p-1 hover:bg-gray-200 rounded"
                                >
                                  {group.isExpanded ? (
                                    <ChevronDown className="w-4 h-4 text-gray-500" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4 text-gray-500" />
                                  )}
                                </button>
                              ) : (
                                <div className="w-6 mr-2" />
                              )}
                              {group.parentVendor}
                              {group.subVendors.length > 1 && (
                                <span className="ml-2 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                                  {group.subVendors.length} locations
                                </span>
                              )}
                            </div>
                          </td>
                          {(["current", "days30", "days60", "days90"] as const).map((key) => (
                            <td key={key} className="px-6 py-4 whitespace-nowrap text-sm text-right">
                              {group.totalAging[key] > 0 ? (
                                <button
                                  onClick={() =>
                                    showVendorTransactions(
                                      `${group.parentVendor} (All Locations)`,
                                      key === "current" ? "current" : key === "days30" ? "31-60" : key === "days60" ? "61-90" : "90+"
                                    )
                                  }
                                  className={`font-bold ${
                                    key === "current"
                                      ? "text-green-600 hover:text-green-800"
                                      : key === "days30"
                                      ? "text-yellow-600 hover:text-yellow-800"
                                      : key === "days60"
                                      ? "text-orange-600 hover:text-orange-800"
                                      : "text-red-600 hover:text-red-800"
                                  } hover:underline cursor-pointer`}
                                >
                                  {formatCurrency(group.totalAging[key])}
                                </button>
                              ) : (
                                <span className="text-gray-300">-</span>
                              )}
                            </td>
                          ))}
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                            <button
                              onClick={() => showVendorTransactions(`${group.parentVendor} (All Locations)`, "all")}
                              className="font-bold text-gray-900 hover:text-blue-600 hover:underline cursor-pointer text-lg"
                            >
                              {formatCurrency(group.totalBalance)}
                            </button>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-bold text-gray-700">
                            {group.totalBillCount}
                          </td>
                        </tr>

                        {/* Sub Vendors */}
                        {group.isExpanded &&
                          group.subVendors.length > 1 &&
                          group.subVendors.map((sub) => (
                            <tr key={sub.vendor} className="hover:bg-blue-25 bg-blue-50">
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                                <div className="flex items-center">
                                  <div className="w-6" />
                                  <span className="text-blue-700">↳ {parseSubName(sub.vendor)}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                                {sub.aging.current > 0 ? (
                                  <button
                                    onClick={() => showVendorTransactions(sub.vendor, "current")}
                                    className="font-medium text-green-600 hover:text-green-800 hover:underline cursor-pointer"
                                  >
                                    {formatCurrency(sub.aging.current)}
                                  </button>
                                ) : (
                                  <span className="text-gray-300">-</span>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                                {sub.aging.days30 > 0 ? (
                                  <button
                                    onClick={() => showVendorTransactions(sub.vendor, "31-60")}
                                    className="font-medium text-yellow-600 hover:text-yellow-800 hover:underline cursor-pointer"
                                  >
                                    {formatCurrency(sub.aging.days30)}
                                  </button>
                                ) : (
                                  <span className="text-gray-300">-</span>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                                {sub.aging.days60 > 0 ? (
                                  <button
                                    onClick={() => showVendorTransactions(sub.vendor, "61-90")}
                                    className="font-medium text-orange-600 hover:text-orange-800 hover:underline cursor-pointer"
                                  >
                                    {formatCurrency(sub.aging.days60)}
                                  </button>
                                ) : (
                                  <span className="text-gray-300">-</span>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                                {sub.aging.days90 > 0 ? (
                                  <button
                                    onClick={() => showVendorTransactions(sub.vendor, "90+")}
                                    className="font-medium text-red-600 hover:text-red-800 hover:underline cursor-pointer"
                                  >
                                    {formatCurrency(sub.aging.days90)}
                                  </button>
                                ) : (
                                  <span className="text-gray-300">-</span>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                                <button
                                  onClick={() => showVendorTransactions(sub.vendor, "all")}
                                  className="font-medium text-gray-900 hover:text-blue-600 hover:underline cursor-pointer"
                                >
                                  {formatCurrency(sub.balance)}
                                </button>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-600">
                                {sub.billCount}
                              </td>
                            </tr>
                          ))}
                      </React.Fragment>
                    ))}
                  </tbody>

                  {/* Totals */}
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
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-bold text-gray-700">
                        {tableTotals.totalBills}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center">
                <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">No accounts payable found for the selected filters.</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Bills Modal */}
      {showTransactionModal && selectedVendorData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-5xl w-full max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-gray-200 flex-shrink-0">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {selectedAgingFilter && selectedAgingFilter !== "all"
                      ? `${
                          selectedAgingFilter === "current"
                            ? "Current (0-30)"
                            : selectedAgingFilter === "31-60"
                            ? "31-60 Days"
                            : selectedAgingFilter === "61-90"
                            ? "61-90 Days"
                            : "90+ Days"
                        } Bills — ${selectedVendorData.vendor}`
                      : `All Outstanding Bills — ${selectedVendorData.vendor}`}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {selectedAgingFilter && selectedAgingFilter !== "all"
                      ? `Showing ${filteredBills.length} bills • Total: ${formatCurrency(
                          filteredBills.reduce((s, b) => s + b.open_balance, 0)
                        )}`
                      : `Outstanding balance: ${formatCurrency(selectedVendorData.balance)} • ${selectedVendorData.billCount} bills`}
                  </p>
                </div>
                <button onClick={() => setShowTransactionModal(false)} className="text-gray-400 hover:text-gray-600">
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
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Open Balance</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Days</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredBills.map((b, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{formatDateSafe(b.date || "")}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{b.type || "Bill"}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{b.number || "-"}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{formatDateSafe(b.due_date || "")}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">{formatCurrency(b.amount)}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-red-600">
                          {formatCurrency(b.open_balance)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-center">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(b.aging_bucket)}`}>
                            {b.days_outstanding} days
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
    </div>
  )
}
