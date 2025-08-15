"use client"

import React, { useState, useEffect } from "react"
import { RefreshCw, X } from "lucide-react"
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

// Balance Sheet Data Structures
interface BalanceSheetAccount {
  account: string
  accountType: string
  balance: number
  beginningBalance: number
  periodActivity: number
  transactions: TransactionDetail[]
}

interface TransactionDetail {
  date: string
  payeeCustomer: string | null
  memo: string | null
  class: string | null
  amount: number
  // Keep some additional fields for reference
  account: string
  debit: number
  credit: number
  impact: number
  entryNumber?: string
  accountType?: string
}

interface JournalEntryLine {
  date: string
  account: string
  memo: string | null
  class: string | null
  debit: string | number | null
  credit: string | number | null
}

interface BalanceSheetSection {
  title: string
  accounts: BalanceSheetAccount[]
  total: number
}

interface AccountTypeGroup {
  accountType: string
  accounts: BalanceSheetAccount[]
  total: number
}

type TimePeriod = "Monthly" | "Quarterly" | "YTD" | "Trailing 12" | "Custom"

// Generate months and years lists
const monthsList = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

const yearsList = Array.from({ length: 10 }, (_, i) => (new Date().getFullYear() - 5 + i).toString())

// Account type ordering for balance sheet display
const assetTypeOrder = ["Bank", "Accounts receivable (A/R)", "Other Current Assets", "Fixed Assets", "Other Assets"]
const liabilityTypeOrder = ["Accounts payable (A/P)", "Credit Card", "Other Current Liabilities", "Long Term Liabilities"]

