'use client'

import {
  useState,
  useEffect,
  useMemo,
  useCallback,
} from "react"
import {
  Menu,
  X,
  ChevronLeft,
  TrendingUp,
  Award,
  AlertTriangle,
  CheckCircle,
  Target,
  type LucideIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabaseClient"

// I AM CFO Brand Colors
const BRAND_COLORS = {
  primary: '#56B6E9',
  secondary: '#3A9BD1', 
  tertiary: '#7CC4ED',
  accent: '#2E86C1',
  success: '#27AE60',
  warning: '#F39C12',
  danger: '#E74C3C',
  gray: {
    50: '#F8FAFC',
    100: '#F1F5F9',
    200: '#E2E8F0'
  }
}

interface PropertySummary {
  name: string
  revenue?: number
  cogs?: number
  expenses?: number
  netIncome?: number
}

interface Category {
  name: string
  total: number
}

interface Transaction {
  date: string
  amount: number
  running: number
  payee?: string | null
  memo?: string | null
  customer?: string | null
  entryNumber?: string
  invoiceNumber?: string | null
}

interface JournalRow {
  account: string
  account_type: string | null
  debit: number | null
  credit: number | null
  customer: string | null
  date: string
  memo?: string | null
  vendor?: string | null
  name?: string | null
  entry_number?: string
  number?: string | null
}

interface JournalEntryLine {
  date: string
  account: string
  memo: string | null
  customer: string | null
  debit: number | null
  credit: number | null
}

type Insight = {
  title: string
  message: string
  icon: LucideIcon
  type: "success" | "warning" | "info"
}

type RankingMetric = "revenue" | "margin" | "netIncome" | "cogs"

const getMonthName = (m: number) =>
  new Date(0, m - 1).toLocaleString("en-US", { month: "long" })

const formatDate = (date: string) =>
  new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })

const insights: Insight[] = [
  {
    title: "Revenue trending up",
    message: "Revenue increased compared to last period.",
    icon: TrendingUp,
    type: "success",
  },
  {
    title: "Expense spike detected",
    message: "Expenses rose faster than revenue this period.",
    icon: AlertTriangle,
    type: "warning",
  },
  {
    title: "Stable cash position",
    message: "Cash flow remains steady.",
    icon: CheckCircle,
    type: "info",
  },
]

