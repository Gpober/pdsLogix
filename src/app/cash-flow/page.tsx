"use client"

import React from "react"
import { useState, useEffect } from "react"
import { RefreshCw, ChevronDown, ChevronRight, X, Download } from "lucide-react"
import * as XLSX from "xlsx"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
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

// Cash Flow Data Structures
interface CashFlowRow {
  property: string
  period: string
  operatingCashFlow: number
  financingCashFlow: number
  investingCashFlow: number
  netChangeInCash: number
}

interface TransactionDetail {
  date: string
  account: string
  memo: string | null
  debit: number
  credit: number
  impact: number
  bankAccount?: string
  entryNumber?: string
  customer?: string
  vendor?: string
  class?: string
  name?: string
  accountType?: string
  reportCategory?: string
}

interface JournalEntryLine {
  date: string
  account: string
  memo: string | null
  class: string | null
  debit: string | number | null
  credit: string | number | null
}

interface CashFlowBreakdown {
  operating: {
    rentalIncome: number
    otherIncome: number
    operatingExpenses: number
    cogs: number
    net: number
  }
  financing: {
    loanProceeds: number
    loanPayments: number
    mortgageProceeds: number
    mortgagePayments: number
    equityContributions: number
    distributions: number
    net: number
  }
  investing: {
    propertyPurchases: number
    propertySales: number
    propertyImprovements: number
    equipmentPurchases: number
    otherInvestments: number
    investmentProceeds: number
    net: number
  }
}

// New interfaces for offset account view
interface OffsetAccountData {
  offsetAccount: string
  periods: Record<string, number>
  total: number
  bankAccounts?: Record<string, number>
}

interface PeriodData {
  key: string
  label: string
  month?: number
  week?: number
}

// Bank Account breakdown interface
interface BankAccountData {
  bankAccount: string
  periods: Record<string, number>
  total: number
  offsetAccounts: Record<string, number>
}
type ViewMode = "offset" | "traditional" | "bybank"
type PeriodType = "monthly" | "weekly" | "total"
type TimePeriod = "Monthly" | "Quarterly" | "YTD" | "Trailing 12" | "Custom"

