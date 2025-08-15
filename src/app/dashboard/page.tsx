"use client"

import type React from "react"
import { useState, useEffect } from "react"
import {
  Download,
  RefreshCw,
  TrendingUp,
  DollarSign,
  PieChart,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Menu,
  X,
  Eye,
  EyeOff,
} from "lucide-react"
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Bar,
  BarChart,
  PieChart as RechartsPieChart,
  Cell,
  Pie,
  ComposedChart,
} from "recharts"
import { supabase } from "@/lib/supabaseClient"
import Image from "next/image"

// I AM CFO Brand Colors
const BRAND_COLORS = {
  primary: "#56B6E9",
  secondary: "#3A9BD1",
  tertiary: "#7CC4ED",
  accent: "#2E86C1",
  success: "#27AE60",
  warning: "#F39C12",
  danger: "#E74C3C",
  gray: {
    50: "#F8FAFC",
    100: "#F1F5F9",
    200: "#E2E8F0",
    300: "#CBD5E1",
    400: "#94A3B8",
    500: "#64748B",
    600: "#475569",
    700: "#334155",
    800: "#1E293B",
    900: "#0F172A",
  },
}

// Smart debugging configuration
const DEBUG_CONFIG = {
  isDevelopment: typeof window !== "undefined" && window.location.hostname === "localhost",
  isDebugMode: typeof window !== "undefined" && localStorage.getItem("iam-cfo-debug") === "true",
  enableDataValidation: true,
  enablePerformanceTracking: true,
}