export default function MobilePLDashboard() {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [reportPeriod, setReportPeriod] = useState<
    "Monthly" | "Custom" | "Year to Date" | "Trailing 12" | "Quarterly"
  >("Monthly")
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1)
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [customStart, setCustomStart] = useState("")
  const [customEnd, setCustomEnd] = useState("")
  const [view, setView] = useState<"overview" | "summary" | "report" | "detail">("overview")
  const [properties, setProperties] = useState<PropertySummary[]>([])
  const [selectedProperty, setSelectedProperty] = useState<string | null>(null)
  const [plData, setPlData] = useState<{ revenue: Category[]; cogs: Category[]; expenses: Category[] }>({
    revenue: [],
    cogs: [],
    expenses: [],
  })
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [rankingMetric, setRankingMetric] = useState<RankingMetric | null>(null)
  const [journalEntryLines, setJournalEntryLines] = useState<JournalEntryLine[]>([])
  const [showJournalModal, setShowJournalModal] = useState(false)
  const [journalTitle, setJournalTitle] = useState("")

  const transactionTotal = useMemo(
    () => transactions.reduce((sum, t) => sum + t.amount, 0),
    [transactions],
  )

  const plTotals = useMemo(() => {
    const revenue = plData.revenue.reduce((sum, c) => sum + c.total, 0)
    const cogs = plData.cogs.reduce((sum, c) => sum + c.total, 0)
    const expenses = plData.expenses.reduce((sum, c) => sum + c.total, 0)
    const grossProfit = revenue - cogs
    const net = grossProfit - expenses
    return { revenue, cogs, grossProfit, expenses, net }
  }, [plData])

  const getDateRange = useCallback(() => {
    const makeUTCDate = (y: number, m: number, d: number) =>
      new Date(Date.UTC(y, m, d))
    const y = year
    const m = month
    if (reportPeriod === "Custom" && customStart && customEnd) {
      return { start: customStart, end: customEnd }
    }
    if (reportPeriod === "Monthly") {
      const startDate = makeUTCDate(y, m - 1, 1)
      const endDate = makeUTCDate(y, m, 0)
      return {
        start: startDate.toISOString().split("T")[0],
        end: endDate.toISOString().split("T")[0],
      }
    }
    if (reportPeriod === "Quarterly") {
      const qStart = Math.floor((m - 1) / 3) * 3
      const startDate = makeUTCDate(y, qStart, 1)
      const endDate = makeUTCDate(y, qStart + 3, 0)
      return {
        start: startDate.toISOString().split("T")[0],
        end: endDate.toISOString().split("T")[0],
      }
    }
    if (reportPeriod === "Year to Date") {
      const startDate = makeUTCDate(y, 0, 1)
      const endDate = makeUTCDate(y, m, 0)
      return {
        start: startDate.toISOString().split("T")[0],
        end: endDate.toISOString().split("T")[0],
      }
    }
    if (reportPeriod === "Trailing 12") {
      const endDate = makeUTCDate(y, m, 0)
      const startDate = makeUTCDate(y, m - 11, 1)
      return {
        start: startDate.toISOString().split("T")[0],
        end: endDate.toISOString().split("T")[0],
      }
    }
    return { start: `${y}-01-01`, end: `${y}-12-31` }
  }, [reportPeriod, month, year, customStart, customEnd])

  useEffect(() => {
    const load = async () => {
      const { start, end } = getDateRange()

      const selectColumns = "account_type, report_category, normal_balance, debit, credit, customer, date"

      let query = supabase
        .from("journal_entry_lines")
        .select(selectColumns)
        .gte("date", start)
        .lte("date", end)

      const { data } = await query
      const map: Record<string, PropertySummary> = {}

      ((data as JournalRow[]) || []).forEach((row) => {
        const customer = row.customer || "General"
        if (!map[customer]) {
          map[customer] = {
            name: customer,
            revenue: 0,
            cogs: 0,
            expenses: 0,
            netIncome: 0,
          }
        }

        const debit = Number(row.debit) || 0
        const credit = Number(row.credit) || 0

        const t = (row.account_type || "").toLowerCase()
        if (t.includes("income") || t.includes("revenue")) {
          map[customer].revenue = (map[customer].revenue || 0) + (credit - debit)
        } else if (t.includes("cost of goods sold") || t.includes("cogs")) {
          const amt = debit - credit
          map[customer].cogs = (map[customer].cogs || 0) + amt
        } else if (t.includes("expense")) {
          const amt = debit - credit
          map[customer].expenses = (map[customer].expenses || 0) + amt
        }
        map[customer].netIncome = (map[customer].revenue || 0) - (map[customer].cogs || 0) - (map[customer].expenses || 0)
      })

      const list = Object.values(map).filter((p) => {
        return (p.revenue || 0) !== 0 || (p.cogs || 0) !== 0 || (p.expenses || 0) !== 0 || (p.netIncome || 0) !== 0
      })

      const finalList =
        map["General"] && !list.find((p) => p.name === "General")
          ? [...list, map["General"]]
          : list
      setProperties(finalList)
    }
    load()
  }, [reportPeriod, month, year, customStart, customEnd, getDateRange])

  const revenueKing = useMemo(() => {
    if (!properties.length) return null
    return properties.reduce((max, p) =>
      (p.revenue || 0) > (max.revenue || 0) ? p : max,
    properties[0]).name
  }, [properties])

  const marginMaster = useMemo(() => {
    if (!properties.length) return null
    return properties.reduce((max, p) => {
      const marginP = p.revenue ? (p.netIncome || 0) / p.revenue : 0
      const marginM = max.revenue ? (max.netIncome || 0) / max.revenue : 0
      return marginP > marginM ? p : max
    }, properties[0]).name
  }, [properties])

  const cogsChamp = useMemo(() => {
    if (!properties.length) return null
    return properties.reduce((min, p) => {
      const cogsRatioP = p.revenue ? (p.cogs || 0) / p.revenue : Infinity
      const cogsRatioMin = min.revenue ? (min.cogs || 0) / min.revenue : Infinity
      return cogsRatioP < cogsRatioMin ? p : min
    }, properties[0]).name
  }, [properties])

  const companyTotals = properties.reduce(
    (acc, p) => {
      acc.revenue += p.revenue || 0
      acc.cogs += p.cogs || 0
      acc.expenses += p.expenses || 0
      acc.net += p.netIncome || 0
      return acc
    },
    {
      revenue: 0,
      cogs: 0,
      expenses: 0,
      net: 0,
    },
  )

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n)

  const formatCompactCurrency = (n: number) => {
    if (Math.abs(n) >= 1000000) {
      return `${(n / 1000000).toFixed(1)}M`
    } else if (Math.abs(n) >= 1000) {
      return `${(n / 1000).toFixed(1)}K`
    }
    return formatCurrency(n)
  }

  const rankingLabels: Record<RankingMetric, string> = {
    revenue: "Revenue",
    margin: "Margin",
    netIncome: "Net Income",
    cogs: "COGS Efficiency",
  }

  const rankedProperties = useMemo(() => {
    if (!rankingMetric) return []
    const arr = [...properties]
    switch (rankingMetric) {
      case "revenue":
        return arr.sort((a, b) => (b.revenue || 0) - (a.revenue || 0))
      case "margin":
        return arr.sort((a, b) => {
          const mA = a.revenue ? (a.netIncome || 0) / (a.revenue || 1) : -Infinity
          const mB = b.revenue ? (b.netIncome || 0) / (b.revenue || 1) : -Infinity
          return mB - mA
        })
      case "cogs":
        return arr.sort((a, b) => {
          const cogsRatioA = a.revenue ? (a.cogs || 0) / a.revenue : Infinity
          const cogsRatioB = b.revenue ? (b.cogs || 0) / b.revenue : Infinity
          return cogsRatioA - cogsRatioB
        })
      case "netIncome":
        return arr.sort((a, b) => (b.netIncome || 0) - (a.netIncome || 0))
      default:
        return arr
    }
  }, [properties, rankingMetric])

  const formatRankingValue = (p: any) => {
    switch (rankingMetric) {
      case "margin":
        const m = p.revenue ? (p.netIncome || 0) / (p.revenue || 1) : 0
        return `${(m * 100).toFixed(1)}%`
      case "cogs":
        const cogsRatio = p.revenue ? (p.cogs || 0) / p.revenue : 0
        return `${(cogsRatio * 100).toFixed(1)}%`
      case "revenue":
        return formatCompactCurrency(p.revenue || 0)
      case "netIncome":
      default:
        return formatCompactCurrency(p.netIncome || 0)
    }
  }

  const showRanking = (metric: RankingMetric) => {
    setRankingMetric(metric)
    setView("summary")
  }

  const handlePropertySelect = async (name: string | null) => {
    setSelectedProperty(name)
    await loadPL(name)
    setView("report")
  }

  const loadPL = async (propertyName: string | null = selectedProperty) => {
    const { start, end } = getDateRange()
    let query = supabase
      .from("journal_entry_lines")
      .select("account, account_type, debit, credit, customer, date")
      .gte("date", start)
      .lte("date", end)
    if (propertyName) {
      query =
        propertyName === "General"
          ? query.is("customer", null)
          : query.eq("customer", propertyName)
    }
    const { data } = await query
    const rev: Record<string, number> = {}
    const cogs: Record<string, number> = {}
    const exp: Record<string, number> = {}
    ((data as JournalRow[]) || []).forEach((row) => {
      const debit = Number(row.debit) || 0
      const credit = Number(row.credit) || 0
      const t = (row.account_type || "").toLowerCase()

      if (t.includes("income") || t.includes("revenue")) {
        const amount = credit - debit
        rev[row.account] = (rev[row.account] || 0) + amount
      } else if (t.includes("cost of goods sold") || t.includes("cogs")) {
        const cogsAmount = debit - credit
        cogs[row.account] = (cogs[row.account] || 0) + cogsAmount
      } else if (t.includes("expense")) {
        const expAmount = debit - credit
        exp[row.account] = (exp[row.account] || 0) + expAmount
      }
    })
    setPlData({
      revenue: Object.entries(rev).map(([name, total]) => ({ name, total })),
      cogs: Object.entries(cogs).map(([name, total]) => ({ name, total })),
      expenses: Object.entries(exp).map(([name, total]) => ({ name, total })),
    })
  }

  const handleCategory = async (
    account: string,
    type: "revenue" | "cogs" | "expense",
  ) => {
    const { start, end } = getDateRange()
    let query = supabase
      .from("journal_entry_lines")
      .select(
        "date, debit, credit, account, customer, memo, vendor, name, entry_number, number",
      )
      .eq("account", account)
      .gte("date", start)
      .lte("date", end)

    if (selectedProperty) {
      query =
        selectedProperty === "General"
          ? query.is("customer", null)
          : query.eq("customer", selectedProperty)
    }
    const { data } = await query
    const list: Transaction[] = ((data as JournalRow[]) || [])
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((row) => {
        const debit = Number(row.debit) || 0
        const credit = Number(row.credit) || 0
        let amount = 0
        if (type === "revenue") {
          amount = credit - debit
        } else {
          amount = debit - credit
        }
        return {
          date: row.date,
          amount,
          running: 0,
          payee: row.vendor || row.name,
          memo: row.memo,
          customer: row.customer,
          entryNumber: row.entry_number,
        }
      })
    let run = 0
    list.forEach((t) => {
      run += t.amount
      t.running = run
    })
    setTransactions(list)
    setSelectedCategory(account)
    setView("detail")
  }

  const openJournalEntry = async (entryNumber?: string) => {
    if (!entryNumber) return
    const { data, error } = await supabase
      .from("journal_entry_lines")
      .select("date, account, memo, customer, debit, credit")
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

  const back = () => {
    if (view === "detail") setView("report")
    else if (view === "report") setView("overview")
    else if (view === "summary") {
      setRankingMetric(null)
      setView("overview")
    }
  }

  return (
    <div style={{ 
      minHeight: '100vh',
      background: BRAND_COLORS.gray[50],
      padding: '16px',
      position: 'relative'
    }}>
      <style jsx>{`
        @keyframes slideDown {
          0% {
            opacity: 0;
            transform: translateY(-10px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      {/* Enhanced Header */}
      <header style={{
        background: `linear-gradient(135deg, ${BRAND_COLORS.primary}, ${BRAND_COLORS.secondary})`,
        borderRadius: '16px',
        padding: '20px',
        marginBottom: '24px',
        color: 'white',
        boxShadow: `0 8px 32px ${BRAND_COLORS.primary}33`
      }}>
        <div className="relative flex items-center justify-center mb-4">
          <button
            onClick={() => router.push('/mobile-dashboard')}
            className="absolute left-0"
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              borderRadius: '8px',
              padding: '8px',
              color: 'white',
              cursor: 'pointer'
            }}
          >
            <ChevronLeft size={24} />
          </button>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="absolute right-0"
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              borderRadius: '8px',
              padding: '8px',
              color: 'white',
              cursor: 'pointer'
            }}
          >
            {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          <span
            onClick={() => handlePropertySelect(null)}
            style={{ fontSize: '28px', fontWeight: 'bold', color: 'white', cursor: 'pointer' }}
          >
            I AM CFO
          </span>
        </div>

        {/* Dashboard Summary */}
        <div style={{ textAlign: 'center', marginBottom: '16px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
            P&L Dashboard
          </h1>
          <p style={{ fontSize: '14px', opacity: 0.9 }}>
            {getMonthName(month)} {year} • {properties.length} Customers
          </p>
        </div>

        {/* Company Total - Enhanced */}
        <div
          onClick={() => handlePropertySelect(null)}
          style={{
            background: 'rgba(255, 255, 255, 0.15)',
            borderRadius: '12px',
            padding: '20px',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            cursor: 'pointer',
            transition: 'all 0.3s ease'
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: '16px' }}>
            <span style={{ fontSize: '14px', opacity: 0.9 }}>Company Total</span>
            <div style={{ fontSize: '32px', fontWeight: 'bold', margin: '8px 0' }}>
              {formatCompactCurrency(companyTotals.net)}
            </div>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                {formatCompactCurrency(companyTotals.revenue)}
              </div>
              <div style={{ fontSize: '11px', opacity: 0.8 }}>Revenue</div>
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                {formatCompactCurrency(companyTotals.cogs)}
              </div>
              <div style={{ fontSize: '11px', opacity: 0.8 }}>COGS</div>
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                {formatCompactCurrency(companyTotals.expenses)}
              </div>
              <div style={{ fontSize: '11px', opacity: 0.8 }}>Expenses</div>
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                {formatCompactCurrency(companyTotals.net)}
              </div>
              <div style={{ fontSize: '11px', opacity: 0.8 }}>Net Income</div>
            </div>
          </div>
        </div>
      </header>

      {/* Hamburger Dropdown Menu */}
      {menuOpen && (
        <div style={{
          position: 'absolute',
          top: '80px',
          left: '16px',
          right: '16px',
          background: 'white',
          borderRadius: '12px',
          padding: '20px',
          boxShadow: '0 8px 40px rgba(0, 0, 0, 0.15)',
          border: `2px solid ${BRAND_COLORS.gray[200]}`,
          zIndex: 1000,
          animation: 'slideDown 0.3s ease-out'
        }}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: BRAND_COLORS.accent }}>
              Report Period
            </label>
            <select
              style={{
                width: '100%',
                padding: '12px',
                border: `2px solid ${BRAND_COLORS.gray[200]}`,
                borderRadius: '8px',
                fontSize: '16px'
              }}
              value={reportPeriod}
              onChange={(e) =>
                setReportPeriod(e.target.value as "Monthly" | "Custom" | "Year to Date" | "Trailing 12" | "Quarterly")
              }
            >
              <option value="Monthly">Monthly</option>
              <option value="Custom">Custom Range</option>
              <option value="Year to Date">Year to Date</option>
              <option value="Trailing 12">Trailing 12 Months</option>
              <option value="Quarterly">Quarterly</option>
            </select>
          </div>
          {reportPeriod === "Custom" ? (
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
              <input
                type="date"
                style={{
                  flex: 1,
                  padding: '12px',
                  border: `2px solid ${BRAND_COLORS.gray[200]}`,
                  borderRadius: '8px',
                  fontSize: '16px'
                }}
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
              />
              <input
                type="date"
                style={{
                  flex: 1,
                  padding: '12px',
                  border: `2px solid ${BRAND_COLORS.gray[200]}`,
                  borderRadius: '8px',
                  fontSize: '16px'
                }}
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
              />
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
              <select
                style={{
                  flex: 1,
                  padding: '12px',
                  border: `2px solid ${BRAND_COLORS.gray[200]}`,
                  borderRadius: '8px',
                  fontSize: '16px'
                }}
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {new Date(0, i).toLocaleString("en", { month: "long" })}
                  </option>
                ))}
              </select>
              <select
                style={{
                  flex: 1,
                  padding: '12px',
                  border: `2px solid ${BRAND_COLORS.gray[200]}`,
                  borderRadius: '8px',
                  fontSize: '16px'
                }}
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              >
                {Array.from({ length: 5 }, (_, i) => {
                  const y = new Date().getFullYear() - 2 + i
                  return (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  )
                })}
              </select>
            </div>
          )}
          <button
            style={{
              width: '100%',
              padding: '12px',
              background: `linear-gradient(135deg, ${BRAND_COLORS.primary}, ${BRAND_COLORS.secondary})`,
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
            onClick={() => setMenuOpen(false)}
          >
            Apply Filters
          </button>
        </div>
      )}

      {view === "overview" && (
        <div>
          {/* Portfolio Insights */}
          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '20px',
            marginBottom: '24px',
            border: `1px solid ${BRAND_COLORS.gray[200]}`,
            boxShadow: '0 4px 20px rgba(86, 182, 233, 0.1)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
              <Target size={20} style={{ color: BRAND_COLORS.accent }} />
              <h3 style={{ fontSize: '18px', fontWeight: '600', color: BRAND_COLORS.accent }}>
                Customer Insights
              </h3>
            </div>
            
            {/* Awards Section */}
            <div style={{
              background: `linear-gradient(135deg, ${BRAND_COLORS.gray[50]}, #f0f9ff)`,
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '16px',
              border: `1px solid ${BRAND_COLORS.tertiary}33`
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                <Award size={16} style={{ color: BRAND_COLORS.primary }} />
                <span style={{ fontSize: '14px', fontWeight: '600', color: BRAND_COLORS.primary }}>
                  Customer Champions
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                <div onClick={() => showRanking("revenue")} style={{
                  background: 'white',
                  borderRadius: '8px',
                  padding: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  border: `1px solid ${BRAND_COLORS.warning}33`,
                  cursor: 'pointer'
                }}>
                  <span style={{ fontSize: '20px' }}>👑</span>
                  <div>
                    <div style={{ fontSize: '11px', color: BRAND_COLORS.warning, fontWeight: '600' }}>
                      REV CHAMP
                    </div>
                    <div style={{ fontSize: '10px', color: '#64748b' }}>
                      {revenueKing}
                    </div>
                  </div>
                </div>
                <div onClick={() => showRanking("margin")} style={{
                  background: 'white',
                  borderRadius: '8px',
                  padding: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  border: `1px solid ${BRAND_COLORS.success}33`,
                  cursor: 'pointer'
                }}>
                  <span style={{ fontSize: '20px' }}>🏅</span>
                  <div>
                    <div style={{ fontSize: '11px', color: BRAND_COLORS.success, fontWeight: '600' }}>
                      MARGIN MASTER
                    </div>
                    <div style={{ fontSize: '10px', color: '#64748b' }}>
                      {marginMaster}
                    </div>
                  </div>
                </div>
                <div onClick={() => showRanking("cogs")} style={{
                  background: 'white',
                  borderRadius: '8px',
                  padding: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  border: `1px solid ${BRAND_COLORS.accent}33`,
                  cursor: 'pointer'
                }}>
                  <span style={{ fontSize: '20px' }}>🎯</span>
                  <div>
                    <div style={{ fontSize: '11px', color: BRAND_COLORS.accent, fontWeight: '600' }}>
                      COGS CHAMP
                    </div>
                    <div style={{ fontSize: '10px', color: '#64748b' }}>
                      {cogsChamp}
                    </div>
                  </div>
                </div>
                <div onClick={() => showRanking("netIncome")} style={{
                  background: 'white',
                  borderRadius: '8px',
                  padding: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  border: `1px solid ${BRAND_COLORS.primary}33`,
                  cursor: 'pointer'
                }}>
                  <span style={{ fontSize: '20px' }}>💎</span>
                  <div>
                    <div style={{ fontSize: '11px', color: BRAND_COLORS.primary, fontWeight: '600' }}>
                      PROFIT STAR
                    </div>
                    <div style={{ fontSize: '10px', color: '#64748b' }}>
                      {properties.find(p => (p.netIncome || 0) === Math.max(...properties.map(prop => prop.netIncome || 0)))?.name}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gap: '12px' }}>
              {insights.map((insight, index) => {
                const Icon = insight.icon
                const bgColor = insight.type === 'success' ? '#f0f9ff' :
                               insight.type === 'warning' ? '#fffbeb' : '#f8fafc'
                const iconColor = insight.type === 'success' ? BRAND_COLORS.success :
                                 insight.type === 'warning' ? BRAND_COLORS.warning : BRAND_COLORS.primary

                return (
                  <div key={index} style={{
                    background: bgColor,
                    padding: '16px',
                    borderRadius: '8px',
                    border: `1px solid ${BRAND_COLORS.gray[200]}`
                  }}>
                    <div style={{ display: 'flex', alignItems: 'start', gap: '12px' }}>
                      <Icon size={20} style={{ color: iconColor, marginTop: '2px' }} />
                      <div>
                        <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>
                          {insight.title}
                        </h4>
                        <p style={{ fontSize: '13px', color: '#64748b', lineHeight: '1.4' }}>
                          {insight.message}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Customer KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
            {properties.map((p) => {
              const isRevenueKing = p.name === revenueKing
              const isMarginMaster = p.name === marginMaster
              const isCogsChamp = p.name === cogsChamp
              
              return (
                <div
                  key={p.name}
                  onClick={() => handlePropertySelect(p.name)}
                  style={{
                    background: selectedProperty === p.name 
                      ? `linear-gradient(135deg, ${BRAND_COLORS.primary}15, ${BRAND_COLORS.tertiary}15)` 
                      : 'white',
                    border: selectedProperty === p.name 
                      ? `3px solid ${BRAND_COLORS.primary}` 
                      : `2px solid ${BRAND_COLORS.gray[200]}`,
                    borderRadius: '16px',
                    padding: '18px',
                    cursor: 'pointer',
                    transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: selectedProperty === p.name 
                      ? `0 8px 32px ${BRAND_COLORS.primary}40` 
                      : '0 4px 16px rgba(0, 0, 0, 0.08)',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <span style={{ 
                      fontWeight: '700', 
                      fontSize: '15px', 
                      color: BRAND_COLORS.accent
                    }}>
                      {p.name}
                    </span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {isRevenueKing && (
                        <div style={{
                          background: `linear-gradient(135deg, ${BRAND_COLORS.warning}, #f59e0b)`,
                          borderRadius: '12px',
                          padding: '4px 6px',
                          boxShadow: '0 2px 8px rgba(245, 158, 11, 0.3)'
                        }}>
                          <span style={{ fontSize: '16px' }}>👑</span>
                        </div>
                      )}
                      {isMarginMaster && (
                        <div style={{
                          background: `linear-gradient(135deg, ${BRAND_COLORS.success}, #22c55e)`,
                          borderRadius: '12px',
                          padding: '4px 6px',
                          boxShadow: '0 2px 8px rgba(34, 197, 94, 0.3)'
                        }}>
                          <span style={{ fontSize: '16px' }}>🏅</span>
                        </div>
                      )}
                      {isCogsChamp && (
                        <div style={{
                          background: `linear-gradient(135deg, ${BRAND_COLORS.accent}, #0ea5e9)`,
                          borderRadius: '12px',
                          padding: '4px 6px',
                          boxShadow: '0 2px 8px rgba(14, 165, 233, 0.3)'
                        }}>
                          <span style={{ fontSize: '16px' }}>🎯</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gap: '6px' }}>
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between',
                      padding: '6px 10px',
                      background: `${BRAND_COLORS.success}08`,
                      borderRadius: '6px',
                      border: `1px solid ${BRAND_COLORS.success}20`
                    }}>
                      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '500' }}>Revenue</span>
                      <span style={{ 
                        fontSize: '12px', 
                        fontWeight: '700',
                        color: BRAND_COLORS.success
                      }}>
                        {formatCompactCurrency(p.revenue || 0)}
                      </span>
                    </div>
                    
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between',
                      padding: '6px 10px',
                      background: `${BRAND_COLORS.warning}08`,
                      borderRadius: '6px',
                      border: `1px solid ${BRAND_COLORS.warning}20`
                    }}>
                      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '500' }}>COGS</span>
                      <span style={{ 
                        fontSize: '12px', 
                        fontWeight: '700',
                        color: BRAND_COLORS.warning
                      }}>
                        {formatCompactCurrency(p.cogs || 0)}
                      </span>
                    </div>
                    
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between',
                      padding: '6px 10px',
                      background: `${BRAND_COLORS.danger}08`,
                      borderRadius: '6px',
                      border: `1px solid ${BRAND_COLORS.danger}20`
                    }}>
                      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '500' }}>Expenses</span>
                      <span style={{ 
                        fontSize: '12px', 
                        fontWeight: '700',
                        color: BRAND_COLORS.danger
                      }}>
                        {formatCompactCurrency(p.expenses || 0)}
                      </span>
                    </div>
                    
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between',
                      padding: '10px',
                      background: `linear-gradient(135deg, ${BRAND_COLORS.primary}10, ${BRAND_COLORS.tertiary}05)`,
                      borderRadius: '8px',
                      border: `2px solid ${BRAND_COLORS.primary}30`,
                      boxShadow: `0 4px 12px ${BRAND_COLORS.primary}20`
                    }}>
                      <span style={{ fontSize: '12px', fontWeight: '700', color: BRAND_COLORS.accent }}>Net Income</span>
                      <span style={{ 
                        fontSize: '14px', 
                        fontWeight: '800',
                        color: (p.netIncome || 0) >= 0 ? BRAND_COLORS.success : BRAND_COLORS.danger
                      }}>
                        {formatCompactCurrency(p.netIncome || 0)}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {view === "summary" && rankingMetric && (
        <div>
          <button
            onClick={back}
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'none',
              border: 'none',
              fontSize: '16px',
              color: BRAND_COLORS.accent,
              marginBottom: '20px',
              cursor: 'pointer'
            }}
          >
            <ChevronLeft size={20} style={{ marginRight: '4px' }} />
            Back to Overview
          </button>

          <div
            style={{
              background: `linear-gradient(135deg, ${BRAND_COLORS.tertiary}, ${BRAND_COLORS.primary})`,
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '24px',
              color: 'white'
            }}
          >
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
              Top Customers by {rankingLabels[rankingMetric]}
            </h2>
            <p style={{ fontSize: '14px', opacity: 0.9 }}>
              {getMonthName(month)} {year}
            </p>
          </div>

          <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '12px' }}>
            {rankedProperties.map((p, idx) => (
              <li
                key={p.name}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'white',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  border: `1px solid ${BRAND_COLORS.gray[200]}`
                }}
              >
                <span style={{ fontWeight: '600' }}>{idx + 1}. {p.name}</span>
                <span style={{ fontWeight: '600', color: BRAND_COLORS.accent }}>
                  {formatRankingValue(p)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {view === "report" && (
        <div>
          <button 
            onClick={back}
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'none',
              border: 'none',
              fontSize: '16px',
              color: BRAND_COLORS.accent,
              marginBottom: '20px',
              cursor: 'pointer'
            }}
          >
            <ChevronLeft size={20} style={{ marginRight: '4px' }} /> 
            Back to Customers
          </button>
          
          <div style={{
            background: `linear-gradient(135deg, ${BRAND_COLORS.tertiary}, ${BRAND_COLORS.primary})`,
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '24px',
            color: 'white'
          }}>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
              {selectedProperty || "Company Total"} - P&L Statement
            </h2>
            <p style={{ fontSize: '14px', opacity: 0.9 }}>
              {getMonthName(month)} {year}
            </p>
          </div>

          <div style={{ display: 'grid', gap: '16px' }}>
            <div style={{
              background: 'white',
              borderRadius: '12px',
              padding: '20px',
              border: `1px solid ${BRAND_COLORS.gray[200]}`
            }}>
              <h3 style={{ 
                fontSize: '18px', 
                fontWeight: '600', 
                marginBottom: '16px',
                color: BRAND_COLORS.success,
                borderBottom: `2px solid ${BRAND_COLORS.success}`,
                paddingBottom: '8px'
              }}>
                Revenue
              </h3>
              {plData.revenue.map((cat) => (
                <div
                  key={cat.name}
                  onClick={() => handleCategory(cat.name, "revenue")}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px',
                    marginBottom: '8px',
                    background: BRAND_COLORS.gray[50],
                    borderRadius: '8px',
                    cursor: 'pointer',
                    border: `1px solid ${BRAND_COLORS.gray[200]}`,
                    transition: 'all 0.2s ease'
                  }}
                >
                  <span style={{ fontSize: '14px', fontWeight: '500' }}>{cat.name}</span>
                  <span style={{ fontSize: '14px', fontWeight: '600', color: BRAND_COLORS.success }}>
                    {formatCurrency(cat.total)}
                  </span>
                </div>
              ))}
            </div>

            <div style={{
              background: 'white',
              borderRadius: '12px',
              padding: '20px',
              border: `1px solid ${BRAND_COLORS.gray[200]}`
            }}>
              <h3 style={{ 
                fontSize: '18px', 
                fontWeight: '600', 
                marginBottom: '16px',
                color: BRAND_COLORS.warning,
                borderBottom: `2px solid ${BRAND_COLORS.warning}`,
                paddingBottom: '8px'
              }}>
                Cost of Goods Sold
              </h3>
              {plData.cogs.map((cat) => (
                <div
                  key={cat.name}
                  onClick={() => handleCategory(cat.name, "cogs")}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px',
                    marginBottom: '8px',
                    background: BRAND_COLORS.gray[50],
                    borderRadius: '8px',
                    cursor: 'pointer',
                    border: `1px solid ${BRAND_COLORS.gray[200]}`,
                    transition: 'all 0.2s ease'
                  }}
                >
                  <span style={{ fontSize: '14px', fontWeight: '500' }}>{cat.name}</span>
                  <span style={{ fontSize: '14px', fontWeight: '600', color: BRAND_COLORS.warning }}>
                    {formatCurrency(cat.total)}
                  </span>
                </div>
              ))}
            </div>

            <div style={{
              background: 'white',
              borderRadius: '12px',
              padding: '20px',
              border: `1px solid ${BRAND_COLORS.gray[200]}`
            }}>
              <h3 style={{ 
                fontSize: '18px', 
                fontWeight: '600', 
                marginBottom: '16px',
                color: BRAND_COLORS.danger,
                borderBottom: `2px solid ${BRAND_COLORS.danger}`,
                paddingBottom: '8px'
              }}>
                Expenses
              </h3>
              {plData.expenses.map((cat) => (
                <div
                  key={cat.name}
                  onClick={() => handleCategory(cat.name, "expense")}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px',
                    marginBottom: '8px',
                    background: BRAND_COLORS.gray[50],
                    borderRadius: '8px',
                    cursor: 'pointer',
                    border: `1px solid ${BRAND_COLORS.gray[200]}`,
                    transition: 'all 0.2s ease'
                  }}
                >
                  <span style={{ fontSize: '14px', fontWeight: '500' }}>{cat.name}</span>
                  <span style={{ fontSize: '14px', fontWeight: '600', color: BRAND_COLORS.danger }}>
                    {formatCurrency(cat.total)}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div
            style={{
              marginTop: '8px',
              textAlign: 'right',
              fontSize: '16px',
              fontWeight: '600',
              color: plTotals.net >= 0 ? BRAND_COLORS.success : BRAND_COLORS.danger,
            }}
          >
            Net Income: {formatCurrency(plTotals.net)}
          </div>
        </div>
      )}

      {view === "detail" && (
        <div>
          <button
            onClick={back}
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'none',
              border: 'none',
              fontSize: '16px',
              color: BRAND_COLORS.accent,
              marginBottom: '20px',
              cursor: 'pointer'
            }}
          >
            <ChevronLeft size={20} style={{ marginRight: '4px' }} />
            Back to P&L
          </button>

          <div style={{
            background: `linear-gradient(135deg, ${BRAND_COLORS.accent}, ${BRAND_COLORS.secondary})`,
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '24px',
            color: 'white'
          }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '8px' }}>
              {selectedCategory}
            </h2>
            <p style={{ fontSize: '14px', opacity: 0.9 }}>
              Transaction Details • {getMonthName(month)} {year}
            </p>
          </div>
          <div style={{ display: 'grid', gap: '12px' }}>
            {transactions.map((t, idx) => (
              <div
                key={idx}
                style={{
                  background: 'white',
                  borderRadius: '8px',
                  padding: '16px',
                  border: `1px solid ${BRAND_COLORS.gray[200]}`,
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
                  cursor: 'pointer'
                }}
                onClick={() => openJournalEntry(t.entryNumber)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '14px', fontWeight: '500' }}>
                    {formatDate(t.date)}
                  </span>
                  <span style={{ fontSize: '14px', fontWeight: '700', color: t.amount >= 0 ? BRAND_COLORS.success : BRAND_COLORS.danger }}>
                    {formatCurrency(t.amount)}
                  </span>
                </div>
                {t.payee && <div style={{ fontSize: '13px', color: '#475569', fontWeight: '500' }}>{t.payee}</div>}
                {t.customer && <div style={{ fontSize: '11px', color: '#94a3b8' }}>{t.customer}</div>}
                {t.memo && <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>{t.memo}</div>}
              </div>
            ))}
          </div>
          <div
            style={{
              marginTop: '16px',
              textAlign: 'right',
              fontSize: '14px',
              fontWeight: '600',
              color: transactionTotal >= 0 ? BRAND_COLORS.success : BRAND_COLORS.danger
            }}
          >
            Total: {formatCurrency(transactionTotal)}
          </div>
        </div>
      )}

      {/* Journal Modal */}
      {showJournalModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '8px',
              width: '90%',
              maxWidth: '600px',
              maxHeight: '80vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 16px',
                borderBottom: `1px solid ${BRAND_COLORS.gray[200]}`,
              }}
            >
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a' }}>
                {journalTitle}
              </h3>
              <button
                onClick={() => setShowJournalModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <X />
              </button>
            </div>
            <div style={{ overflowY: 'auto', padding: '16px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '8px', fontSize: '12px', color: '#475569' }}>Account</th>
                    <th style={{ textAlign: 'right', padding: '8px', fontSize: '12px', color: '#475569' }}>Debit</th>
                    <th style={{ textAlign: 'right', padding: '8px', fontSize: '12px', color: '#475569' }}>Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {journalEntryLines.map((line, idx) => (
                    <tr key={idx} style={{ borderTop: `1px solid ${BRAND_COLORS.gray[100]}` }}>
                      <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>{line.account}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontSize: '12px', color: BRAND_COLORS.danger }}>
                        {formatCurrency(Number(line.debit || 0))}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontSize: '12px', color: BRAND_COLORS.success }}>
                        {formatCurrency(Number(line.credit || 0))}
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