// Generate months and years lists
const monthsList = [
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

const yearsList = Array.from({ length: 10 }, (_, i) => (new Date().getFullYear() - 5 + i).toString())

export default function CashFlowPage() {
  // All state variables
  const [selectedMonth, setSelectedMonth] = useState<string>("June")
  const [selectedYear, setSelectedYear] = useState<string>("2024")
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("Monthly")
  const [selectedProperty, setSelectedProperty] = useState("All Properties")
  const [selectedBankAccount, setSelectedBankAccount] = useState("All Bank Accounts")
  const [viewMode, setViewMode] = useState<ViewMode>("offset")
  const [periodType, setPeriodType] = useState<PeriodType>("monthly")
  const [customStartDate, setCustomStartDate] = useState("")
  const [customEndDate, setCustomEndDate] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  // Collapsible sections state
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    operating: false,
    financing: false,
    investing: false,
    transfer: false,
    other: false,
    netchange: false,
  })

  // Toggle section collapse
  const toggleSectionCollapse = (section: string) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }))
  }

  // NEW: Transfer toggle state
  const [includeTransfers, setIncludeTransfers] = useState(false)

  // Traditional view state
  const [cashFlowData, setCashFlowData] = useState<CashFlowRow[]>([])
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [rowBreakdown, setRowBreakdown] = useState<CashFlowBreakdown | null>(null)
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false)

  // Offset view state
  const [offsetAccountData, setOffsetAccountData] = useState<OffsetAccountData[]>([])
  const [periods, setPeriods] = useState<PeriodData[]>([])

  // Bank account view state
  const [bankAccountData, setBankAccountData] = useState<BankAccountData[]>([])

  // Common state
  const [availableProperties, setAvailableProperties] = useState<string[]>(["All Properties"])
  const [availableBankAccounts, setAvailableBankAccounts] = useState<string[]>(["All Bank Accounts"])
  const [error, setError] = useState<string | null>(null)
  const [showTransactionModal, setShowTransactionModal] = useState(false)
  const [transactionDetails, setTransactionDetails] = useState<TransactionDetail[]>([])
  const [modalTitle, setModalTitle] = useState("")
  const [cashTransactions, setCashTransactions] = useState<any[]>([])
  const [journalEntryLines, setJournalEntryLines] = useState<JournalEntryLine[]>([])
  const [showJournalModal, setShowJournalModal] = useState(false)
  const [journalTitle, setJournalTitle] = useState("")

  // Data quality reconciliation state
  const [badEntries, setBadEntries] = useState<{ entry: string; delta: number }[]>([])
  const [showDataQuality, setShowDataQuality] = useState(false)

  // Store detailed transaction data for reuse
  const [transactionData, setTransactionData] = useState<Map<string, any[]>>(new Map())

  // Extract date parts directly from string
  const getDateParts = (dateString: string) => {
    const datePart = dateString.split("T")[0]
    const [year, month, day] = datePart.split("-").map(Number)
    return { year, month, day }
  }

  // Get month from date string
  const getMonthFromDate = (dateString: string): number => {
    const { month } = getDateParts(dateString)
    return month
  }

  // Get year from date string
  const getYearFromDate = (dateString: string): number => {
    const { year } = getDateParts(dateString)
    return year
  }

  const sum = (values: number[]) => values.reduce((acc, val) => acc + val, 0)

  // Convert any value to a number, treating null/undefined as 0
  const toNum = (v: any) => Number(v ?? 0)


  // Format date for display
  const formatDateSafe = (dateString: string): string => {
    const { year, month, day } = getDateParts(dateString)
    const date = new Date(year, month - 1, day)
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value || 0)
  }

  const formatDate = (dateString: string) => {
    return formatDateSafe(dateString)
  }

  const getMonthName = (month: number) => {
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
    return monthNames[month - 1]
  }

  const getWeekLabel = (year: number, week: number) => {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    const month = Math.ceil(week / 4.33)
    const weekInMonth = week - Math.floor((month - 1) * 4.33)
    return `${monthNames[Math.min(month - 1, 11)]} W${Math.max(1, Math.ceil(weekInMonth))}`
  }

  // Determine period key based on current periodType
  const getPeriodKey = (dateString: string): string => {
    if (periodType === "monthly") {
      const month = getMonthFromDate(dateString)
      const year = getYearFromDate(dateString)
      return `${year}-${month.toString().padStart(2, "0")}`
    }
    if (periodType === "weekly") {
      const date = getDateParts(dateString)
      const year = date.year
      const startOfYear = new Date(year, 0, 1)
      const dayOfYear =
        Math.floor(
          (new Date(date.year, date.month - 1, date.day).getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000),
        ) + 1
      const week = Math.ceil(dayOfYear / 7)
      return `${year}-W${week.toString().padStart(2, "0")}`
    }
    return "total"
  }

  const handleExportCashFlowExcel = () => {
    const months = Array.from(
      new Set(
        cashTransactions.map((tx) => monthsList[getMonthFromDate(tx.date) - 1]),
      ),
    ).sort((a, b) => monthsList.indexOf(a) - monthsList.indexOf(b))

    type ActivityMap = Record<string, number>
    const breakdown: Record<
      string,
      { operating: ActivityMap; financing: ActivityMap; investing: ActivityMap }
    > = {}
    const accounts = {
      operating: new Set<string>(),
      financing: new Set<string>(),
      investing: new Set<string>(),
    }
    const accountTypes: Record<string, Record<string, string>> = {
      operating: {},
      financing: {},
      investing: {},
    }

    months.forEach((m) => {
      breakdown[m] = { operating: {}, financing: {}, investing: {} }
    })

    cashTransactions.forEach((tx) => {
      const monthName = monthsList[getMonthFromDate(tx.date) - 1]
      if (!breakdown[monthName]) return

      const account = tx.account || ""
      const classification = classifyTransaction(
        tx.account_type,
        tx.report_category,
      )
      const impact = tx.cashFlowImpact || 0

      if (
        classification === "operating" ||
        classification === "financing" ||
        classification === "investing"
      ) {
        const activity = breakdown[monthName][classification]
        activity[account] = (activity[account] || 0) + impact
        accounts[classification].add(account)
        accountTypes[classification][account] = tx.account_type || ""
      }
    })

    const sheetData: (string | number | { f: string })[][] = []
    sheetData.push(["Account", ...months, "Total"])

    const formatCell = (value: number | { f: string }) =>
      typeof value === "number"
        ? { v: value, t: "n", z: '"$"#,##0.00_);("$"#,##0.00)' }
        : { t: "n", f: value.f, z: '"$"#,##0.00_);("$"#,##0.00)' }

    const pushRow = (
      label: string,
      values: (number | string | { f: string })[] = [],
      computeTotal = true,
    ) => {
      const row = [label, ...values.map((v) => (typeof v === "number" || (typeof v === "object" && "f" in v) ? formatCell(v as any) : v))]
      if (computeTotal) {
        const rowIdx = sheetData.length + 1
        const start = columnLetter(2)
        const end = columnLetter(months.length + 1)
        row.push({ t: "n", f: `SUM(${start}${rowIdx}:${end}${rowIdx})`, z: '"$"#,##0.00_);("$"#,##0.00)' })
      } else {
        row.push("")
      }
      sheetData.push(row)
    }

    const columnLetter = (col: number) => {
      let temp = ""
      while (col > 0) {
        const rem = (col - 1) % 26
        temp = String.fromCharCode(65 + rem) + temp
        col = Math.floor((col - 1) / 26)
      }
      return temp
    }

    const emptyRow = Array(months.length).fill("")

    // Operating Activities
    pushRow("Operating Activities", [...emptyRow], false)
    const opStart = sheetData.length + 1
    const opAccounts = Array.from(accounts.operating)
    const incomeOps = opAccounts
      .filter((a) => accountTypes.operating[a]?.toLowerCase().includes("income"))
      .sort()
    const otherOps = opAccounts
      .filter((a) => !accountTypes.operating[a]?.toLowerCase().includes("income"))
      .sort()
    ;[...incomeOps, ...otherOps].forEach((acc) => {
      pushRow(
        `  ${acc}`,
        months.map((m) => breakdown[m].operating[acc] || 0),
      )
    })
    const opEnd = sheetData.length
    const opTotals = months.map((_, idx) =>
      opEnd >= opStart
        ? {
            f: `SUM(${columnLetter(idx + 2)}${opStart}:${columnLetter(idx + 2)}${opEnd})`,
          }
        : 0,
    )
    pushRow("Total Operating Activities", opTotals)
    const opTotalRow = sheetData.length
    pushRow("", [...emptyRow], false)

    // Financing Activities
    pushRow("Financing Activities", [...emptyRow], false)
    const finStart = sheetData.length + 1
    Array.from(accounts.financing)
      .sort()
      .forEach((acc) => {
        pushRow(
          `  ${acc}`,
          months.map((m) => breakdown[m].financing[acc] || 0),
        )
      })
    const finEnd = sheetData.length
    const finTotals = months.map((_, idx) =>
      finEnd >= finStart
        ? {
            f: `SUM(${columnLetter(idx + 2)}${finStart}:${columnLetter(idx + 2)}${finEnd})`,
          }
        : 0,
    )
    pushRow("Total Financing Activities", finTotals)
    const finTotalRow = sheetData.length
    pushRow("", [...emptyRow], false)

    // Investing Activities
    pushRow("Investing Activities", [...emptyRow], false)
    const invStart = sheetData.length + 1
    Array.from(accounts.investing)
      .sort()
      .forEach((acc) => {
        pushRow(
          `  ${acc}`,
          months.map((m) => breakdown[m].investing[acc] || 0),
        )
      })
    const invEnd = sheetData.length
    const invTotals = months.map((_, idx) =>
      invEnd >= invStart
        ? {
            f: `SUM(${columnLetter(idx + 2)}${invStart}:${columnLetter(idx + 2)}${invEnd})`,
          }
        : 0,
    )
    pushRow("Total Investing Activities", invTotals)
    const invTotalRow = sheetData.length
    pushRow("", [...emptyRow], false)

    // Net Change in Cash
    pushRow(
      "Net Change in Cash",
      months.map((_, idx) => ({
        f: `SUM(${columnLetter(idx + 2)}${opTotalRow},${columnLetter(
          idx + 2,
        )}${finTotalRow},${columnLetter(idx + 2)}${invTotalRow})`,
      })),
    )

    const worksheet = XLSX.utils.aoa_to_sheet(sheetData)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Cash Flow")
    XLSX.writeFile(workbook, "cash_flow.xlsx")
  }

  const handleExportCashFlowPdf = () => {
    const months = Array.from(
      new Set(
        cashTransactions.map((tx) => monthsList[getMonthFromDate(tx.date) - 1]),
      ),
    ).sort((a, b) => monthsList.indexOf(a) - monthsList.indexOf(b))

    type ActivityMap = Record<string, number>
    const breakdown: Record<
      string,
      { operating: ActivityMap; financing: ActivityMap; investing: ActivityMap }
    > = {}
    const accounts = {
      operating: new Set<string>(),
      financing: new Set<string>(),
      investing: new Set<string>(),
    }
    const accountTypes: Record<string, Record<string, string>> = {
      operating: {},
      financing: {},
      investing: {},
    }

    months.forEach((m) => {
      breakdown[m] = { operating: {}, financing: {}, investing: {} }
    })

    cashTransactions.forEach((tx) => {
      const monthName = monthsList[getMonthFromDate(tx.date) - 1]
      if (!breakdown[monthName]) return

      const account = tx.account || ""
      const classification = classifyTransaction(
        tx.account_type,
        tx.report_category,
      )
      const impact = tx.cashFlowImpact || 0

      if (
        classification === "operating" ||
        classification === "financing" ||
        classification === "investing"
      ) {
        const activity = breakdown[monthName][classification]
        activity[account] = (activity[account] || 0) + impact
        accounts[classification].add(account)
        accountTypes[classification][account] = tx.account_type || ""
      }
    })
    const doc = new jsPDF()
    const tableColumn = ["Account", ...months, "Total"]
    const body: (string | number)[][] = []
    const fill = Array(months.length + 1).fill("")
    const format = (val: number) => {
      const abs = Math.abs(val).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
      return val < 0 ? `($${abs})` : `$${abs}`
    }
    const push = (label: string, values: (number | string)[] = []) => {
      body.push([label, ...values])
    }

    // Operating Activities
    push("Operating Activities", [...fill])
    const opAccounts = Array.from(accounts.operating)
    const incomeOps = opAccounts
      .filter((a) => accountTypes.operating[a]?.toLowerCase().includes("income"))
      .sort()
    const otherOps = opAccounts
      .filter((a) => !accountTypes.operating[a]?.toLowerCase().includes("income"))
      .sort()
    ;[...incomeOps, ...otherOps].forEach((acc) => {
      const vals = months.map((m) => breakdown[m].operating[acc] || 0)
      push(`  ${acc}`, [...vals.map(format), format(sum(vals))])
    })
    const opTotals = months.map((m) => sum(Object.values(breakdown[m].operating)))
    push(
      "Total Operating Activities",
      [...opTotals.map(format), format(sum(opTotals))],
    )
    push("", [...fill])

    // Financing Activities
    push("Financing Activities", [...fill])
    Array.from(accounts.financing)
      .sort()
      .forEach((acc) => {
        const vals = months.map((m) => breakdown[m].financing[acc] || 0)
        push(`  ${acc}`, [...vals.map(format), format(sum(vals))])
      })
    const finTotals = months.map((m) => sum(Object.values(breakdown[m].financing)))
    push(
      "Total Financing Activities",
      [...finTotals.map(format), format(sum(finTotals))],
    )
    push("", [...fill])

    // Investing Activities
    push("Investing Activities", [...fill])
    Array.from(accounts.investing)
      .sort()
      .forEach((acc) => {
        const vals = months.map((m) => breakdown[m].investing[acc] || 0)
        push(`  ${acc}`, [...vals.map(format), format(sum(vals))])
      })
    const invTotals = months.map((m) => sum(Object.values(breakdown[m].investing)))
    push(
      "Total Investing Activities",
      [...invTotals.map(format), format(sum(invTotals))],
    )
    push("", [...fill])

    // Net Change
    const netVals = months.map((m) =>
      sum([
        sum(Object.values(breakdown[m].operating)),
        sum(Object.values(breakdown[m].financing)),
        sum(Object.values(breakdown[m].investing)),
      ]),
    )
    push("Net Change in Cash", [...netVals.map(format), format(sum(netVals))])

    autoTable(doc, {
      head: [tableColumn],
      body,
    })
    doc.save("cash_flow.pdf")
  }

  // ENHANCED: Classification function with transfers as separate category
  const classifyTransaction = (accountType: string, reportCategory: string) => {
    const typeLower = accountType?.toLowerCase() || ""
    const categoryLower = reportCategory?.toLowerCase() || ""

    if (includeTransfers && categoryLower === "transfer") {
      return "transfer"
    }

    if (
      typeLower === "income" ||
      typeLower === "other income" ||
      typeLower === "expenses" ||
      typeLower === "expense" ||
      typeLower === "cost of goods sold" ||
      typeLower === "accounts receivable" ||
      typeLower === "accounts payable"
    ) {
      return "operating"
    }

    if (typeLower === "fixed assets" || typeLower === "other assets" || typeLower === "property, plant & equipment") {
      return "investing"
    }

    if (
      typeLower === "long term liabilities" ||
      typeLower === "equity" ||
      typeLower === "credit card" ||
      typeLower === "other current liabilities" ||
      typeLower === "line of credit"
    ) {
      return "financing"
    }

    return "other"
  }

  // Calculate date range based on selected period
  const calculateDateRange = () => {
    const now = new Date()
    let startDate: string
    let endDate: string

    if (timePeriod === "Custom") {
      startDate = customStartDate || "2024-01-01"
      endDate = customEndDate || "2024-12-31"
    } else if (timePeriod === "YTD") {
      const monthIndex = monthsList.indexOf(selectedMonth)
      const year = Number.parseInt(selectedYear)
      startDate = `${year}-01-01`
      const lastDay = new Date(year, monthIndex + 1, 0).getDate()
      endDate = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
    } else if (timePeriod === "Monthly") {
      const monthIndex = monthsList.indexOf(selectedMonth)
      const year = Number.parseInt(selectedYear)

      startDate = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`
      const lastDay = new Date(year, monthIndex + 1, 0).getDate()
      endDate = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
    } else if (timePeriod === "Quarterly") {
      const monthIndex = monthsList.indexOf(selectedMonth)
      const year = Number.parseInt(selectedYear)
      const quarter = Math.floor(monthIndex / 3)
      const quarterStartMonth = quarter * 3
      startDate = `${year}-${String(quarterStartMonth + 1).padStart(2, "0")}-01`
      const quarterEndMonth = quarterStartMonth + 2
      const lastDay = new Date(year, quarterEndMonth + 1, 0).getDate()
      endDate = `${year}-${String(quarterEndMonth + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
    } else if (timePeriod === "Trailing 12") {
      const monthIndex = monthsList.indexOf(selectedMonth)
      const year = Number.parseInt(selectedYear)

      // Start date is 11 months before selected month
      let startYear = year
      let startMonth = monthIndex + 1 - 11
      if (startMonth <= 0) {
        startMonth += 12
        startYear -= 1
      }
      startDate = `${startYear}-${String(startMonth).padStart(2, "0")}-01`

      // End date is last day of selected month
      const lastDay = new Date(year, monthIndex + 1, 0).getDate()
      endDate = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
    } else {
      // Fallback Trailing 12 from current date
      const twelveMonthsAgo = new Date(now)
      twelveMonthsAgo.setMonth(now.getMonth() - 12)
      startDate = twelveMonthsAgo.toISOString().split("T")[0]
      endDate = now.toISOString().split("T")[0]
    }

    return { startDate, endDate }
  }

  const getPeriodLabel = () => {
    const { startDate, endDate } = calculateDateRange()
    if (timePeriod === "Custom") {
      const startMonth = getMonthName(getMonthFromDate(startDate)).slice(0, 3)
      const endMonth = getMonthName(getMonthFromDate(endDate)).slice(0, 3)
      const startYear = getYearFromDate(startDate)
      const endYear = getYearFromDate(endDate)
      return startYear === endYear
        ? `${startMonth}-${endMonth} ${startYear}`
        : `${startMonth} ${startYear} - ${endMonth} ${endYear}`
    } else if (timePeriod === "Monthly") {
      return `${selectedMonth} ${selectedYear}`
    } else if (timePeriod === "Quarterly") {
      return `Q${Math.floor(monthsList.indexOf(selectedMonth) / 3) + 1} ${selectedYear}`
    } else if (timePeriod === "YTD") {
      return `January - ${selectedMonth} ${selectedYear}`
    } else if (timePeriod === "Trailing 12") {
      const startMonth = getMonthName(getMonthFromDate(startDate)).slice(0, 3)
      const endMonth = getMonthName(getMonthFromDate(endDate)).slice(0, 3)
      const startYear = getYearFromDate(startDate)
      const endYear = getYearFromDate(endDate)
      return `${startMonth} ${startYear} - ${endMonth} ${endYear}`
    }
    return "Trailing 12 Months"
  }

  // ENHANCED: Fetch available properties and bank accounts using new fields
  const fetchFilters = async () => {
    try {
      // Fetch properties from 'class' field
      const { data: propertyData, error: propertyError } = await supabase
        .from("journal_entry_lines")
        .select("class")
        .not("class", "is", null)

      if (propertyError) throw propertyError

      const properties = new Set<string>()
      propertyData.forEach((row: any) => {
        if (row.class) properties.add(row.class)
      })

      setAvailableProperties(["All Properties", ...Array.from(properties).sort()])

      // ENHANCED: Fetch bank accounts using entry_bank_account field
      const { data: bankData, error: bankError } = await supabase
        .from("journal_entry_lines")
        .select("entry_bank_account")
        .eq("is_cash_account", true)
        .not("entry_bank_account", "is", null)

      if (bankError) throw bankError

      const bankAccounts = new Set<string>()
      bankData.forEach((row: any) => {
        if (row.entry_bank_account) {
          bankAccounts.add(row.entry_bank_account)
        }
      })

      console.log(
        `🏦 Found ${bankAccounts.size} bank accounts using entry_bank_account field:`,
        Array.from(bankAccounts),
      )

      setAvailableBankAccounts(["All Bank Accounts", ...Array.from(bankAccounts).sort()])
    } catch (err) {
      console.error("Error fetching filters:", err)
    }
  }


  // FIXED: Fetch bank account view data with corrected transfer toggle logic
  const fetchBankAccountData = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const { startDate, endDate } = calculateDateRange()

      let query = supabase
        .from("journal_entry_lines")
        .select("entry_number,date,entry_bank_account,debit,credit,report_category,class")
        .gte("date", startDate)
        .lte("date", endDate)
        .eq("is_cash_account", true)
        .not("entry_bank_account", "is", null)

      if (selectedProperty !== "All Properties") {
        query = query.eq("class", selectedProperty)
      }
      if (selectedBankAccount !== "All Bank Accounts") {
        query = query.eq("entry_bank_account", selectedBankAccount)
      }
      if (!includeTransfers) {
        query = query.not("report_category", "ilike", "transfer")
      }

      const { data: cashLines, error } = await query
      if (error) throw error

      const bankAccountMap = new Map<string, Record<string, number>>()
      const periodSet = new Set<string>()
      const cashTransactionsList: any[] = []

      cashLines.forEach((line: any) => {
        const periodKey = getPeriodKey(line.date)
        periodSet.add(periodKey)
        const bank = line.entry_bank_account || "Unspecified"
        const cashDelta = toNum(line.debit) - toNum(line.credit)
        if (!bankAccountMap.has(bank)) bankAccountMap.set(bank, {})
        const bankData = bankAccountMap.get(bank)!
        bankData[periodKey] = toNum(bankData[periodKey]) + cashDelta
        cashTransactionsList.push({ ...line, cashDelta, cashFlowImpact: cashDelta, periodKey })
      })

      const periodsArray = Array.from(periodSet)
        .sort()
        .map((key) => {
          let label: string = "Total"
          let month: number | undefined
          let week: number | undefined
          if (periodType === "monthly") {
            const [year, monthStr] = key.split("-")
            const monthNum = Number.parseInt(monthStr)
            label = `${getMonthName(monthNum)} ${year}`
            month = monthNum
          } else if (periodType === "weekly") {
            const [year, weekStr] = key.split("-")
            const weekNum = Number.parseInt(weekStr.replace("W", ""))
            label = getWeekLabel(Number.parseInt(year), weekNum)
            week = weekNum
          }
          return { key, label, month, week }
        })
      setPeriods(periodsArray)

      const bankData: BankAccountData[] = Array.from(bankAccountMap.entries()).map(([bankAccount, periods]) => {
        const total = Object.values(periods).reduce((sum, val) => sum + val, 0)
        return { bankAccount, periods, total, offsetAccounts: {} }
      })

      bankData.sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
      setBankAccountData(bankData)
      setCashTransactions(cashTransactionsList)
    } catch (err) {
      console.error("❌ Error fetching bank account cash flow data:", err)
      setError(err instanceof Error ? err.message : "Unknown error")
  } finally {
      setIsLoading(false)
    }
  }

  // Helper: fetch offset lines via view if available, otherwise fall back to two-step query
  const fetchOffsets = async (startDate: string, endDate: string) => {
    // Attempt to use the cash_related_offsets view
    let viewQuery = supabase
      .from("cash_related_offsets")
      .select("entry_number,date,class,account,account_type,report_category,debit,credit,cash_effect,cash_bank_account")
      .gte("date", startDate)
      .lte("date", endDate)

    if (selectedProperty !== "All Properties") {
      viewQuery = viewQuery.eq("class", selectedProperty)
    }
    if (selectedBankAccount !== "All Bank Accounts") {
      viewQuery = viewQuery.eq("cash_bank_account", selectedBankAccount)
    }
    if (!includeTransfers) {
      viewQuery = viewQuery.not("report_category", "ilike", "transfer")
    }

    const { data: viewData, error: viewError } = await viewQuery
    if (!viewError && viewData) return viewData

    console.warn("cash_related_offsets view unavailable, falling back to manual query", viewError)

    // Option B fallback: first fetch cash lines
    let cashQuery = supabase
      .from("journal_entry_lines")
      .select("entry_number,entry_bank_account")
      .gte("date", startDate)
      .lte("date", endDate)
      .eq("is_cash_account", true)

    if (selectedProperty !== "All Properties") {
      cashQuery = cashQuery.eq("class", selectedProperty)
    }
    if (selectedBankAccount !== "All Bank Accounts") {
      cashQuery = cashQuery.eq("entry_bank_account", selectedBankAccount)
    }
    if (!includeTransfers) {
      cashQuery = cashQuery.not("report_category", "ilike", "transfer")
    }

    const { data: cashLines, error: cashError } = await cashQuery
    if (cashError) throw cashError

    const entryBankMap = new Map<string, string>()
    const entryNumbers: string[] = []
    cashLines.forEach((l: any) => {
      const entry = l.entry_number
      if (!entryBankMap.has(entry)) {
        entryBankMap.set(entry, l.entry_bank_account)
        entryNumbers.push(entry)
      }
    })

    if (entryNumbers.length === 0) return []

    let offsetQuery = supabase
      .from("journal_entry_lines")
      .select("entry_number,date,class,account,account_type,report_category,debit,credit")
      .in("entry_number", entryNumbers)
      .eq("is_cash_account", false)

    const { data: offsetLines, error: offsetError } = await offsetQuery
    if (offsetError) throw offsetError

    return offsetLines.map((o: any) => ({
        ...o,
        cash_bank_account: entryBankMap.get(o.entry_number) || null,
        cash_effect: toNum(o.credit) - toNum(o.debit),
      }))
  }

  // FIXED: Fetch offset account data with corrected transfer toggle logic
  const fetchOffsetAccountData = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const { startDate, endDate } = calculateDateRange()

      const offsets = await fetchOffsets(startDate, endDate)

      const offsetAccountMap = new Map<string, Record<string, number>>()
      const periodSet = new Set<string>()
      const transactionsList: any[] = []

      offsets.forEach((row: any) => {
        const periodKey = getPeriodKey(row.date)
        periodSet.add(periodKey)
        const account = row.account || "Unspecified"
        const cashEffect = toNum(row.credit) - toNum(row.debit)
        if (!offsetAccountMap.has(account)) offsetAccountMap.set(account, {})
        const accountPeriods = offsetAccountMap.get(account)!
        accountPeriods[periodKey] = toNum(accountPeriods[periodKey]) + cashEffect
        transactionsList.push({ ...row, cashFlowImpact: cashEffect, periodKey })
      })

      const periodsArray = Array.from(periodSet)
        .sort()
        .map((key) => {
          let label: string = "Total"
          let month: number | undefined
          let week: number | undefined
          if (periodType === "monthly") {
            const [year, monthStr] = key.split("-")
            const monthNum = Number.parseInt(monthStr)
            label = `${getMonthName(monthNum)} ${year}`
            month = monthNum
          } else if (periodType === "weekly") {
            const [year, weekStr] = key.split("-")
            const weekNum = Number.parseInt(weekStr.replace("W", ""))
            label = getWeekLabel(Number.parseInt(year), weekNum)
            week = weekNum
          }
          return { key, label, month, week }
        })
      setPeriods(periodsArray)

      const offsetData: OffsetAccountData[] = Array.from(offsetAccountMap.entries()).map(([account, periods]) => {
        const total = Object.values(periods).reduce((sum, val) => sum + val, 0)
        return { offsetAccount: account, periods, total }
      })

      offsetData.sort((a, b) => {
        const sampleA = transactionsList.find((tx) => tx.account === a.offsetAccount)
        const sampleB = transactionsList.find((tx) => tx.account === b.offsetAccount)
        const classA = classifyTransaction(sampleA?.account_type || "", sampleA?.report_category || "")
        const classB = classifyTransaction(sampleB?.account_type || "", sampleB?.report_category || "")
        const classOrder: Record<string, number> = { operating: 1, financing: 2, investing: 3, transfer: 4, other: 5 }
        const orderA = classOrder[classA] || 6
        const orderB = classOrder[classB] || 6
        if (orderA !== orderB) return orderA - orderB
        return Math.abs(b.total) - Math.abs(a.total)
      })

      setOffsetAccountData(offsetData)
      setCashTransactions(transactionsList)

      if (process.env.NODE_ENV === "development") {
        await checkDataQuality(offsets, startDate, endDate)
      }
    } catch (err) {
      console.error("❌ Error fetching cash flow offset account data:", err)
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setIsLoading(false)
    }
  }

  const fetchCashFlowData = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const { startDate, endDate } = calculateDateRange()

      const offsets = await fetchOffsets(startDate, endDate)

      const propertyTransactions = new Map<string, any[]>()
      offsets.forEach((row: any) => {
        const property = row.class || "Unclassified"
        if (!propertyTransactions.has(property)) propertyTransactions.set(property, [])
        const cashEffect = toNum(row.credit) - toNum(row.debit)
        propertyTransactions.get(property)!.push({ ...row, cashFlowImpact: cashEffect })
      })
      setTransactionData(propertyTransactions)

      const cashFlowArray: CashFlowRow[] = []
      const periodLabel = getPeriodLabel()
      for (const [property, transactions] of propertyTransactions.entries()) {
        let operatingTotal = 0
        let financingTotal = 0
        let investingTotal = 0
        transactions.forEach((row: any) => {
          const classification = classifyTransaction(row.account_type, row.report_category)
          const impact = row.cashFlowImpact
          if (classification === "operating") operatingTotal += impact
          else if (classification === "financing") financingTotal += impact
          else if (classification === "investing") investingTotal += impact
        })
        if (operatingTotal !== 0 || financingTotal !== 0 || investingTotal !== 0) {
          cashFlowArray.push({
            property,
            period: periodLabel,
            operatingCashFlow: operatingTotal,
            financingCashFlow: financingTotal,
            investingCashFlow: investingTotal,
            netChangeInCash: operatingTotal + financingTotal + investingTotal,
          })
        }
      }

      cashFlowArray.sort((a, b) => (a.property || "").localeCompare(b.property || ""))
      setCashFlowData(cashFlowArray)

      if (process.env.NODE_ENV === "development") {
        await checkDataQuality(offsets, startDate, endDate)
      }
    } catch (err) {
      console.error("❌ Error fetching traditional cash flow data:", err)
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setIsLoading(false)
    }
  }

  // Dev-only reconciliation between cash and offset lines
  const checkDataQuality = async (offsets: any[], startDate: string, endDate: string) => {
    let cashQuery = supabase
      .from("journal_entry_lines")
      .select("entry_number,debit,credit,entry_bank_account,report_category,class,date")
      .gte("date", startDate)
      .lte("date", endDate)
      .eq("is_cash_account", true)

    if (selectedProperty !== "All Properties") {
      cashQuery = cashQuery.eq("class", selectedProperty)
    }
    if (selectedBankAccount !== "All Bank Accounts") {
      cashQuery = cashQuery.eq("entry_bank_account", selectedBankAccount)
    }
    if (!includeTransfers) {
      cashQuery = cashQuery.not("report_category", "ilike", "transfer")
    }

    const { data: cashLines, error } = await cashQuery
    if (error) {
      console.error("Data quality cash line fetch error:", error)
      return
    }

    const cashSum = new Map<string, number>()
    cashLines.forEach((l: any) => {
      const entry = l.entry_number
      const delta = toNum(l.credit) - toNum(l.debit)
      cashSum.set(entry, toNum(cashSum.get(entry)) + delta)
    })

    const offsetSum = new Map<string, number>()
    offsets.forEach((o: any) => {
      const entry = o.entry_number
      const delta = toNum(o.credit) - toNum(o.debit)
      offsetSum.set(entry, toNum(offsetSum.get(entry)) + delta)
    })

    const issues: { entry: string; delta: number }[] = []
    const entries = new Set([...cashSum.keys(), ...offsetSum.keys()])
    entries.forEach((e) => {
      const diff = toNum(offsetSum.get(e)) - toNum(cashSum.get(e))
      if (Math.abs(diff) > 0.005) {
        console.warn(`Data quality issue entry ${e}: ${diff}`)
        issues.push({ entry: e, delta: diff })
      }
    })
    setBadEntries(issues)
  }

  /*
   Fixture:
   JE-001:
   Cash: Debit Checking 100
   Offsets: Credit Airbnb Rev 50, Credit Guesty Rev 50
   Expect: offset cash_effects [+50, +50], sum +100; cashSum -100; reconciliation OK.
  */

  // Show transaction drill-down for bank account view
  const openBankAccountDrillDown = async (bankAccount: string, periodKey: string) => {
    try {
      console.log(`🔍 Opening bank account drill-down for: "${bankAccount}", period: "${periodKey}"`)

      const periodTransactions = cashTransactions.filter((tx: any) => {
        return tx.periodKey === periodKey && tx.entry_bank_account === bankAccount
      })

      console.log(
        `🎯 Found ${periodTransactions.length} transactions for bank account "${bankAccount}" in period ${periodKey}`,
      )

      const period = periods.find((p) => p.key === periodKey)

      setModalTitle(`${bankAccount} - ${period?.label || periodKey} (Cash Activity)`)

      const transactionDetails: TransactionDetail[] = periodTransactions.map((tx: any) => ({
        date: tx.date,
        account: tx.account,
        memo: tx.memo,
        debit: Number.parseFloat(tx.debit) || 0,
        credit: Number.parseFloat(tx.credit) || 0,
        impact: tx.cashFlowImpact,
        entryNumber: tx.entry_number,
        customer: tx.customer,
        vendor: tx.vendor,
        name: tx.name,
        class: tx.class,
        bankAccount: tx.entry_bank_account,
        accountType: tx.account_type,
        reportCategory: tx.report_category,
      }))

      setTransactionDetails(transactionDetails)
      setShowTransactionModal(true)
    } catch (err) {
      console.error("Error fetching bank account transaction drill-down:", err)
    }
  }

  // Show transaction drill-down for offset accounts
  const openTransactionDrillDown = async (offsetAccount: string, periodKey: string) => {
    try {
      console.log(`🔍 Opening cash flow drill-down for account: "${offsetAccount}", period: "${periodKey}"`)

      const periodTransactions = cashTransactions.filter((tx: any) => {
        return tx.periodKey === periodKey && tx.account === offsetAccount
      })

      console.log(
        `🎯 Found ${periodTransactions.length} cash flow transactions for account "${offsetAccount}" in period ${periodKey}`,
      )

      const period = periods.find((p) => p.key === periodKey)

      setModalTitle(`${offsetAccount} - ${period?.label || periodKey} (Cash Flows)`)

      const transactionDetails: TransactionDetail[] = periodTransactions.map((tx: any) => ({
        date: tx.date,
        account: tx.account,
        memo: tx.memo,
        debit: Number.parseFloat(tx.debit) || 0,
        credit: Number.parseFloat(tx.credit) || 0,
        impact: tx.cashFlowImpact,
        entryNumber: tx.entry_number,
        customer: tx.customer,
        vendor: tx.vendor,
        name: tx.name,
        class: tx.class,
        bankAccount: tx.entry_bank_account,
        accountType: tx.account_type,
        reportCategory: tx.report_category,
      }))

      setTransactionDetails(transactionDetails)
      setShowTransactionModal(true)
    } catch (err) {
      console.error("Error fetching cash flow transaction drill-down:", err)
    }
  }

  // Fetch detailed breakdown for expanded row
  const fetchRowBreakdown = async (property: string) => {
    try {
      const transactions = transactionData.get(property) || []

      console.log(
        `Cash flow breakdown for ${property} ${getPeriodLabel()}: ${transactions.length} transactions`,
      )

      const breakdown: CashFlowBreakdown = {
        operating: {
          rentalIncome: 0,
          otherIncome: 0,
          operatingExpenses: 0,
          cogs: 0,
          net: 0,
        },
        financing: {
          loanProceeds: 0,
          loanPayments: 0,
          mortgageProceeds: 0,
          mortgagePayments: 0,
          equityContributions: 0,
          distributions: 0,
          net: 0,
        },
        investing: {
          propertyPurchases: 0,
          propertySales: 0,
          propertyImprovements: 0,
          equipmentPurchases: 0,
          otherInvestments: 0,
          investmentProceeds: 0,
          net: 0,
        },
      }

      let operatingTotal = 0
      let financingTotal = 0
      let investingTotal = 0

      transactions.forEach((row: any) => {
        const account = row.account?.toLowerCase() || ""
        const accountType = row.account_type?.toLowerCase() || ""
        const classification = classifyTransaction(row.account_type, row.report_category)
        const impact = row.cashFlowImpact || 0

        if (classification === "operating") {
          operatingTotal += impact

          if (accountType.includes("income") && impact > 0) {
            if (account.includes("rent") || account.includes("rental")) {
              breakdown.operating.rentalIncome += impact
            } else {
              breakdown.operating.otherIncome += impact
            }
          } else if ((accountType.includes("expense") || accountType.includes("cost")) && impact < 0) {
            if (accountType.includes("cost of goods sold")) {
              breakdown.operating.cogs += Math.abs(impact)
            } else {
              breakdown.operating.operatingExpenses += Math.abs(impact)
            }
          }
        } else if (classification === "financing") {
          financingTotal += impact

          if (account.includes("mortgage") && !account.includes("interest")) {
            if (impact > 0) breakdown.financing.mortgageProceeds += impact
            if (impact < 0) breakdown.financing.mortgagePayments += Math.abs(impact)
          } else if (account.includes("loan") && !account.includes("interest")) {
            if (impact > 0) breakdown.financing.loanProceeds += impact
            if (impact < 0) breakdown.financing.loanPayments += Math.abs(impact)
          } else if (accountType.includes("equity")) {
            if (impact > 0) breakdown.financing.equityContributions += impact
            if (impact < 0) breakdown.financing.distributions += Math.abs(impact)
          }
        } else if (classification === "investing") {
          investingTotal += impact

          if (accountType.includes("fixed assets") || accountType.includes("property")) {
            if (impact < 0) breakdown.investing.propertyPurchases += Math.abs(impact)
            if (impact > 0) breakdown.investing.propertySales += impact
          } else if (account.includes("improvement")) {
            breakdown.investing.propertyImprovements += Math.abs(impact)
          } else if (account.includes("equipment")) {
            breakdown.investing.equipmentPurchases += Math.abs(impact)
          }
        }
      })

      breakdown.operating.net = operatingTotal
      breakdown.financing.net = financingTotal
      breakdown.investing.net = investingTotal

      setRowBreakdown(breakdown)
    } catch (err) {
      console.error("Error fetching cash flow row breakdown:", err)
    }
  }

  // Show transaction details for traditional view
  const showTransactionDetails = async (
    property: string,
    category: "operating" | "financing" | "investing",
  ) => {
    try {
      const transactions = transactionData.get(property) || []

      console.log(
        `Cash flow transaction details for ${property} ${getPeriodLabel()} ${category}: ${transactions.length} total transactions`,
      )

      const filteredTransactions = transactions.filter((row: any) => {
        const classification = classifyTransaction(row.account_type, row.report_category)
        return classification === category
      })

      console.log(`Filtered to ${filteredTransactions.length} ${category} cash flow transactions`)

      setModalTitle(
        `${property} - ${getPeriodLabel()} ${category.charAt(0).toUpperCase() + category.slice(1)} Cash Flows`,
      )

      const transactionDetails: TransactionDetail[] = filteredTransactions.map((row: any) => ({
        date: row.date,
        account: row.account,
        memo: row.memo,
        debit: Number.parseFloat(row.debit) || 0,
        credit: Number.parseFloat(row.credit) || 0,
        impact: row.cashFlowImpact || 0,
        bankAccount: row.entry_bank_account,
        accountType: row.account_type,
        reportCategory: row.report_category,
        entryNumber: row.entry_number,
        customer: row.customer,
        vendor: row.vendor,
        name: row.name,
        class: row.class,
      }))

      setTransactionDetails(transactionDetails)
      setShowTransactionModal(true)
    } catch (err) {
      console.error("Error fetching cash flow transaction details:", err)
    }
  }

  const openJournalEntry = async (entryNumber?: string) => {
    if (!entryNumber) return
    const { data, error } = await supabase
      .from("journal_entry_lines")
      .select("date, account, memo, class, debit, credit")
      .eq("entry_number", entryNumber)
      .order("line_sequence")
    if (error) {
      console.error("Error fetching journal entry lines:", error)
      return
    }
    setJournalEntryLines(data || [])
    setJournalTitle(`Journal Entry ${entryNumber}`)
    setShowJournalModal(true)
  }

  // Toggle row expansion
  const toggleRowExpansion = async (property: string) => {
    if (expandedRow === property) {
      setExpandedRow(null)
      setRowBreakdown(null)
    } else {
      setExpandedRow(property)
      await fetchRowBreakdown(property)
    }
  }

  // Helper function to group accounts by classification including transfers
  const getAccountsByClass = () => {
    return {
      operating: offsetAccountData
        .filter((account) => {
          const sampleTx = cashTransactions.find((tx) => tx.account === account.offsetAccount)
          return sampleTx && classifyTransaction(sampleTx.account_type, sampleTx.report_category) === "operating"
        })
        .sort((a, b) => {
          // Get sample transactions to determine account types
          const sampleTxA = cashTransactions.find((tx) => tx.account === a.offsetAccount)
          const sampleTxB = cashTransactions.find((tx) => tx.account === b.offsetAccount)

          const accountTypeA = sampleTxA?.account_type?.toLowerCase() || ""
          const accountTypeB = sampleTxB?.account_type?.toLowerCase() || ""

          // Check if accounts are income types
          const isIncomeA = accountTypeA.includes("income")
          const isIncomeB = accountTypeB.includes("income")

          // Income accounts first, then expenses
          if (isIncomeA && !isIncomeB) return -1
          if (!isIncomeA && isIncomeB) return 1

          // Within same category, sort alphabetically
          return (a.offsetAccount || "").localeCompare(b.offsetAccount || "")
        }),
      financing: offsetAccountData.filter((account) => {
        const sampleTx = cashTransactions.find((tx) => tx.account === account.offsetAccount)
        return sampleTx && classifyTransaction(sampleTx.account_type, sampleTx.report_category) === "financing"
      }),
      investing: offsetAccountData.filter((account) => {
        const sampleTx = cashTransactions.find((tx) => tx.account === account.offsetAccount)
        return sampleTx && classifyTransaction(sampleTx.account_type, sampleTx.report_category) === "investing"
      }),
      transfer: offsetAccountData.filter((account) => {
        const sampleTx = cashTransactions.find((tx) => tx.account === account.offsetAccount)
        return sampleTx && classifyTransaction(sampleTx.account_type, sampleTx.report_category) === "transfer"
      }),
      other: offsetAccountData.filter((account) => {
        const sampleTx = cashTransactions.find((tx) => tx.account === account.offsetAccount)
        return !sampleTx || classifyTransaction(sampleTx.account_type, sampleTx.report_category) === "other"
      }),
    }
  }

  // Load data on component mount and when filters change
  useEffect(() => {
    fetchFilters()
  }, [])

  // ENHANCED: Add includeTransfers to dependency array
  useEffect(() => {
    if (viewMode === "offset") {
      fetchOffsetAccountData()
    } else if (viewMode === "bybank") {
      fetchBankAccountData()
    } else {
      fetchCashFlowData()
    }
  }, [
    timePeriod,
    selectedMonth,
    selectedYear,
    customStartDate,
    customEndDate,
    selectedProperty,
    selectedBankAccount,
    viewMode,
    periodType,
    includeTransfers, // NEW: Added to dependency array
  ])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Cash Flow Statement</h1>
              <p className="text-sm text-gray-600 mt-1">
                {timePeriod === "Custom"
                  ? `${formatDate(calculateDateRange().startDate)} - ${formatDate(calculateDateRange().endDate)}`
                  : timePeriod === "Monthly"
                    ? `${selectedMonth} ${selectedYear}`
                    : timePeriod === "Quarterly"
                      ? `Q${Math.floor(monthsList.indexOf(selectedMonth) / 3) + 1} ${selectedYear}`
                      : timePeriod === "YTD"
                        ? `January - ${selectedMonth} ${selectedYear}`
                        : timePeriod === "Trailing 12"
                          ? `${formatDate(calculateDateRange().startDate)} - ${formatDate(calculateDateRange().endDate)}`
                          : `${timePeriod} Period`}
              </p>
              {/* ENHANCED: Updated header information with transfer mode */}
              <p className="text-xs text-blue-600 mt-1">
                💰 Enhanced with perfect transfer logic -{" "}
                {includeTransfers
                  ? "Bank reconciliation mode (includes transfers)"
                  : "Business activity mode (excludes transfers)"}
              </p>
            </div>

            <div className="flex items-center space-x-4">
              {/* View Mode Toggle */}
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setViewMode("offset")}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${
                    viewMode === "offset" ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  📊 By Offset Account
                </button>
                <button
                  onClick={() => setViewMode("bybank")}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${
                    viewMode === "bybank" ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  🏦 By Bank (Cash lines)
                </button>
                <button
                  onClick={() => setViewMode("traditional")}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${
                    viewMode === "traditional"
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  📈 Traditional View
                </button>
              </div>

              {/* Period Type Toggle (only for offset and bank views) */}
              {(viewMode === "offset" || viewMode === "bybank") && (
                <div className="flex bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => setPeriodType("monthly")}
                    className={`px-3 py-1 text-sm rounded-md transition-colors ${
                      periodType === "monthly"
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    📅 Monthly
                  </button>
                  <button
                    onClick={() => setPeriodType("weekly")}
                    className={`px-3 py-1 text-sm rounded-md transition-colors ${
                      periodType === "weekly"
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    📊 Weekly
                  </button>
                  <button
                    onClick={() => setPeriodType("total")}
                    className={`px-3 py-1 text-sm rounded-md transition-colors ${
                      periodType === "total"
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    Σ Total
                  </button>
                </div>
              )}
              <div className="relative">
                <button
                  onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
                  className="inline-flex items-center px-4 py-2 text-white rounded-lg text-sm font-medium hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2"
                  style={{ backgroundColor: BRAND_COLORS.primary, "--tw-ring-color": BRAND_COLORS.primary + "33" } as React.CSSProperties}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export
                  <ChevronDown className="w-4 h-4 ml-2" />
                </button>
                {exportDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-36 bg-white border border-gray-200 rounded-lg shadow-lg">
                    <button onClick={handleExportCashFlowExcel} className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100">
                      Excel
                    </button>
                    <button onClick={handleExportCashFlowPdf} className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100">
                      PDF
                    </button>
                  </div>
                )}
              </div>

              <button
                onClick={() => {
                  if (viewMode === "offset") {
                    fetchOffsetAccountData()
                  } else if (viewMode === "bybank") {
                    fetchBankAccountData()
                  } else {
                    fetchCashFlowData()
                  }
                }}
                disabled={isLoading}
                className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors shadow-sm disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-wrap items-center gap-4">
            {/* Time Period */}
            <select
              value={timePeriod}
              onChange={(e) => setTimePeriod(e.target.value as TimePeriod)}
              className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm hover:border-blue-500 focus:outline-none focus:ring-2 transition-all"
              style={{ "--tw-ring-color": BRAND_COLORS.secondary + "33" } as React.CSSProperties}
            >
              <option value="Monthly">Monthly</option>
              <option value="Quarterly">Quarterly</option>
              <option value="YTD">Year to Date</option>
              <option value="Trailing 12">Trailing 12 Months</option>
              <option value="Custom">Custom Date Range</option>
            </select>

            {/* Month Dropdown - Show for Monthly, Quarterly, YTD, and Trailing 12 */}
            {(timePeriod === "Monthly" ||
              timePeriod === "Quarterly" ||
              timePeriod === "YTD" ||
              timePeriod === "Trailing 12") && (
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm hover:border-blue-500 focus:outline-none focus:ring-2 transition-all"
                style={{ "--tw-ring-color": BRAND_COLORS.secondary + "33" } as React.CSSProperties}
              >
                {monthsList.map((month) => (
                  <option key={month} value={month}>
                    {month}
                  </option>
                ))}
              </select>
            )}

            {/* Year Dropdown - Show for Monthly, Quarterly, YTD, and Trailing 12 */}
            {(timePeriod === "Monthly" ||
              timePeriod === "Quarterly" ||
              timePeriod === "YTD" ||
              timePeriod === "Trailing 12") && (
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm hover:border-blue-500 focus:outline-none focus:ring-2 transition-all"
                style={{ "--tw-ring-color": BRAND_COLORS.secondary + "33" } as React.CSSProperties}
              >
                {yearsList.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            )}

            {/* Custom Date Range - Show for Custom */}
            {timePeriod === "Custom" && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm hover:border-blue-500 focus:outline-none focus:ring-2 transition-all"
                  style={{ "--tw-ring-color": BRAND_COLORS.secondary + "33" } as React.CSSProperties}
                />
                <span className="text-gray-500">to</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm hover:border-blue-500 focus:outline-none focus:ring-2 transition-all"
                  style={{ "--tw-ring-color": BRAND_COLORS.secondary + "33" } as React.CSSProperties}
                />
              </div>
            )}

            {/* Property Filter */}
            <select
              value={selectedProperty}
              onChange={(e) => setSelectedProperty(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm hover:border-blue-500 focus:outline-none focus:ring-2 transition-all"
              style={{ "--tw-ring-color": BRAND_COLORS.secondary + "33" } as React.CSSProperties}
            >
              {availableProperties.map((property) => (
                <option key={property} value={property}>
                  {property}
                </option>
              ))}
            </select>

            {/* Bank Account Filter */}
            {(viewMode === "offset" ||
              viewMode === "traditional" ||
              viewMode === "bybank") && (
              <select
                value={selectedBankAccount}
                onChange={(e) => setSelectedBankAccount(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm hover:border-blue-500 focus:outline-none focus:ring-2 transition-all"
                style={{ "--tw-ring-color": BRAND_COLORS.secondary + "33" } as React.CSSProperties}
              >
                {availableBankAccounts.map((account) => (
                  <option key={account} value={account}>
                    {account}
                  </option>
                ))}
              </select>
            )}

            {/* NEW: Transfer Toggle */}
            <div className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm hover:border-blue-500 transition-all">
              <input
                type="checkbox"
                id="includeTransfers"
                checked={includeTransfers}
                onChange={(e) => setIncludeTransfers(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
              />
              <label htmlFor="includeTransfers" className="cursor-pointer select-none">
                Include transfers (for bank reconciliation)
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          {/* Error State */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-700">Error loading cash flow data: {error}</p>
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin mr-2" />
              <span>Loading cash flow data...</span>
            </div>
          )}

          {process.env.NODE_ENV === "development" && !isLoading && (
            <div className="mb-4">
              <button
                onClick={() => setShowDataQuality((s) => !s)}
                className="text-sm text-blue-600 flex items-center"
              >
                {showDataQuality ? (
                  <ChevronDown className="w-4 h-4 mr-1" />
                ) : (
                  <ChevronRight className="w-4 h-4 mr-1" />
                )}
                Data Quality ({badEntries.length})
              </button>
              {showDataQuality && (
                <div className="mt-2">
                  {badEntries.length === 0 ? (
                    <div className="text-sm text-green-700">No discrepancies</div>
                  ) : (
                    <ul className="text-sm text-red-700 list-disc list-inside">
                      {badEntries.map((b) => (
                        <li key={b.entry}>
                          {b.entry}: {b.delta.toFixed(2)}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Bank Account View */}
          {viewMode === "bybank" && !isLoading && (
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">By Bank (Cash lines)</h3>
                <div className="text-sm text-gray-600 mt-1">
                  {timePeriod === "Custom"
                    ? `For the period ${formatDate(calculateDateRange().startDate)} - ${formatDate(calculateDateRange().endDate)}`
                    : timePeriod === "Monthly"
                      ? `For ${selectedMonth} ${selectedYear}`
                      : timePeriod === "Quarterly"
                        ? `For Q${Math.floor(monthsList.indexOf(selectedMonth) / 3) + 1} ${selectedYear}`
                        : timePeriod === "YTD"
                          ? `For January - ${selectedMonth} ${selectedYear}`
                          : timePeriod === "Trailing 12"
                            ? `For ${formatDate(calculateDateRange().startDate)} - ${formatDate(calculateDateRange().endDate)}`
                            : `For ${timePeriod} Period`}
                  {selectedProperty !== "All Properties" && (
                    <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                      Property: {selectedProperty}
                    </span>
                  )}
                </div>
                <div className="text-xs text-blue-600 mt-1">
                  🏦 Enhanced with entry_bank_account field - Shows exact bank source for every transaction
                </div>
              </div>

              {bankAccountData.length > 0 &&
                (() => {
                  const grandTotal = bankAccountData.reduce((sum, acc) => sum + acc.total, 0)
                  return (
                    <div className="p-6 bg-gradient-to-r from-green-50 to-blue-50 border-b border-gray-200">
                      <div className="text-center">
                        <div className="text-sm text-blue-700 font-semibold">Net Change in All Bank Accounts</div>
                        <div className={`text-2xl font-bold ${grandTotal >= 0 ? "text-green-700" : "text-red-700"}`}>
                          {formatCurrency(grandTotal)}
                        </div>
                        <div className="text-xs text-gray-600 mt-1">Across {bankAccountData.length} bank accounts</div>
                      </div>
                    </div>
                  )
                })()}

              {bankAccountData.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="sticky left-0 bg-gray-50 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                          Bank Account
                        </th>
                        {periods.map((period) => (
                          <th
                            key={period.key}
                            className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px]"
                          >
                            {period.label}
                          </th>
                        ))}
                        {periodType !== "total" && (
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Total
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {bankAccountData.map((account, index) => (
                        <tr key={account.bankAccount} className="hover:bg-gray-50">
                          <td className="sticky left-0 bg-white px-6 py-4 text-sm font-medium text-gray-900 border-r border-gray-200 max-w-[250px]">
                            <div className="truncate" title={account.bankAccount}>
                              🏦 {account.bankAccount}
                            </div>
                          </td>
                          {periods.map((period) => {
                            const amount = account.periods[period.key] || 0
                            return (
                              <td key={period.key} className="px-4 py-4 text-center">
                                {amount !== 0 ? (
                                  <button
                                    onClick={() => openBankAccountDrillDown(account.bankAccount, period.key)}
                                    className={`font-medium hover:underline ${
                                      amount >= 0 ? "text-green-600" : "text-red-600"
                                    }`}
                                  >
                                    {formatCurrency(amount)}
                                  </button>
                                ) : (
                                  <span className="text-gray-300">-</span>
                                )}
                              </td>
                            )
                          })}
                          {periodType !== "total" && (
                            <td className="px-6 py-4 text-right">
                              <span className={`font-bold ${account.total >= 0 ? "text-green-600" : "text-red-600"}`}>
                                {formatCurrency(account.total)}
                              </span>
                            </td>
                          )}
                        </tr>
                      ))}

                      {/* Total Row */}
                      <tr className="bg-blue-100 font-bold border-t-4 border-blue-400">
                        <td className="sticky left-0 bg-blue-100 px-6 py-4 text-sm font-bold text-blue-900 border-r border-blue-200">
                          💰 Net Change - All Bank Accounts
                        </td>
                        {periods.map((period) => {
                          const amount = bankAccountData.reduce((sum, acc) => sum + (acc.periods[period.key] || 0), 0)
                          return (
                            <td key={period.key} className="px-4 py-4 text-center">
                              <span className={`font-bold text-lg ${amount >= 0 ? "text-green-700" : "text-red-700"}`}>
                                {formatCurrency(amount)}
                              </span>
                            </td>
                          )
                        })}
                        {periodType !== "total" && (
                          <td className="px-6 py-4 text-right">
                            <span
                              className={`font-bold text-xl ${
                                bankAccountData.reduce((sum, acc) => sum + acc.total, 0) >= 0
                                  ? "text-green-700"
                                  : "text-red-700"
                              }`}
                            >
                              {formatCurrency(bankAccountData.reduce((sum, acc) => sum + acc.total, 0))}
                            </span>
                          </td>
                        )}
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center">
                  <p className="text-gray-500">No bank account activity found for the selected filters.</p>
                  <p className="text-xs text-gray-400 mt-2">Only transactions with entry_bank_account are shown.</p>
                </div>
              )}
            </div>
          )}

          {/* Offset Account View */}
          {viewMode === "offset" && !isLoading && (
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Cash Flow by Offset Account</h3>
                <div className="text-sm text-gray-600 mt-1">
                  {timePeriod === "Custom"
                    ? `For the period ${formatDate(calculateDateRange().startDate)} - ${formatDate(calculateDateRange().endDate)}`
                    : timePeriod === "Monthly"
                      ? `For ${selectedMonth} ${selectedYear}`
                      : timePeriod === "Quarterly"
                        ? `For Q${Math.floor(monthsList.indexOf(selectedMonth) / 3) + 1} ${selectedYear}`
                        : timePeriod === "YTD"
                          ? `For January - ${selectedMonth} ${selectedYear}`
                          : timePeriod === "Trailing 12"
                            ? `For ${formatDate(calculateDateRange().startDate)} - ${formatDate(calculateDateRange().endDate)}`
                            : `For ${timePeriod} Period`}
                  {selectedProperty !== "All Properties" && (
                    <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                      Property: {selectedProperty}
                    </span>
                  )}
                  {selectedBankAccount !== "All Bank Accounts" && (
                    <span className="ml-2 px-2 py-1 bg-green-100 text-green-800 rounded text-xs">
                      Bank: {selectedBankAccount}
                    </span>
                  )}
                </div>
                <div className="text-xs text-blue-600 mt-1">
                  💰 Enhanced with entry_bank_account field - Perfect cash flow tracking with transfer exclusion
                </div>
              </div>

              {offsetAccountData.length > 0 &&
                (() => {
                  const accountsByClass = getAccountsByClass()
                  const operatingTotal = accountsByClass.operating.reduce((sum, acc) => sum + acc.total, 0)
                  const financingTotal = accountsByClass.financing.reduce((sum, acc) => sum + acc.total, 0)
                  const investingTotal = accountsByClass.investing.reduce((sum, acc) => sum + acc.total, 0)
                  const transferTotal = accountsByClass.transfer.reduce((sum, acc) => sum + acc.total, 0)
                  const netTotal = operatingTotal + financingTotal + investingTotal + transferTotal

                  return (
                    <div className="p-6 bg-gradient-to-r from-blue-50 to-green-50 border-b border-gray-200">
                      <div
                        className={`grid grid-cols-1 gap-4 ${includeTransfers ? "md:grid-cols-5" : "md:grid-cols-4"}`}
                      >
                        <div className="text-center">
                          <div className="text-sm text-gray-600">Operating Activities</div>
                          <div
                            className={`text-lg font-bold ${operatingTotal >= 0 ? "text-green-600" : "text-red-600"}`}
                          >
                            {formatCurrency(operatingTotal)}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-sm text-gray-600">Financing Activities</div>
                          <div
                            className={`text-lg font-bold ${financingTotal >= 0 ? "text-green-600" : "text-red-600"}`}
                          >
                            {formatCurrency(financingTotal)}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-sm text-gray-600">Investing Activities</div>
                          <div
                            className={`text-lg font-bold ${investingTotal >= 0 ? "text-green-600" : "text-red-600"}`}
                          >
                            {formatCurrency(investingTotal)}
                          </div>
                        </div>
                        {includeTransfers && (
                          <div className="text-center">
                            <div className="text-sm text-gray-600">Transfer Activities</div>
                            <div
                              className={`text-lg font-bold ${transferTotal >= 0 ? "text-green-600" : "text-red-600"}`}
                            >
                              {formatCurrency(transferTotal)}
                            </div>
                          </div>
                        )}
                        <div
                          className={`text-center ${includeTransfers ? "border-l-2 border-blue-300" : "border-l-2 border-blue-300"}`}
                        >
                          <div className="text-sm text-blue-700 font-semibold">Net Change in Cash</div>
                          <div className={`text-xl font-bold ${netTotal >= 0 ? "text-green-700" : "text-red-700"}`}>
                            {formatCurrency(netTotal)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })()}

              {offsetAccountData.length > 0 ? (
                <div className="space-y-6">
                  {(() => {
                    const accountsByClass = getAccountsByClass()
                    const operatingAccounts = accountsByClass.operating
                    const operatingTotal = operatingAccounts.reduce((sum, acc) => sum + acc.total, 0)
                    const isCollapsed = collapsedSections.operating

                    return operatingAccounts.length > 0 ? (
                      <div className="border-b border-gray-200 last:border-b-0">
                        <div
                          className="bg-green-50 px-6 py-4 border-b border-green-200 cursor-pointer hover:bg-green-100 transition-colors"
                          onClick={() => toggleSectionCollapse("operating")}
                        >
                          <div className="flex justify-between items-center">
                            <h4 className="text-lg font-semibold text-green-800 flex items-center">
                              <span className="w-4 h-4 bg-green-500 rounded-full mr-3"></span>
                              Operating Activities
                              {isCollapsed ? (
                                <ChevronRight className="w-5 h-5 ml-2 text-green-600" />
                              ) : (
                                <ChevronDown className="w-5 h-5 ml-2 text-green-600" />
                              )}
                              <span className="ml-2 text-sm text-green-600">({operatingAccounts.length} accounts)</span>
                            </h4>
                            <span
                              className={`text-xl font-bold ${operatingTotal >= 0 ? "text-green-700" : "text-red-700"}`}
                            >
                              {formatCurrency(operatingTotal)}
                            </span>
                          </div>
                        </div>

                        {!isCollapsed && (
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="sticky left-0 bg-gray-50 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                                    Account
                                  </th>
                                  {periods.map((period) => (
                                    <th
                                      key={period.key}
                                      className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px]"
                                    >
                                      {period.label}
                                    </th>
                                  ))}
                                  {periodType !== "total" && (
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                      Total
                                    </th>
                                  )}
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {operatingAccounts.map((account) => (
                                  <tr key={account.offsetAccount} className="hover:bg-gray-50">
                                    <td className="sticky left-0 bg-white px-6 py-4 text-sm font-medium text-gray-900 border-r border-gray-200 max-w-[250px]">
                                      <div className="truncate" title={account.offsetAccount}>
                                        {account.offsetAccount}
                                      </div>
                                    </td>
                                    {periods.map((period) => {
                                      const amount = account.periods[period.key] || 0
                                      return (
                                        <td key={period.key} className="px-4 py-4 text-center">
                                          {amount !== 0 ? (
                                            <button
                                              onClick={() =>
                                                openTransactionDrillDown(account.offsetAccount, period.key)
                                              }
                                              className={`font-medium hover:underline ${
                                                amount >= 0 ? "text-green-600" : "text-red-600"
                                              }`}
                                            >
                                              {formatCurrency(amount)}
                                            </button>
                                          ) : (
                                            <span className="text-gray-300">-</span>
                                          )}
                                        </td>
                                      )
                                    })}
                                    {periodType !== "total" && (
                                      <td className="px-6 py-4 text-right">
                                        <span
                                          className={`font-bold ${account.total >= 0 ? "text-green-600" : "text-red-600"}`}
                                        >
                                          {formatCurrency(account.total)}
                                        </span>
                                      </td>
                                    )}
                                  </tr>
                                ))}

                                {/* Total Row for Operating Activities */}
                                <tr className="bg-green-100 font-bold border-t-2 border-green-300">
                                  <td className="sticky left-0 bg-green-100 px-6 py-4 text-sm font-bold text-green-900 border-r border-green-200">
                                    💰 Total Operating Activities
                                  </td>
                                  {periods.map((period) => {
                                    const amount = operatingAccounts.reduce(
                                      (sum, acc) => sum + (acc.periods[period.key] || 0),
                                      0,
                                    )
                                    return (
                                      <td key={period.key} className="px-4 py-4 text-center">
                                        <span
                                          className={`font-bold text-lg ${amount >= 0 ? "text-green-700" : "text-red-700"}`}
                                        >
                                          {formatCurrency(amount)}
                                        </span>
                                      </td>
                                    )
                                  })}
                                  {periodType !== "total" && (
                                    <td className="px-6 py-4 text-right">
                                      <span
                                        className={`font-bold text-xl ${operatingTotal >= 0 ? "text-green-700" : "text-red-700"}`}
                                      >
                                        {formatCurrency(operatingTotal)}
                                      </span>
                                    </td>
                                  )}
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    ) : null
                  })()}

                  {(() => {
                    const accountsByClass = getAccountsByClass()
                    const financingAccounts = accountsByClass.financing
                    const financingTotal = financingAccounts.reduce((sum, acc) => sum + acc.total, 0)
                    const isCollapsed = collapsedSections.financing

                    return financingAccounts.length > 0 ? (
                      <div className="border-b border-gray-200 last:border-b-0">
                        <div
                          className="bg-blue-50 px-6 py-4 border-b border-blue-200 cursor-pointer hover:bg-blue-100 transition-colors"
                          onClick={() => toggleSectionCollapse("financing")}
                        >
                          <div className="flex justify-between items-center">
                            <h4 className="text-lg font-semibold text-blue-800 flex items-center">
                              <span className="w-4 h-4 bg-blue-500 rounded-full mr-3"></span>
                              Financing Activities
                              {isCollapsed ? (
                                <ChevronRight className="w-5 h-5 ml-2 text-blue-600" />
                              ) : (
                                <ChevronDown className="w-5 h-5 ml-2 text-blue-600" />
                              )}
                              <span className="ml-2 text-sm text-blue-600">({financingAccounts.length} accounts)</span>
                            </h4>
                            <span
                              className={`text-xl font-bold ${financingTotal >= 0 ? "text-green-700" : "text-red-700"}`}
                            >
                              {formatCurrency(financingTotal)}
                            </span>
                          </div>
                        </div>

                        {!isCollapsed && (
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="sticky left-0 bg-gray-50 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                                    Account
                                  </th>
                                  {periods.map((period) => (
                                    <th
                                      key={period.key}
                                      className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px]"
                                    >
                                      {period.label}
                                    </th>
                                  ))}
                                  {periodType !== "total" && (
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                      Total
                                    </th>
                                  )}
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {financingAccounts.map((account) => (
                                  <tr key={account.offsetAccount} className="hover:bg-gray-50">
                                    <td className="sticky left-0 bg-white px-6 py-4 text-sm font-medium text-gray-900 border-r border-gray-200 max-w-[250px]">
                                      <div className="truncate" title={account.offsetAccount}>
                                        {account.offsetAccount}
                                      </div>
                                    </td>
                                    {periods.map((period) => {
                                      const amount = account.periods[period.key] || 0
                                      return (
                                        <td key={period.key} className="px-4 py-4 text-center">
                                          {amount !== 0 ? (
                                            <button
                                              onClick={() =>
                                                openTransactionDrillDown(account.offsetAccount, period.key)
                                              }
                                              className={`font-medium hover:underline ${
                                                amount >= 0 ? "text-green-600" : "text-red-600"
                                              }`}
                                            >
                                              {formatCurrency(amount)}
                                            </button>
                                          ) : (
                                            <span className="text-gray-300">-</span>
                                          )}
                                        </td>
                                      )
                                    })}
                                    {periodType !== "total" && (
                                      <td className="px-6 py-4 text-right">
                                        <span
                                          className={`font-bold ${account.total >= 0 ? "text-green-600" : "text-red-600"}`}
                                        >
                                          {formatCurrency(account.total)}
                                        </span>
                                      </td>
                                    )}
                                  </tr>
                                ))}

                                {/* Total Row for Financing Activities */}
                                <tr className="bg-blue-100 font-bold border-t-2 border-blue-300">
                                  <td className="sticky left-0 bg-blue-100 px-6 py-4 text-sm font-bold text-blue-900 border-r border-blue-200">
                                    💰 Total Financing Activities
                                  </td>
                                  {periods.map((period) => {
                                    const amount = financingAccounts.reduce(
                                      (sum, acc) => sum + (acc.periods[period.key] || 0),
                                      0,
                                    )
                                    return (
                                      <td key={period.key} className="px-4 py-4 text-center">
                                        <span
                                          className={`font-bold text-lg ${amount >= 0 ? "text-green-700" : "text-red-700"}`}
                                        >
                                          {formatCurrency(amount)}
                                        </span>
                                      </td>
                                    )
                                  })}
                                  {periodType !== "total" && (
                                    <td className="px-6 py-4 text-right">
                                      <span
                                        className={`font-bold text-xl ${financingTotal >= 0 ? "text-green-700" : "text-red-700"}`}
                                      >
                                        {formatCurrency(financingTotal)}
                                      </span>
                                    </td>
                                  )}
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    ) : null
                  })()}

                  {(() => {
                    const accountsByClass = getAccountsByClass()
                    const investingAccounts = accountsByClass.investing
                    const investingTotal = investingAccounts.reduce((sum, acc) => sum + acc.total, 0)
                    const isCollapsed = collapsedSections.investing

                    return investingAccounts.length > 0 ? (
                      <div className="border-b border-gray-200 last:border-b-0">
                        <div
                          className="bg-orange-50 px-6 py-4 border-b border-orange-200 cursor-pointer hover:bg-orange-100 transition-colors"
                          onClick={() => toggleSectionCollapse("investing")}
                        >
                          <div className="flex justify-between items-center">
                            <h4 className="text-lg font-semibold text-orange-800 flex items-center">
                              <span className="w-4 h-4 bg-orange-500 rounded-full mr-3"></span>
                              Investing Activities
                              {isCollapsed ? (
                                <ChevronRight className="w-5 h-5 ml-2 text-orange-600" />
                              ) : (
                                <ChevronDown className="w-5 h-5 ml-2 text-orange-600" />
                              )}
                              <span className="ml-2 text-sm text-orange-600">
                                ({investingAccounts.length} accounts)
                              </span>
                            </h4>
                            <span
                              className={`text-xl font-bold ${investingTotal >= 0 ? "text-green-700" : "text-red-700"}`}
                            >
                              {formatCurrency(investingTotal)}
                            </span>
                          </div>
                        </div>
                        <div className="overflow-x-auto">
                          {!isCollapsed && (
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="sticky left-0 bg-gray-50 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                                    Account
                                  </th>
                                  {periods.map((period) => (
                                    <th
                                      key={period.key}
                                      className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px]"
                                    >
                                      {period.label}
                                    </th>
                                  ))}
                                  {periodType !== "total" && (
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                      Total
                                    </th>
                                  )}
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {investingAccounts.map((account) => (
                                  <tr key={account.offsetAccount} className="hover:bg-gray-50">
                                    <td className="sticky left-0 bg-white px-6 py-4 text-sm font-medium text-gray-900 border-r border-gray-200 max-w-[250px]">
                                      <div className="truncate" title={account.offsetAccount}>
                                        {account.offsetAccount}
                                      </div>
                                    </td>
                                    {periods.map((period) => {
                                      const amount = account.periods[period.key] || 0
                                      return (
                                        <td key={period.key} className="px-4 py-4 text-center">
                                          {amount !== 0 ? (
                                            <button
                                              onClick={() =>
                                                openTransactionDrillDown(account.offsetAccount, period.key)
                                              }
                                              className={`font-medium hover:underline ${
                                                amount >= 0 ? "text-green-600" : "text-red-600"
                                              }`}
                                            >
                                              {formatCurrency(amount)}
                                            </button>
                                          ) : (
                                            <span className="text-gray-300">-</span>
                                          )}
                                        </td>
                                      )
                                    })}
                                    {periodType !== "total" && (
                                      <td className="px-6 py-4 text-right">
                                        <span
                                          className={`font-bold ${account.total >= 0 ? "text-green-600" : "text-red-600"}`}
                                        >
                                          {formatCurrency(account.total)}
                                        </span>
                                      </td>
                                    )}
                                  </tr>
                                ))}

                                {/* Total Row for Investing Activities */}
                                <tr className="bg-orange-100 font-bold border-t-2 border-orange-300">
                                  <td className="sticky left-0 bg-orange-100 px-6 py-4 text-sm font-bold text-orange-900 border-r border-orange-200">
                                    💰 Total Investing Activities
                                  </td>
                                  {periods.map((period) => {
                                    const amount = investingAccounts.reduce(
                                      (sum, acc) => sum + (acc.periods[period.key] || 0),
                                      0,
                                    )
                                    return (
                                      <td key={period.key} className="px-4 py-4 text-center">
                                        <span
                                          className={`font-bold text-lg ${amount >= 0 ? "text-green-700" : "text-red-700"}`}
                                        >
                                          {formatCurrency(amount)}
                                        </span>
                                      </td>
                                    )
                                  })}
                                  {periodType !== "total" && (
                                    <td className="px-6 py-4 text-right">
                                      <span
                                        className={`font-bold text-xl ${investingTotal >= 0 ? "text-green-700" : "text-red-700"}`}
                                      >
                                        {formatCurrency(investingTotal)}
                                      </span>
                                    </td>
                                  )}
                                </tr>
                              </tbody>
                            </table>
                          )}
                        </div>
                      </div>
                    ) : null
                  })()}

                  {includeTransfers &&
                    (() => {
                      const accountsByClass = getAccountsByClass()
                      const transferAccounts = accountsByClass.transfer
                      const transferTotal = transferAccounts.reduce((sum, acc) => sum + acc.total, 0)
                      const isCollapsed = collapsedSections.transfer

                      return transferAccounts.length > 0 ? (
                        <div className="border-b border-gray-200 last:border-b-0">
                          <div
                            className="bg-purple-50 px-6 py-4 border-b border-purple-200 cursor-pointer hover:bg-purple-100 transition-colors"
                            onClick={() => toggleSectionCollapse("transfer")}
                          >
                            <div className="flex justify-between items-center">
                              <h4 className="text-lg font-semibold text-purple-800 flex items-center">
                                <span className="w-4 h-4 bg-purple-500 rounded-full mr-3"></span>
                                Transfer Activities
                                {isCollapsed ? (
                                  <ChevronRight className="w-5 h-5 ml-2 text-purple-600" />
                                ) : (
                                  <ChevronDown className="w-5 h-5 ml-2 text-purple-600" />
                                )}
                                <span className="ml-2 text-sm text-purple-600">
                                  ({transferAccounts.length} accounts)
                                </span>
                              </h4>
                              <span
                                className={`text-xl font-bold ${transferTotal >= 0 ? "text-green-700" : "text-red-700"}`}
                              >
                                {formatCurrency(transferTotal)}
                              </span>
                            </div>
                          </div>
                          <div className="overflow-x-auto">
                            {!isCollapsed && (
                              <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th className="sticky left-0 bg-gray-50 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                                      Account
                                    </th>
                                    {periods.map((period) => (
                                      <th
                                        key={period.key}
                                        className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px]"
                                      >
                                        {period.label}
                                      </th>
                                    ))}
                                    {periodType !== "total" && (
                                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Total
                                      </th>
                                    )}
                                  </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                  {transferAccounts.map((account) => (
                                    <tr key={account.offsetAccount} className="hover:bg-gray-50">
                                      <td className="sticky left-0 bg-white px-6 py-4 text-sm font-medium text-gray-900 border-r border-gray-200 max-w-[250px]">
                                        <div className="truncate flex items-center" title={account.offsetAccount}>
                                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 mr-2">
                                            Transfer
                                          </span>
                                          {account.offsetAccount}
                                        </div>
                                      </td>
                                      {periods.map((period) => {
                                        const amount = account.periods[period.key] || 0
                                        return (
                                          <td key={period.key} className="px-4 py-4 text-center">
                                            {amount !== 0 ? (
                                              <button
                                                onClick={() =>
                                                  openTransactionDrillDown(account.offsetAccount, period.key)
                                                }
                                                className={`font-medium hover:underline ${
                                                  amount >= 0 ? "text-green-600" : "text-red-600"
                                                }`}
                                              >
                                                {formatCurrency(amount)}
                                              </button>
                                            ) : (
                                              <span className="text-gray-300">-</span>
                                            )}
                                          </td>
                                        )
                                      })}
                                      {periodType !== "total" && (
                                        <td className="px-6 py-4 text-right">
                                          <span
                                            className={`font-bold ${account.total >= 0 ? "text-green-600" : "text-red-600"}`}
                                          >
                                            {formatCurrency(account.total)}
                                          </span>
                                        </td>
                                      )}
                                    </tr>
                                  ))}

                                  {/* Total Row for Transfer Activities */}
                                  <tr className="bg-purple-100 font-bold border-t-2 border-purple-300">
                                    <td className="sticky left-0 bg-purple-100 px-6 py-4 text-sm font-bold text-purple-900 border-r border-purple-200">
                                      💰 Total Transfer Activities
                                    </td>
                                    {periods.map((period) => {
                                      const amount = transferAccounts.reduce(
                                        (sum, acc) => sum + (acc.periods[period.key] || 0),
                                        0,
                                      )
                                      return (
                                        <td key={period.key} className="px-4 py-4 text-center">
                                          <span
                                            className={`font-bold text-lg ${amount >= 0 ? "text-green-700" : "text-red-700"}`}
                                          >
                                            {formatCurrency(amount)}
                                          </span>
                                        </td>
                                      )
                                    })}
                                    {periodType !== "total" && (
                                      <td className="px-6 py-4 text-right">
                                        <span
                                          className={`font-bold text-xl ${transferTotal >= 0 ? "text-green-700" : "text-red-700"}`}
                                        >
                                          {formatCurrency(transferTotal)}
                                        </span>
                                      </td>
                                    )}
                                  </tr>
                                </tbody>
                              </table>
                            )}
                          </div>
                        </div>
                      ) : null
                    })()}

                  {(() => {
                    const accountsByClass = getAccountsByClass()
                    const otherAccounts = accountsByClass.other
                    const otherTotal = otherAccounts.reduce((sum, acc) => sum + acc.total, 0)
                    const isCollapsed = collapsedSections.other

                    return otherAccounts.length > 0 ? (
                      <div className="border-b border-gray-200 last:border-b-0">
                        <div
                          className="bg-gray-50 px-6 py-4 border-b border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors"
                          onClick={() => toggleSectionCollapse("other")}
                        >
                          <div className="flex justify-between items-center">
                            <h4 className="text-lg font-semibold text-gray-800 flex items-center">
                              <span className="w-4 h-4 bg-gray-500 rounded-full mr-3"></span>
                              Other Activities
                              {isCollapsed ? (
                                <ChevronRight className="w-5 h-5 ml-2 text-gray-600" />
                              ) : (
                                <ChevronDown className="w-5 h-5 ml-2 text-gray-600" />
                              )}
                              <span className="ml-2 text-sm text-gray-600">({otherAccounts.length} accounts)</span>
                            </h4>
                            <span
                              className={`text-xl font-bold ${otherTotal >= 0 ? "text-green-700" : "text-red-700"}`}
                            >
                              {formatCurrency(otherTotal)}
                            </span>
                          </div>
                        </div>
                        <div className="overflow-x-auto">
                          {!isCollapsed && (
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="sticky left-0 bg-gray-50 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                                    Account
                                  </th>
                                  {periods.map((period) => (
                                    <th
                                      key={period.key}
                                      className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px]"
                                    >
                                      {period.label}
                                    </th>
                                  ))}
                                  {periodType !== "total" && (
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                      Total
                                    </th>
                                  )}
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {otherAccounts.map((account) => (
                                  <tr key={account.offsetAccount} className="hover:bg-gray-50">
                                    <td className="sticky left-0 bg-white px-6 py-4 text-sm font-medium text-gray-900 border-r border-gray-200 max-w-[250px]">
                                      <div className="truncate" title={account.offsetAccount}>
                                        {account.offsetAccount}
                                      </div>
                                    </td>
                                    {periods.map((period) => {
                                      const amount = account.periods[period.key] || 0
                                      return (
                                        <td key={period.key} className="px-4 py-4 text-center">
                                          {amount !== 0 ? (
                                            <button
                                              onClick={() =>
                                                openTransactionDrillDown(account.offsetAccount, period.key)
                                              }
                                              className={`font-medium hover:underline ${
                                                amount >= 0 ? "text-green-600" : "text-red-600"
                                              }`}
                                            >
                                              {formatCurrency(amount)}
                                            </button>
                                          ) : (
                                            <span className="text-gray-300">-</span>
                                          )}
                                        </td>
                                      )
                                    })}
                                    {periodType !== "total" && (
                                      <td className="px-6 py-4 text-right">
                                        <span
                                          className={`font-bold ${account.total >= 0 ? "text-green-600" : "text-red-600"}`}
                                        >
                                          {formatCurrency(account.total)}
                                        </span>
                                      </td>
                                    )}
                                  </tr>
                                ))}

                                {/* Total Row for Other Activities */}
                                <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
                                  <td className="sticky left-0 bg-gray-100 px-6 py-4 text-sm font-bold text-gray-900 border-r border-gray-200">
                                    💰 Total Other Activities
                                  </td>
                                  {periods.map((period) => {
                                    const amount = otherAccounts.reduce(
                                      (sum, acc) => sum + (acc.periods[period.key] || 0),
                                      0,
                                    )
                                    return (
                                      <td key={period.key} className="px-4 py-4 text-center">
                                        <span
                                          className={`font-bold text-lg ${amount >= 0 ? "text-green-700" : "text-red-700"}`}
                                        >
                                          {formatCurrency(amount)}
                                        </span>
                                      </td>
                                    )
                                  })}
                                  {periodType !== "total" && (
                                    <td className="px-6 py-4 text-right">
                                      <span
                                        className={`font-bold text-xl ${otherTotal >= 0 ? "text-green-700" : "text-red-700"}`}
                                      >
                                        {formatCurrency(otherTotal)}
                                      </span>
                                    </td>
                                  )}
                                </tr>
                              </tbody>
                            </table>
                          )}
                        </div>
                      </div>
                    ) : null
                  })()}

                  {/* Net Change in Cash Flow - Moved to bottom and formatted like other sections */}
                  {(() => {
                    const accountsByClass = getAccountsByClass()
                    const isCollapsed = collapsedSections.netchange

                    return (
                      <div className="border-b border-gray-200 last:border-b-0">
                        <div
                          className="bg-gradient-to-r from-blue-50 to-green-50 px-6 py-4 border-b border-blue-200 cursor-pointer hover:bg-gradient-to-r hover:from-blue-100 hover:to-green-100 transition-colors"
                          onClick={() => toggleSectionCollapse("netchange")}
                        >
                          <div className="flex justify-between items-center">
                            <h4 className="text-lg font-semibold text-blue-800 flex items-center">
                              <span className="w-4 h-4 bg-gradient-to-r from-blue-500 to-green-500 rounded-full mr-3"></span>
                              🏆 Net Change in Cash Flow
                              {isCollapsed ? (
                                <ChevronRight className="w-5 h-5 ml-2 text-blue-600" />
                              ) : (
                                <ChevronDown className="w-5 h-5 ml-2 text-blue-600" />
                              )}
                            </h4>
                            <span
                              className={`text-xl font-bold ${(() => {
                                const grandTotal =
                                  accountsByClass.operating.reduce((sum, acc) => sum + acc.total, 0) +
                                  accountsByClass.financing.reduce((sum, acc) => sum + acc.total, 0) +
                                  accountsByClass.investing.reduce((sum, acc) => sum + acc.total, 0) +
                                  accountsByClass.transfer.reduce((sum, acc) => sum + acc.total, 0) +
                                  accountsByClass.other.reduce((sum, acc) => sum + acc.total, 0)
                                return grandTotal >= 0 ? "text-green-700" : "text-red-700"
                              })()}`}
                            >
                              {(() => {
                                const grandTotal =
                                  accountsByClass.operating.reduce((sum, acc) => sum + acc.total, 0) +
                                  accountsByClass.financing.reduce((sum, acc) => sum + acc.total, 0) +
                                  accountsByClass.investing.reduce((sum, acc) => sum + acc.total, 0) +
                                  accountsByClass.transfer.reduce((sum, acc) => sum + acc.total, 0) +
                                  accountsByClass.other.reduce((sum, acc) => sum + acc.total, 0)
                                return formatCurrency(grandTotal)
                              })()}
                            </span>
                          </div>
                        </div>

                        {!isCollapsed && (
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="sticky left-0 bg-gray-50 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                                    Net Change
                                  </th>
                                  {periods.map((period) => (
                                    <th
                                      key={period.key}
                                      className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px]"
                                    >
                                      {period.label}
                                    </th>
                                  ))}
                                  {periodType !== "total" && (
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                      Total
                                    </th>
                                  )}
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                <tr className="bg-gradient-to-r from-blue-50 to-green-50">
                                  <td className="sticky left-0 bg-gradient-to-r from-blue-50 to-green-50 px-6 py-4 text-sm font-bold text-blue-900 border-r border-blue-200">
                                    💰 Total Net Change in Cash
                                  </td>
                                  {periods.map((period) => {
                                    const operatingAmount = accountsByClass.operating.reduce(
                                      (sum, acc) => sum + (acc.periods[period.key] || 0),
                                      0,
                                    )
                                    const financingAmount = accountsByClass.financing.reduce(
                                      (sum, acc) => sum + (acc.periods[period.key] || 0),
                                      0,
                                    )
                                    const investingAmount = accountsByClass.investing.reduce(
                                      (sum, acc) => sum + (acc.periods[period.key] || 0),
                                      0,
                                    )
                                    const transferAmount = accountsByClass.transfer.reduce(
                                      (sum, acc) => sum + (acc.periods[period.key] || 0),
                                      0,
                                    )
                                    const otherAmount = accountsByClass.other.reduce(
                                      (sum, acc) => sum + (acc.periods[period.key] || 0),
                                      0,
                                    )
                                    const totalAmount =
                                      operatingAmount + financingAmount + investingAmount + transferAmount + otherAmount

                                    return (
                                      <td key={period.key} className="px-4 py-4 text-center">
                                        <span
                                          className={`font-bold text-lg ${totalAmount >= 0 ? "text-green-700" : "text-red-700"}`}
                                        >
                                          {formatCurrency(totalAmount)}
                                        </span>
                                      </td>
                                    )
                                  })}
                                  {periodType !== "total" && (
                                    <td className="px-6 py-4 text-right">
                                      <span
                                        className={`font-bold text-xl ${(() => {
                                          const grandTotal =
                                            accountsByClass.operating.reduce((sum, acc) => sum + acc.total, 0) +
                                            accountsByClass.financing.reduce((sum, acc) => sum + acc.total, 0) +
                                            accountsByClass.investing.reduce((sum, acc) => sum + acc.total, 0) +
                                            accountsByClass.transfer.reduce((sum, acc) => sum + acc.total, 0) +
                                            accountsByClass.other.reduce((sum, acc) => sum + acc.total, 0)
                                          return grandTotal >= 0 ? "text-green-700" : "text-red-700"
                                        })()}`}
                                      >
                                        {(() => {
                                          const grandTotal =
                                            accountsByClass.operating.reduce((sum, acc) => sum + acc.total, 0) +
                                            accountsByClass.financing.reduce((sum, acc) => sum + acc.total, 0) +
                                            accountsByClass.investing.reduce((sum, acc) => sum + acc.total, 0) +
                                            accountsByClass.transfer.reduce((sum, acc) => sum + acc.total, 0) +
                                            accountsByClass.other.reduce((sum, acc) => sum + acc.total, 0)
                                          return formatCurrency(grandTotal)
                                        })()}
                                      </span>
                                    </td>
                                  )}
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              ) : (
                <div className="p-8 text-center">
                  <p className="text-gray-500">No cash flow data found for the selected filters.</p>
                  <p className="text-xs text-gray-400 mt-2">Only transactions with entry_bank_account are shown.</p>
                </div>
              )}
            </div>
          )}

          {/* Traditional Cash Flow Table */}
          {viewMode === "traditional" && !isLoading && cashFlowData.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Statement of Cash Flows</h3>
                <div className="text-sm text-gray-600 mt-1">
                  {timePeriod === "Custom"
                    ? `For the period ${formatDate(calculateDateRange().startDate)} - ${formatDate(calculateDateRange().endDate)}`
                    : timePeriod === "Monthly"
                      ? `For ${selectedMonth} ${selectedYear}`
                      : timePeriod === "Quarterly"
                        ? `For Q${Math.floor(monthsList.indexOf(selectedMonth) / 3) + 1} ${selectedYear}`
                        : timePeriod === "YTD"
                          ? `For January - ${selectedMonth} ${selectedYear}`
                          : timePeriod === "Trailing 12"
                            ? `For ${formatDate(calculateDateRange().startDate)} - ${formatDate(calculateDateRange().endDate)}`
                            : `For ${timePeriod} Period`}
                  {selectedProperty !== "All Properties" && (
                    <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                      Property: {selectedProperty}
                    </span>
                  )}
                  {selectedBankAccount !== "All Bank Accounts" && (
                    <span className="ml-2 px-2 py-1 bg-green-100 text-green-800 rounded text-xs">
                      Bank: {selectedBankAccount}
                    </span>
                  )}
                </div>
                <div className="text-xs text-blue-600 mt-1">
                  💰 Enhanced with entry_bank_account field - Click on amounts to view transaction details. Click row to
                  expand breakdown.
                </div>
              </div>

              {/* Add Summary Cards Section */}
              {cashFlowData.length > 0 &&
                (() => {
                  // Calculate totals from cash flow data
                  const operatingTotal = cashFlowData.reduce((sum, row) => sum + row.operatingCashFlow, 0)
                  const financingTotal = cashFlowData.reduce((sum, row) => sum + row.financingCashFlow, 0)
                  const investingTotal = cashFlowData.reduce((sum, row) => sum + row.investingCashFlow, 0)
                  const netChangeTotal = cashFlowData.reduce((sum, row) => sum + row.netChangeInCash, 0)

                  return (
                    <div className="p-6 bg-gradient-to-r from-blue-50 to-green-50 border-b border-gray-200">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="text-center">
                          <div className="text-sm text-gray-600">Operating Activities</div>
                          <div
                            className={`text-lg font-bold ${operatingTotal >= 0 ? "text-green-600" : "text-red-600"}`}
                          >
                            {formatCurrency(operatingTotal)}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-sm text-gray-600">Financing Activities</div>
                          <div
                            className={`text-lg font-bold ${financingTotal >= 0 ? "text-green-600" : "text-red-600"}`}
                          >
                            {formatCurrency(financingTotal)}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-sm text-gray-600">Investing Activities</div>
                          <div
                            className={`text-lg font-bold ${investingTotal >= 0 ? "text-green-600" : "text-red-600"}`}
                          >
                            {formatCurrency(investingTotal)}
                          </div>
                        </div>
                        <div className="text-center border-l-2 border-blue-300">
                          <div className="text-sm text-blue-700 font-semibold">Net Change in Cash</div>
                          <div
                            className={`text-xl font-bold ${netChangeTotal >= 0 ? "text-green-700" : "text-red-700"}`}
                          >
                            {formatCurrency(netChangeTotal)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })()}

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Property
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Period
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Operating CF
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Financing CF
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Investing CF
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Net Change
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {cashFlowData.map((row, index) => {
                      const rowKey = row.property
                      const isExpanded = expandedRow === rowKey

                      return (
                        <React.Fragment key={rowKey}>
                          <tr
                            className="hover:bg-gray-50 cursor-pointer"
                            onClick={() => toggleRowExpansion(row.property)}
                          >
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              <div className="flex items-center">
                                {isExpanded ? (
                                  <ChevronDown className="w-4 h-4 mr-2 text-gray-400" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 mr-2 text-gray-400" />
                                )}
                                {row.property}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.period}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  showTransactionDetails(row.property, "operating")
                                }}
                                className={`font-medium hover:underline ${
                                  row.operatingCashFlow >= 0 ? "text-green-600" : "text-red-600"
                                }`}
                              >
                                {formatCurrency(row.operatingCashFlow)}
                              </button>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  showTransactionDetails(row.property, "financing")
                                }}
                                className={`font-medium hover:underline ${
                                  row.financingCashFlow >= 0 ? "text-green-600" : "text-red-600"
                                }`}
                              >
                                {formatCurrency(row.financingCashFlow)}
                              </button>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  showTransactionDetails(row.property, "investing")
                                }}
                                className={`font-medium hover:underline ${
                                  row.investingCashFlow >= 0 ? "text-green-600" : "text-red-600"
                                }`}
                              >
                                {formatCurrency(row.investingCashFlow)}
                              </button>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                              <span
                                className={`font-bold ${row.netChangeInCash >= 0 ? "text-green-600" : "text-red-600"}`}
                              >
                                {formatCurrency(row.netChangeInCash)}
                              </span>
                            </td>
                          </tr>

                          {/* Expanded Row Details */}
                          {isExpanded && rowBreakdown && (
                            <tr>
                              <td colSpan={6} className="px-6 py-4 bg-gray-50">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                  {/* Operating Activities Breakdown */}
                                  <div>
                                    <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center">
                                      <span className="w-3 h-3 bg-green-500 rounded-full mr-2"></span>
                                      Operating Activities
                                    </h4>
                                    <div className="space-y-2 text-sm">
                                      <div className="flex justify-between">
                                        <span className="text-gray-600">Rental Income:</span>
                                        <span className="text-green-600">
                                          {formatCurrency(rowBreakdown.operating.rentalIncome)}
                                        </span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-gray-600">Other Income:</span>
                                        <span className="text-green-600">
                                          {formatCurrency(rowBreakdown.operating.otherIncome)}
                                        </span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-gray-600">Operating Expenses:</span>
                                        <span className="text-red-600">
                                          -{formatCurrency(rowBreakdown.operating.operatingExpenses)}
                                        </span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-gray-600">Cost of Goods Sold:</span>
                                        <span className="text-red-600">
                                          -{formatCurrency(rowBreakdown.operating.cogs)}
                                        </span>
                                      </div>
                                      <div className="flex justify-between border-t pt-2 font-semibold">
                                        <span className="text-gray-900">Net Operating:</span>
                                        <span
                                          className={
                                            rowBreakdown.operating.net >= 0 ? "text-green-600" : "text-red-600"
                                          }
                                        >
                                          {formatCurrency(rowBreakdown.operating.net)}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Financing Activities Breakdown */}
                                  <div>
                                    <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center">
                                      <span className="w-3 h-3 bg-blue-500 rounded-full mr-2"></span>
                                      Financing Activities
                                    </h4>
                                    <div className="space-y-2 text-sm">
                                      <div className="flex justify-between">
                                        <span className="text-gray-600">Loan Proceeds:</span>
                                        <span className="text-green-600">
                                          {formatCurrency(rowBreakdown.financing.loanProceeds)}
                                        </span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-gray-600">Loan Payments:</span>
                                        <span className="text-red-600">
                                          -{formatCurrency(rowBreakdown.financing.loanPayments)}
                                        </span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-gray-600">Mortgage Payments:</span>
                                        <span className="text-red-600">
                                          -{formatCurrency(rowBreakdown.financing.mortgagePayments)}
                                        </span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-gray-600">Equity Contributions:</span>
                                        <span className="text-green-600">
                                          {formatCurrency(rowBreakdown.financing.equityContributions)}
                                        </span>
                                      </div>
                                      <div className="flex justify-between border-t pt-2 font-semibold">
                                        <span className="text-gray-900">Net Financing:</span>
                                        <span
                                          className={
                                            rowBreakdown.financing.net >= 0 ? "text-green-600" : "text-red-600"
                                          }
                                        >
                                          {formatCurrency(rowBreakdown.financing.net)}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Investing Activities Breakdown */}
                                  <div>
                                    <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center">
                                      <span className="w-3 h-3 bg-orange-500 rounded-full mr-2"></span>
                                      Investing Activities
                                    </h4>
                                    <div className="space-y-2 text-sm">
                                      <div className="flex justify-between">
                                        <span className="text-gray-600">Property Purchases:</span>
                                        <span className="text-red-600">
                                          -{formatCurrency(rowBreakdown.investing.propertyPurchases)}
                                        </span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-gray-600">Property Improvements:</span>
                                        <span className="text-red-600">
                                          -{formatCurrency(rowBreakdown.investing.propertyImprovements)}
                                        </span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-gray-600">Equipment Purchases:</span>
                                        <span className="text-red-600">
                                          -{formatCurrency(rowBreakdown.investing.equipmentPurchases)}
                                        </span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-gray-600">Property Sales:</span>
                                        <span className="text-green-600">
                                          {formatCurrency(rowBreakdown.investing.propertySales)}
                                        </span>
                                      </div>
                                      <div className="flex justify-between border-t pt-2 font-semibold">
                                        <span className="text-gray-900">Net Investing:</span>
                                        <span
                                          className={
                                            rowBreakdown.investing.net >= 0 ? "text-green-600" : "text-red-600"
                                          }
                                        >
                                          {formatCurrency(rowBreakdown.investing.net)}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* No Data State */}
          {!isLoading &&
            ((viewMode === "offset" && offsetAccountData.length === 0) ||
              (viewMode === "bybank" && bankAccountData.length === 0) ||
              (viewMode === "traditional" && cashFlowData.length === 0)) && (
              <div className="bg-white rounded-lg shadow-sm p-8 text-center">
                <p className="text-gray-500">No cash flow data found for the selected period and filters.</p>
                <p className="text-xs text-gray-400 mt-2">Only transactions with entry_bank_account are shown.</p>
              </div>
            )}
        </div>
      </main>

      {/* Transaction Detail Modal */}
      {showTransactionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-200 flex-shrink-0">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{modalTitle}</h3>
                  <p className="text-sm text-gray-600">{transactionDetails.length} cash flow transactions</p>
                </div>
                <button onClick={() => setShowTransactionModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Transaction Totals */}
              {transactionDetails.length > 0 && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg text-center">
                  <div className="text-sm text-gray-600">Cash Flow Impact</div>
                  <div
                    className={`text-xl font-bold ${
                      transactionDetails.reduce((sum, t) => sum + t.impact, 0) >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {formatCurrency(transactionDetails.reduce((sum, t) => sum + t.impact, 0))}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">{transactionDetails.length} transactions</div>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-auto p-6 pb-16">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Payee/Customer
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Memo
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Class
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                  {transactionDetails.map((transaction, index) => (
                      <tr
                        key={`${transaction.entryNumber}-${index}`}
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => openJournalEntry(transaction.entryNumber)}
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(transaction.date)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {transaction.name ||
                            transaction.vendor ||
                            transaction.customer ||
                            "N/A"}
                        </td>
                        <td
                          className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate"
                          title={transaction.memo || ""}
                        >
                          {transaction.memo || "-"}
                        </td>
                        <td
                          className={`px-6 py-4 whitespace-nowrap text-sm text-right font-medium ${
                            transaction.impact >= 0 ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {formatCurrency(transaction.impact)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          {transaction.class && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              {transaction.class}
                            </span>
                          )}
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
      {showJournalModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center flex-shrink-0">
              <h3 className="text-lg font-semibold text-gray-900">{journalTitle}</h3>
              <button
                onClick={() => setShowJournalModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Account
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Memo
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Class
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Debit
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Credit
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {journalEntryLines.map((line, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(line.date)}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-900">{line.account}</td>
                      <td className="px-4 py-2 text-sm text-gray-500">{line.memo || ""}</td>
                      <td className="px-4 py-2 text-sm text-gray-500">{line.class || ""}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-red-600">
                        {formatCurrency(Number.parseFloat(line.debit?.toString() || "0"))}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-green-600">
                        {formatCurrency(Number.parseFloat(line.credit?.toString() || "0"))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