// Smart console logging - only in development or debug mode
const smartLog = (message, data, level = "info") => {
  if (DEBUG_CONFIG.isDevelopment || DEBUG_CONFIG.isDebugMode) {
    const timestamp = new Date().toISOString()
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`

    switch (level) {
      case "warn":
        console.warn(prefix, message, data)
        break
      case "error":
        console.error(prefix, message, data)
        break
      default:
        console.log(prefix, message, data)
    }
  }
}

// Data validation cache
const validationCache = new Map()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// Cache performance metrics
const cacheMetrics = {
  hits: 0,
  misses: 0,
  getHitRate: () => {
    const total = cacheMetrics.hits + cacheMetrics.misses
    return total > 0 ? ((cacheMetrics.hits / total) * 100).toFixed(1) : "0.0"
  },
}

// Performance-conscious cache cleanup
const cleanupCache = () => {
  const now = Date.now()
  const keysToDelete = []

  validationCache.forEach((value, key) => {
    if (now - value.timestamp > CACHE_TTL) {
      keysToDelete.push(key)
    }
  })

  keysToDelete.forEach((key) => validationCache.delete(key))

  if (DEBUG_CONFIG.isDebugMode) {
    smartLog(`🧹 Cache cleanup: removed ${keysToDelete.length} expired entries, ${validationCache.size} remaining`)
  }
}

// Auto-cleanup cache every 10 minutes
if (typeof window !== "undefined") {
  setInterval(cleanupCache, 10 * 60 * 1000)
}

// Performance tracking
const performanceTracker = {
  startTime: (operation) => {
    if (DEBUG_CONFIG.enablePerformanceTracking) {
      return performance.now()
    }
    return 0
  },
  endTime: (operation, startTime) => {
    if (DEBUG_CONFIG.enablePerformanceTracking && startTime > 0) {
      const duration = performance.now() - startTime
      smartLog(`⚡ Performance: ${operation} took ${duration.toFixed(2)}ms`)
    }
  },
}

// Data integrity validator
const validateDataIntegrity = (data, source, expectedCount, callback) => {
  const cacheKey = `${source}-${JSON.stringify(data?.slice(0, 5))}`
  const cached = validationCache.get(cacheKey)

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    cacheMetrics.hits++
    smartLog(`🎯 Cache hit for ${source} (${cacheMetrics.getHitRate()}% hit rate)`)
    return cached.result
  }

  cacheMetrics.misses++

  const validation = {
    source,
    isValid: true,
    issues: [],
    stats: {
      totalRecords: data?.length || 0,
      nullRecords: 0,
      invalidAmounts: 0,
      missingDates: 0,
      duplicateIds: 0,
    },
  }

  if (!data || !Array.isArray(data)) {
    validation.isValid = false
    validation.issues.push("Data is not an array")
    return validation
  }

  const seenIds = new Set()

  data.forEach((item, index) => {
    if (!item) {
      validation.stats.nullRecords++
      validation.issues.push(`Record ${index} is null/undefined`)
    } else {
      if (typeof item.amount !== "number" || isNaN(item.amount)) {
        validation.stats.invalidAmounts++
        validation.issues.push(`Record ${index} has invalid amount: ${item.amount}`)
      }

      if (!item.date) {
        validation.stats.missingDates++
        validation.issues.push(`Record ${index} has missing date`)
      }

      if (item.id && seenIds.has(item.id)) {
        validation.stats.duplicateIds++
        validation.issues.push(`Duplicate ID found: ${item.id}`)
      } else if (item.id) {
        seenIds.add(item.id)
      }
    }
  })

  if (expectedCount && validation.stats.totalRecords !== expectedCount) {
    validation.isValid = false
    validation.issues.push(`Expected ${expectedCount} records, got ${validation.stats.totalRecords}`)
  }

  validation.isValid = validation.issues.length === 0

  // Cache the result
  validationCache.set(cacheKey, {
    timestamp: Date.now(),
    result: validation,
  })

  // Log validation results
  if (!validation.isValid) {
    smartLog(`❌ Data integrity issues in ${source}:`, validation, "error")
  } else if (DEBUG_CONFIG.isDebugMode) {
    smartLog(`✅ Data integrity validated for ${source}:`, validation.stats)
  }

  // Call the callback if provided
  if (callback) {
    callback(validation)
  }

  return validation
}


// P&L ONLY Account Classification - EXCLUDES Balance Sheet accounts
const classifyAccount = (accountType, accountDetailType, accountName) => {
  const type = (accountType || "").toLowerCase().trim()
  const detailType = (accountDetailType || "").toLowerCase().trim()
  const name = (accountName || "").toLowerCase().trim()

  // ❌ EXCLUDE BALANCE SHEET ACCOUNTS
  const balanceSheetTypes = [
    "asset",
    "assets",
    "current asset",
    "fixed asset",
    "other asset",
    "liability",
    "liabilities",
    "current liability",
    "long term liability",
    "equity",
    "owner equity",
    "retained earnings",
    "capital",
    "stockholder equity",
    "accounts receivable",
    "accounts payable",
    "cash",
    "bank",
    "inventory",
    "equipment",
    "property",
    "building",
    "loan",
    "credit card",
    "payroll liability",
  ]

  if (balanceSheetTypes.some((bsType) => type.includes(bsType) || detailType.includes(bsType))) {
    return null
  }

  // ✅ P&L ACCOUNTS ONLY
  if (type === "income" || type === "revenue" || type === "sales") {
    return "Revenue"
  }

  if (
    type === "cost of goods sold" ||
    type === "cogs" ||
    detailType.includes("cost of goods sold") ||
    detailType.includes("cogs") ||
    name.includes("cost of sales") ||
    name.includes("cost of goods") ||
    name.includes("direct cost") ||
    name.includes("materials cost") ||
    name.includes("labor cost")
  ) {
    return "COGS"
  }

  if (
    type === "other income" ||
    detailType.includes("other income") ||
    detailType.includes("interest income") ||
    detailType.includes("dividend income") ||
    detailType.includes("gain on sale") ||
    name.includes("interest income") ||
    name.includes("dividend") ||
    name.includes("gain on") ||
    name.includes("other income")
  ) {
    return "Other Income"
  }

  if (
    type === "other expense" ||
    detailType.includes("other expense") ||
    detailType.includes("interest expense") ||
    detailType.includes("loss on sale") ||
    detailType.includes("depreciation") ||
    name.includes("interest expense") ||
    name.includes("depreciation") ||
    name.includes("amortization") ||
    name.includes("loss on") ||
    name.includes("other expense")
  ) {
    return "Other Expenses"
  }

  if (type === "expense" || type === "expenses") {
    return "Operating Expenses"
  }

  if (type.includes("income") || type.includes("revenue")) {
    return "Revenue"
  } else if (type.includes("expense") || type.includes("cost")) {
    return "Operating Expenses"
  }

  return null
}

// Hardcoded customers based on actual database data
const HARDCODED_CUSTOMERS = [
  "All Customers",
  "Cleveland",
  "Columbus IN",
  "Detroit",
  "General",
  "Hastings MN",
  "Lisbon",
  "McHenry IL",
  "Mokena IL",
  "Pine Terrace",
  "Rockford",
  "Terra2",
  "Terra3",
  "Terraview",
  "Wesley",
]

// Fetch customers
const fetchCustomers = async () => {
  try {
    const { data, error } = await supabase
      .from("journal_entry_lines")
      .select("customer")
      .not("customer", "is", null)

    if (error) {
      console.error("❌ Customer fetch error:", error)
      return HARDCODED_CUSTOMERS
    }

    const customerValues = data
      .map((item) => item.customer)
      .filter((c) => c && c.trim() !== "")

    const uniqueCustomers = [...new Set(customerValues)].sort()
    const allCustomers = [
      ...new Set([...HARDCODED_CUSTOMERS.slice(1), ...uniqueCustomers]),
    ].sort()
    return ["All Customers", ...allCustomers]
  } catch (error) {
    console.error("❌ Customer fetch error:", error)
    return HARDCODED_CUSTOMERS
  }
}

// ENHANCED: Time series data fetching with Customer Dimension support
const fetchTimeSeriesData = async (property = "All Customers", monthYear, timePeriod, viewMode, onDataValidation) => {
  try {
    const perfStart = performanceTracker.startTime("fetchTimeSeriesData")
    smartLog("🔍 FETCHING TIME SERIES DATA:", { property, monthYear, timePeriod, viewMode })

    const [month, year] = monthYear.split(" ")
    const selectedDate = new Date(`${month} 1, ${year}`)
    smartLog("🔍 Selected date object:", selectedDate)
    smartLog("🔍 Month:", month, "Year:", year)

    let dateRanges = []

    // ENHANCED: For by-property view, use the SAME logic as other views
    // Fetch month by month to avoid hitting row limits, then aggregate
    if (viewMode === "by-property") {
      if (timePeriod === "Monthly") {
        const monthNum = selectedDate.getMonth() + 1
        const startDate = `${year}-${monthNum.toString().padStart(2, "0")}-01`
        const lastDay = new Date(Number.parseInt(year), monthNum, 0).getDate()
        const endDate = `${year}-${monthNum.toString().padStart(2, "0")}-${lastDay.toString().padStart(2, "0")}`
        dateRanges = [{ start: startDate, end: endDate, label: monthYear }]
      } else if (timePeriod === "Quarterly") {
        const quarter = Math.floor(selectedDate.getMonth() / 3) + 1
        const qStart = new Date(Number.parseInt(year), (quarter - 1) * 3, 1)
        const qEnd = new Date(Number.parseInt(year), quarter * 3, 0)
        dateRanges = [
          {
            start: qStart.toISOString().split("T")[0],
            end: qEnd.toISOString().split("T")[0],
            label: `Q${quarter} ${year}`,
          },
        ]
      } else if (timePeriod === "Yearly") {
        const yearStart = `${year}-01-01`
        const monthDate = new Date(selectedDate)
        const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)
        const yearEnd = monthEnd.toISOString().split("T")[0]
        const monthName = selectedDate.toLocaleDateString("en-US", { month: "long" })
        dateRanges = [{ start: yearStart, end: yearEnd, label: `${year} YTD (through ${monthName})` }]
      } else {
        // Trailing 12
        // FIXED: Use month-by-month fetching like other views to avoid row limits
        for (let i = 11; i >= 0; i--) {
          const monthDate = new Date(selectedDate)
          monthDate.setMonth(monthDate.getMonth() - i)

          const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
          const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)

          const monthName = monthStart.toLocaleDateString("en-US", { month: "short" })
          const monthYear = monthStart.getFullYear()

          dateRanges.push({
            start: monthStart.toISOString().split("T")[0],
            end: monthEnd.toISOString().split("T")[0],
            label: `${monthName} ${monthYear}`,
          })
        }
      }
    } else {
      // Original logic for non-property views
      switch (timePeriod) {
        case "Monthly":
          if (viewMode === "total") {
            const monthNum = selectedDate.getMonth() + 1
            const startDate = `${year}-${monthNum.toString().padStart(2, "0")}-01`
            const lastDay = new Date(Number.parseInt(year), monthNum, 0).getDate()
            const endDate = `${year}-${monthNum.toString().padStart(2, "0")}-${lastDay.toString().padStart(2, "0")}`
            dateRanges = [{ start: startDate, end: endDate, label: monthYear }]
          } else {
            // Weekly breakdown
            const monthNum = selectedDate.getMonth() + 1
            const firstDay = new Date(Number.parseInt(year), monthNum - 1, 1)
            const lastDay = new Date(Number.parseInt(year), monthNum, 0)

            const weeks = []
            const weekStart = new Date(firstDay)
            let weekNumber = 1

            while (weekStart <= lastDay) {
              const weekEnd = new Date(weekStart)
              weekEnd.setDate(weekStart.getDate() + 6)

              if (weekEnd > lastDay) {
                weekEnd.setTime(lastDay.getTime())
              }

              const weekStartStr = weekStart.toISOString().split("T")[0]
              const weekEndStr = weekEnd.toISOString().split("T")[0]

              const startDay = weekStart.getDate()
              const endDay = weekEnd.getDate()

              weeks.push({
                start: weekStartStr,
                end: weekEndStr,
                label: `Week ${weekNumber} (${startDay}-${endDay})`,
              })

              weekStart.setDate(weekStart.getDate() + 7)
              weekNumber++
            }

            dateRanges = weeks
          }
          break

        case "Quarterly":
          const quarter = Math.floor(selectedDate.getMonth() / 3) + 1
          if (viewMode === "total") {
            const qStart = new Date(Number.parseInt(year), (quarter - 1) * 3, 1)
            const qEnd = new Date(Number.parseInt(year), quarter * 3, 0)
            dateRanges = [
              {
                start: qStart.toISOString().split("T")[0],
                end: qEnd.toISOString().split("T")[0],
                label: `Q${quarter} ${year}`,
              },
            ]
          } else {
            for (let q = 1; q <= quarter; q++) {
              const qStart = new Date(Number.parseInt(year), (q - 1) * 3, 1)
              const qEnd = new Date(Number.parseInt(year), q * 3, 0)
              dateRanges.push({
                start: qStart.toISOString().split("T")[0],
                end: qEnd.toISOString().split("T")[0],
                label: `Q${q} ${year}`,
              })
            }
          }
          break

        case "Yearly":
          if (viewMode === "total") {
            const yearStart = `${year}-01-01`
            const monthDate = new Date(selectedDate)
            const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)
            const yearEnd = monthEnd.toISOString().split("T")[0]
            dateRanges = [{ start: yearStart, end: yearEnd, label: year }]
          } else {
            const currentMonth = selectedDate.getMonth() + 1
            for (let m = 1; m <= currentMonth; m++) {
              const monthStart = `${year}-${m.toString().padStart(2, "0")}-01`
              const monthEnd = new Date(Number.parseInt(year), m, 0)
              const monthEndStr = monthEnd.toISOString().split("T")[0]
              const monthName = new Date(Number.parseInt(year), m - 1, 1).toLocaleDateString("en-US", {
                month: "short",
              })
              dateRanges.push({
                start: monthStart,
                end: monthEndStr,
                label: `${monthName} ${year}`,
              })
            }
          }
          break

        case "Trailing 12":
          if (viewMode === "total") {
            dateRanges = []

            for (let i = 11; i >= 0; i--) {
              const monthDate = new Date(selectedDate)
              monthDate.setMonth(monthDate.getMonth() - i)

              const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
              const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)

              const monthName = monthStart.toLocaleDateString("en-US", { month: "short" })
              const monthYear = monthStart.getFullYear()

              dateRanges.push({
                start: monthStart.toISOString().split("T")[0],
                end: monthEnd.toISOString().split("T")[0],
                label: `${monthName} ${monthYear}`,
              })
            }
          } else {
            dateRanges = []

            for (let i = 11; i >= 0; i--) {
              const monthDate = new Date(selectedDate)
              monthDate.setMonth(monthDate.getMonth() - i)

              const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
              const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)

              const monthName = monthStart.toLocaleDateString("en-US", { month: "short" })
              const monthYear = monthStart.getFullYear()

              dateRanges.push({
                start: monthStart.toISOString().split("T")[0],
                end: monthEnd.toISOString().split("T")[0],
                label: `${monthName} ${monthYear}`,
              })
            }
          }
          break
      }
    }

    smartLog("🔍 CALCULATED DATE RANGES:", dateRanges)
    smartLog("🔍 Total date ranges for", viewMode, "view:", dateRanges.length)

    // Fetch data for all date ranges
    const allData = {}
    let totalEntriesProcessed = 0
    let availableProperties = []

    for (const range of dateRanges) {
      smartLog(`🔍 Fetching data for period: ${range.label} (${range.start} to ${range.end})`)

      // CRITICAL FIX: Fetch ALL data without row limits
      // Supabase might have a default limit, so we'll use a very high limit
      let url = `${SUPABASE_URL}/rest/v1/journal_entry_lines?select=*&date=gte.${range.start}&date=lte.${range.end}&limit=10000`

      // FIXED: For by-property view, NEVER filter by customer - we need ALL customer data
      // Only filter by customer for non-by-property views
      if (viewMode !== "by-property" && property !== "All Customers") {
        url += `&customer=eq.${encodeURIComponent(property)}`
      }

      smartLog(`🔍 FETCHING URL for ${viewMode} view:`, url)

      const response = await fetch(url, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
        },
      })

      if (response.ok) {
        const rawData = await response.json()

        // Validate data integrity
        const validation = validateDataIntegrity(rawData, `${range.label} (${viewMode})`, undefined, onDataValidation)

        smartLog(`🔍 Period ${range.label}: ${rawData.length} transactions`)
        smartLog(`🔍 Sample transactions for ${range.label}:`, rawData.slice(0, 3))
        smartLog(`🔍 Date range: ${range.start} to ${range.end}`)
        smartLog(`🔍 View mode: ${viewMode}, Customer filter: ${property}`)
        totalEntriesProcessed += rawData.length

        if (viewMode === "by-property") {
          // Get available customers from the data
          const propertiesInData = [
            ...new Set(rawData.map((row) => row.customer).filter((cls) => cls && cls.trim() !== "")),
          ].sort()
          if (availableProperties.length === 0) {
            availableProperties = propertiesInData
          }

          smartLog(`🏢 BY-PROPERTY DATA PROCESSING for ${range.label}:`, {
            totalTransactions: rawData.length,
            propertiesFound: propertiesInData.length,
            properties: propertiesInData,
          })

          // Group by account first, then by customer within each account
          const groupedByAccount = rawData.reduce((acc, row) => {
            const accountName = row.account || "Unknown Account"
            const propertyName = row.customer || "No Customer"

            const category = classifyAccount(row.account_type, row.account_detail_type, accountName)
            if (category === null) {
              return acc
            }

            if (!acc[accountName]) {
              acc[accountName] = {
                name: accountName,
                category: category,
                type: category,
                total: 0,
                entries: [],
                account_type: row.account_type,
                account_detail_type: row.account_detail_type,
                propertyTotals: {},
                propertyEntries: {},
              }
            }

            // Initialize ALL customers for this account, not just the current one
            propertiesInData.forEach((prop) => {
              if (!acc[accountName].propertyTotals[prop]) {
                acc[accountName].propertyTotals[prop] = 0
                acc[accountName].propertyEntries[prop] = []
              }
            })

            acc[accountName].total += row.amount || 0
            acc[accountName].propertyTotals[propertyName] += row.amount || 0

            acc[accountName].entries.push(row)
            acc[accountName].propertyEntries[propertyName].push(row)

            return acc
          }, {})

          smartLog(`🏢 BY-PROPERTY GROUPED for ${range.label}:`, {
            accountsGrouped: Object.keys(groupedByAccount).length,
            sampleAccount: Object.keys(groupedByAccount)[0],
            sampleData: groupedByAccount[Object.keys(groupedByAccount)[0]],
            availableCustomers: propertiesInData,
          })

          allData[range.label] = groupedByAccount
        } else {
          // Original grouping logic for non-property views
          const grouped = rawData.reduce((acc, row) => {
            const accountName = row.account || "Unknown Account"

            const category = classifyAccount(row.account_type, row.account_detail_type, accountName)
            if (category === null) {
              return acc
            }

            if (!acc[accountName]) {
              acc[accountName] = {
                name: accountName,
                category: category,
                type: category,
                total: 0,
                entries: [],
                account_type: row.account_type,
                account_detail_type: row.account_detail_type,
              }
            }

            acc[accountName].total += row.amount || 0
            acc[accountName].entries.push(row)

            return acc
          }, {})

          allData[range.label] = grouped
        }
      } else {
        console.error(`Failed to fetch data for period ${range.label}:`, response.status)
        allData[range.label] = {}
      }
    }

    // FIXED: For by-property Trailing 12, aggregate all monthly data
    if (viewMode === "by-property" && timePeriod === "Trailing 12") {
      smartLog("🔍 AGGREGATING BY-PROPERTY TRAILING 12 DATA...")

      const aggregatedData = {}
      const allAvailableProperties = []

      // First, collect all customers from all months
      dateRanges.forEach((range) => {
        const monthData = allData[range.label] || {}
        Object.values(monthData).forEach((account) => {
          if (account.propertyTotals) {
            Object.keys(account.propertyTotals).forEach((prop) => {
              if (!allAvailableProperties.includes(prop)) {
                allAvailableProperties.push(prop)
              }
            })
          }
        })
      })

      // Then aggregate all months
      dateRanges.forEach((range) => {
        const monthData = allData[range.label] || {}

        Object.values(monthData).forEach((account) => {
          const accountName = account.name

          if (!aggregatedData[accountName]) {
            aggregatedData[accountName] = {
              name: accountName,
              category: account.category,
              type: account.category,
              total: 0,
              entries: [],
              account_type: account.account_type,
              account_detail_type: account.account_detail_type,
              propertyTotals: {},
              propertyEntries: {},
            }

            // Initialize all customers for this account
            allAvailableProperties.forEach((prop) => {
              aggregatedData[accountName].propertyTotals[prop] = 0
              aggregatedData[accountName].propertyEntries[prop] = []
            })
          }

          aggregatedData[accountName].total += account.total
          aggregatedData[accountName].entries.push(...account.entries)

          // Aggregate customer data
          if (account.propertyTotals) {
            Object.entries(account.propertyTotals).forEach(([prop, amount]) => {
              aggregatedData[accountName].propertyTotals[prop] += amount
            })
          }

          if (account.propertyEntries) {
            Object.entries(account.propertyEntries).forEach(([prop, entries]) => {
              aggregatedData[accountName].propertyEntries[prop].push(...entries)
            })
          }
        })
      })

      const result = {
        success: true,
        data: { "Trailing 12 Months": aggregatedData },
        periods: ["Trailing 12 Months"],
        availableCustomers: allAvailableProperties.sort(),
        summary: {
          timePeriod,
          viewMode,
          property: property === "All Customers" ? "ALL CUSTOMERS" : property,
          dateRanges: [
            {
              start: dateRanges[0].start,
              end: dateRanges[dateRanges.length - 1].end,
              label: "Trailing 12 Months",
            },
          ],
          totalEntriesProcessed,
          periodsGenerated: 1,
          monthsAggregated: dateRanges.length,
        },
      }

      performanceTracker.endTime("fetchTimeSeriesData", perfStart)
      return result
    }

    // FIXED: For Trailing 12 Total mode, aggregate all monthly data into one summary
    if (timePeriod === "Trailing 12" && viewMode === "total") {
      smartLog("🔍 AGGREGATING TRAILING 12 TOTAL DATA...")

      const aggregatedData = {}

      dateRanges.forEach((range) => {
        const monthData = allData[range.label] || {}

        Object.values(monthData).forEach((account) => {
          const accountName = account.name

          if (!aggregatedData[accountName]) {
            aggregatedData[accountName] = {
              name: accountName,
              category: account.category,
              type: account.category,
              total: 0,
              entries: [],
              account_type: account.account_type,
              account_detail_type: account.account_detail_type,
            }
          }

          aggregatedData[accountName].total += account.total
          aggregatedData[accountName].entries.push(...account.entries)
        })
      })

      const result = {
        success: true,
        data: { "Trailing 12 Months": aggregatedData },
        periods: ["Trailing 12 Months"],
        availableCustomers: viewMode === "by-property" ? availableProperties : [],
        summary: {
          timePeriod,
          viewMode,
          property: property === "All Customers" ? "ALL CUSTOMERS" : property,
          dateRanges: [
            {
              start: dateRanges[0].start,
              end: dateRanges[dateRanges.length - 1].end,
              label: "Trailing 12 Months",
            },
          ],
          totalEntriesProcessed,
          periodsGenerated: 1,
          monthsAggregated: dateRanges.length,
        },
      }

      performanceTracker.endTime("fetchTimeSeriesData", perfStart)
      return result
    }

    const result = {
      success: true,
      data: allData,
      periods: dateRanges.map((r) => r.label),
      availableCustomers: viewMode === "by-property" ? availableProperties : [],
      summary: {
        timePeriod,
        viewMode,
        property: property === "All Customers" ? "ALL CUSTOMERS" : property,
        dateRanges: dateRanges,
        totalEntriesProcessed,
        periodsGenerated: dateRanges.length,
      },
    }

    performanceTracker.endTime("fetchTimeSeriesData", perfStart)
    return result
  } catch (error) {
    smartLog("Error fetching time series data:", error, "error")
    return {
      success: false,
      error: error.message,
      data: {},
    }
  }
}

// Hook to detect device type
const useDeviceType = () => {
  const [deviceType, setDeviceType] = useState("desktop")

  useEffect(() => {
    const checkDeviceType = () => {
      const width = window.innerWidth
      if (width < 768) {
        setDeviceType("mobile")
      } else if (width < 1024) {
        setDeviceType("tablet")
      } else {
        setDeviceType("desktop")
      }
    }

    checkDeviceType()
    window.addEventListener("resize", checkDeviceType)

    return () => window.removeEventListener("resize", checkDeviceType)
  }, [])

  return deviceType
}

// I AM CFO Logo Component
const IAMCFOLogo = ({ className = "w-8 h-8" }) => (
  <div className={`${className} flex items-center justify-center relative`}>
    <Image src="/favicon.png" alt="I AM CFO Logo" width={32} height={32} />
  </div>
)

const COLORS = [
  BRAND_COLORS.primary,
  BRAND_COLORS.success,
  BRAND_COLORS.warning,
  BRAND_COLORS.danger,
  BRAND_COLORS.secondary,
  BRAND_COLORS.tertiary,
]

export default function MobileResponsiveFinancialsPage() {
  const [activeTab, setActiveTab] = useState("p&l")
  const [selectedMonth, setSelectedMonth] = useState("May 2025")
  const [timePeriod, setTimePeriod] = useState("Trailing 12")
  const [viewMode, setViewMode] = useState("by-property") // Default to by-customer
  const [notification, setNotification] = useState({ show: false, message: "", type: "info" })
  const [timePeriodDropdownOpen, setTimePeriodDropdownOpen] = useState(false)
  const [selectedProperties, setSelectedProperties] = useState(new Set(["All Customers"]))
  const [propertyDropdownOpen, setPropertyDropdownOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false)
  const [compactMode, setCompactMode] = useState(false)
  const [showDetailPanel, setShowDetailPanel] = useState(false)
  const [columnsToShow, setColumnsToShow] = useState(new Set(["account", "total", "percentage"]))

  // Expandable accounts state
  const [expandedAccounts, setExpandedAccounts] = useState(new Set())

  // Data integrity state
  const [dataIntegrityStatus, setDataIntegrityStatus] = useState(null)
  const [propertyChartMetric, setPropertyChartMetric] = useState("income")
  const [propertyChartView, setPropertyChartView] = useState("pie")

  // Debug mode state
  const [debugMode, setDebugMode] = useState(DEBUG_CONFIG.isDebugMode)

  // Real data state
  const [isLoadingData, setIsLoadingData] = useState(false)
  const [realData, setRealData] = useState(null)
  const [dataError, setDataError] = useState(null)
  const [availableProperties, setAvailableProperties] = useState(HARDCODED_CUSTOMERS)
  const [selectedAccountDetails, setSelectedAccountDetails] = useState(null)
  const [timeSeriesData, setTimeSeriesData] = useState(null)

  // Device type
  const deviceType = useDeviceType()

  // Mobile-specific states
  const [tableMode, setTableMode] = useState("summary") // Default to summary
  const [activeKPICard, setActiveKPICard] = useState(null)
  const [selectedCustomerForPL, setSelectedCustomerForPL] = useState(null)
  const [showCustomerPL, setShowCustomerPL] = useState(false)
  const [showTransactionDetail, setShowTransactionDetail] = useState(false)
  const [showCompanyPL, setShowCompanyPL] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const [startY, setStartY] = useState(0)

  const renderMobileFilters = () => {
    if (deviceType !== "mobile") return null

    return (
      <>
        {/* Toggle button */}
        <div className="md:hidden mb-3">
          <button
            className="w-full flex items-center justify-between rounded-lg border px-3 py-2 bg-white"
            onClick={() => setMobileFilterOpen((v) => !v)}
            aria-label="Toggle filters"
          >
            <span className="text-sm font-medium">Filters</span>
            {mobileFilterOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </div>

        {/* Panel */}
        {mobileFilterOpen && (
          <div className="md:hidden space-y-4 rounded-lg border bg-white p-3">
            {/* Month selector */}
            <div>
              <div className="text-xs text-gray-600 mb-1">Month</div>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
              >
                {monthsList.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {/* Time period */}
            <div>
              <div className="text-xs text-gray-600 mb-1">Time Period</div>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={timePeriod}
                onChange={(e) => setTimePeriod(e.target.value)}
              >
                <option>Monthly</option>
                <option>Quarterly</option>
                <option>Yearly</option>
                <option>Trailing 12</option>
              </select>
            </div>

            {/* View mode */}
            <div>
              <div className="text-xs text-gray-600 mb-1">View</div>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={viewMode}
                onChange={(e) => setViewMode(e.target.value)}
              >
                <option value="by-property">By Customer</option>
                <option value="total">Total</option>
                <option value="detailed">Detailed</option>
              </select>
            </div>

            {/* Customers multiselect */}
            <div>
              <div className="text-xs text-gray-600 mb-1">Customers</div>
              <button
                className="w-full rounded-md border px-3 py-2 text-sm text-left"
                onClick={() => setPropertyDropdownOpen((v) => !v)}
              >
                {getSelectedCustomersText()}
              </button>

              {propertyDropdownOpen && (
                <div className="mt-2 max-h-56 overflow-auto rounded-md border">
                  {availableProperties.map((prop) => (
                    <label key={prop} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={selectedProperties.has(prop)}
                        onChange={() => handlePropertyToggle(prop)}
                      />
                      <span>{prop}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Apply/Close */}
            <div className="flex gap-2">
              <button className="flex-1 rounded-md border px-3 py-2 text-sm" onClick={() => setMobileFilterOpen(false)}>
                Close
              </button>
              <button
                className="flex-1 rounded-md px-3 py-2 text-sm text-white"
                style={{ backgroundColor: BRAND_COLORS.primary }}
                onClick={() => setMobileFilterOpen(false)}
              >
                Apply
              </button>
            </div>
          </div>
        )}
      </>
    )
  }

  // Auto-adjust settings based on device type
  useEffect(() => {
    if (deviceType === "mobile") {
      setCompactMode(true)
      setColumnsToShow(new Set(["account", "total"]))
      setTableMode("summary")
    } else if (deviceType === "tablet") {
      setCompactMode(false)
      setColumnsToShow(new Set(["account", "total", "percentage"]))
      setTableMode("summary")
    } else {
      setCompactMode(false)
      setColumnsToShow(new Set(["account", "total", "percentage"]))
      setTableMode("detailed")
    }
  }, [deviceType])

  // Load initial data
  useEffect(() => {
    loadInitialData()
  }, [])

  // Load data when filters change
  useEffect(() => {
    loadRealFinancialData()
  }, [selectedProperties, selectedMonth, timePeriod, viewMode])

  // Generate months list
  const generateMonthsList = () => {
    const months = []
    const currentYear = new Date().getFullYear()

    for (let year = 2020; year <= currentYear + 2; year++) {
      for (let month = 1; month <= 12; month++) {
        const monthNames = [
          "January",
          "February",
          "March",
          "April",
          "May",
          "June",
          "July",
          "August",
          "September",
          "October",
          "November",
          "December",
        ]
        months.push(`${monthNames[month - 1]} ${year}`)
      }
    }
    return months
  }

  const monthsList = generateMonthsList()

  const loadInitialData = async () => {
    try {
      setIsLoadingData(true)

      const customers = await fetchCustomers()
      smartLog("🏠 Available customers loaded:", customers)
      setAvailableProperties(customers)

      await loadRealFinancialData()
    } catch (error) {
      console.error("Failed to load initial data:", error)
      setDataError("Failed to load initial data")
    } finally {
      setIsLoadingData(false)
    }
  }

  const loadRealFinancialData = async () => {
    try {
      setIsLoadingData(true)
      setDataError(null)

      // FIXED: For by-property view, always use 'All Customers' to get all data
      let propertyFilter = "All Customers"
      if (viewMode !== "by-property" && selectedProperties.size > 0 && !selectedProperties.has("All Customers")) {
        propertyFilter = Array.from(selectedProperties)[0]
      }

      smartLog("🔍 LOADING DATA WITH FILTERS:", {
        selectedCustomers: Array.from(selectedProperties),
        propertyFilter,
        month: selectedMonth,
        timePeriod,
        viewMode,
        note:
          viewMode === "by-property" ? "FORCING All Customers for by-customer view" : "Using selected customer filter",
      })

      const timeSeriesResult = await fetchTimeSeriesData(
        propertyFilter,
        selectedMonth,
        timePeriod,
        viewMode,
        updateDataIntegrityStatus,
      )

      if (timeSeriesResult.success) {
        setTimeSeriesData(timeSeriesResult)
        setRealData(null)
        setDataError(null)
      } else {
        setDataError(timeSeriesResult.error || "Failed to load time series data")
      }

      const customerText =
        viewMode === "by-property"
          ? "all customers (by-customer view)"
          : selectedProperties.has("All Customers")
            ? "all customers"
            : `${selectedProperties.size} selected customers`

      showNotification(
        `Loaded data for ${customerText} - ${timePeriod} ${viewMode} view`,
        "success",
      )
    } catch (error) {
      console.error("Failed to load financial data:", error)
      setDataError("Failed to load financial data")
      showNotification("Failed to load financial data", "error")
    } finally {
      setIsLoadingData(false)
    }
  }

  const handlePropertyToggle = (property) => {
    const newSelected = new Set(selectedProperties)

    if (property === "All Customers") {
      newSelected.clear()
      newSelected.add("All Customers")
    } else {
      newSelected.delete("All Customers")

      if (newSelected.has(property)) {
        newSelected.delete(property)
      } else {
        newSelected.add(property)
      }

      if (newSelected.size === 0) {
        newSelected.add("All Customers")
      }
    }

    setSelectedProperties(newSelected)
    smartLog("🏠 Customer selection changed:", Array.from(newSelected))
  }

  const getSelectedCustomersText = () => {
    if (selectedProperties.has("All Customers") || selectedProperties.size === 0) {
      return "All Customers"
    }
    if (selectedProperties.size === 1) {
      return Array.from(selectedProperties)[0]
    }
    return `${selectedProperties.size} Customers Selected`
  }

  // Helper functions
  const formatCurrency = (value) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value)
  }

  // Compact currency formatting for KPI cards
  const formatCompactCurrency = (value) => {
    if (Math.abs(value) >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`
    } else if (Math.abs(value) >= 1000) {
      return `${(value / 1000).toFixed(1)}K`
    }
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value)
  }

  const calculatePercentage = (value, total) => {
    return total !== 0 ? ((value / total) * 100).toFixed(1) + "%" : "0%"
  }

  const showNotification = (message, type = "info") => {
    setNotification({ show: true, message, type })
    setTimeout(() => {
      setNotification({ show: false, message: "", type: "info" })
    }, 3000)
  }

  const handleAccountClick = (accountItem) => {
    setSelectedAccountDetails(accountItem)
    if (deviceType === "mobile") {
      setShowDetailPanel(true)
    }
  }

  // Toggle parent account expansion
  const toggleParentAccount = (parentName) => {
    const newExpanded = new Set(expandedAccounts)
    if (newExpanded.has(parentName)) {
      newExpanded.delete(parentName)
    } else {
      newExpanded.add(parentName)
    }
    setExpandedAccounts(newExpanded)
  }

  // Function to update data integrity status
  const updateDataIntegrityStatus = (validation) => {
    setDataIntegrityStatus({
      isValid: validation.isValid,
      lastValidated: new Date(),
      totalRecords: validation.stats.totalRecords,
      issues: validation.issues,
      source: validation.source,
    })
  }

  // Function to toggle debug mode
  const toggleDebugMode = () => {
    const newDebugMode = !debugMode
    setDebugMode(newDebugMode)
    if (typeof window !== "undefined") {
      localStorage.setItem("iam-cfo-debug", newDebugMode.toString())
    }
    DEBUG_CONFIG.isDebugMode = newDebugMode
    smartLog(`🔧 Debug mode ${newDebugMode ? "enabled" : "disabled"}`)

    if (newDebugMode) {
      smartLog(`📊 Cache stats: ${validationCache.size} entries cached, ${cacheMetrics.getHitRate()}% hit rate`)
    }
  }

  // Account Grouping with Colon Detection and Parent-as-Sub handling
  const groupAccountsByParent = (accounts) => {
    smartLog("🏗️ GROUPING ACCOUNTS - Starting with", accounts.length, "accounts")

    const grouped = {}
    const standalone = []
    const parentNames = new Set()

    // First pass: identify all parent names from colon-separated accounts
    accounts.forEach((account) => {
      if (account.name.includes(":")) {
        const colonIndex = account.name.indexOf(":")
        const parentName = account.name.substring(0, colonIndex).trim()
        parentNames.add(parentName)
      }
    })

    accounts.forEach((account) => {
      if (account.name.includes(":")) {
        // This is a sub-account
        const colonIndex = account.name.indexOf(":")
        const parentName = account.name.substring(0, colonIndex).trim()
        const subName = account.name.substring(colonIndex + 1).trim()

        if (!grouped[parentName]) {
          grouped[parentName] = {
            name: parentName,
            category: account.category,
            type: account.category,
            total: 0,
            months: {},
            entries: [],
            account_type: account.account_type,
            account_detail_type: account.account_detail_type,
            subAccounts: [],
            isParent: true,
            propertyTotals: {},
            propertyEntries: {},
          }
        }

        // Add to parent total and entries
        grouped[parentName].total += account.total
        grouped[parentName].entries = grouped[parentName].entries || []
        grouped[parentName].entries.push(...(account.entries || []))

        // Aggregate customer data to parent
        if (account.propertyTotals) {
          Object.entries(account.propertyTotals).forEach(([prop, amount]) => {
            if (!grouped[parentName].propertyTotals[prop]) {
              grouped[parentName].propertyTotals[prop] = 0
              grouped[parentName].propertyEntries[prop] = []
            }
            grouped[parentName].propertyTotals[prop] += amount
            if (account.propertyEntries && account.propertyEntries[prop]) {
              grouped[parentName].propertyEntries[prop].push(...account.propertyEntries[prop])
            }
          })
        }

        // Add as sub-account
        grouped[parentName].subAccounts = grouped[parentName].subAccounts || []
        grouped[parentName].subAccounts.push({
          ...account,
          name: subName,
          originalName: account.name,
          parentName: parentName,
          isSubAccount: true,
        })
      } else if (parentNames.has(account.name)) {
        // This is a standalone account that ALSO has sub-accounts with colons
        if (!grouped[account.name]) {
          grouped[account.name] = {
            name: account.name,
            category: account.category,
            type: account.category,
            total: 0,
            months: {},
            entries: [],
            account_type: account.account_type,
            account_detail_type: account.account_detail_type,
            subAccounts: [],
            isParent: true,
            propertyTotals: {},
            propertyEntries: {},
          }
        }

        // Add the standalone account as a sub-account of itself
        grouped[account.name].total += account.total
        grouped[account.name].entries.push(...(account.entries || []))

        // Add customer data to parent
        if (account.propertyTotals) {
          Object.entries(account.propertyTotals).forEach(([prop, amount]) => {
            if (!grouped[account.name].propertyTotals[prop]) {
              grouped[account.name].propertyTotals[prop] = 0
              grouped[account.name].propertyEntries[prop] = []
            }
            grouped[account.name].propertyTotals[prop] += amount
            if (account.propertyEntries && account.propertyEntries[prop]) {
              grouped[account.name].propertyEntries[prop].push(...account.propertyEntries[prop])
            }
          })
        }

        grouped[account.name].subAccounts = grouped[account.name].subAccounts || []
        grouped[account.name].subAccounts.push({
          ...account,
          name: account.name,
          originalName: account.name,
          parentName: account.name,
          isSubAccount: true,
          isParentAsSubAccount: true,
        })
      } else {
        // This is a truly standalone account
        standalone.push({
          ...account,
          isStandalone: true,
        })
      }
    })

    // Convert grouped object to array and combine with standalone
    const parentAccounts = Object.values(grouped)
    const result = [...standalone, ...parentAccounts]

    // Sort everything alphabetically
    result.sort((a, b) => a.name.localeCompare(b.name))

    // Sort sub-accounts within each parent
    result.forEach((account) => {
      if (account.subAccounts) {
        account.subAccounts.sort((a, b) => {
          if (a.isParentAsSubAccount && !b.isParentAsSubAccount) return -1
          if (!a.isParentAsSubAccount && b.isParentAsSubAccount) return 1
          return a.name.localeCompare(b.name)
        })
      }
    })

    return result
  }

  // Get current financial data with customer support
  const getCurrentFinancialData = () => {
    if (timeSeriesData) {
      if (viewMode === "by-property") {
        // For by-property view, get data from the first period
        const firstPeriodKey = timeSeriesData.periods[0]
        const firstPeriodData = timeSeriesData.data[firstPeriodKey] || {}
        const result = Object.values(firstPeriodData)

        smartLog("🏢 BY-PROPERTY getCurrentFinancialData:", {
          periodKey: firstPeriodKey,
          accountCount: result.length,
          sampleAccount: result[0],
          availableCustomers: timeSeriesData.availableProperties,
        })

        return result
      } else if (
        viewMode === "detailed" ||
        (viewMode === "total" && (timePeriod === "Quarterly" || timePeriod === "Yearly")) ||
        (timePeriod === "Monthly" && viewMode === "total")
      ) {
        // Aggregate across multiple periods
        const allAccounts = {}

        timeSeriesData.periods.forEach((period) => {
          const periodData = timeSeriesData.data[period] || {}

          Object.values(periodData).forEach((account) => {
            if (!allAccounts[account.name]) {
              allAccounts[account.name] = {
                name: account.name,
                category: account.category,
                type: account.category,
                total: 0,
                entries: [],
                account_type: account.account_type,
                account_detail_type: account.account_detail_type,
              }
            }
            allAccounts[account.name].total += account.total
            allAccounts[account.name].entries.push(...account.entries)
          })
        })

        return Object.values(allAccounts)
      } else {
        // For single-period total modes
        if (timePeriod === "Trailing 12" && viewMode === "total") {
          const trailingData = timeSeriesData.data["Trailing 12 Months"] || {}
          return Object.values(trailingData)
        } else {
          const firstPeriodKey = timeSeriesData.periods[0]
          const firstPeriodData = timeSeriesData.data[firstPeriodKey] || {}
          return Object.values(firstPeriodData)
        }
      }
    }
    return []
  }

  const currentData = getCurrentFinancialData()

  // Calculate KPIs
  const calculateKPIs = () => {
    if (!currentData || currentData.length === 0) {
      return {
        revenue: 0,
        cogs: 0,
        grossProfit: 0,
        operatingExpenses: 0,
        netOperatingIncome: 0,
        otherIncome: 0,
        otherExpenses: 0,
        netIncome: 0,
        grossMargin: 0,
        operatingMargin: 0,
        netMargin: 0,
      }
    }

    const revenue = currentData.filter((item) => item.category === "Revenue").reduce((sum, item) => sum + item.total, 0)

    const cogs = currentData
      .filter((item) => item.category === "COGS")
      .reduce((sum, item) => sum + Math.abs(item.total), 0)

    const operatingExpenses = currentData
      .filter((item) => item.category === "Operating Expenses")
      .reduce((sum, item) => sum + Math.abs(item.total), 0)

    const otherIncome = currentData
      .filter((item) => item.category === "Other Income")
      .reduce((sum, item) => sum + item.total, 0)

    const otherExpenses = currentData
      .filter((item) => item.category === "Other Expenses")
      .reduce((sum, item) => sum + Math.abs(item.total), 0)

    const grossProfit = revenue - cogs
    const netOperatingIncome = grossProfit - operatingExpenses
    const netIncome = netOperatingIncome + otherIncome - otherExpenses

    return {
      revenue,
      cogs,
      grossProfit,
      operatingExpenses,
      netOperatingIncome,
      otherIncome,
      otherExpenses,
      netIncome,
      grossMargin: revenue ? (grossProfit / revenue) * 100 : 0,
      operatingMargin: revenue ? (netOperatingIncome / revenue) * 100 : 0,
      netMargin: revenue ? (netIncome / revenue) * 100 : 0,
    }
  }

  const generateTrendData = () => {
    // Generate trend data based on time period and actual data
    if (!timeSeriesData || !timeSeriesData.periods) {
      return []
    }

    smartLog("🔍 GENERATING TREND DATA:", {
      timePeriod,
      viewMode,
      periods: timeSeriesData.periods,
      dataKeys: Object.keys(timeSeriesData.data),
      availableCustomers: timeSeriesData.availableProperties,
    })

    // For by-property view with multiple customers, show customer breakdown
    if (
      viewMode === "by-property" &&
      timeSeriesData.availableProperties &&
      timeSeriesData.availableProperties.length > 0
    ) {
      const firstPeriodKey = timeSeriesData.periods[0]
      const periodData = timeSeriesData.data[firstPeriodKey] || {}

      // Create trend data by property
      const propertyTrendData = timeSeriesData.availableProperties
        .map((property) => {
          const revenue = Object.values(periodData)
            .filter((item) => item.category === "Revenue")
            .reduce((sum, item) => sum + (item.propertyTotals?.[property] || 0), 0)

          const cogs = currentData
            .filter((item) => item.category === "COGS")
            .reduce((sum, item) => sum + Math.abs(item.propertyTotals?.[property] || 0), 0)

          const operatingExpenses = currentData
            .filter((item) => item.category === "Operating Expenses")
            .reduce((sum, item) => sum + Math.abs(item.propertyTotals?.[property] || 0), 0)

          const otherIncome = Object.values(periodData)
            .filter((item) => item.category === "Other Income")
            .reduce((sum, item) => sum + (item.propertyTotals?.[property] || 0), 0)

          const otherExpenses = currentData
            .filter((item) => item.category === "Other Expenses")
            .reduce((sum, item) => sum + Math.abs(item.propertyTotals?.[property] || 0), 0)

          const netIncome = revenue - cogs - operatingExpenses + otherIncome - otherExpenses

          return {
            period: property.length > 8 ? property.substring(0, 8) + "..." : property,
            fullPropertyName: property,
            revenue,
            netIncome,
            grossProfit: revenue - cogs,
            operatingIncome: revenue - cogs - operatingExpenses,
          }
        })
        .filter((item) => item.revenue > 0 || item.netIncome !== 0) // Only show customers with activity

      smartLog("🏢 BY-PROPERTY TREND DATA:", propertyTrendData)
      return propertyTrendData
    }

    // For detailed view or multiple periods (time-based trend)
    if (viewMode === "detailed" || timePeriod !== "Monthly" || viewMode !== "total") {
      const trendResult = timeSeriesData.periods
        .map((period) => {
          const periodData = timeSeriesData.data[period] || {}

          const revenue = Object.values(periodData)
            .filter((item) => item.category === "Revenue")
            .reduce((sum, item) => sum + item.total, 0)

          const cogs = currentData
            .filter((item) => item.category === "COGS")
            .reduce((sum, item) => sum + Math.abs(item.total), 0)

          const operatingExpenses = currentData
            .filter((item) => item.category === "Operating Expenses")
            .reduce((sum, item) => sum + Math.abs(item.total), 0)

          const otherIncome = Object.values(periodData)
            .filter((item) => item.category === "Other Income")
            .reduce((sum, item) => sum + item.total, 0)

          const otherExpenses = currentData
            .filter((item) => item.category === "Other Expenses")
            .reduce((sum, item) => sum + Math.abs(item.total), 0)

          const netIncome = revenue - cogs - operatingExpenses + otherIncome - otherExpenses

          const result = {
            period: period.length > 12 ? period.substring(0, 12) : period,
            fullPeriodName: period,
            revenue,
            netIncome,
            grossProfit: revenue - cogs,
            operatingIncome: revenue - cogs - operatingExpenses,
          }

          smartLog(`📊 Period ${period}:`, result)
          return result
        })
        .filter((item) => item.revenue > 0 || item.netIncome !== 0) // Only show periods with activity

      smartLog("📊 FINAL TREND DATA:", trendResult)
      return trendResult
    }

    // For single period (like Trailing 12 Total) - show overall totals as single point
    const singlePeriodKey = timeSeriesData.periods[0]
    const periodData = timeSeriesData.data[singlePeriodKey] || {}

    const revenue = Object.values(periodData)
      .filter((item) => item.category === "Revenue")
      .reduce((sum, item) => sum + item.total, 0)

    const cogs = Object.values(periodData)
      .filter((item) => item.category === "COGS")
      .reduce((sum, item) => sum + Math.abs(item.total), 0)

    const operatingExpenses = Object.values(periodData)
      .filter((item) => item.category === "Operating Expenses")
      .reduce((sum, item) => sum + Math.abs(item.total), 0)

    const otherIncome = Object.values(periodData)
      .filter((item) => item.category === "Other Income")
      .reduce((sum, item) => sum + item.total, 0)

    const otherExpenses = Object.values(periodData)
      .filter((item) => item.category === "Other Expenses")
      .reduce((sum, item) => sum + Math.abs(item.total), 0)

    const netIncome = revenue - cogs - operatingExpenses + otherIncome - otherExpenses

    const result = [
      {
        period: singlePeriodKey.length > 15 ? "Total" : singlePeriodKey,
        fullPeriodName: singlePeriodKey,
        revenue,
        netIncome,
        grossProfit: revenue - cogs,
        operatingIncome: revenue - cogs - operatingExpenses,
      },
    ]

    smartLog("📊 SINGLE PERIOD DATA:", result)
    return result
  }

  const generateExpenseBreakdown = () => {
    return currentData
      .filter((item) => item.category === "Operating Expenses" && item.total < 0)
      .map((item) => ({
        name: item.name,
        value: Math.abs(item.total),
      }))
      .filter((item) => item.value > 0)
  }

  const generateCustomerChartData = () => {
    // Only show customer data if we have it
    if (viewMode === "by-property" && timeSeriesData?.availableProperties) {
      return timeSeriesData.availableProperties
        .map((property) => {
          const revenue = currentData
            .filter((item) => item.category === "Revenue")
            .reduce((sum, item) => sum + (item.propertyTotals?.[property] || 0), 0)

          const cogs = currentData
            .filter((item) => item.category === "COGS")
            .reduce((sum, item) => sum + Math.abs(item.propertyTotals?.[property] || 0), 0)

          const operatingExpenses = currentData
            .filter((item) => item.category === "Operating Expenses")
            .reduce((sum, item) => sum + Math.abs(item.propertyTotals?.[property] || 0), 0)

          const otherIncome = currentData
            .filter((item) => item.category === "Other Income")
            .reduce((sum, item) => sum + (item.propertyTotals?.[property] || 0), 0)

          const otherExpenses = currentData
            .filter((item) => item.category === "Other Expenses")
            .reduce((sum, item) => sum + Math.abs(item.propertyTotals?.[property] || 0), 0)

          const grossProfit = revenue - cogs
          const netIncome = revenue - cogs - operatingExpenses + otherIncome - otherExpenses

          let value = 0
          switch (propertyChartMetric) {
            case "income":
              value = revenue
              break
            case "gp":
              value = grossProfit
              break
            case "ni":
              value = netIncome
              break
          }

          return {
            name: property,
            value: value,
            revenue: revenue,
            grossProfit: grossProfit,
            netIncome: netIncome,
          }
        })
        .filter((item) => item.value > 0) // Only show customers with positive values
    }

    // Fallback: If not in by-property mode, create customer data from current data
    if (currentData.length > 0) {
      // Extract customers from entries
      const propertyData = {}

      currentData.forEach((account) => {
        if (account.entries) {
          account.entries.forEach((entry) => {
            const property = entry.customer || "No Customer"
            if (!propertyData[property]) {
              propertyData[property] = { revenue: 0, cogs: 0, opex: 0, otherIncome: 0, otherExpenses: 0 }
            }

            const amount = entry.amount || 0
            switch (account.category) {
              case "Revenue":
                propertyData[property].revenue += amount
                break
              case "COGS":
                propertyData[property].cogs += Math.abs(amount)
                break
              case "Operating Expenses":
                propertyData[property].opex += Math.abs(amount)
                break
              case "Other Income":
                propertyData[property].otherIncome += amount
                break
              case "Other Expenses":
                propertyData[property].otherExpenses += Math.abs(amount)
                break
            }
          })
        }
      })

      return Object.entries(propertyData)
        .map(([property, data]) => {
          const grossProfit = data.revenue - data.cogs
          const netIncome = data.revenue - data.cogs - data.opex + data.otherIncome - data.otherExpenses

          let value = 0
          switch (propertyChartMetric) {
            case "income":
              value = data.revenue
              break
            case "gp":
              value = grossProfit
              break
            case "ni":
              value = netIncome
              break
          }

          return {
            name: property,
            value: value,
            revenue: data.revenue,
            grossProfit: grossProfit,
            netIncome: netIncome,
          }
        })
        .filter((item) => item.value > 0)
    }

    return []
  }

  const kpis = calculateKPIs()
  const trendData = generateTrendData()
  const expenseData = generateExpenseBreakdown()

  // Achievement system
  const calculateAchievements = () => {
    if (!timeSeriesData?.availableProperties || timeSeriesData.availableProperties.length === 0) {
      return []
    }

    const achievements = []

    // Get customer performance data
    const propertyData = timeSeriesData.availableProperties.map((property) => {
      const revenue = currentData
        .filter((item) => item.category === "Revenue")
        .reduce((sum, item) => sum + (item.propertyTotals?.[property] || 0), 0)

      const cogs = currentData
        .filter((item) => item.category === "COGS")
        .reduce((sum, item) => sum + Math.abs(item.propertyTotals?.[property] || 0), 0)

      const operatingExpenses = currentData
        .filter((item) => item.category === "Operating Expenses")
        .reduce((sum, item) => sum + Math.abs(item.propertyTotals?.[property] || 0), 0)

      const otherIncome = currentData
        .filter((item) => item.category === "Other Income")
        .reduce((sum, item) => sum + (item.propertyTotals?.[property] || 0), 0)

      const otherExpenses = currentData
        .filter((item) => item.category === "Other Expenses")
        .reduce((sum, item) => sum + Math.abs(item.propertyTotals?.[property] || 0), 0)

      const totalExpenses = cogs + operatingExpenses + otherExpenses
      const profit = revenue - totalExpenses + otherIncome
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0

      return {
        name: property,
        revenue,
        expenses: totalExpenses,
        profit,
        margin,
      }
    })

    // Sort by different metrics
    const sortedByProfit = [...propertyData].sort((a, b) => b.profit - a.profit)
    const sortedByRevenue = [...propertyData].sort((a, b) => b.revenue - a.revenue)
    const sortedByMargin = [...propertyData].sort((a, b) => b.margin - a.margin)

    // Calculate totals
    const totalRevenue = propertyData.reduce((sum, p) => sum + p.revenue, 0)
    const totalProfit = propertyData.reduce((sum, p) => sum + p.profit, 0)
    const profitableProperties = propertyData.filter((p) => p.profit > 0)
    const highMarginProperties = propertyData.filter((p) => p.margin > 20)

    // Achievement: Top Performer
    if (sortedByProfit.length > 0 && sortedByProfit[0].profit > 0) {
      achievements.push({
        id: "top-performer",
        title: "🏆 Top Performer",
        description: `${sortedByProfit[0].name} leads with ${formatCurrency(sortedByProfit[0].profit)} profit`,
        type: "success",
        property: sortedByProfit[0].name,
        metric: sortedByProfit[0].profit,
      })
    }

    // Achievement: Revenue Champion
    if (sortedByRevenue.length > 0 && sortedByRevenue[0].revenue > 0) {
      achievements.push({
        id: "revenue-champion",
        title: "💰 Revenue Champion",
        description: `${sortedByRevenue[0].name} generates ${formatCurrency(sortedByRevenue[0].revenue)} in revenue`,
        type: "success",
        property: sortedByRevenue[0].name,
        metric: sortedByRevenue[0].revenue,
      })
    }

    // Achievement: Margin Master
    if (sortedByMargin.length > 0 && sortedByMargin[0].margin > 0) {
      achievements.push({
        id: "margin-master",
        title: "📈 Margin Master",
        description: `${sortedByMargin[0].name} achieves ${sortedByMargin[0].margin.toFixed(1)}% profit margin`,
        type: "success",
        property: sortedByMargin[0].name,
        metric: sortedByMargin[0].margin,
      })
    }

    // Achievement: Portfolio Powerhouse
    if (profitableProperties.length > 0) {
      const profitablePercentage = (profitableProperties.length / propertyData.length) * 100
      achievements.push({
        id: "portfolio-powerhouse",
        title: "🌟 Portfolio Powerhouse",
        description: `${profitableProperties.length} of ${propertyData.length} customers (${profitablePercentage.toFixed(0)}%) are profitable`,
        type: "info",
        metric: profitableProperties.length,
      })
    }

    // Achievement: Efficiency Expert
    if (highMarginProperties.length > 0) {
      achievements.push({
        id: "efficiency-expert",
        title: "⚡ Efficiency Expert",
        description: `${highMarginProperties.length} customers achieve 20%+ profit margins`,
        type: "info",
        metric: highMarginProperties.length,
      })
    }

    // Achievement: Growth Alert
    if (totalRevenue > 100000) {
      achievements.push({
        id: "growth-milestone",
        title: "🚀 Growth Milestone",
        description: `Portfolio revenue: ${formatCurrency(totalRevenue)} - Strong performance!`,
        type: "success",
        metric: totalRevenue,
      })
    }

    // Achievement: Needs Attention
    const lossProperties = propertyData.filter((p) => p.profit < 0)
    if (lossProperties.length > 0) {
      achievements.push({
        id: "needs-attention",
        title: "⚠️ Needs Attention",
        description: `${lossProperties.length} customers need optimization`,
        type: "warning",
        metric: lossProperties.length,
      })
    }

    // Achievement: Consistent Performer
    const consistentProperties = propertyData.filter((p) => p.margin > 10 && p.margin < 30)
    if (consistentProperties.length >= 3) {
      achievements.push({
        id: "consistent-performer",
        title: "🎯 Consistent Performer",
        description: `${consistentProperties.length} customers maintain steady 10-30% margins`,
        type: "info",
        metric: consistentProperties.length,
      })
    }

    return achievements
  }

  const achievements = calculateAchievements()

  // Achievement badges component
  const renderAchievementBadges = () => {
    if (achievements.length === 0) return null

    return (
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">🏆 Achievements</h3>
            <div className="text-sm text-gray-600">{achievements.length} earned</div>
          </div>
        </div>

        <div className="p-4">
          <div className={`grid ${deviceType === "mobile" ? "grid-cols-1" : "grid-cols-2"} gap-3`}>
            {achievements.map((achievement) => (
              <div
                key={achievement.id}
                className={`p-3 rounded-lg border-l-4 ${
                  achievement.type === "success"
                    ? "bg-green-50 border-green-400"
                    : achievement.type === "warning"
                      ? "bg-yellow-50 border-yellow-400"
                      : "bg-blue-50 border-blue-400"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900 mb-1">{achievement.title}</div>
                    <div className="text-sm text-gray-600">{achievement.description}</div>
                  </div>
                  {achievement.property && (
                    <div className="ml-3 text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                      {achievement.property}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Achievement summary */}
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600 text-center">
              🎉 Keep up the great work! Your portfolio is showing strong performance across multiple metrics.
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Helper function to get category totals with customer support
  const getCategoryTotal = (category, period, property) => {
    if (timeSeriesData) {
      if (viewMode === "by-property" && property) {
        return currentData
          .filter((item) => item.category === category)
          .reduce((sum, item) => {
            const propertyValue = item.propertyTotals?.[property] || 0
            return sum + propertyValue
          }, 0)
      } else if (period) {
        const periodData = timeSeriesData.data[period] || {}
        return Object.values(periodData)
          .filter((account) => account.category === category)
          .reduce((sum, account) => sum + account.total, 0)
      } else {
        return currentData.filter((item) => item.category === category).reduce((sum, item) => sum + item.total, 0)
      }
    }
    return 0
  }

  // Mobile-optimized KPI Cards
  const renderMobileKPICards = () => {
    const kpiData = [
      { key: "revenue", label: "Revenue", value: kpis.revenue, icon: DollarSign, color: BRAND_COLORS.primary },
      {
        key: "grossProfit",
        label: "Gross Profit",
        value: kpis.grossProfit,
        icon: BarChart3,
        color: BRAND_COLORS.warning,
        margin: kpis.grossMargin,
      },
      {
        key: "netOperatingIncome",
        label: "Operating Income",
        value: kpis.netOperatingIncome,
        icon: TrendingUp,
        color: BRAND_COLORS.success,
        margin: kpis.operatingMargin,
      },
      {
        key: "netIncome",
        label: "Net Income",
        value: kpis.netIncome,
        icon: PieChart,
        color: BRAND_COLORS.secondary,
        margin: kpis.netMargin,
      },
    ]

    if (deviceType === "mobile") {
      return (
        <div className="grid grid-cols-2 gap-3">
          {kpiData.map((kpi) => (
            <div
              key={kpi.key}
              className={`bg-white p-4 rounded-lg shadow-sm border-l-4 transition-all ${
                activeKPICard === kpi.key ? "shadow-md scale-105" : ""
              }`}
              style={{ borderLeftColor: kpi.color }}
              onClick={() => setActiveKPICard(activeKPICard === kpi.key ? null : kpi.key)}
            >
              <div className="flex items-center justify-between mb-2">
                <kpi.icon className="w-5 h-5" style={{ color: kpi.color }} />
                {activeKPICard === kpi.key && <ChevronDown className="w-4 h-4 text-gray-400" />}
              </div>
              <div className="text-xs text-gray-600 mb-1">{kpi.label}</div>
              <div className="text-lg font-bold text-gray-900">{formatCompactCurrency(kpi.value)}</div>
              {kpi.margin && activeKPICard === kpi.key && (
                <div className="text-xs text-green-600 mt-1">{kpi.margin.toFixed(1)}% Margin</div>
              )}
            </div>
          ))}
        </div>
      )
    }

    // Tablet version - single row
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiData.map((kpi) => (
          <div
            key={kpi.key}
            className="bg-white p-4 rounded-lg shadow-sm border-l-4 hover:shadow-md transition-shadow"
            style={{ borderLeftColor: kpi.color }}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-gray-600 text-sm font-medium mb-2">{kpi.label}</div>
                <div className="text-xl font-bold text-gray-900 mb-1">{formatCompactCurrency(kpi.value)}</div>
                {kpi.margin && (
                  <div className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full inline-block">
                    {kpi.margin.toFixed(1)}% Margin
                  </div>
                )}
              </div>
              <kpi.icon className="w-6 h-6" style={{ color: kpi.color }} />
            </div>
          </div>
        ))}
      </div>
    )
  }

  // Enhanced desktop P&L table with mobile-like fluidity
  const renderDesktopPLTable = () => {
    if (isLoadingData) {
      return (
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="w-6 h-6 animate-spin mr-2" />
          <span>Loading financial data from Supabase...</span>
        </div>
      )
    }

    if (currentData.length === 0) {
      return <div className="text-center py-8 text-gray-500">No financial data available for the selected filters</div>
    }

    const groupedAccounts = groupAccountsByParent(currentData)
    const categories = ["Revenue", "COGS", "Operating Expenses", "Other Income", "Other Expenses"]

    return (
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-xl font-semibold text-gray-900">
                Profit & Loss Statement {viewMode === "by-property" ? "(By Customer)" : "(Total)"}
              </h3>
              <div className="mt-2 text-sm text-gray-600">
                Showing {timePeriod.toLowerCase()} {viewMode} view for {selectedMonth}
                <div className="mt-1 text-xs text-green-600">
                  ✅ P&L accounts automatically classified • Balance Sheet accounts excluded • 🏗️ Account grouping
                  enabled
                </div>
              </div>
            </div>
            <div className="text-sm text-gray-500">
              {timeSeriesData?.summary?.totalEntriesProcessed || 0} entries loaded
            </div>
          </div>
        </div>

        <div className="overflow-hidden">
          {categories.map((category) => {
            const categoryAccounts = groupedAccounts.filter((account) => account.category === category)
            if (categoryAccounts.length === 0) return null

            const categoryTotal = getCategoryTotal(category)
            const isExpense = ["COGS", "Operating Expenses", "Other Expenses"].includes(category)

            return (
              <div key={category} className="border-b border-gray-100 last:border-b-0">
                {/* Category Header */}
                <div
                  className={`p-4 ${
                    category === "Revenue"
                      ? "bg-green-50"
                      : category === "COGS"
                        ? "bg-red-50"
                        : category === "Operating Expenses"
                          ? "bg-orange-50"
                          : category === "Other Income"
                            ? "bg-blue-50"
                            : "bg-purple-50"
                  } border-l-4 ${
                    category === "Revenue"
                      ? "border-green-400"
                      : category === "COGS"
                        ? "border-red-400"
                        : category === "Operating Expenses"
                          ? "border-orange-400"
                          : category === "Other Income"
                            ? "border-blue-400"
                            : "border-purple-400"
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <h4 className="text-lg font-bold text-gray-900 flex items-center">
                      <span className="mr-3 text-xl">
                        {category === "Revenue"
                          ? "💰"
                          : category === "COGS"
                            ? "🏭"
                            : category === "Operating Expenses"
                              ? "💸"
                              : category === "Other Income"
                                ? "➕"
                                : "➖"}
                      </span>
                      {category}
                    </h4>
                    <div className="text-right">
                      <div className={`text-xl font-bold ${isExpense ? "text-red-600" : "text-green-600"}`}>
                        {isExpense ? `(${formatCurrency(Math.abs(categoryTotal))})` : formatCurrency(categoryTotal)}
                      </div>
                      <div className="text-sm text-gray-500">
                        {kpis.revenue ? calculatePercentage(Math.abs(categoryTotal), Math.abs(kpis.revenue)) : "0%"} of
                        revenue
                      </div>
                    </div>
                  </div>
                </div>

                {/* Accounts in Category */}
                <div className="divide-y divide-gray-100">
                  {categoryAccounts.map((account) => (
                    <div key={account.name}>
                      {/* Parent Account Row */}
                      <div
                        className="p-4 hover:bg-gray-50 cursor-pointer transition-colors group"
                        onClick={() => handleAccountClick(account)}
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex items-center flex-1">
                            {account.isParent && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  toggleParentAccount(account.name)
                                }}
                                className="mr-3 p-1 hover:bg-gray-200 rounded transition-colors"
                              >
                                {expandedAccounts.has(account.name) ? (
                                  <ChevronDown className="w-4 h-4 text-gray-600" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-gray-600" />
                                )}
                              </button>
                            )}
                            <div className="flex-1">
                              <div className="flex items-center">
                                <span className="font-semibold text-gray-900 mr-2">
                                  {account.isParent ? "📁" : "📄"} {account.name}
                                </span>
                                {account.isParent && account.subAccounts && (
                                  <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded-full">
                                    {account.subAccounts.length} accounts
                                  </span>
                                )}
                              </div>
                              <div className="text-sm text-gray-500 mt-1">
                                {account.account_type} • {account.entries?.length || 0} transactions
                              </div>
                            </div>
                          </div>
                          <div className="text-right ml-4">
                            <div
                              className={`text-lg font-semibold group-hover:text-blue-600 transition-colors ${
                                account.total >= 0 ? "text-green-600" : "text-red-600"
                              }`}
                            >
                              {formatCurrency(account.total)}
                            </div>
                            <div className="text-sm text-gray-500">
                              {kpis.revenue
                                ? calculatePercentage(Math.abs(account.total), Math.abs(kpis.revenue))
                                : "0%"}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Sub-account Rows (if expanded) */}
                      {account.isParent && expandedAccounts.has(account.name) && account.subAccounts && (
                        <div className="bg-gray-25 border-l-4 border-gray-200 ml-4">
                          {account.subAccounts.map((subAccount) => (
                            <div
                              key={`${account.name}-${subAccount.name}`}
                              className="p-3 pl-8 hover:bg-gray-100 cursor-pointer transition-colors border-b border-gray-100 last:border-b-0"
                              onClick={() => handleAccountClick(subAccount)}
                            >
                              <div className="flex justify-between items-center">
                                <div className="flex items-center">
                                  <div
                                    className={`w-3 h-3 rounded-full mr-3 ${
                                      subAccount.isParentAsSubAccount ? "bg-blue-400" : "bg-gray-400"
                                    }`}
                                  ></div>
                                  <div>
                                    <div className="font-medium text-gray-800">
                                      {subAccount.isParentAsSubAccount ? "📁" : "💧"} {subAccount.name}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                      {subAccount.entries?.length || 0} transactions
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div
                                    className={`font-medium ${
                                      subAccount.total >= 0 ? "text-green-600" : "text-red-600"
                                    }`}
                                  >
                                    {formatCurrency(subAccount.total)}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {kpis.revenue
                                      ? calculatePercentage(Math.abs(subAccount.total), Math.abs(kpis.revenue))
                                      : "0%"}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          {/* Summary Section */}
          <div className="p-6 bg-gradient-to-r from-blue-50 to-purple-50 border-t-4 border-blue-400">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="text-sm text-gray-600 mb-1">📈 Gross Profit</div>
                <div className="text-xl font-bold text-green-600">{formatCurrency(kpis.grossProfit)}</div>
                <div className="text-xs text-gray-500">{kpis.grossMargin.toFixed(1)}% margin</div>
              </div>
              <div className="text-center">
                <div className="text-sm text-gray-600 mb-1">🏆 Operating Income</div>
                <div className={`text-xl font-bold ${kpis.netOperatingIncome >= 0 ? "text-blue-600" : "text-red-600"}`}>
                  {formatCurrency(kpis.netOperatingIncome)}
                </div>
                <div className="text-xs text-gray-500">{kpis.operatingMargin.toFixed(1)}% margin</div>
              </div>
              <div className="text-center">
                <div className="text-sm text-gray-600 mb-1">🎯 Net Income</div>
                <div className={`text-2xl font-bold ${kpis.netIncome >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {formatCurrency(kpis.netIncome)}
                </div>
                <div className="text-xs text-gray-500">{kpis.netMargin.toFixed(1)}% margin</div>
              </div>
              <div className="text-center">
                <div className="text-sm text-gray-600 mb-1">📊 Customers</div>
                <div className="text-xl font-bold text-purple-600">
                  {timeSeriesData?.availableProperties?.length || 0}
                </div>
                <div className="text-xs text-gray-500">Active customers</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Add the missing renderMobileTable function
  const renderMobileTable = () => {
    return renderDesktopPLTable()
  }

  // Add the missing renderSideBySideCustomerCards function
  const renderSideBySideCustomerCards = () => {
    return renderMobileCustomerCards()
  }

  const renderCompanyScorecard = () => {
    return (
      <div
        className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg shadow-lg overflow-hidden cursor-pointer hover:shadow-xl transition-all"
        onClick={() => setShowCompanyPL(true)}
      >
        <div className="p-6 text-white">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-bold">🏢 Company Total</h3>
              <div className="text-sm opacity-90">{timePeriod} Portfolio Performance</div>
            </div>
            <div className="text-xs bg-white bg-opacity-20 px-3 py-1 rounded-full">Tap for full P&L</div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Revenue */}
            <div>
              <div className="text-xs opacity-75 mb-1">Total Revenue</div>
              <div className="text-2xl font-bold">{formatCompactCurrency(kpis.revenue)}</div>
            </div>

            {/* Net Income */}
            <div>
              <div className="text-xs opacity-75 mb-1">Net Income</div>
              <div className={`text-2xl font-bold ${kpis.netIncome >= 0 ? "text-green-200" : "text-red-200"}`}>
                {formatCompactCurrency(kpis.netIncome)}
              </div>
            </div>

            {/* Gross Profit */}
            <div>
              <div className="text-xs opacity-75 mb-1">Gross Profit</div>
              <div className="text-xl font-semibold">{formatCompactCurrency(kpis.grossProfit)}</div>
              <div className="text-xs opacity-75">{kpis.grossMargin.toFixed(1)}% margin</div>
            </div>

            {/* Operating Income */}
            <div>
              <div className="text-xs opacity-75 mb-1">Operating Income</div>
              <div
                className={`text-xl font-semibold ${kpis.netOperatingIncome >= 0 ? "text-green-200" : "text-red-200"}`}
              >
                {formatCompactCurrency(kpis.netOperatingIncome)}
              </div>
              <div className="text-xs opacity-75">{kpis.operatingMargin.toFixed(1)}% margin</div>
            </div>
          </div>

          {/* Customer count */}
          <div className="mt-4 pt-4 border-t border-white border-opacity-20">
            <div className="flex justify-between items-center text-sm">
              <span className="opacity-75">Customers:</span>
              <span className="font-semibold">{timeSeriesData?.availableProperties?.length || 0}</span>
            </div>
            <div className="flex justify-between items-center text-sm mt-1">
              <span className="opacity-75">Net Margin:</span>
              <span className={`font-semibold ${kpis.netMargin >= 0 ? "text-green-200" : "text-red-200"}`}>
                {kpis.netMargin.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Mobile charts view
  const renderMobileCharts = () => (
    <div className="space-y-6">
      {/* Customer Performance Chart */}
      {generateCustomerChartData().length > 0 && (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900">Customer Performance</h3>
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                  <button
                    onClick={() => setPropertyChartMetric("income")}
                    className={`px-2 py-1 text-xs transition-colors ${
                      propertyChartMetric === "income" ? "text-white" : "bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                    style={{ backgroundColor: propertyChartMetric === "income" ? BRAND_COLORS.primary : undefined }}
                  >
                    Revenue
                  </button>
                  <button
                    onClick={() => setPropertyChartMetric("ni")}
                    className={`px-2 py-1 text-xs transition-colors ${
                      propertyChartMetric === "ni" ? "text-white" : "bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                    style={{ backgroundColor: propertyChartMetric === "ni" ? BRAND_COLORS.secondary : undefined }}
                  >
                    Net Income
                  </button>
                </div>
                <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                  <button
                    onClick={() => setPropertyChartView("pie")}
                    className={`p-1 ${
                      propertyChartView === "pie" ? "text-white" : "bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                    style={{ backgroundColor: propertyChartView === "pie" ? BRAND_COLORS.primary : undefined }}
                  >
                    <PieChart className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setPropertyChartView("bar")}
                    className={`p-1 ${
                      propertyChartView === "bar" ? "text-white" : "bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                    style={{ backgroundColor: propertyChartView === "bar" ? BRAND_COLORS.secondary : undefined }}
                  >
                    <BarChart3 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="p-2">
            <ResponsiveContainer width="100%" height={250}>
              {propertyChartView === "pie" ? (
                <RechartsPieChart>
                  <Pie
                    data={generateCustomerChartData()}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={0}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) => (percent > 0.1 ? `${(percent * 100).toFixed(0)}%` : "")}
                    labelLine={false}
                  >
                    {generateCustomerChartData().map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                        style={{ cursor: "pointer", filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.1))" }}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length > 0) {
                        const data = payload[0].payload
                        const metricName = propertyChartMetric === "income" ? "Revenue" : "Net Income"
                        const percentage = payload[0].percent

                        return (
                          <div
                            style={{
                              backgroundColor: "white",
                              border: "1px solid #e2e8f0",
                              borderRadius: "8px",
                              boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                              padding: "12px 16px",
                              fontSize: "12px",
                              fontWeight: 500,
                              maxWidth: "200px",
                            }}
                          >
                            <div
                              style={{
                                fontWeight: "bold",
                                fontSize: "14px",
                                color: "#1f2937",
                                marginBottom: "6px",
                                borderBottom: "1px solid #e5e7eb",
                                paddingBottom: "4px",
                              }}
                            >
                              {data.name}
                            </div>
                            <div style={{ color: "#374151", marginBottom: "4px" }}>
                              <strong>{metricName}:</strong> {formatCurrency(data.value)}
                            </div>
                            <div style={{ color: "#6b7280", marginBottom: "4px" }}>
                              <strong>Share:</strong> {(percentage * 100).toFixed(1)}%
                            </div>
                            <div
                              style={{
                                fontSize: "11px",
                                color: "#9ca3af",
                                borderTop: "1px solid #f3f4f6",
                                paddingTop: "4px",
                                marginTop: "4px",
                              }}
                            >
                              <div>Revenue: {formatCurrency(data.revenue)}</div>
                              <div>Net Income: {formatCurrency(data.netIncome)}</div>
                            </div>
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                </RechartsPieChart>
              ) : (
                <BarChart data={generateCustomerChartData()}>
                  <CartesianGrid strokeDasharray="2 2" stroke="#f1f5f9" />
                  <XAxis dataKey="name" hide />
                  <YAxis tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} />
                  <Tooltip
                    formatter={(value) => [formatCurrency(value), propertyChartMetric === "income" ? "Revenue" : "Net Income"]}
                    contentStyle={{ fontSize: "12px" }}
                  />
                  <Bar dataKey="value" fill={BRAND_COLORS.primary} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Trend Chart */}
      {trendData.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Revenue & Net Income</h3>
          </div>

          <div className="p-2">
            <ResponsiveContainer width="100%" height={250}>
              <ComposedChart data={trendData}>
                <CartesianGrid strokeDasharray="2 2" stroke="#f1f5f9" />
                <XAxis dataKey="period" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={60} interval={0} />
                <YAxis tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} />
                <Tooltip
                  formatter={(value, name) => [formatCurrency(value), name === "netIncome" ? "Net Income" : "Revenue"]}
                  contentStyle={{ fontSize: "12px" }}
                />
                <Bar dataKey="revenue" fill={BRAND_COLORS.tertiary} opacity={0.6} />
                <Bar dataKey="netIncome" fill={BRAND_COLORS.primary} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )

  const renderMobileCustomerCards = () => {
    if (!timeSeriesData?.availableProperties || timeSeriesData.availableProperties.length === 0) {
      return (
        <div className="text-center py-8 text-gray-500">
          <div className="text-center">
            <PieChart className="w-12 h-12 mx-auto mb-3 text-gray-400" />
            <p className="text-lg font-medium text-gray-600">No customer data available</p>
            <p className="text-sm mt-2 text-gray-500">Switch to "By Customer" view to see customer breakdown</p>
          </div>
        </div>
      )
    }

    // Get customer data and sort by profit (best performers first)
    const propertyData = timeSeriesData.availableProperties
      .map((property) => {
        const revenue = currentData
          .filter((item) => item.category === "Revenue")
          .reduce((sum, item) => sum + (item.propertyTotals?.[property] || 0), 0)

        const cogs = currentData
          .filter((item) => item.category === "COGS")
          .reduce((sum, item) => sum + Math.abs(item.propertyTotals?.[property] || 0), 0)

        const operatingExpenses = currentData
          .filter((item) => item.category === "Operating Expenses")
          .reduce((sum, item) => sum + Math.abs(item.propertyTotals?.[property] || 0), 0)

        const otherIncome = currentData
          .filter((item) => item.category === "Other Income")
          .reduce((sum, item) => sum + (item.propertyTotals?.[property] || 0), 0)

        const otherExpenses = currentData
          .filter((item) => item.category === "Other Expenses")
          .reduce((sum, item) => sum + Math.abs(item.propertyTotals?.[property] || 0), 0)

        const totalExpenses = cogs + operatingExpenses + otherExpenses
        const profit = revenue - totalExpenses + otherIncome

        return {
          name: property,
          revenue,
          expenses: totalExpenses,
          profit,
          data: {
            revenue,
            cogs,
            operatingExpenses,
            otherIncome,
            otherExpenses,
          },
        }
      })
      .sort((a, b) => b.profit - a.profit) // Sort by profit (highest first)

    return (
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Customer Performance</h3>
              <div className="text-sm text-gray-600 mt-1">
                {timePeriod} period • {propertyData.length} customers • Sorted by profit
              </div>
            </div>
            <div className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded-full">🏢 Tap to view P&L</div>
          </div>
        </div>

        {/* Horizontal scrolling customer cards */}
        <div className="p-4">
          <div className="flex gap-4 overflow-x-auto pb-2" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
            {propertyData.map((property, index) => (
              <div
                key={property.name}
                className="flex-shrink-0 w-36 bg-gradient-to-br from-white to-gray-50 rounded-lg border border-gray-200 p-4 shadow-sm hover:shadow-md transition-all cursor-pointer"
                onClick={() => {
                  setSelectedCustomerForPL(property)
                  setShowCustomerPL(true)
                }}
                style={{
                  minWidth: "144px",
                  boxShadow: index === 0 ? `0 4px 6px -1px ${BRAND_COLORS.primary}33` : undefined,
                }}
              >
                {/* Customer name */}
                <div className="text-sm font-semibold text-gray-900 mb-3 truncate" title={property.name}>
                  {property.name}
                  {index === 0 && <span className="ml-1 text-xs">🏆</span>}
                </div>

                {/* Revenue */}
                <div className="mb-3">
                  <div className="text-xs text-gray-500 mb-1">Revenue</div>
                  <div className="text-lg font-bold text-green-600">{formatCurrency(property.revenue)}</div>
                </div>

                {/* Expenses */}
                <div className="mb-3">
                  <div className="text-xs text-gray-500 mb-1">Expenses</div>
                  <div className="text-lg font-bold text-red-600">{formatCurrency(property.expenses)}</div>
                </div>

                {/* Profit */}
                <div className="mb-2">
                  <div className="text-xs text-gray-500 mb-1">Profit</div>
                  <div className={`text-lg font-bold ${property.profit >= 0 ? "text-blue-600" : "text-red-600"}`}>
                    {formatCurrency(property.profit)}
                  </div>
                </div>

                {/* Profit margin indicator */}
                <div className="mt-2 pt-2 border-t border-gray-200">
                  <div className="text-xs text-gray-500">
                    {property.revenue > 0
                      ? `${((property.profit / property.revenue) * 100).toFixed(1)}% margin`
                      : "No revenue"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="px-4 pb-4">
          <div className="text-xs text-gray-500 text-center">👈 Scroll horizontally to see all customers</div>
        </div>
      </div>
    )
  }

  // Customer P&L modal/screen
  const renderCustomerPLModal = () => {
    if (!showCustomerPL || !selectedCustomerForPL) return null

    const customer = selectedCustomerForPL

    // Get detailed P&L data for this customer
    const customerPLData = currentData
      .filter(
        (account) => account.propertyTotals?.[customer.name] && account.propertyTotals[customer.name] !== 0,
      )
      .map((account) => ({
        ...account,
        total: account.propertyTotals[customer.name],
        entries: account.propertyEntries?.[customer.name] || [],
      }))
      .sort((a, b) => {
        const categoryOrder = { Revenue: 0, COGS: 1, "Operating Expenses": 2, "Other Income": 3, "Other Expenses": 4 }
        return categoryOrder[a.category] - categoryOrder[b.category]
      })

    const categories = ["Revenue", "COGS", "Operating Expenses", "Other Income", "Other Expenses"]

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50">
        <div className="fixed inset-0 bg-white overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 p-4 z-10">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{customer.name}</h2>
                <div className="text-sm text-gray-600">{timePeriod} P&L Statement</div>
              </div>
              <button
                onClick={() => setShowCustomerPL(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Summary metrics */}
            <div className="mt-4 grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-sm text-gray-500">Revenue</div>
                <div className="text-lg font-bold text-green-600">{formatCurrency(customer.revenue)}</div>
              </div>
              <div className="text-center">
                <div className="text-sm text-gray-500">Expenses</div>
                <div className="text-lg font-bold text-red-600">{formatCurrency(customer.expenses)}</div>
              </div>
              <div className="text-center">
                <div className="text-sm text-gray-500">Profit</div>
                <div className={`text-lg font-bold ${customer.profit >= 0 ? "text-blue-600" : "text-red-600"}`}>
                  {formatCurrency(customer.profit)}
                </div>
              </div>
            </div>
          </div>

          {/* P&L Details */}
          <div className="p-4 space-y-4">
            {categories.map((category) => {
              const categoryAccounts = customerPLData.filter((account) => account.category === category)
              if (categoryAccounts.length === 0) return null

              const categoryTotal = categoryAccounts.reduce((sum, account) => sum + account.total, 0)
              const isExpense = ["COGS", "Operating Expenses", "Other Expenses"].includes(category)

              return (
                <div key={category} className="bg-gray-50 rounded-lg p-4">
                  {/* Category Header */}
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-semibold text-gray-900 flex items-center">
                      <span className="mr-2">
                        {category === "Revenue"
                          ? "💰"
                          : category === "COGS"
                            ? "🏭"
                            : category === "Operating Expenses"
                              ? "💸"
                              : category === "Other Income"
                                ? "➕"
                                : "➖"}
                      </span>
                      {category}
                    </h4>
                    <div className={`font-bold ${isExpense ? "text-red-600" : "text-green-600"}`}>
                      {isExpense ? `(${formatCurrency(Math.abs(categoryTotal))})` : formatCurrency(categoryTotal)}
                    </div>
                  </div>

                  {/* Accounts in Category */}
                  <div className="space-y-2">
                    {categoryAccounts.map((account) => (
                      <div
                        key={account.name}
                        className="flex justify-between items-center py-2 px-3 bg-white rounded cursor-pointer hover:bg-gray-50"
                        onClick={() => {
                          setSelectedAccountDetails(account)
                          setShowTransactionDetail(true)
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900 truncate">{account.name}</div>
                          <div className="text-xs text-gray-500 truncate">
                            {account.entries?.length || 0} transactions
                          </div>
                        </div>
                        <div className="ml-3 text-right">
                          <div className={`font-medium ${account.total >= 0 ? "text-green-600" : "text-red-600"}`}>
                            {formatCurrency(account.total)}
                          </div>
                          <div className="text-xs text-gray-500">Tap for details</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}

            {/* Summary totals */}
            <div className="bg-blue-50 rounded-lg p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-blue-900">📈 Gross Profit</span>
                <span className="font-bold text-blue-600">{formatCurrency(customer.revenue - customer.data.cogs)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-semibold text-blue-900">🏆 Operating Income</span>
                <span
                  className={`font-bold ${(customer.revenue - customer.data.cogs - customer.data.operatingExpenses) >= 0 ? "text-blue-600" : "text-red-600"}`}
                >
                  {formatCurrency(customer.revenue - customer.data.cogs - customer.data.operatingExpenses)}
                </span>
              </div>
              <div className="flex justify-between items-center border-t border-blue-200 pt-3">
                <span className="font-bold text-blue-900">🎯 Net Income</span>
                <span className={`font-bold text-lg ${customer.profit >= 0 ? "text-blue-600" : "text-red-600"}`}>
                  {formatCurrency(customer.profit)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Transaction detail modal
  const renderTransactionDetailModal = () => {
    if (!showTransactionDetail || !selectedAccountDetails) return null

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50">
        <div className="fixed inset-0 bg-white overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 p-4 z-10">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{selectedAccountDetails.name}</h2>
                <div className="text-sm text-gray-600">
                  {selectedAccountDetails.entries?.length || 0} transactions •{" "}
                  {formatCurrency(selectedAccountDetails.total)}
                </div>
              </div>
              <button
                onClick={() => setShowTransactionDetail(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Transaction list */}
          <div className="p-4">
            {selectedAccountDetails.entries && selectedAccountDetails.entries.length > 0 ? (
              <div className="space-y-3">
                {selectedAccountDetails.entries
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .map((entry, index) => (
                    <div key={`${entry.id}-${index}`} className="bg-gray-50 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div className="text-sm text-gray-600">{new Date(entry.date).toLocaleDateString()}</div>
                        <div className={`text-lg font-bold ${entry.amount >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {formatCurrency(entry.amount)}
                        </div>
                      </div>

                      {entry.memo && (
                        <div className="mb-2 p-2 bg-white rounded text-sm">
                          <span className="text-gray-700">{entry.memo}</span>
                        </div>
                      )}

                      <div className="flex justify-between text-sm text-gray-600">
                        <span>ID: {entry.id}</span>
                        <span>Customer: {entry.customer || "No Customer"}</span>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">No transaction details available</div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Company P&L modal - Mobile Only
  const renderCompanyPLModal = () => {
    if (!showCompanyPL) return null

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50">
        <div className="fixed inset-0 bg-white overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 p-4 z-10">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Company P&L Statement</h2>
                <div className="text-sm text-gray-600">{timePeriod} Portfolio Performance</div>
              </div>
              <button
                onClick={() => setShowCompanyPL(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Summary metrics */}
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="text-sm text-gray-500">Total Revenue</div>
                <div className="text-2xl font-bold text-green-600">{formatCurrency(kpis.revenue)}</div>
              </div>
              <div className="text-center">
                <div className="text-sm text-gray-500">Net Income</div>
                <div className={`text-2xl font-bold ${kpis.netIncome >= 0 ? "text-blue-600" : "text-red-600"}`}>
                  {formatCurrency(kpis.netIncome)}
                </div>
              </div>
            </div>
          </div>

          {/* Full P&L Table */}
          <div className="p-4">{renderDesktopPLTable()}</div>
        </div>
      </div>
    )
  }

  // Mobile detail panel
  const renderMobileDetailPanel = () => {
    if (!showDetailPanel || !selectedAccountDetails) return null

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 lg:hidden">
        <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-lg max-h-[80vh] overflow-hidden">
          <div className="p-4 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900">Transaction Details</h3>
              <button
                onClick={() => setShowDetailPanel(false)}
                className="p-2 hover:bg-gray-100 rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="mt-2">
              <p className="text-sm text-gray-600">{selectedAccountDetails.name}</p>
              <p className="text-lg font-semibold" style={{ color: BRAND_COLORS.primary }}>
                {formatCurrency(selectedAccountDetails.total)}
              </p>
            </div>
          </div>

          <div className="p-4 overflow-y-auto max-h-96">
            {selectedAccountDetails.entries && selectedAccountDetails.entries.length > 0 ? (
              <div className="space-y-3">
                {selectedAccountDetails.entries
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .slice(0, 20) // Limit to 20 most recent transactions on mobile
                  .map((entry, index) => (
                    <div key={`${entry.id}-${index}`} className="border border-gray-200 rounded-lg p-3">
                      <div className="flex justify-between items-start mb-2">
                        <div className="text-xs text-gray-500">{new Date(entry.date).toLocaleDateString()}</div>
                        <div
                          className={`text-sm font-semibold ${entry.amount >= 0 ? "text-green-600" : "text-red-600"}`}
                        >
                          {formatCurrency(entry.amount)}
                        </div>
                      </div>

                      {entry.memo && <div className="mb-2 text-xs text-gray-700">{entry.memo}</div>}

                      <div className="text-xs text-gray-600">
                        <strong>Customer:</strong> {entry.customer || "No Customer"}
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">No transaction details available</div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <IAMCFOLogo className="w-6 h-6 mr-3" />
              <div>
                <h1 className="text-lg font-bold text-gray-900">I AM CFO</h1>
                <p className="text-xs text-gray-600">
                  {deviceType === "mobile" ? "Mobile" : deviceType === "tablet" ? "Tablet" : "Desktop"} View
                </p>
              </div>
            </div>

            {/* Mobile Menu Controls */}
            <div className="flex items-center space-x-2 relative">
              {deviceType === "mobile" && (
                <>
                  <button
                    onClick={() => setMobileFilterOpen(!mobileFilterOpen)}
                    className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    <Menu className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setCompactMode(!compactMode)}
                    className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    {compactMode ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                  </button>
                </>
              )}

              <button
                onClick={loadRealFinancialData}
                disabled={isLoadingData}
                className="flex items-center gap-1 px-3 py-2 bg-gray-600 text-white rounded-lg text-sm disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingData ? "animate-spin" : ""}`} />
                {deviceType !== "mobile" && (isLoadingData ? "Loading..." : "Refresh")}
              </button>

              {/* Mobile Filter Panel */}
              {renderMobileFilters()}
            </div>
          </div>

          {/* Desktop Filter Controls */}
          {deviceType !== "mobile" && (
            <div className="mt-4 flex flex-wrap gap-3 items-center">
              {/* Month Selector */}
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm hover:border-blue-500 focus:outline-none focus:ring-2 transition-all"
                style={{ "--tw-ring-color": BRAND_COLORS.secondary + "33" } as React.CSSProperties}
              >
                {monthsList.map((month) => (
                  <option key={month} value={month}>
                    {month}
                  </option>
                ))}
              </select>

              {/* Customer Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setPropertyDropdownOpen(!propertyDropdownOpen)}
                  className="flex items-center justify-between w-56 px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm hover:border-blue-500 focus:outline-none focus:ring-2 transition-all"
                  style={{ "--tw-ring-color": BRAND_COLORS.secondary + "33" } as React.CSSProperties}
                >
                  <span className="truncate">{getSelectedCustomersText()}</span>
                  <ChevronDown
                    className={`w-4 h-4 ml-2 transition-transform ${propertyDropdownOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {propertyDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
                    <div className="p-2 text-xs text-gray-500 border-b border-gray-100">
                      Select customers to analyze
                    </div>
                    {availableProperties.map((property) => (
                      <div
                        key={property}
                        className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm"
                        onClick={() => handlePropertyToggle(property)}
                      >
                        <input
                          type="checkbox"
                          checked={selectedProperties.has(property)}
                          onChange={() => {}}
                          className="mr-3 h-4 w-4 border-gray-300 rounded"
                          style={{ accentColor: BRAND_COLORS.primary }}
                        />
                        <span className="text-gray-700">{property}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Time Period */}
              <select
                value={timePeriod}
                onChange={(e) => setTimePeriod(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm hover:border-blue-500 focus:outline-none focus:ring-2 transition-all"
                style={{ "--tw-ring-color": BRAND_COLORS.secondary + "33" } as React.CSSProperties}
              >
                {["Monthly", "Quarterly", "Yearly", "Trailing 12"].map((period) => (
                  <option key={period} value={period}>
                    {period}
                  </option>
                ))}
              </select>

              {/* View Mode Toggle */}
              <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                <button
                  onClick={() => setViewMode("total")}
                  className={`px-3 py-2 text-xs transition-colors ${
                    viewMode === "total" ? "text-white" : "bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                  style={{ backgroundColor: viewMode === "total" ? BRAND_COLORS.primary : undefined }}
                >
                  Total
                </button>
                <button
                  onClick={() => setViewMode("detailed")}
                  className={`px-3 py-2 text-xs transition-colors ${
                    viewMode === "detailed" ? "text-white" : "bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                  style={{ backgroundColor: viewMode === "detailed" ? BRAND_COLORS.primary : undefined }}
                >
                  Detail
                </button>
                <button
                  onClick={() => setViewMode("by-property")}
                  className={`px-3 py-2 text-xs transition-colors ${
                    viewMode === "by-property" ? "text-white" : "bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                  style={{ backgroundColor: viewMode === "by-property" ? BRAND_COLORS.primary : undefined }}
                  title="View P&L with customers as columns"
                >
                  By Customer
                </button>
              </div>

              {/* Export Button */}
              <button
                onClick={() => showNotification("Financial data exported", "success")}
                className="flex items-center gap-2 px-4 py-2 text-white rounded-lg hover:opacity-90 transition-colors shadow-sm"
                style={{ backgroundColor: BRAND_COLORS.primary }}
              >
                <Download className="w-4 h-4" />
                Export
              </button>
            </div>
          )}
          {/* Mobile Filter Panel */}
          {renderMobileFilters()}
        </div>
      </div>

      {/* Main Content */}
      <main
        id="mobile-container"
        className="px-4 py-6 space-y-6 relative"
        style={{
          transform: deviceType === "mobile" ? `translateY(${pullDistance}px)` : "none",
          transition: isRefreshing ? "transform 0.3s ease" : "none",
        }}
      >
        {/* Pull-to-refresh indicator */}
        {deviceType === "mobile" && (pullDistance > 0 || isRefreshing) && (
          <div
            className="absolute top-0 left-1/2 transform -translate-x-1/2 flex items-center justify-center"
            style={{
              top: deviceType === "mobile" ? `${-40 + pullDistance * 0.5}px` : "-40px",
              opacity: pullDistance > 20 || isRefreshing ? 1 : pullDistance / 20,
            }}
          >
            <div className="bg-white rounded-full p-2 shadow-lg border border-gray-200">
              <RefreshCw
                className={`w-5 h-5 ${isRefreshing ? "animate-spin" : ""} ${
                  pullDistance > 60 ? "text-green-500" : "text-gray-400"
                }`}
              />
            </div>
            <div className="ml-2 text-sm text-gray-600">
              {isRefreshing ? "Refreshing..." : pullDistance > 60 ? "Release to refresh" : "Pull to refresh"}
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoadingData && (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="w-6 h-6 animate-spin mr-2" />
            <span>Loading financial data from Supabase...</span>
          </div>
        )}

        {/* Error State */}
        {dataError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-700">{dataError}</p>
          </div>
        )}

        {/* Data Integrity Status */}
        {dataIntegrityStatus && !dataIntegrityStatus.isValid && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-center">
              <span className="text-yellow-600 mr-2">⚠️</span>
              <span className="text-yellow-700 font-medium">Data integrity issues detected</span>
            </div>
            <div className="text-sm text-yellow-600 mt-1">
              {dataIntegrityStatus.issues.slice(0, 2).join(", ")}
              {dataIntegrityStatus.issues.length > 2 && "..."}
            </div>
          </div>
        )}

        {/* KPI Cards */}
        {renderMobileKPICards()}

        {/* Main Content Grid */}
        {deviceType === "mobile" ? (
          // Mobile: Customer cards with drill-down
          <div className="space-y-6">
            {renderCompanyScorecard()}
            {renderAchievementBadges()}
            {renderSideBySideCustomerCards()}
          </div>
        ) : (
          // Tablet/Desktop: Charts on top, P&L below
          <div className="space-y-6">
            {/* Top Section: Charts and Company Info */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Company Scorecard */}
              <div>{renderCompanyScorecard()}</div>

              {/* Achievement Badges */}
              <div>{renderAchievementBadges()}</div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">{renderMobileCharts()}</div>

            {/* P&L Table - Full Width */}
            <div>{renderMobileTable()}</div>
          </div>
        )}
      </main>

      {/* Company P&L Modal - Mobile Only */}
      {deviceType === "mobile" && renderCompanyPLModal()}

      {/* Mobile Customer P&L Modal */}
      {renderCustomerPLModal()}

      {/* Mobile Transaction Detail Modal */}
      {renderTransactionDetailModal()}

      {/* Mobile Detail Panel */}
      {renderMobileDetailPanel()}

      {/* Notification */}
      {notification.show && (
        <div
          className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-lg text-white font-medium shadow-lg transition-transform ${
            notification.type === "success"
              ? "bg-green-500"
              : notification.type === "error"
                ? "bg-red-500"
                : "bg-blue-500"
          }`}
        >
          {notification.message}
        </div>
      )}

      {/* Click outside to close dropdowns */}
      {(timePeriodDropdownOpen || propertyDropdownOpen || mobileFilterOpen) && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => {
            setTimePeriodDropdownOpen(false)
            setPropertyDropdownOpen(false)
            setMobileFilterOpen(false)
          }}
        />
      )}
    </div>
  )
}