export default function BalanceSheetPage() {
  // State variables
  const [selectedMonth, setSelectedMonth] = useState<string>("December")
  const [selectedYear, setSelectedYear] = useState<string>("2023")
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("Monthly")
  const [selectedProperty, setSelectedProperty] = useState("All Properties")
  const [customStartDate, setCustomStartDate] = useState("")
  const [customEndDate, setCustomEndDate] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  // Balance sheet data
  const [assets, setAssets] = useState<BalanceSheetSection>({ title: "Assets", accounts: [], total: 0 })
  const [liabilities, setLiabilities] = useState<BalanceSheetSection>({ title: "Liabilities", accounts: [], total: 0 })
  const [equity, setEquity] = useState<BalanceSheetSection>({ title: "Equity", accounts: [], total: 0 })

  // Common state
  const [availableProperties, setAvailableProperties] = useState<string[]>(["All Properties"])
  const [error, setError] = useState<string | null>(null)
  const [showTransactionModal, setShowTransactionModal] = useState(false)
  const [transactionDetails, setTransactionDetails] = useState<TransactionDetail[]>([])
  const [modalTitle, setModalTitle] = useState("")
  const [asOfDate, setAsOfDate] = useState<string>("")
  const [journalEntryLines, setJournalEntryLines] = useState<JournalEntryLine[]>([])
  const [showJournalModal, setShowJournalModal] = useState(false)
  const [journalTitle, setJournalTitle] = useState("")

  // Utility functions
  const parseDate = (dateString: string | null): string => {
    if (!dateString) return "N/A"
    try {
      return dateString.split("T")[0]
    } catch {
      return "N/A"
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value || 0)
  }

  const formatDate = (dateString: string) => {
    const { year, month, day } = getDateParts(dateString)
    const date = new Date(year, month - 1, day)
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }

  const getDateParts = (dateString: string) => {
    const datePart = dateString.split("T")[0]
    const [year, month, day] = datePart.split("-").map(Number)
    return { year, month, day }
  }

  const smartLog = (message: string, data?: any) => {
    if (data && typeof data === "object" && data.length !== undefined) {
      console.log(`${message}: ${data.length} items`, data.slice(0, 3))
    } else {
      console.log(message, data)
    }
  }

  // Helper function to parse parent/sub-account relationships
  const parseAccountHierarchy = (accountName: string) => {
    if (accountName.includes(':')) {
      const parts = accountName.split(':')
      return {
        fullName: accountName,
        parentAccount: parts[0].trim(),
        subAccount: parts[1].trim(),
        isSubAccount: true,
        displayName: `    ${parts[1].trim()}`, // Indented display name
        sortKey: `${parts[0].trim()}_${parts[1].trim()}`, // For sorting sub-accounts under parents
      }
    }
    return {
      fullName: accountName,
      parentAccount: accountName,
      subAccount: null,
      isSubAccount: false,
      displayName: accountName,
      sortKey: accountName,
    }
  }

  // Enhanced sorting function that groups sub-accounts under parents and follows account type order
  const sortAccountsWithHierarchy = (accounts: BalanceSheetAccount[], typeOrder: string[]) => {
    // First, parse all account hierarchies
    const accountsWithHierarchy = accounts.map(account => ({
      ...account,
      hierarchy: parseAccountHierarchy(account.account)
    }))

    // Sort by account type first (following the specified order), then by hierarchy
    return accountsWithHierarchy.sort((a, b) => {
      // First, sort by account type order
      const aTypeIndex = typeOrder.indexOf(a.accountType)
      const bTypeIndex = typeOrder.indexOf(b.accountType)
      
      const aTypeOrder = aTypeIndex === -1 ? 999 : aTypeIndex
      const bTypeOrder = bTypeIndex === -1 ? 999 : bTypeIndex
      
      if (aTypeOrder !== bTypeOrder) {
        return aTypeOrder - bTypeOrder
      }

      // Within same account type, sort by parent account name
      const parentCompare = a.hierarchy.parentAccount.localeCompare(b.hierarchy.parentAccount)
      if (parentCompare !== 0) return parentCompare

      // If same parent, sort sub-accounts under parent
      if (a.hierarchy.isSubAccount && !b.hierarchy.isSubAccount) return 1  // Sub-account after parent
      if (!a.hierarchy.isSubAccount && b.hierarchy.isSubAccount) return -1 // Parent before sub-account
      
      // If both are sub-accounts of same parent, sort alphabetically
      if (a.hierarchy.isSubAccount && b.hierarchy.isSubAccount) {
        return (a.hierarchy.subAccount || '').localeCompare(b.hierarchy.subAccount || '')
      }

      // Both are parents of same type, sort by balance (largest first)
      return Math.abs(b.balance) - Math.abs(a.balance)
    })
  }

  // Group accounts by account type for subtotals
  const groupAccountsByType = (accounts: BalanceSheetAccount[], typeOrder: string[]): AccountTypeGroup[] => {
    const groups = new Map<string, BalanceSheetAccount[]>()
    
    // Group accounts by type
    accounts.forEach(account => {
      if (!groups.has(account.accountType)) {
        groups.set(account.accountType, [])
      }
      groups.get(account.accountType)!.push(account)
    })

    // Convert to ordered array with totals
    const orderedGroups: AccountTypeGroup[] = []
    typeOrder.forEach(accountType => {
      if (groups.has(accountType)) {
        const typeAccounts = groups.get(accountType)!
        const total = typeAccounts.reduce((sum, acc) => sum + acc.balance, 0)
        orderedGroups.push({
          accountType,
          accounts: typeAccounts,
          total
        })
      }
    })

    // Add any remaining account types not in the predefined order
    groups.forEach((typeAccounts, accountType) => {
      if (!typeOrder.includes(accountType)) {
        const total = typeAccounts.reduce((sum, acc) => sum + acc.balance, 0)
        orderedGroups.push({
          accountType,
          accounts: typeAccounts,
          total
        })
      }
    })

    return orderedGroups
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
      startDate = `${now.getFullYear()}-01-01`
      endDate = now.toISOString().split("T")[0]
    } else if (timePeriod === "Monthly") {
      const monthIndex = monthsList.indexOf(selectedMonth)
      const year = Number.parseInt(selectedYear)
      const lastDay = new Date(year, monthIndex + 1, 0).getDate()
      startDate = `${year}-01-01`
      endDate = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
    } else if (timePeriod === "Quarterly") {
      const monthIndex = monthsList.indexOf(selectedMonth)
      const year = Number.parseInt(selectedYear)
      const quarter = Math.floor(monthIndex / 3)
      const quarterEndMonth = quarter * 3 + 2
      const lastDay = new Date(year, quarterEndMonth + 1, 0).getDate()
      startDate = `${year}-01-01`
      endDate = `${year}-${String(quarterEndMonth + 1).padStart(2, "0")}-${lastDay}`
    } else {
      // Trailing 12
      const twelveMonthsAgo = new Date(now)
      twelveMonthsAgo.setMonth(now.getMonth() - 12)
      startDate = twelveMonthsAgo.toISOString().split("T")[0]
      endDate = now.toISOString().split("T")[0]
    }

    return { startDate, endDate }
  }

  // Calculate period start for activity calculation
  const calculatePeriodStart = () => {
    const now = new Date()

    if (timePeriod === "Custom") {
      return customStartDate || "2024-01-01"
    } else if (timePeriod === "YTD") {
      return `${now.getFullYear()}-01-01`
    } else if (timePeriod === "Monthly") {
      const monthIndex = monthsList.indexOf(selectedMonth)
      const year = Number.parseInt(selectedYear)
      return `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`
    } else if (timePeriod === "Quarterly") {
      const monthIndex = monthsList.indexOf(selectedMonth)
      const year = Number.parseInt(selectedYear)
      const quarter = Math.floor(monthIndex / 3)
      const quarterStartMonth = quarter * 3
      return `${year}-${String(quarterStartMonth + 1).padStart(2, "0")}-01`
    } else {
      // Trailing 12
      const twelveMonthsAgo = new Date(now)
      twelveMonthsAgo.setMonth(now.getMonth() - 12)
      return twelveMonthsAgo.toISOString().split("T")[0]
    }
  }

  // Helper function to apply manual beginning balances
  const applyManualBeginningBalances = async (accountMap: Map<string, any>, endDate: string) => {
    // Apply beginning balances from database
    try {
      let manualBalanceQuery = supabase
        .from("balance_sheet_balances")
        .select("balance_amount, balance_date, property_class, balance_sheet_accounts!inner(account_name)")
        .lte("balance_date", endDate)
        .order("balance_date", { ascending: false })

      if (selectedProperty !== "All Properties") {
        manualBalanceQuery = manualBalanceQuery.eq("property_class", selectedProperty)
      }

      const { data: storedBeginningBalances, error: storedBeginningBalancesError } =
        await manualBalanceQuery

      if (storedBeginningBalancesError) {
        smartLog("❌ Error fetching stored beginning balances", storedBeginningBalancesError)
      } else if (storedBeginningBalances) {
        const latestBalancesByAccount = new Map<string, any>()
        
        storedBeginningBalances.forEach((row: any) => {
          const accountName = row.balance_sheet_accounts?.account_name
          if (accountName) {
            const currentDate = parseDate(row.balance_date)
            if (!latestBalancesByAccount.has(accountName) || 
                currentDate > parseDate(latestBalancesByAccount.get(accountName).balance_date)) {
              latestBalancesByAccount.set(accountName, row)
            }
          }
        })

        latestBalancesByAccount.forEach((row: any) => {
          const accountName = row.balance_sheet_accounts?.account_name
          const savedDate = parseDate(row.balance_date)
          const storedBalance = Number.parseFloat(row.balance_amount) || 0

          if (!accountName || savedDate === "N/A") return

          let acc = accountMap.get(accountName)
          if (!acc) {
            acc = {
              account: accountName,
              accountType: "Other Current Assets",
              allTransactions: [],
              manualBalanceApplied: false,
            }
            accountMap.set(accountName, acc)
          }

          const beginningEntry = {
            date: savedDate,
            account: accountName,
            memo: "Manual Beginning Balance (Database)",
            debit: storedBalance > 0 ? storedBalance : 0,
            credit: storedBalance < 0 ? -storedBalance : 0,
            impact: storedBalance,
            entry_number: "MANUAL-DB",
          }

          acc.allTransactions.push(beginningEntry)
          acc.manualBalanceApplied = true
        })
      }
    } catch (err) {
      smartLog("❌ Error applying database beginning balances", err)
    }

    // Apply beginning balances from localStorage
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("beginningBalances")
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as {
            date: string
            balances: {
              account: string
              balance: number
              accountType?: string
            }[]
          }
          const savedDate = parseDate(parsed.date)
          
          if (savedDate !== "N/A" && savedDate <= endDate) {
            parsed.balances.forEach((b) => {
              let acc = accountMap.get(b.account)
              if (!acc) {
                const lower = b.account.toLowerCase()
                let inferredType = b.accountType || "Other Current Assets"
                if (
                  !b.accountType &&
                  (lower.includes("cash") ||
                    lower.includes("bank") ||
                    lower.includes("checking") ||
                    lower.includes("savings"))
                ) {
                  inferredType = "Bank"
                }
                acc = {
                  account: b.account,
                  accountType: inferredType,
                  allTransactions: [],
                  manualBalanceApplied: false,
                }
                accountMap.set(b.account, acc)
              }

              if (!acc.manualBalanceApplied) {
                const beginningEntry = {
                  date: savedDate,
                  account: b.account,
                  memo: "Manual Beginning Balance (Local)",
                  debit: b.balance > 0 ? b.balance : 0,
                  credit: b.balance < 0 ? -b.balance : 0,
                  impact: b.balance,
                  entry_number: "MANUAL-LOCAL",
                }

                acc.allTransactions.push(beginningEntry)
              }
            })
          }
        } catch (e) {
          smartLog("❌ Error parsing local beginning balances", e)
        }
      }
    }
  }

  // Fetch available properties
  const fetchFilters = async () => {
    try {
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
    } catch (err) {
      console.error("Error fetching filters:", err)
    }
  }

  const loadData = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const { endDate } = calculateDateRange()
      const periodStart = calculatePeriodStart()

      setAsOfDate(endDate)

      smartLog(`🔍 BALANCE SHEET DATA LOAD`)
      smartLog(`📅 As Of Date: ${endDate}`)
      smartLog(`📊 Period Activity From: ${periodStart}`)
      smartLog(`🏢 Property Filter: "${selectedProperty}"`)

      // SINGLE QUERY: Get ALL balance sheet transactions up to as-of date
      let query = supabase
        .from("journal_entry_lines")
        .select(
          "entry_number, class, date, account, account_type, debit, credit, memo, customer, vendor, name",
        )
        .lte("date", endDate)
        .order("date", { ascending: true })

      if (selectedProperty !== "All Properties") {
        query = query.eq("class", selectedProperty)
      }

      const { data: allTransactions, error } = await query

      if (error) throw error

      smartLog(`📊 Found ${allTransactions.length} total balance sheet transactions`)

      // Initialize account map
      const accountMap = new Map<string, any>()

      // First, apply manual beginning balances
      await applyManualBeginningBalances(accountMap, endDate)

      // Process ALL transactions and store them by account
      allTransactions.forEach((transaction: any) => {
        const account = transaction.account
        const accountType = transaction.account_type || "Unknown"

        if (!accountMap.has(account)) {
          accountMap.set(account, {
            account,
            accountType,
            allTransactions: [],
            manualBalanceApplied: false,
          })
        }

        const accountData = accountMap.get(account)!

        // Calculate transaction impact using EXACT QuickBooks account types
        const debit = Number.parseFloat(transaction.debit) || 0
        const credit = Number.parseFloat(transaction.credit) || 0
        let transactionImpact = 0

        // ASSETS: DEBIT - CREDIT (Debit increases, Credit decreases)
        if (
          accountType === "Bank" ||
          accountType === "Accounts receivable (A/R)" ||
          accountType === "Other Current Assets" ||
          accountType === "Fixed Assets" ||
          accountType === "Other Assets"
        ) {
          transactionImpact = debit - credit
        } 
        // LIABILITIES AND EQUITY: CREDIT - DEBIT (Credit increases, Debit decreases)
        else if (
          accountType === "Accounts payable (A/P)" ||
          accountType === "Credit Card" ||
          accountType === "Other Current Liabilities" ||
          accountType === "Long Term Liabilities" ||
          accountType === "Equity"
        ) {
          transactionImpact = credit - debit
        } 
        // P&L ACCOUNTS: Track but don't show on balance sheet directly
        else if (
          accountType === "Income" ||
          accountType === "Other Income"
        ) {
          transactionImpact = credit - debit // Income increases with credits
        }
        else if (
          accountType === "Cost of Goods Sold" ||
          accountType === "Expenses" ||
          accountType === "Other Expense"
        ) {
          transactionImpact = debit - credit // Expenses increase with debits
        }
        // DEFAULT: If unknown account type, log it and treat as asset
        else {
          transactionImpact = debit - credit
          console.log(`⚠️ UNKNOWN ACCOUNT TYPE IN CALC: ${account} (${accountType}) - Using debit - credit = ${transactionImpact}`)
        }

        // Store ALL transactions
        accountData.allTransactions.push({
          ...transaction,
          impact: transactionImpact,
        })
      })

      // Sort all transactions by date for each account
      accountMap.forEach((accountData) => {
        accountData.allTransactions.sort((a, b) =>
          parseDate(a.date).localeCompare(parseDate(b.date))
        )
      })

      // CLASSIFICATION: Calculate balances by classifying the transactions
      accountMap.forEach((accountData) => {
        let beginningBalance = 0
        let periodActivity = 0
        let endingBalance = 0

        // Classify each transaction and calculate running balances
        accountData.allTransactions.forEach((tx: any) => {
          const transactionDate = parseDate(tx.date)
          
          // Add to ending balance (all transactions)
          endingBalance += tx.impact
          
          // Classify: before period = beginning, during period = activity
          if (transactionDate !== "N/A" && transactionDate < periodStart) {
            beginningBalance += tx.impact
          } else if (transactionDate !== "N/A" && transactionDate >= periodStart) {
            periodActivity += tx.impact
          }
        })

        // Store classifications
        accountData.beginningBalance = beginningBalance
        accountData.periodActivity = periodActivity
        accountData.endingBalance = endingBalance
      })

      // Calculate P&L totals for Net Income calculation BEFORE categorization
      let totalIncome = 0 // Renamed from totalRevenue for clarity
      let totalOtherIncome = 0
      let totalExpenses = 0
      let totalOtherExpenses = 0

      console.log(`💰 CALCULATING P&L TOTALS FOR NET INCOME`)

      accountMap.forEach((accountData) => {
        const accountType = accountData.accountType
        const endingBalance = accountData.endingBalance

        // INCOME ACCOUNTS: Already calculated as Credit - Debit, so positive balance = income
        if (accountType === "Income") {
          totalIncome += endingBalance // endingBalance is already Credit - Debit
          console.log(`📈 INCOME: ${accountData.account} = ${formatCurrency(endingBalance)}`)
        }
        else if (accountType === "Other Income") {
          totalOtherIncome += endingBalance // endingBalance is already Credit - Debit
          console.log(`📈 OTHER INCOME: ${accountData.account} = ${formatCurrency(endingBalance)}`)
        }
        // EXPENSE ACCOUNTS: Already calculated as Debit - Credit, so positive balance = expense
        else if (accountType === "Cost of Goods Sold") {
          // For expenses: positive endingBalance = expense amount to subtract from income
          totalExpenses += endingBalance > 0 ? endingBalance : 0
          console.log(`📉 COGS: ${accountData.account} = ${formatCurrency(endingBalance > 0 ? endingBalance : 0)}`)
        }
        else if (accountType === "Expenses") {
          // For expenses: positive endingBalance = expense amount to subtract from income
          totalExpenses += endingBalance > 0 ? endingBalance : 0
          console.log(`📉 EXPENSES: ${accountData.account} = ${formatCurrency(endingBalance > 0 ? endingBalance : 0)}`)
        }
        else if (accountType === "Other Expense") {
          // For expenses: positive endingBalance = expense amount to subtract from income
          totalOtherExpenses += endingBalance > 0 ? endingBalance : 0
          console.log(`📉 OTHER EXPENSE: ${accountData.account} = ${formatCurrency(endingBalance > 0 ? endingBalance : 0)}`)
        }
      })

      console.log(`💰 P&L TOTALS SUMMARY:`)
      console.log(`   Total Income: ${formatCurrency(totalIncome)}`)
      console.log(`   Total Other Income: ${formatCurrency(totalOtherIncome)}`)
      console.log(`   Total Expenses: ${formatCurrency(totalExpenses)}`)
      console.log(`   Total Other Expenses: ${formatCurrency(totalOtherExpenses)}`)

      // Now calculate Net Income
      const netIncome = totalIncome + totalOtherIncome - totalExpenses - totalOtherExpenses

      console.log(`💰 NET INCOME CALCULATION:`)
      console.log(`   Income: ${formatCurrency(totalIncome)}`)
      console.log(`   Other Income: ${formatCurrency(totalOtherIncome)}`)
      console.log(`   Expenses: ${formatCurrency(totalExpenses)}`)
      console.log(`   Other Expenses: ${formatCurrency(totalOtherExpenses)}`)
      console.log(`   Net Income: ${formatCurrency(netIncome)}`)

      smartLog(`✅ Processed ${accountMap.size} accounts with transaction classifications`)

      // Categorize accounts using EXACT QuickBooks account types
      const assetAccounts: BalanceSheetAccount[] = []
      const liabilityAccounts: BalanceSheetAccount[] = []
      const equityAccounts: BalanceSheetAccount[] = []

      accountMap.forEach((accountData) => {
        const accountType = accountData.accountType
        
        // Only include accounts with non-zero balances or activity
        if (Math.abs(accountData.endingBalance) > 0.01 || Math.abs(accountData.periodActivity) > 0.01) {
          const balanceSheetAccount: BalanceSheetAccount = {
            account: accountData.account,
            accountType: accountData.accountType,
            balance: accountData.endingBalance,
            beginningBalance: accountData.beginningBalance,
            periodActivity: accountData.periodActivity,
            transactions: accountData.allTransactions,
          }

          // ASSETS
          if (
            accountType === "Bank" ||
            accountType === "Accounts receivable (A/R)" ||
            accountType === "Other Current Assets" ||
            accountType === "Fixed Assets" ||
            accountType === "Other Assets"
          ) {
            assetAccounts.push(balanceSheetAccount)
          } 
          // LIABILITIES
          else if (
            accountType === "Accounts payable (A/P)" ||
            accountType === "Credit Card" ||
            accountType === "Other Current Liabilities" ||
            accountType === "Long Term Liabilities"
          ) {
            liabilityAccounts.push(balanceSheetAccount)
          } 
          // EQUITY
          else if (accountType === "Equity") {
            equityAccounts.push(balanceSheetAccount)
          } 
          // P&L ACCOUNTS: Don't show on balance sheet, but note them
          else if (
            accountType === "Income" ||
            accountType === "Cost of Goods Sold" ||
            accountType === "Expenses" ||
            accountType === "Other Income" ||
            accountType === "Other Expense"
          ) {
            console.log(`📊 P&L ACCOUNT (not shown): ${accountData.account} (${accountType}) - Balance: ${formatCurrency(accountData.endingBalance)}`)
          }
        }
      })

      // Add Net Income to Equity if significant
      if (Math.abs(netIncome) > 0.01) {
        const netIncomeAccount: BalanceSheetAccount = {
          account: timePeriod === "YTD" ? "Net Income (Year to Date)" :
                   timePeriod === "Monthly" ? `Net Income (${selectedMonth} ${selectedYear})` :
                   `Net Income (${timePeriod})`,
          accountType: "Equity",
          balance: netIncome,
          beginningBalance: 0, // Net income starts at 0 each period
          periodActivity: netIncome, // All of net income is period activity
          transactions: [{
            date: endDate,
            payeeCustomer: "System Calculated",
            memo: "Calculated Net Income from P&L accounts",
            class: "All Properties",
            amount: netIncome,
            account: "Net Income",
            debit: netIncome > 0 ? 0 : Math.abs(netIncome),
            credit: netIncome > 0 ? netIncome : 0,
            impact: netIncome,
            entryNumber: "AUTO-NET-INCOME",
            accountType: "Equity"
          }]
        }

        equityAccounts.push(netIncomeAccount)
      }

      // Sort accounts with proper hierarchy
      const sortedAssets = sortAccountsWithHierarchy(assetAccounts, assetTypeOrder)
      const sortedLiabilities = sortAccountsWithHierarchy(liabilityAccounts, liabilityTypeOrder)
      const sortedEquity = sortAccountsWithHierarchy(equityAccounts, ["Equity"])

      // Calculate totals
      const assetTotal = sortedAssets.reduce((sum, acc) => sum + acc.balance, 0)
      const liabilityTotal = sortedLiabilities.reduce((sum, acc) => sum + acc.balance, 0)
      const equityTotal = sortedEquity.reduce((sum, acc) => sum + acc.balance, 0)

      setAssets({ title: "Assets", accounts: sortedAssets, total: assetTotal })
      setLiabilities({ title: "Liabilities", accounts: sortedLiabilities, total: liabilityTotal })
      setEquity({ title: "Equity", accounts: sortedEquity, total: equityTotal })

      smartLog(`✅ Balance Sheet Summary:`)
      smartLog(`   Assets: ${sortedAssets.length} accounts, Total: ${formatCurrency(assetTotal)}`)
      smartLog(`   Liabilities: ${sortedLiabilities.length} accounts, Total: ${formatCurrency(liabilityTotal)}`)
      smartLog(`   Equity: ${sortedEquity.length} accounts, Total: ${formatCurrency(equityTotal)}`)
      smartLog(`   Balance Check: ${formatCurrency(assetTotal - liabilityTotal - equityTotal)}`)
      
    } catch (err) {
      smartLog("❌ Data load failed", err)
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setIsLoading(false)
    }
  };

  // Show transaction details modal with different filter types
  const showTransactionDetails = (
    account: BalanceSheetAccount, 
    filterType: 'all' | 'beginning' | 'period' | 'ending' = 'all'
  ) => {
    let filteredTransactions: any[] = []
    let title = ""

    switch (filterType) {
      case 'beginning':
        // Show transactions that contribute to beginning balance (before period start)
        filteredTransactions = account.transactions.filter((tx: any) => {
          const txDate = parseDate(tx.date)
          return txDate !== "N/A" && txDate < calculatePeriodStart()
        })
        title = `${account.account} - Beginning Balance Transactions`
        break
      
      case 'period':
        // Show transactions within the current period
        filteredTransactions = account.transactions.filter((tx: any) => {
          const txDate = parseDate(tx.date)
          const periodStart = calculatePeriodStart()
          return txDate !== "N/A" && txDate >= periodStart
        })
        title = `${account.account} - Period Activity Transactions`
        break
      
      case 'ending':
        // Show all transactions up to as-of date
        filteredTransactions = account.transactions
        title = `${account.account} - All Transactions (Ending Balance)`
        break
      
      default:
        filteredTransactions = account.transactions
        title = `${account.account} - All Transaction Details`
        break
    }

    setModalTitle(title)

    const transactionDetails: TransactionDetail[] = filteredTransactions.map((tx: any) => {
      // Determine Payee/Customer - prioritize customer, then vendor, then name
      const payeeCustomer = tx.customer || tx.vendor || tx.name || "N/A"
      
      // Calculate amount (positive for increases to the account, negative for decreases)
      const amount = tx.impact || 0

      return {
        date: tx.date,
        payeeCustomer,
        memo: tx.memo,
        class: tx.class,
        amount,
        account: tx.account,
        debit: Number.parseFloat(tx.debit) || 0,
        credit: Number.parseFloat(tx.credit) || 0,
        impact: tx.impact,
        entryNumber: tx.entry_number,
        accountType: tx.account_type,
      }
    })

    setTransactionDetails(transactionDetails)
    setShowTransactionModal(true)
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

  // Render enhanced balance sheet section with account type subtotals
  const renderBalanceSheetSection = (
    section: BalanceSheetSection,
    colorTheme: 'green' | 'red' | 'blue',
    typeOrder: string[],
    showSubtotals: boolean = true
  ) => {
    const groups = groupAccountsByType(section.accounts, typeOrder)
    
    const colorClasses = {
      green: {
        header: 'bg-green-50 text-green-800',
        subtotal: 'bg-green-100 text-green-800',
        total: 'text-green-700',
        dot: 'bg-green-500'
      },
      red: {
        header: 'bg-red-50 text-red-800',
        subtotal: 'bg-red-100 text-red-800',
        total: 'text-red-700',
        dot: 'bg-red-500'
      },
      blue: {
        header: 'bg-blue-50 text-blue-800',
        subtotal: 'bg-blue-100 text-blue-800',
        total: 'text-blue-700',
        dot: 'bg-blue-500'
      }
    }

    const colors = colorClasses[colorTheme]

    return (
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className={`p-4 sm:p-6 border-b border-gray-200 ${colors.header}`}>
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold flex items-center">
              <span className={`w-4 h-4 ${colors.dot} rounded-full mr-3`}></span>
              {section.title}
            </h3>
            <span className={`text-xl font-bold ${colors.total}`}>
              {formatCurrency(section.title === 'Liabilities' ? Math.abs(section.total) : section.total)}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Account
                </th>
                <th className="hidden sm:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-3 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Beginning
                </th>
                <th className="px-3 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Activity
                </th>
                <th className="px-3 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ending Balance
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {groups.map((group, groupIndex) => (
                <React.Fragment key={group.accountType}>
                  {/* Individual accounts in this type */}
                  {group.accounts.map((account) => {
                    const hierarchy = parseAccountHierarchy(account.account)
                    return (
                      <tr key={account.account} className="hover:bg-gray-50">
                        <td className="px-3 sm:px-6 py-4 text-sm font-medium text-gray-900">
                          <button
                            onClick={() => showTransactionDetails(account)}
                            className="text-left hover:text-blue-600 hover:underline"
                          >
                            <div className={`truncate max-w-[150px] sm:max-w-none ${hierarchy.isSubAccount ? 'text-gray-700 text-sm' : ''}`} title={account.account}>
                              {hierarchy.isSubAccount ? hierarchy.displayName : hierarchy.parentAccount}
                            </div>
                            <div className="sm:hidden text-xs text-gray-500 mt-1">{account.accountType}</div>
                          </button>
                        </td>
                        <td className="hidden sm:table-cell px-6 py-4 text-sm text-gray-500">{account.accountType}</td>
                        <td className="px-3 sm:px-6 py-4 text-sm text-right">
                          <button
                            onClick={() => showTransactionDetails(account, 'beginning')}
                            className={`hover:underline ${section.title === 'Liabilities' 
                              ? (account.beginningBalance <= 0 ? "text-red-600" : "text-green-600")
                              : (account.beginningBalance >= 0 ? "text-green-600" : "text-red-600")
                            } ${
                              account.beginningBalance !== 0 ? "hover:bg-green-50" : "cursor-default"
                            } px-2 py-1 rounded transition-colors`}
                            disabled={account.beginningBalance === 0}
                          >
                            {formatCurrency(section.title === 'Liabilities' ? Math.abs(account.beginningBalance) : account.beginningBalance)}
                          </button>
                        </td>
                        <td className="px-3 sm:px-6 py-4 text-sm text-right">
                          <button
                            onClick={() => showTransactionDetails(account, 'period')}
                            className={`hover:underline ${section.title === 'Liabilities'
                              ? (account.periodActivity <= 0 ? "text-red-600" : "text-green-600")
                              : (account.periodActivity >= 0 ? "text-green-600" : "text-red-600")
                            } ${
                              account.periodActivity !== 0 ? "hover:bg-blue-50" : "cursor-default"
                            } px-2 py-1 rounded transition-colors`}
                            disabled={account.periodActivity === 0}
                          >
                            {account.periodActivity !== 0 
                              ? formatCurrency(section.title === 'Liabilities' ? Math.abs(account.periodActivity) : account.periodActivity) 
                              : "-"}
                          </button>
                        </td>
                        <td className="px-3 sm:px-6 py-4 text-sm text-right">
                          <button
                            onClick={() => showTransactionDetails(account, 'ending')}
                            className={`font-bold hover:underline ${section.title === 'Liabilities'
                              ? (account.balance <= 0 ? "text-red-600" : "text-green-600")
                              : (account.balance >= 0 ? "text-green-600" : "text-red-600")
                            } hover:bg-gray-50 px-2 py-1 rounded transition-colors`}
                          >
                            {formatCurrency(section.title === 'Liabilities' ? Math.abs(account.balance) : account.balance)}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                  
                  {/* Subtotal for this account type - but not for Equity as requested */}
                  {showSubtotals && section.title !== 'Equity' && group.accounts.length > 1 && (
                    <tr className={`${colors.subtotal} border-t border-gray-200`}>
                      <td className="px-3 sm:px-6 py-2 text-sm font-semibold">
                        Total {group.accountType}
                      </td>
                      <td className="hidden sm:table-cell px-6 py-2"></td>
                      <td className="px-3 sm:px-6 py-2 text-sm font-semibold text-right">
                        {formatCurrency(section.title === 'Liabilities' 
                          ? Math.abs(group.accounts.reduce((sum, acc) => sum + acc.beginningBalance, 0))
                          : group.accounts.reduce((sum, acc) => sum + acc.beginningBalance, 0))}
                      </td>
                      <td className="px-3 sm:px-6 py-2 text-sm font-semibold text-right">
                        {formatCurrency(section.title === 'Liabilities'
                          ? Math.abs(group.accounts.reduce((sum, acc) => sum + acc.periodActivity, 0))
                          : group.accounts.reduce((sum, acc) => sum + acc.periodActivity, 0))}
                      </td>
                      <td className="px-3 sm:px-6 py-2 text-sm font-semibold text-right">
                        {formatCurrency(section.title === 'Liabilities' ? Math.abs(group.total) : group.total)}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // Load data on component mount and when filters change
  useEffect(() => {
    fetchFilters()
  }, [])

  useEffect(() => {
    loadData()
  }, [timePeriod, selectedMonth, selectedYear, customStartDate, customEndDate, selectedProperty])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Balance Sheet</h1>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                As of{" "}
                {asOfDate
                  ? formatDate(asOfDate)
                  : timePeriod === "Monthly"
                    ? `${selectedMonth} ${selectedYear}`
                    : timePeriod === "Quarterly"
                      ? `Q${Math.floor(monthsList.indexOf(selectedMonth) / 3) + 1} ${selectedYear}`
                      : `${timePeriod} Period`}
              </p>
              <p className="text-xs text-blue-600 mt-1">
                💰 Enhanced with account type subtotals and corrected balance calculations
              </p>
            </div>

            <button
              onClick={loadData}
              disabled={isLoading}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex gap-3 overflow-x-auto pb-2 sm:pb-0 sm:flex-wrap sm:items-center scrollbar-hide">
            <select
              value={timePeriod}
              onChange={(e) => setTimePeriod(e.target.value as TimePeriod)}
              className="flex-shrink-0 px-3 sm:px-4 py-2 border border-gray-300 rounded-lg bg-white text-xs sm:text-sm hover:border-blue-500 focus:outline-none focus:ring-2 transition-all"
            >
              <option value="Monthly">Monthly</option>
              <option value="Quarterly">Quarterly</option>
              <option value="YTD">Year to Date</option>
              <option value="Trailing 12">Trailing 12 Months</option>
              <option value="Custom">Custom Date Range</option>
            </select>

            {(timePeriod === "Monthly" || timePeriod === "Quarterly") && (
              <>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="flex-shrink-0 px-3 sm:px-4 py-2 border border-gray-300 rounded-lg bg-white text-xs sm:text-sm hover:border-blue-500 focus:outline-none focus:ring-2 transition-all"
                >
                  {monthsList.map((month) => (
                    <option key={month} value={month}>
                      {month}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="flex-shrink-0 px-3 sm:px-4 py-2 border border-gray-300 rounded-lg bg-white text-xs sm:text-sm hover:border-blue-500 focus:outline-none focus:ring-2 transition-all"
                >
                  {yearsList.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </>
            )}

            {timePeriod === "Custom" && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="px-3 sm:px-4 py-2 border border-gray-300 rounded-lg bg-white text-xs sm:text-sm hover:border-blue-500 focus:outline-none focus:ring-2 transition-all"
                />
                <span className="text-gray-500 text-xs">to</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="px-3 sm:px-4 py-2 border border-gray-300 rounded-lg bg-white text-xs sm:text-sm hover:border-blue-500 focus:outline-none focus:ring-2 transition-all"
                />
              </div>
            )}

            <select
              value={selectedProperty}
              onChange={(e) => setSelectedProperty(e.target.value)}
              className="flex-shrink-0 px-3 sm:px-4 py-2 border border-gray-300 rounded-lg bg-white text-xs sm:text-sm hover:border-blue-500 focus:outline-none focus:ring-2 transition-all"
            >
              {availableProperties.map((property) => (
                <option key={property} value={property}>
                  {property}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
        <div className="space-y-6 sm:space-y-8">
          {/* Error State */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 sm:p-4">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin mr-2" />
              <span className="text-sm sm:text-base">Loading balance sheet data...</span>
            </div>
          )}

          {/* Summary Cards */}
          {!isLoading &&
            (assets.accounts.length > 0 || liabilities.accounts.length > 0 || equity.accounts.length > 0) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6 border border-gray-200">
                  <div className="text-center">
                    <div className="text-xs sm:text-sm text-gray-600">Total Assets</div>
                    <div
                      className={`text-lg sm:text-xl font-bold ${assets.total >= 0 ? "text-green-600" : "text-red-600"}`}
                    >
                      {formatCurrency(assets.total)}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{assets.accounts.length} accounts</div>
                  </div>
                </div>
                <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6 border border-gray-200">
                  <div className="text-center">
                    <div className="text-xs sm:text-sm text-gray-600">Total Liabilities</div>
                    <div
                      className={`text-lg sm:text-xl font-bold ${liabilities.total >= 0 ? "text-red-600" : "text-green-600"}`}
                    >
                      {formatCurrency(Math.abs(liabilities.total))}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{liabilities.accounts.length} accounts</div>
                  </div>
                </div>
                <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6 border border-gray-200">
                  <div className="text-center">
                    <div className="text-xs sm:text-sm text-gray-600">Total Equity</div>
                    <div
                      className={`text-lg sm:text-xl font-bold ${equity.total >= 0 ? "text-blue-600" : "text-red-600"}`}
                    >
                      {formatCurrency(equity.total)}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{equity.accounts.length} accounts</div>
                  </div>
                </div>
                <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6 border border-gray-200 border-l-4 border-l-blue-500">
                  <div className="text-center">
                    <div className="text-xs sm:text-sm text-blue-700 font-semibold">Balance Check</div>
                    <div
                      className={`text-lg sm:text-xl font-bold ${
                        Math.abs(assets.total - liabilities.total - equity.total) < 1
                          ? "text-green-700"
                          : "text-red-700"
                      }`}
                    >
                      {formatCurrency(assets.total - liabilities.total - equity.total)}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Should be $0</div>
                  </div>
                </div>
              </div>
            )}

          {/* Assets Section with Subtotals */}
          {!isLoading && assets.accounts.length > 0 && 
            renderBalanceSheetSection(assets, 'green', assetTypeOrder, true)
          }

          {/* Liabilities Section with Subtotals */}
          {!isLoading && liabilities.accounts.length > 0 && 
            renderBalanceSheetSection(liabilities, 'red', liabilityTypeOrder, true)
          }

          {/* Equity Section without Subtotals (as requested) */}
          {!isLoading && equity.accounts.length > 0 && 
            renderBalanceSheetSection(equity, 'blue', ["Equity"], false)
          }

          {/* No Data State */}
          {!isLoading &&
            assets.accounts.length === 0 &&
            liabilities.accounts.length === 0 &&
            equity.accounts.length === 0 && (
              <div className="bg-white rounded-lg shadow-sm p-8 text-center">
                <p className="text-gray-500">No balance sheet data found for the selected period and filters.</p>
                <p className="text-xs text-gray-400 mt-2">Try adjusting your date range or property filter.</p>
              </div>
            )}
        </div>
      </main>

      {/* Transaction Detail Modal - Fixed Sizing */}
      {showTransactionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white rounded-lg w-full max-w-6xl h-[85vh] flex flex-col overflow-hidden">
            {/* Fixed Header */}
            <div className="flex-shrink-0 p-4 sm:p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900">{modalTitle}</h3>
                  <p className="text-xs sm:text-sm text-gray-600">{transactionDetails.length} transactions</p>
                </div>
                <button onClick={() => setShowTransactionModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
              </div>

              {/* Enhanced Transaction Summary with Period Info */}
              {transactionDetails.length > 0 && (
                <div className="mt-4 space-y-3">
                  {/* Main Totals */}
                  <div className="grid grid-cols-2 gap-2 sm:gap-4 p-3 sm:p-4 bg-gray-50 rounded-lg">
                    <div className="text-center">
                      <div className="text-xs text-gray-600">Total Amount</div>
                      <div
                        className={`text-sm sm:text-lg font-semibold ${
                          transactionDetails.reduce((sum, t) => sum + t.amount, 0) >= 0
                            ? "text-green-600"
                            : "text-red-600"
                        }`}
                      >
                        {formatCurrency(transactionDetails.reduce((sum, t) => sum + t.amount, 0))}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-gray-600">Transaction Count</div>
                      <div className="text-sm sm:text-lg font-semibold text-blue-600">
                        {transactionDetails.length}
                      </div>
                    </div>
                  </div>

                  {/* Period Breakdown */}
                  <div className="grid grid-cols-2 gap-2 sm:gap-4 p-3 sm:p-4 bg-blue-50 rounded-lg">
                    <div className="text-center">
                      <div className="text-xs text-blue-700 font-medium">
                        Before {formatDate(calculatePeriodStart())}
                      </div>
                      <div className="text-sm sm:text-base font-semibold text-blue-800">
                        {formatCurrency(
                          transactionDetails
                            .filter(t => parseDate(t.date) < calculatePeriodStart())
                            .reduce((sum, t) => sum + t.amount, 0)
                        )}
                      </div>
                      <div className="text-xs text-blue-600">
                        ({transactionDetails.filter(t => parseDate(t.date) < calculatePeriodStart()).length} transactions)
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-blue-700 font-medium">
                        From {formatDate(calculatePeriodStart())}
                      </div>
                      <div className="text-sm sm:text-base font-semibold text-blue-800">
                        {formatCurrency(
                          transactionDetails
                            .filter(t => parseDate(t.date) >= calculatePeriodStart())
                            .reduce((sum, t) => sum + t.amount, 0)
                        )}
                      </div>
                      <div className="text-xs text-blue-600">
                        ({transactionDetails.filter(t => parseDate(t.date) >= calculatePeriodStart()).length} transactions)
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-auto p-3 sm:p-6">
              {/* Mobile: Card List */}
              <div className="sm:hidden space-y-3">
                {transactionDetails.map((transaction, index) => (
                  <div
                    key={index}
                    className="bg-gray-50 rounded-lg p-3 border cursor-pointer"
                    onClick={() => openJournalEntry(transaction.entryNumber)}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="text-sm font-medium text-gray-900">{formatDate(transaction.date)}</div>
                      <div className="text-right">
                        <div
                          className={`text-sm font-bold ${transaction.amount >= 0 ? "text-green-600" : "text-red-600"}`}
                        >
                          {formatCurrency(transaction.amount)}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm text-gray-700">
                        <span className="font-medium">Payee/Customer:</span> {transaction.payeeCustomer}
                      </div>
                      {transaction.memo && (
                        <div className="text-sm text-gray-600">
                          <span className="font-medium">Memo:</span> {transaction.memo}
                        </div>
                      )}
                      {transaction.class && (
                        <div className="text-sm text-blue-600">
                          <span className="font-medium">Class:</span> {transaction.class}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: Table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0">
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
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Class
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {transactionDetails.map((transaction, index) => (
                      <tr
                        key={index}
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => openJournalEntry(transaction.entryNumber)}
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatDate(transaction.date)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 max-w-xs">
                          <div className="truncate" title={transaction.payeeCustomer || "N/A"}>
                            {transaction.payeeCustomer || "N/A"}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500 max-w-xs">
                          <div className="truncate" title={transaction.memo || "N/A"}>
                            {transaction.memo || "N/A"}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-blue-600 max-w-xs">
                          <div className="truncate" title={transaction.class || "N/A"}>
                            {transaction.class || "N/A"}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium">
                          <span className={transaction.amount >= 0 ? "text-green-600" : "text-red-600"}>
                            {formatCurrency(transaction.amount)}
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
