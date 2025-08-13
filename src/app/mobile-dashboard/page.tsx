"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
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
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

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
};

interface PropertySummary {
  name: string;
  revenue?: number;
  expenses?: number;
  netIncome?: number;
  operating?: number;
  financing?: number;
}

interface Category {
  name: string;
  total: number;
}

interface Transaction {
  date: string;
  amount: number;
  running: number;
  payee?: string | null;
  memo?: string | null;
  className?: string | null;
}

interface JournalRow {
  account: string;
  account_type: string | null;
  debit: number | null;
  credit: number | null;
  class: string | null;
  report_category?: string | null;
  normal_balance?: number | null;
  entry_bank_account?: string | null;
  is_cash_account?: boolean | null;
  date: string;
  memo?: string | null;
  customer?: string | null;
  vendor?: string | null;
  name?: string | null;
}

const getMonthName = (m: number) =>
  new Date(0, m - 1).toLocaleString("en-US", { month: "long" });

type Insight = {
  title: string;
  message: string;
  icon: LucideIcon;
  type: "success" | "warning" | "info";
};

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
];

export default function EnhancedMobileDashboard() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportType, setReportType] = useState<"pl" | "cf">("pl");
  const [reportPeriod, setReportPeriod] = useState<
    "Monthly" | "Custom" | "Year to Date" | "Trailing 12" | "Quarterly"
  >("Monthly");
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [view, setView] = useState<"overview" | "summary" | "report" | "detail">("overview");
  const [properties, setProperties] = useState<PropertySummary[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<string | null>(null);
  const [plData, setPlData] = useState<{ revenue: Category[]; expenses: Category[] }>({
    revenue: [],
    expenses: [],
  });
  const [cfData, setCfData] = useState<{
    operating: Category[];
    financing: Category[];
  }>({
    operating: [],
    financing: [],
  });
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const transactionTotal = useMemo(
    () => transactions.reduce((sum, t) => sum + t.amount, 0),
    [transactions],
  );

  const plTotals = useMemo(() => {
    const revenue = plData.revenue.reduce((sum, c) => sum + c.total, 0);
    const expenses = plData.expenses.reduce((sum, c) => sum + c.total, 0);
    return { revenue, expenses, net: revenue - expenses };
  }, [plData]);

  const cfTotals = useMemo(() => {
    const operating = cfData.operating.reduce((sum, c) => sum + c.total, 0);
    const financing = cfData.financing.reduce((sum, c) => sum + c.total, 0);
    return { operating, financing, net: operating + financing };
  }, [cfData]);

  const classifyTransaction = (
    accountType: string | null,
    reportCategory: string | null,
  ) => {
    const typeLower = accountType?.toLowerCase() || "";
    if (reportCategory === "transfer") return "transfer";
    if (
      typeLower === "income" ||
      typeLower === "other income" ||
      typeLower === "expenses" ||
      typeLower === "expense" ||
      typeLower === "cost of goods sold" ||
      typeLower === "accounts receivable" ||
      typeLower === "accounts payable"
    )
      return "operating";
    if (
      typeLower === "fixed assets" ||
      typeLower === "other assets" ||
      typeLower === "property, plant & equipment"
    )
      return "investing";
    if (
      typeLower === "long term liabilities" ||
      typeLower === "equity" ||
      typeLower === "credit card" ||
      typeLower === "other current liabilities" ||
      typeLower === "line of credit"
    )
      return "financing";
    return "other";
  };

  const getDateRange = useCallback(() => {
    const y = year;
    const m = month;
    if (reportPeriod === "Custom" && customStart && customEnd) {
      return { start: customStart, end: customEnd };
    }
    if (reportPeriod === "Monthly") {
      const startDate = new Date(y, m - 1, 1);
      const endDate = new Date(y, m, 0);
      return {
        start: startDate.toISOString().split("T")[0],
        end: endDate.toISOString().split("T")[0],
      };
    }
    if (reportPeriod === "Quarterly") {
      const qStart = Math.floor((m - 1) / 3) * 3;
      const startDate = new Date(y, qStart, 1);
      const endDate = new Date(y, qStart + 3, 0);
      return {
        start: startDate.toISOString().split("T")[0],
        end: endDate.toISOString().split("T")[0],
      };
    }
    if (reportPeriod === "Year to Date") {
      const startDate = new Date(y, 0, 1);
      const endDate = new Date(y, m, 0);
      return {
        start: startDate.toISOString().split("T")[0],
        end: endDate.toISOString().split("T")[0],
      };
    }
    if (reportPeriod === "Trailing 12") {
      const endDate = new Date(y, m, 0);
      const startDate = new Date(endDate);
      startDate.setMonth(startDate.getMonth() - 11);
      startDate.setDate(1);
      return {
        start: startDate.toISOString().split("T")[0],
        end: endDate.toISOString().split("T")[0],
      };
    }
    return { start: `${y}-01-01`, end: `${y}-12-31` };
  }, [reportPeriod, month, year, customStart, customEnd]);

  useEffect(() => {
    const load = async () => {
      const { start, end } = getDateRange();
      const query = supabase
        .from("journal_entry_lines")
        .select(
          "account, account_type, report_category, normal_balance, debit, credit, class, date, entry_bank_account, is_cash_account",
        )
        .gte("date", start)
        .lte("date", end);
      const { data } = await query;
      const map: Record<string, PropertySummary> = {};
      ((data as JournalRow[]) || []).forEach((row) => {
        const cls = row.class || "General";
        if (!map[cls]) {
          map[cls] = { name: cls, revenue: 0, expenses: 0, netIncome: 0, operating: 0, financing: 0 };
        }
        const debit = Number(row.debit) || 0;
        const credit = Number(row.credit) || 0;
        if (reportType === "pl") {
          const t = (row.account_type || "").toLowerCase();
          if (t.includes("income") || t.includes("revenue")) {
            map[cls].revenue = (map[cls].revenue || 0) + (credit - debit);
            map[cls].netIncome = (map[cls].netIncome || 0) + (credit - debit);
          } else if (t.includes("expense") || t.includes("cogs")) {
            const amt = debit - credit;
            map[cls].expenses = (map[cls].expenses || 0) + amt;
            map[cls].netIncome = (map[cls].netIncome || 0) - amt;
          }
        } else {
          const amount =
            row.report_category === "transfer" ? debit - credit : credit - debit;
          const classification = classifyTransaction(
            row.account_type,
            row.report_category,
          );
          if (classification === "operating") {
            map[cls].operating = (map[cls].operating || 0) + amount;
          } else if (
            classification === "financing" &&
            (row.account_type || "").toLowerCase() === "credit card" &&
            row.entry_bank_account
          ) {
            map[cls].financing = (map[cls].financing || 0) + amount;
          }
        }
      });
      const list = Object.values(map).filter((p) => {
        return reportType === "pl"
          ? (p.revenue || 0) !== 0 || (p.expenses || 0) !== 0 || (p.netIncome || 0) !== 0
          : (p.operating || 0) !== 0 || (p.financing || 0) !== 0;
      });
      const finalList =
        map["General"] && !list.find((p) => p.name === "General")
          ? [...list, map["General"]]
          : list;
      setProperties(finalList);
    };
    load();
  }, [reportType, reportPeriod, month, year, customStart, customEnd, getDateRange]);

  const revenueKing = useMemo(() => {
    if (reportType !== "pl" || !properties.length) return null;
    return properties.reduce((max, p) =>
      (p.revenue || 0) > (max.revenue || 0) ? p : max,
    properties[0]).name;
  }, [properties, reportType]);

  const marginMaster = useMemo(() => {
    if (reportType !== "pl" || !properties.length) return null;
    return properties.reduce((max, p) => {
      const marginP = p.revenue ? (p.netIncome || 0) / p.revenue : 0;
      const marginM = max.revenue ? (max.netIncome || 0) / max.revenue : 0;
      return marginP > marginM ? p : max;
    }, properties[0]).name;
  }, [properties, reportType]);

  const companyTotals = properties.reduce(
    (acc, p) => {
      if (reportType === "pl") {
        acc.revenue += p.revenue || 0;
        acc.expenses += p.expenses || 0;
        acc.net += p.netIncome || 0;
      } else {
        acc.operating += p.operating || 0;
        acc.financing += p.financing || 0;
        acc.net += (p.operating || 0) + (p.financing || 0);
      }
      return acc;
    },
    { revenue: 0, expenses: 0, net: 0, operating: 0, financing: 0 },
  );


  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n);

  const formatCompactCurrency = (n: number) => {
    if (Math.abs(n) >= 1000000) {
      return `${(n / 1000000).toFixed(1)}M`;
    } else if (Math.abs(n) >= 1000) {
      return `${(n / 1000).toFixed(1)}K`;
    }
    return formatCurrency(n);
  };

  const handlePropertySelect = async (name: string | null) => {
    setSelectedProperty(name);
    if (reportType === "pl") await loadPL(name);
    else await loadCF(name);
    setView("report");
  };

  const loadPL = async (propertyName: string | null = selectedProperty) => {
    const { start, end } = getDateRange();
    let query = supabase
      .from("journal_entry_lines")
      .select("account, account_type, debit, credit, class, date")
      .gte("date", start)
      .lte("date", end);
    if (propertyName) {
      query =
        propertyName === "General"
          ? query.is("class", null)
          : query.eq("class", propertyName);
    }
    const { data } = await query;
    const rev: Record<string, number> = {};
    const exp: Record<string, number> = {};
    ((data as JournalRow[]) || []).forEach((row) => {
      const debit = Number(row.debit) || 0;
      const credit = Number(row.credit) || 0;
      const t = (row.account_type || "").toLowerCase();
      const amount = credit - debit;
      if (t.includes("income") || t.includes("revenue")) {
        rev[row.account] = (rev[row.account] || 0) + amount;
      } else if (t.includes("expense")) {
        const expAmount = debit - credit;
        exp[row.account] = (exp[row.account] || 0) + expAmount;
      }
    });
    setPlData({
      revenue: Object.entries(rev).map(([name, total]) => ({ name, total })),
      expenses: Object.entries(exp).map(([name, total]) => ({ name, total })),
    });
  };

  const loadCF = async (propertyName: string | null = selectedProperty) => {
    const { start, end } = getDateRange();
    let query = supabase
      .from("journal_entry_lines")
      .select(
        "account, account_type, report_category, normal_balance, debit, credit, class, date, entry_bank_account, is_cash_account",
      )
      .gte("date", start)
      .lte("date", end);
    if (propertyName) {
      query =
        propertyName === "General"
          ? query.is("class", null)
          : query.eq("class", propertyName);
    }
    const { data } = await query;
    const op: Record<string, number> = {};
    const fin: Record<string, number> = {};
    ((data as JournalRow[]) || []).forEach((row) => {
      if (!row.entry_bank_account) return;
      const debit = Number(row.debit) || 0;
      const credit = Number(row.credit) || 0;
      const amount =
        row.report_category === "transfer" ? debit - credit : credit - debit;
      const classification = classifyTransaction(
        row.account_type,
        row.report_category,
      );
      if (classification === "operating") {
        op[row.account] = (op[row.account] || 0) + amount;
      } else if (
        classification === "financing" &&
        (row.account_type || "").toLowerCase() === "credit card"
      ) {
        fin[row.entry_bank_account] =
          (fin[row.entry_bank_account] || 0) + amount;
      }
    });
    const operatingArr = Object.entries(op)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);
    const financingArr = Object.entries(fin)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);
    setCfData({ operating: operatingArr, financing: financingArr });
  };


  const handleCategory = async (
    account: string,
    type: "revenue" | "expense" | "operating" | "financing",
  ) => {
    const { start, end } = getDateRange();
    let query = supabase
      .from("journal_entry_lines")
      .select(
        "date, debit, credit, account, class, report_category, memo, customer, vendor, name, entry_bank_account, account_type",
      )
      .gte("date", start)
      .lte("date", end);

    if (type === "financing") {
      query = query
        .eq("entry_bank_account", account)
        .eq("account_type", "Credit Card");
    } else {
      query = query.eq("account", account);
    }
    if (selectedProperty) {
      query =
        selectedProperty === "General"
          ? query.is("class", null)
          : query.eq("class", selectedProperty);
    }
    const { data } = await query;
    const list: Transaction[] = ((data as JournalRow[]) || [])
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((row) => {
        const debit = Number(row.debit) || 0;
        const credit = Number(row.credit) || 0;
        let amount = 0;
        if (reportType === "pl") {
          amount = type === "revenue" ? credit - debit : debit - credit;
        } else {
          amount =
            row.report_category === "transfer" ? debit - credit : credit - debit;
        }
        return {
          date: row.date,
          amount,
          running: 0,
          payee: row.customer || row.vendor || row.name,
          memo: row.memo,
          className: row.class,
        };
      });
    let run = 0;
    list.forEach((t) => {
      run += t.amount;
      t.running = run;
    });
    setTransactions(list);
    setSelectedCategory(account);
    setView("detail");
  };

  const back = () => {
    if (view === "detail") setView("report");
    else if (view === "report") setView("overview");
    else if (view === "summary") setView("overview");
  };

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
            onClick={() => setMenuOpen(!menuOpen)}
            className="absolute left-0"
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              borderRadius: '8px',
              padding: '8px',
              color: 'white'
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
            {reportType === "pl" ? "P&L Dashboard" : "Cash Flow Dashboard"}
          </h1>
          <p style={{ fontSize: '14px', opacity: 0.9 }}>
            {getMonthName(month)} {year} • {properties.length} Properties
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
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: '16px' }}>
            <span style={{ fontSize: '14px', opacity: 0.9 }}>Company Total</span>
            <div style={{ fontSize: '32px', fontWeight: 'bold', margin: '8px 0' }}>
              {formatCompactCurrency(companyTotals.net)}
            </div>
          </div>
          
          {reportType === "pl" ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', textAlign: 'center' }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                  {formatCompactCurrency(companyTotals.revenue)}
                </div>
                <div style={{ fontSize: '12px', opacity: 0.8 }}>Revenue</div>
              </div>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                  {formatCompactCurrency(companyTotals.expenses)}
                </div>
                <div style={{ fontSize: '12px', opacity: 0.8 }}>Expenses</div>
              </div>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                  {formatCompactCurrency(companyTotals.net)}
                </div>
                <div style={{ fontSize: '12px', opacity: 0.8 }}>Net Income</div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', textAlign: 'center' }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                  {formatCompactCurrency(companyTotals.operating)}
                </div>
                <div style={{ fontSize: '12px', opacity: 0.8 }}>Operating</div>
              </div>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                  {formatCompactCurrency(companyTotals.financing)}
                </div>
                <div style={{ fontSize: '12px', opacity: 0.8 }}>Financing</div>
              </div>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                  {formatCompactCurrency(companyTotals.net)}
                </div>
                <div style={{ fontSize: '12px', opacity: 0.8 }}>Net Cash</div>
              </div>
            </div>
          )}
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
              Report Type
            </label>
            <select
              style={{
                width: '100%',
                padding: '12px',
                border: `2px solid ${BRAND_COLORS.gray[200]}`,
                borderRadius: '8px',
                fontSize: '16px'
              }}
              value={reportType}
              onChange={(e) => setReportType(e.target.value as "pl" | "cf")}
            >
              <option value="pl">P&L Statement</option>
              <option value="cf">Cash Flow Statement</option>
            </select>
          </div>
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
                  const y = new Date().getFullYear() - 2 + i;
                  return (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  );
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
                Portfolio Insights
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
                  Property Champions
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                {reportType === "pl" ? (
                  <>
                    <div style={{
                      background: 'white',
                      borderRadius: '8px',
                      padding: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      border: `1px solid ${BRAND_COLORS.warning}33`
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
                    <div style={{
                      background: 'white',
                      borderRadius: '8px',
                      padding: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      border: `1px solid ${BRAND_COLORS.success}33`
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
                    <div style={{
                      background: 'white',
                      borderRadius: '8px',
                      padding: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      border: `1px solid ${BRAND_COLORS.primary}33`
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
                    <div style={{
                      background: 'white',
                      borderRadius: '8px',
                      padding: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      border: `1px solid ${BRAND_COLORS.tertiary}33`
                    }}>
                      <span style={{ fontSize: '20px' }}>🚀</span>
                      <div>
                        <div style={{ fontSize: '11px', color: BRAND_COLORS.tertiary, fontWeight: '600' }}>
                          GROWTH HERO
                        </div>
                        <div style={{ fontSize: '10px', color: '#64748b' }}>
                          {properties.length ? properties[Math.floor(Math.random() * properties.length)].name : "N/A"}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{
                      background: 'white',
                      borderRadius: '8px',
                      padding: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      border: `1px solid ${BRAND_COLORS.primary}33`
                    }}>
                      <span style={{ fontSize: '20px' }}>💰</span>
                      <div>
                        <div style={{ fontSize: '11px', color: BRAND_COLORS.primary, fontWeight: '600' }}>
                          CASH KING
                        </div>
                        <div style={{ fontSize: '10px', color: '#64748b' }}>
                          {properties.find(p => (p.operating || 0) === Math.max(...properties.map(prop => prop.operating || 0)))?.name}
                        </div>
                      </div>
                    </div>
                    <div style={{
                      background: 'white',
                      borderRadius: '8px',
                      padding: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      border: `1px solid ${BRAND_COLORS.success}33`
                    }}>
                      <span style={{ fontSize: '20px' }}>⚡</span>
                      <div>
                        <div style={{ fontSize: '11px', color: BRAND_COLORS.success, fontWeight: '600' }}>
                          FLOW MASTER
                        </div>
                        <div style={{ fontSize: '10px', color: '#64748b' }}>
                          {properties.find(p => ((p.operating || 0) + (p.financing || 0)) === Math.max(...properties.map(prop => (prop.operating || 0) + (prop.financing || 0))))?.name}
                        </div>
                      </div>
                    </div>
                    <div style={{
                      background: 'white',
                      borderRadius: '8px',
                      padding: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      border: `1px solid ${BRAND_COLORS.warning}33`
                    }}>
                      <span style={{ fontSize: '20px' }}>🎯</span>
                      <div>
                        <div style={{ fontSize: '11px', color: BRAND_COLORS.warning, fontWeight: '600' }}>
                          EFFICIENCY ACE
                        </div>
                        <div style={{ fontSize: '10px', color: '#64748b' }}>
                          {properties.length ? properties[Math.floor(Math.random() * properties.length)].name : "N/A"}
                        </div>
                      </div>
                    </div>
                    <div style={{
                      background: 'white',
                      borderRadius: '8px',
                      padding: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      border: `1px solid ${BRAND_COLORS.secondary}33`
                    }}>
                      <span style={{ fontSize: '20px' }}>💪</span>
                      <div>
                        <div style={{ fontSize: '11px', color: BRAND_COLORS.secondary, fontWeight: '600' }}>
                          STABILITY PRO
                        </div>
                        <div style={{ fontSize: '10px', color: '#64748b' }}>
                          {properties.length ? properties[Math.floor(Math.random() * properties.length)].name : "N/A"}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gap: '12px' }}>
              {insights.map((insight, index) => {
                const Icon = insight.icon;
                const bgColor = insight.type === 'success' ? '#f0f9ff' : 
                               insight.type === 'warning' ? '#fffbeb' : '#f8fafc';
                const iconColor = insight.type === 'success' ? BRAND_COLORS.success :
                                 insight.type === 'warning' ? BRAND_COLORS.warning : BRAND_COLORS.primary;
                
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
                );
              })}
            </div>
          </div>

          {/* Enhanced Property KPI Boxes */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
            {properties.map((p) => {
              const isRevenueKing = p.name === revenueKing;
              const isMarginMaster = p.name === marginMaster;
              
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
                      ? `0 8px 32px ${BRAND_COLORS.primary}40, 0 0 0 1px ${BRAND_COLORS.primary}20` 
                      : '0 4px 16px rgba(0, 0, 0, 0.08)',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                  onMouseOver={(e) => {
                    if (selectedProperty !== p.name) {
                      e.currentTarget.style.borderColor = BRAND_COLORS.tertiary;
                      e.currentTarget.style.transform = 'translateY(-4px) scale(1.02)';
                      e.currentTarget.style.boxShadow = `0 12px 32px ${BRAND_COLORS.tertiary}30`;
                    }
                  }}
                  onMouseOut={(e) => {
                    if (selectedProperty !== p.name) {
                      e.currentTarget.style.borderColor = BRAND_COLORS.gray[200];
                      e.currentTarget.style.transform = 'translateY(0) scale(1)';
                      e.currentTarget.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.08)';
                    }
                  }}
                >
                  {/* Decorative corner element */}
                  <div style={{
                    position: 'absolute',
                    top: '-20px',
                    right: '-20px',
                    width: '60px',
                    height: '60px',
                    background: `linear-gradient(135deg, ${BRAND_COLORS.tertiary}20, ${BRAND_COLORS.primary}10)`,
                    borderRadius: '50%',
                    opacity: 0.6
                  }} />
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <span style={{ 
                      fontWeight: '700', 
                      fontSize: '15px', 
                      color: BRAND_COLORS.accent,
                      textShadow: '0 1px 2px rgba(0,0,0,0.1)'
                    }}>
                      {p.name}
                    </span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {reportType === "pl" && isRevenueKing && (
                        <div style={{
                          background: `linear-gradient(135deg, ${BRAND_COLORS.warning}, #f59e0b)`,
                          borderRadius: '12px',
                          padding: '4px 6px',
                          boxShadow: '0 2px 8px rgba(245, 158, 11, 0.3)'
                        }}>
                          <span style={{ fontSize: '16px' }}>👑</span>
                        </div>
                      )}
                      {reportType === "pl" && isMarginMaster && (
                        <div style={{
                          background: `linear-gradient(135deg, ${BRAND_COLORS.success}, #22c55e)`,
                          borderRadius: '12px',
                          padding: '4px 6px',
                          boxShadow: '0 2px 8px rgba(34, 197, 94, 0.3)'
                        }}>
                          <span style={{ fontSize: '16px' }}>🏅</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {reportType === "pl" ? (
                    <div style={{ display: 'grid', gap: '8px' }}>
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        background: `${BRAND_COLORS.success}08`,
                        borderRadius: '8px',
                        border: `1px solid ${BRAND_COLORS.success}20`
                      }}>
                        <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '500' }}>Revenue</span>
                        <span style={{ 
                          fontSize: '13px', 
                          fontWeight: '700',
                          color: BRAND_COLORS.success,
                          textShadow: '0 1px 2px rgba(0,0,0,0.1)'
                        }}>
                          {formatCompactCurrency(p.revenue || 0)}
                        </span>
                      </div>
                      
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        background: `${BRAND_COLORS.warning}08`,
                        borderRadius: '8px',
                        border: `1px solid ${BRAND_COLORS.warning}20`
                      }}>
                        <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '500' }}>Expenses</span>
                        <span style={{ 
                          fontSize: '13px', 
                          fontWeight: '700',
                          color: BRAND_COLORS.warning,
                          textShadow: '0 1px 2px rgba(0,0,0,0.1)'
                        }}>
                          {formatCompactCurrency(p.expenses || 0)}
                        </span>
                      </div>
                      
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between',
                        padding: '12px',
                        background: `linear-gradient(135deg, ${BRAND_COLORS.primary}10, ${BRAND_COLORS.tertiary}05)`,
                        borderRadius: '10px',
                        border: `2px solid ${BRAND_COLORS.primary}30`,
                        boxShadow: `0 4px 12px ${BRAND_COLORS.primary}20`
                      }}>
                        <span style={{ fontSize: '14px', fontWeight: '700', color: BRAND_COLORS.accent }}>Net Income</span>
                        <span style={{ 
                          fontSize: '16px', 
                          fontWeight: '800',
                          color: (p.netIncome || 0) >= 0 ? BRAND_COLORS.success : BRAND_COLORS.danger,
                          textShadow: '0 1px 3px rgba(0,0,0,0.2)'
                        }}>
                          {formatCompactCurrency(p.netIncome || 0)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: '10px' }}>
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        background: `${BRAND_COLORS.primary}08`,
                        borderRadius: '8px',
                        border: `1px solid ${BRAND_COLORS.primary}20`
                      }}>
                        <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '500' }}>Operating</span>
                        <span style={{ 
                          fontSize: '13px', 
                          fontWeight: '700',
                          color: BRAND_COLORS.primary,
                          textShadow: '0 1px 2px rgba(0,0,0,0.1)'
                        }}>
                          {formatCompactCurrency(p.operating || 0)}
                        </span>
                      </div>
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        background: `${BRAND_COLORS.secondary}08`,
                        borderRadius: '8px',
                        border: `1px solid ${BRAND_COLORS.secondary}20`
                      }}>
                        <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '500' }}>Financing</span>
                        <span style={{ 
                          fontSize: '13px', 
                          fontWeight: '700',
                          color: BRAND_COLORS.secondary,
                          textShadow: '0 1px 2px rgba(0,0,0,0.1)'
                        }}>
                          {formatCompactCurrency(p.financing || 0)}
                        </span>
                      </div>
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between',
                        padding: '12px',
                        background: `linear-gradient(135deg, ${BRAND_COLORS.accent}10, ${BRAND_COLORS.primary}05)`,
                        borderRadius: '10px',
                        border: `2px solid ${BRAND_COLORS.accent}30`,
                        boxShadow: `0 4px 12px ${BRAND_COLORS.accent}20`
                      }}>
                        <span style={{ fontSize: '14px', fontWeight: '700', color: BRAND_COLORS.accent }}>Net Cash</span>
                        <span style={{ 
                          fontSize: '16px', 
                          fontWeight: '800',
                          color: ((p.operating || 0) + (p.financing || 0)) >= 0 ? BRAND_COLORS.success : BRAND_COLORS.danger,
                          textShadow: '0 1px 3px rgba(0,0,0,0.2)'
                        }}>
                          {formatCompactCurrency((p.operating || 0) + (p.financing || 0))}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div
            onClick={() => handlePropertySelect(null)}
            style={{
              marginTop: '24px',
              background: 'white',
              borderRadius: '16px',
              padding: '18px',
              cursor: 'pointer',
              border: `2px solid ${BRAND_COLORS.gray[200]}`,
              textAlign: 'center',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)'
            }}
          >
            <span
              style={{
                fontWeight: '700',
                fontSize: '15px',
                color: BRAND_COLORS.accent
              }}
            >
              Company Total Net {reportType === "pl" ? "Income" : "Cash"}
            </span>
            <div
              style={{
                fontSize: '20px',
                fontWeight: '800',
                marginTop: '4px',
                color: companyTotals.net >= 0 ? BRAND_COLORS.success : BRAND_COLORS.danger
              }}
            >
              {formatCompactCurrency(companyTotals.net)}
            </div>
          </div>
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
            Back to Properties
          </button>
          
          <div style={{
            background: `linear-gradient(135deg, ${BRAND_COLORS.tertiary}, ${BRAND_COLORS.primary})`,
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '24px',
            color: 'white'
          }}>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
              {selectedProperty || "Company Total"} - {reportType === "pl" ? "P&L Statement" : "Cash Flow Statement"}
            </h2>
            <p style={{ fontSize: '14px', opacity: 0.9 }}>
              {getMonthName(month)} {year}
            </p>
          </div>

          {reportType === "pl" ? (
            <>
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
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = '#f0f9ff';
                      e.currentTarget.style.borderColor = BRAND_COLORS.primary;
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = BRAND_COLORS.gray[50];
                      e.currentTarget.style.borderColor = BRAND_COLORS.gray[200];
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
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = '#fff7ed';
                      e.currentTarget.style.borderColor = BRAND_COLORS.warning;
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = BRAND_COLORS.gray[50];
                      e.currentTarget.style.borderColor = BRAND_COLORS.gray[200];
                    }}
                  >
                    <span style={{ fontSize: '14px', fontWeight: '500' }}>{cat.name}</span>
                    <span style={{ fontSize: '14px', fontWeight: '600', color: BRAND_COLORS.warning }}>
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
                color:
                  plTotals.net >= 0 ? BRAND_COLORS.success : BRAND_COLORS.danger,
              }}
            >
              Net Income: {formatCurrency(plTotals.net)}
            </div>
            </>
          ) : (
            <>
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
                  color: BRAND_COLORS.primary,
                  borderBottom: `2px solid ${BRAND_COLORS.primary}`,
                  paddingBottom: '8px'
                }}>
                  Operating Activities
                </h3>
                {cfData.operating.map((cat) => (
                  <div
                    key={cat.name}
                    onClick={() => handleCategory(cat.name, "operating")}
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
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = '#f0f9ff';
                      e.currentTarget.style.borderColor = BRAND_COLORS.primary;
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = BRAND_COLORS.gray[50];
                      e.currentTarget.style.borderColor = BRAND_COLORS.gray[200];
                    }}
                  >
                    <span style={{ fontSize: '14px', fontWeight: '500' }}>{cat.name}</span>
                    <span style={{ 
                      fontSize: '14px', 
                      fontWeight: '600', 
                      color: cat.total >= 0 ? BRAND_COLORS.success : BRAND_COLORS.danger
                    }}>
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
                  color: BRAND_COLORS.secondary,
                  borderBottom: `2px solid ${BRAND_COLORS.secondary}`,
                  paddingBottom: '8px'
                }}>
                  Financing Activities
                </h3>
                {cfData.financing.map((cat) => (
                  <div
                    key={cat.name}
                    onClick={() => handleCategory(cat.name, "financing")}
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
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = '#f8fafc';
                      e.currentTarget.style.borderColor = BRAND_COLORS.secondary;
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = BRAND_COLORS.gray[50];
                      e.currentTarget.style.borderColor = BRAND_COLORS.gray[200];
                    }}
                  >
                    <span style={{ fontSize: '14px', fontWeight: '500' }}>{cat.name}</span>
                    <span style={{ 
                      fontSize: '14px', 
                      fontWeight: '600', 
                      color: cat.total >= 0 ? BRAND_COLORS.success : BRAND_COLORS.danger
                    }}>
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
                color:
                  cfTotals.net >= 0 ? BRAND_COLORS.success : BRAND_COLORS.danger,
              }}
            >
              Net Cash Flow: {formatCurrency(cfTotals.net)}
            </div>
            </>
          )}
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
            Back to {reportType === "pl" ? "P&L" : "Cash Flow"}
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
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '8px',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '500' }}>
                      {new Date(t.date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </div>
                    {t.payee && (
                      <div style={{ fontSize: '13px', color: '#475569' }}>{t.payee}</div>
                    )}
                    {t.className && (
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: '600',
                          color: BRAND_COLORS.accent,
                          background: `${BRAND_COLORS.primary}20`,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          display: 'inline-block',
                          marginTop: '2px',
                        }}
                      >
                        {t.className}
                      </div>
                    )}
                    {t.memo && (
                      <div style={{ fontSize: '12px', color: '#64748b' }}>{t.memo}</div>
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: '16px',
                      fontWeight: '600',
                      color: t.amount >= 0 ? BRAND_COLORS.success : BRAND_COLORS.danger,
                    }}
                  >
                    {formatCurrency(t.amount)}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: '12px',
                    color: '#64748b',
                    textAlign: 'right',
                    borderTop: `1px solid ${BRAND_COLORS.gray[100]}`,
                    paddingTop: '8px',
                  }}
                >
                  Running Total: {formatCurrency(t.running)}
                </div>
              </div>
            ))}
          </div>
          <div
            style={{
              marginTop: '16px',
              textAlign: 'right',
              fontSize: '14px',
              fontWeight: '600',
              color: transactionTotal >= 0 ? BRAND_COLORS.success : BRAND_COLORS.danger,
            }}
          >
            {reportType === "pl" ? "Total Net Income" : "Total Net Cash Flow"}: {formatCurrency(transactionTotal)}
          </div>
        </div>
      )}
    </div>
  );
}
