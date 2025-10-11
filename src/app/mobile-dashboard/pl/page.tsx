'use client'

import {
  useState,
  useEffect,
  useMemo,
  useCallback,
} from "react"
import {
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
import ReportHeader from "@/components/mobile-dashboard/ReportHeader"

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

  const handleDateChange = (startDate: string, endDate: string) => {
    setCustomStart(startDate)
    setCustomEnd(endDate)
  }

  useEffect(() => {
    const load = async () => {
      const start = customStart || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]
      const end = customEnd || new Date().toISOString().split('T')[0]

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
  }, [customStart, customEnd])

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
    const start = customStart || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]
    const end = customEnd || new Date().toISOString().split('T')[0]

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
    const start = customStart || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]
    const end = customEnd || new Date().toISOString().split('T')[0]

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
      background: `linear-gradient(135deg, ${BRAND_COLORS.primary} 0%, ${BRAND_COLORS.secondary} 100%)`,
      paddingBottom: '32px'
    }}>
      {/* Shared Header Component */}
      {view === 'overview' && (
        <ReportHeader
          title="P&L Statement"
          subtitle={`${properties.length} Customers`}
          showDateFilter={true}
          startDate={customStart}
          endDate={customEnd}
          onDateChange={handleDateChange}
        />
      )}

      <div style={{ padding: '20px' }}>
        {view === "overview" && (
          <div>
            {/* Company Total Summary */}
            <div
              onClick={() => handlePropertySelect(null)}
              style={{
                background: 'white',
                borderRadius: '16px',
                padding: '24px',
                marginBottom: '24px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <span style={{ fontSize: '14px', color: BRAND_COLORS.gray[600], fontWeight: '500' }}>
                  Company Total
                </span>
                <div style={{ fontSize: '36px', fontWeight: 'bold', margin: '8px 0', color: BRAND_COLORS.primary }}>
                  {formatCompactCurrency(companyTotals.net)}
                </div>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', textAlign: 'center' }}>
                <div>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: BRAND_COLORS.success }}>
                    {formatCompactCurrency(companyTotals.revenue)}
                  </div>
                  <div style={{ fontSize: '12px', color: BRAND_COLORS.gray[600] }}>Revenue</div>
                </div>
                <div>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: BRAND_COLORS.warning }}>
                    {formatCompactCurrency(companyTotals.cogs)}
                  </div>
                  <div style={{ fontSize: '12px', color: BRAND_COLORS.gray[600] }}>COGS</div>
                </div>
                <div>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: BRAND_COLORS.danger }}>
                    {formatCompactCurrency(companyTotals.expenses)}
                  </div>
                  <div style={{ fontSize: '12px', color: BRAND_COLORS.gray[600] }}>Expenses</div>
                </div>
                <div>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: BRAND_COLORS.primary }}>
                    {formatCompactCurrency(companyTotals.net)}
                  </div>
                  <div style={{ fontSize: '12px', color: BRAND_COLORS.gray[600] }}>Net Income</div>
                </div>
              </div>
            </div>

            {/* Portfolio Insights */}
            <div style={{
              background: 'white',
              borderRadius: '16px',
              padding: '20px',
              marginBottom: '24px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                <Target size={20} style={{ color: BRAND_COLORS.accent }} />
                <h3 style={{ fontSize: '18px', fontWeight: '600', color: BRAND_COLORS.accent, margin: 0 }}>
                  Customer Insights
                </h3>
              </div>
              
              {/* Awards Section */}
              <div style={{
                background: BRAND_COLORS.gray[50],
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '16px'
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
                    cursor: 'pointer'
                  }}>
                    <span style={{ fontSize: '20px' }}>👑</span>
                    <div>
                      <div style={{ fontSize: '11px', color: BRAND_COLORS.warning, fontWeight: '600' }}>
                        REV CHAMP
                      </div>
                      <div style={{ fontSize: '10px', color: BRAND_COLORS.gray[600] }}>
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
                    cursor: 'pointer'
                  }}>
                    <span style={{ fontSize: '20px' }}>🏅</span>
                    <div>
                      <div style={{ fontSize: '11px', color: BRAND_COLORS.success, fontWeight: '600' }}>
                        MARGIN MASTER
                      </div>
                      <div style={{ fontSize: '10px', color: BRAND_COLORS.gray[600] }}>
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
                    cursor: 'pointer'
                  }}>
                    <span style={{ fontSize: '20px' }}>🎯</span>
                    <div>
                      <div style={{ fontSize: '11px', color: BRAND_COLORS.accent, fontWeight: '600' }}>
                        COGS CHAMP
                      </div>
                      <div style={{ fontSize: '10px', color: BRAND_COLORS.gray[600] }}>
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
                    cursor: 'pointer'
                  }}>
                    <span style={{ fontSize: '20px' }}>💎</span>
                    <div>
                      <div style={{ fontSize: '11px', color: BRAND_COLORS.primary, fontWeight: '600' }}>
                        PROFIT STAR
                      </div>
                      <div style={{ fontSize: '10px', color: BRAND_COLORS.gray[600] }}>
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
                      borderRadius: '8px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'start', gap: '12px' }}>
                        <Icon size={20} style={{ color: iconColor, marginTop: '2px' }} />
                        <div>
                          <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '4px', margin: 0 }}>
                            {insight.title}
                          </h4>
                          <p style={{ fontSize: '13px', color: BRAND_COLORS.gray[600], lineHeight: '1.4', margin: 0 }}>
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
            <h2 style={{
              fontSize: '18px',
              fontWeight: 'bold',
              color: 'white',
              marginBottom: '16px',
              textShadow: '0 2px 4px rgba(0,0,0,0.2)'
            }}>
              By Customer
            </h2>

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
                        borderRadius: '6px'
                      }}>
                        <span style={{ fontSize: '11px', color: BRAND_COLORS.gray[600], fontWeight: '500' }}>Revenue</span>
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
                        borderRadius: '6px'
                      }}>
                        <span style={{ fontSize: '11px', color: BRAND_COLORS.gray[600], fontWeight: '500' }}>COGS</span>
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
                        borderRadius: '6px'
                      }}>
                        <span style={{ fontSize: '11px', color: BRAND_COLORS.gray[600], fontWeight: '500' }}>Expenses</span>
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
                        border: `2px solid ${BRAND_COLORS.primary}30`
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
                background: 'white',
                border: 'none',
                borderRadius: '12px',
                padding: '12px 16px',
                fontSize: '16px',
                color: BRAND_COLORS.accent,
                marginBottom: '20px',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
              }}
            >
              <ChevronLeft size={20} style={{ marginRight: '4px' }} />
              Back to Overview
            </button>

            <div
              style={{
                background: 'white',
                borderRadius: '16px',
                padding: '20px',
                marginBottom: '24px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
              }}
            >
              <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px', color: BRAND_COLORS.accent, margin: 0 }}>
                Top Customers by {rankingLabels[rankingMetric]}
              </h2>
              <p style={{ fontSize: '14px', color: BRAND_COLORS.gray[600], margin: 0 }}>
                Ranked Performance
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
                    padding: '16px',
                    borderRadius: '12px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
                  }}
                >
                  <span style={{ fontWeight: '600', color: BRAND_COLORS.gray[900] }}>{idx + 1}. {p.name}</span>
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
                background: 'white',
                border: 'none',
                borderRadius: '12px',
                padding: '12px 16px',
                fontSize: '16px',
                color: BRAND_COLORS.accent,
                marginBottom: '20px',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
              }}
            >
              <ChevronLeft size={20} style={{ marginRight: '4px' }} /> 
              Back to Customers
            </button>
            
            <div style={{
              background: 'white',
              borderRadius: '16px',
              padding: '20px',
              marginBottom: '24px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
            }}>
              <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px', color: BRAND_COLORS.accent, margin: '0 0 8px 0' }}>
                {selectedProperty || "Company Total"}
              </h2>
              <p style={{ fontSize: '14px', color: BRAND_COLORS.gray[600], margin: 0 }}>
                P&L Statement
              </p>
            </div>

            <div style={{ display: 'grid', gap: '16px' }}>
              <div style={{
                background: 'white',
                borderRadius: '12px',
                padding: '20px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
              }}>
                <h3 style={{ 
                  fontSize: '18px', 
                  fontWeight: '600', 
                  marginBottom: '16px',
                  color: BRAND_COLORS.success,
                  borderBottom: `2px solid ${BRAND_COLORS.success}`,
                  paddingBottom: '8px',
                  margin: '0 0 16px 0'
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
                boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
              }}>
                <h3 style={{ 
                  fontSize: '18px', 
                  fontWeight: '600', 
                  marginBottom: '16px',
                  color: BRAND_COLORS.warning,
                  borderBottom: `2px solid ${BRAND_COLORS.warning}`,
                  paddingBottom: '8px',
                  margin: '0 0 16px 0'
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
                boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
              }}>
                <h3 style={{ 
                  fontSize: '18px', 
                  fontWeight: '600', 
                  marginBottom: '16px',
                  color: BRAND_COLORS.danger,
                  borderBottom: `2px solid ${BRAND_COLORS.danger}`,
                  paddingBottom: '8px',
                  margin: '0 0 16px 0'
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
                color: 'white',
                background: plTotals.net >= 0 ? BRAND_COLORS.success : BRAND_COLORS.danger,
                padding: '12px',
                borderRadius: '8px'
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
                background: 'white',
                border: 'none',
                borderRadius: '12px',
                padding: '12px 16px',
                fontSize: '16px',
                color: BRAND_COLORS.accent,
                marginBottom: '20px',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
              }}
            >
              <ChevronLeft size={20} style={{ marginRight: '4px' }} />
              Back to P&L
            </button>

            <div style={{
              background: 'white',
              borderRadius: '16px',
              padding: '20px',
              marginBottom: '24px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
            }}>
              <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '8px', color: BRAND_COLORS.accent, margin: '0 0 8px 0' }}>
                {selectedCategory}
              </h2>
              <p style={{ fontSize: '14px', color: BRAND_COLORS.gray[600], margin: 0 }}>
                Transaction Details
              </p>
            </div>
            <div style={{ display: 'grid', gap: '12px' }}>
              {transactions.map((t, idx) => (
                <div
                  key={idx}
                  style={{
                    background: 'white',
                    borderRadius: '12px',
                    padding: '16px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
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
                  {t.payee && <div style={{ fontSize: '13px', color: BRAND_COLORS.gray[700], fontWeight: '500' }}>{t.payee}</div>}
                  {t.customer && <div style={{ fontSize: '11px', color: BRAND_COLORS.gray[500] }}>{t.customer}</div>}
                  {t.memo && <div style={{ fontSize: '12px', color: BRAND_COLORS.gray[600], marginTop: '4px' }}>{t.memo}</div>}
                </div>
              ))}
            </div>
            <div
              style={{
                marginTop: '16px',
                textAlign: 'right',
                fontSize: '14px',
                fontWeight: '600',
                color: 'white',
                background: transactionTotal >= 0 ? BRAND_COLORS.success : BRAND_COLORS.danger,
                padding: '12px',
                borderRadius: '8px'
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
                borderRadius: '16px',
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
                  padding: '20px',
                  borderBottom: `2px solid ${BRAND_COLORS.gray[200]}`,
                }}
              >
                <h3 style={{ fontSize: '18px', fontWeight: '600', color: BRAND_COLORS.accent, margin: 0 }}>
                  {journalTitle}
                </h3>
                <button
                  onClick={() => setShowJournalModal(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  <X size={24} color={BRAND_COLORS.gray[600]} />
                </button>
              </div>
              <div style={{ overflowY: 'auto', padding: '20px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${BRAND_COLORS.gray[200]}` }}>
                      <th style={{ textAlign: 'left', padding: '12px 8px', fontSize: '13px', color: BRAND_COLORS.gray[700], fontWeight: '600' }}>Account</th>
                      <th style={{ textAlign: 'right', padding: '12px 8px', fontSize: '13px', color: BRAND_COLORS.gray[700], fontWeight: '600' }}>Debit</th>
                      <th style={{ textAlign: 'right', padding: '12px 8px', fontSize: '13px', color: BRAND_COLORS.gray[700], fontWeight: '600' }}>Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {journalEntryLines.map((line, idx) => (
                      <tr key={idx} style={{ borderTop: `1px solid ${BRAND_COLORS.gray[100]}` }}>
                        <td style={{ padding: '12px 8px', fontSize: '13px', color: BRAND_COLORS.gray[700] }}>{line.account}</td>
                        <td style={{ padding: '12px 8px', textAlign: 'right', fontSize: '13px', color: BRAND_COLORS.danger, fontWeight: '600' }}>
                          {formatCurrency(Number(line.debit || 0))}
                        </td>
                        <td style={{ padding: '12px 8px', textAlign: 'right', fontSize: '13px', color: BRAND_COLORS.success, fontWeight: '600' }}>
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
    </div>
  )
}
