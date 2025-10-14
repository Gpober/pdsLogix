"use client";

import {
  useState,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import {
  Menu,
  X,
  ChevronLeft,
  TrendingUp,
  Award,
  AlertTriangle,
  CheckCircle,
  Target,
  Home,
} from "lucide-react";
import { useRouter } from "next/navigation";

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
  operating?: number;
  financing?: number;
  investing?: number;
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
  customer?: string | null;
  entryNumber?: string;
  invoiceNumber?: string | null;
}

interface JournalRow {
  account: string;
  account_type: string | null;
  debit: number | null;
  credit: number | null;
  customer: string | null;
  report_category?: string | null;
  normal_balance?: number | null;
  date: string;
  memo?: string | null;
  vendor?: string | null;
  name?: string | null;
  entry_number?: string;
  number?: string | null;
  entry_bank_account?: string | null;
  is_cash_account?: boolean;
}

interface JournalEntryLine {
  date: string;
  account: string;
  memo: string | null;
  customer: string | null;
  debit: number | null;
  credit: number | null;
}

type RankingMetric = "operating" | "netCash" | "investing" | "stability";

const getMonthName = (m: number) =>
  new Date(0, m - 1).toLocaleString("en-US", { month: "long" });

const formatDate = (date: string) =>
  new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

const insights = [
  {
    title: "Strong operating cash",
    message: "Operating activities generated positive cash flow.",
    icon: TrendingUp,
    type: "success" as const,
  },
  {
    title: "Investment activity",
    message: "Significant investing cash flow this period.",
    icon: AlertTriangle,
    type: "warning" as const,
  },
  {
    title: "Stable financing",
    message: "Financing activities remain consistent.",
    icon: CheckCircle,
    type: "info" as const,
  },
];

// Enhanced classification function to mirror cash flow component
const classifyTransaction = (
  accountType: string | null,
  reportCategory: string | null,
) => {
  const typeLower = accountType?.toLowerCase() || "";
  
  if (reportCategory === "transfer") {
    return "transfer";
  }

  // Operating activities - Income and Expenses (mirroring cash flow logic)
  const isReceivable = typeLower.includes("accounts receivable") || typeLower.includes("a/r");
  const isPayable = typeLower.includes("accounts payable") || typeLower.includes("a/p");

  if (
    typeLower === "income" ||
    typeLower === "other income" ||
    typeLower === "expenses" ||
    typeLower === "expense" ||
    typeLower === "cost of goods sold" ||
    isReceivable ||
    isPayable
  ) {
    return "operating";
  }

  // Investing activities - Fixed Assets and Other Assets
  if (
    typeLower === "fixed assets" || 
    typeLower === "other assets" || 
    typeLower === "property, plant & equipment"
  ) {
    return "investing";
  }

  // Financing activities - Liabilities, Equity, Credit Cards
  if (
    typeLower === "long term liabilities" ||
    typeLower === "equity" ||
    typeLower === "credit card" ||
    typeLower === "other current liabilities" ||
    typeLower === "line of credit"
  ) {
    return "financing";
  }

  return "other";
};

export default function CashFlowMobileDashboard() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
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
  const [cfData, setCfData] = useState<{
    operating: Category[];
    financing: Category[];
    investing: Category[];
    totals: {
      debits: number;
      credits: number;
      net: number;
    };
  }>({
    operating: [],
    financing: [],
    investing: [],
    totals: {
      debits: 0,
      credits: 0,
      net: 0,
    },
  });
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [rankingMetric, setRankingMetric] = useState<RankingMetric | null>(null);
  const [journalEntryLines, setJournalEntryLines] = useState<JournalEntryLine[]>([]);
  const [showJournalModal, setShowJournalModal] = useState(false);
  const [journalTitle, setJournalTitle] = useState("");

  const transactionTotal = useMemo(
    () => transactions.reduce((sum, t) => sum + t.amount, 0),
    [transactions],
  );

  const cfTotals = useMemo(() => {
    const operating = cfData.operating.reduce((sum, c) => sum + c.total, 0);
    const financing = cfData.financing.reduce((sum, c) => sum + c.total, 0);
    const investing = cfData.investing.reduce((sum, c) => sum + c.total, 0);
    const net = cfData.totals?.net ?? operating + financing + investing;
    return {
      operating,
      financing,
      investing,
      net,
    };
  }, [cfData]);

  const getDateRange = useCallback(() => {
    const makeUTCDate = (y: number, m: number, d: number) =>
      new Date(Date.UTC(y, m, d));
    const y = year;
    const m = month;
    if (reportPeriod === "Custom" && customStart && customEnd) {
      return { start: customStart, end: customEnd };
    }
    if (reportPeriod === "Monthly") {
      const startDate = makeUTCDate(y, m - 1, 1);
      const endDate = makeUTCDate(y, m, 0);
      return {
        start: startDate.toISOString().split("T")[0],
        end: endDate.toISOString().split("T")[0],
      };
    }
    if (reportPeriod === "Quarterly") {
      const qStart = Math.floor((m - 1) / 3) * 3;
      const startDate = makeUTCDate(y, qStart, 1);
      const endDate = makeUTCDate(y, qStart + 3, 0);
      return {
        start: startDate.toISOString().split("T")[0],
        end: endDate.toISOString().split("T")[0],
      };
    }
    if (reportPeriod === "Year to Date") {
      const startDate = makeUTCDate(y, 0, 1);
      const endDate = makeUTCDate(y, m, 0);
      return {
        start: startDate.toISOString().split("T")[0],
        end: endDate.toISOString().split("T")[0],
      };
    }
    if (reportPeriod === "Trailing 12") {
      const endDate = makeUTCDate(y, m, 0);
      const startDate = makeUTCDate(y, m - 11, 1);
      return {
        start: startDate.toISOString().split("T")[0],
        end: endDate.toISOString().split("T")[0],
      };
    }
    return { start: `${y}-01-01`, end: `${y}-12-31` };
  }, [reportPeriod, month, year, customStart, customEnd]);

  // Load properties data from Supabase
  useEffect(() => {
    const load = async () => {
      const { start, end } = getDateRange();

      const selectColumns = "account, account_type, report_category, normal_balance, debit, credit, customer, date, entry_bank_account, is_cash_account";

      let query = supabase
        .from("journal_entry_lines")
        .select(selectColumns)
        .gte("date", start)
        .lte("date", end)
        .not("entry_bank_account", "is", null)
        .eq("is_cash_account", false)
        .neq("report_category", "transfer");

      const { data } = await query;
      const map: Record<string, PropertySummary> = {};

      ((data as JournalRow[]) || []).forEach((row) => {
        const customer = row.customer || "General";
        if (!map[customer]) {
          map[customer] = {
            name: customer,
            operating: 0,
            financing: 0,
            investing: 0,
          };
        }

        const debit = Number(row.debit) || 0;
        const credit = Number(row.credit) || 0;

        const classification = classifyTransaction(row.account_type, row.report_category);

        if (classification !== "other" && classification !== "transfer") {
          const cashImpact = row.report_category === "transfer"
            ? debit - credit
            : row.normal_balance || credit - debit;

          if (classification === "operating") {
            map[customer].operating = (map[customer].operating || 0) + cashImpact;
          } else if (classification === "financing") {
            map[customer].financing = (map[customer].financing || 0) + cashImpact;
          } else if (classification === "investing") {
            map[customer].investing = (map[customer].investing || 0) + cashImpact;
          }
        }
      });

      const list = Object.values(map).filter((p) => {
        return (p.operating || 0) !== 0 || (p.financing || 0) !== 0 || (p.investing || 0) !== 0;
      });

      const finalList =
        map["General"] && !list.find((p) => p.name === "General")
          ? [...list, map["General"]]
          : list;

      setProperties(finalList);
    };
    load();
  }, [reportPeriod, month, year, customStart, customEnd, getDateRange]);

  const cashKing = useMemo(() => {
    if (!properties.length) return null;
    return properties.reduce((max, p) =>
      (p.operating || 0) > (max.operating || 0) ? p : max,
    properties[0]).name;
  }, [properties]);

  const flowMaster = useMemo(() => {
    if (!properties.length) return null;
    return properties.reduce((max, p) => {
      const netP = (p.operating || 0) + (p.financing || 0) + (p.investing || 0);
      const netM = (max.operating || 0) + (max.financing || 0) + (max.investing || 0);
      return netP > netM ? p : max;
    }, properties[0]).name;
  }, [properties]);

  const companyTotals = properties.reduce(
    (acc, p) => {
      acc.operating += p.operating || 0;
      acc.financing += p.financing || 0;
      acc.investing += p.investing || 0;
      acc.net += (p.operating || 0) + (p.financing || 0) + (p.investing || 0);
      return acc;
    },
    { operating: 0, financing: 0, investing: 0, net: 0 }
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

  const rankingLabels: Record<RankingMetric, string> = {
    operating: "Operating Cash",
    netCash: "Net Cash",
    investing: "Investing",
    stability: "Net Cash",
  };

  const rankedProperties = useMemo(() => {
    if (!rankingMetric) return [];
    const arr = [...properties];
    switch (rankingMetric) {
      case "operating":
        return arr.sort((a, b) => (b.operating || 0) - (a.operating || 0));
      case "netCash":
        return arr.sort(
          (a, b) =>
            (b.operating || 0) + (b.financing || 0) + (b.investing || 0) -
            ((a.operating || 0) + (a.financing || 0) + (a.investing || 0)),
        );
      case "investing":
        return arr.sort((a, b) => (a.investing || 0) - (b.investing || 0));
      case "stability":
        return arr.sort(
          (a, b) =>
            (b.operating || 0) + (b.financing || 0) + (b.investing || 0) -
            ((a.operating || 0) + (a.financing || 0) + (a.investing || 0)),
        );
      default:
        return arr;
    }
  }, [properties, rankingMetric]);

  const formatRankingValue = (p: PropertySummary) => {
    switch (rankingMetric) {
      case "netCash":
      case "stability":
        return formatCompactCurrency(
          (p.operating || 0) + (p.financing || 0) + (p.investing || 0),
        );
      case "operating":
        return formatCompactCurrency(p.operating || 0);
      case "investing":
        return formatCompactCurrency(p.investing || 0);
      default:
        return formatCompactCurrency(0);
    }
  };

  const showRanking = (metric: RankingMetric) => {
    setRankingMetric(metric);
    setView("summary");
  };

  const handlePropertySelect = async (name: string | null) => {
    setSelectedProperty(name);
    await loadCF(name);
    setView("report");
  };

  const loadCF = async (propertyName: string | null = selectedProperty) => {
    const { start, end } = getDateRange();
    
    const selectColumns = "account, account_type, report_category, normal_balance, debit, credit, customer, date, entry_bank_account, is_cash_account";
    
    let query = supabase
      .from("journal_entry_lines")
      .select(selectColumns)
      .gte("date", start)
      .lte("date", end)
      .not("entry_bank_account", "is", null)
      .neq("report_category", "transfer");

    if (propertyName) {
      query =
        propertyName === "General"
          ? query.is("customer", null)
          : query.eq("customer", propertyName);
    }
    
    const { data } = await query;
    let totalDebits = 0;
    let totalCredits = 0;
    const op: Record<string, number> = {};
    const fin: Record<string, number> = {};
    const inv: Record<string, number> = {};
    
    ((data as JournalRow[]) || []).forEach((row) => {
      const debitRaw = Number(row.debit ?? 0);
      const creditRaw = Number(row.credit ?? 0);
      const debit = Number.isNaN(debitRaw) ? 0 : debitRaw;
      const credit = Number.isNaN(creditRaw) ? 0 : creditRaw;

      if (row.entry_bank_account && row.is_cash_account) {
        totalDebits += debit;
        totalCredits += credit;
      }

      if (row.is_cash_account) {
        return;
      }

      const classification = classifyTransaction(
        row.account_type,
        row.report_category,
      );

      if (classification !== "other" && classification !== "transfer") {
        const cashImpact = debit - credit;

        if (classification === "operating") {
          op[row.account] = (op[row.account] || 0) + cashImpact;
        } else if (classification === "financing") {
          fin[row.account] = (fin[row.account] || 0) + cashImpact;
        } else if (classification === "investing") {
          inv[row.account] = (inv[row.account] || 0) + cashImpact;
        }
      }
    });
    
    const operatingArr = Object.entries(op)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);
    const financingArr = Object.entries(fin)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);
    const investingArr = Object.entries(inv)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);
      
    setCfData({
      operating: operatingArr,
      financing: financingArr,
      investing: investingArr,
      totals: {
        debits: totalDebits,
        credits: totalCredits,
        net: totalDebits - totalCredits,
      },
    });
  };

  const handleCategory = async (account: string, type: "operating" | "financing" | "investing") => {
    const { start, end } = getDateRange();
    
    let query = supabase
      .from("journal_entry_lines")
      .select(
        "date, debit, credit, account, customer, report_category, normal_balance, memo, vendor, name, entry_number, number",
      )
      .eq("account", account)
      .gte("date", start)
      .lte("date", end)
      .not("entry_bank_account", "is", null)
      .eq("is_cash_account", false)
      .neq("report_category", "transfer");

    if (selectedProperty) {
      query =
        selectedProperty === "General"
          ? query.is("customer", null)
          : query.eq("customer", selectedProperty);
    }
    
    const { data } = await query;
    const list: Transaction[] = ((data as JournalRow[]) || [])
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((row) => {
        const debit = Number(row.debit) || 0;
        const credit = Number(row.credit) || 0;
        
        const amount = row.report_category === "transfer" 
          ? debit - credit
          : row.normal_balance || credit - debit;
        
        return {
          date: row.date,
          amount,
          running: 0,
          payee: row.vendor || row.name,
          memo: row.memo,
          customer: row.customer,
          entryNumber: row.entry_number,
          invoiceNumber: row.number,
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

  const openJournalEntry = async (entryNumber?: string) => {
    if (!entryNumber) return;
    
    const { data, error } = await supabase
      .from("journal_entry_lines")
      .select("date, account, memo, customer, debit, credit")
      .eq("entry_number", entryNumber)
      .order("line_sequence");
      
    if (error) {
      console.error("Error fetching journal entry lines:", error);
      return;
    }

    setJournalEntryLines(data || []);
    setJournalTitle(`Journal Entry ${entryNumber}`);
    setShowJournalModal(true);
  };

  const back = () => {
    if (view === "detail") setView("report");
    else if (view === "report") setView("overview");
    else if (view === "summary") {
      setRankingMetric(null);
      setView("overview");
    }
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
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
      `}</style>

      {/* Enhanced Header */}
      <header style={{
        background: `linear-gradient(135deg, ${BRAND_COLORS.success}, #2ECC71)`,
        borderRadius: '16px',
        padding: '20px',
        marginBottom: '24px',
        color: 'white',
        boxShadow: `0 8px 32px ${BRAND_COLORS.success}33`
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
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer'
            }}
          >
            <Home size={20} />
          </button>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="absolute right-0"
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
            Cash Flow Dashboard
          </h1>
          <p style={{ fontSize: '14px', opacity: 0.9 }}>
            {getMonthName(month)} {year} • {properties.length} Customers
          </p>
        </div>

        {/* Company Total */}
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
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                {formatCompactCurrency(companyTotals.operating)}
              </div>
              <div style={{ fontSize: '11px', opacity: 0.8 }}>Operating</div>
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                {formatCompactCurrency(companyTotals.financing)}
              </div>
              <div style={{ fontSize: '11px', opacity: 0.8 }}>Financing</div>
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                {formatCompactCurrency(companyTotals.investing)}
              </div>
              <div style={{ fontSize: '11px', opacity: 0.8 }}>Investing</div>
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                {formatCompactCurrency(companyTotals.net)}
              </div>
              <div style={{ fontSize: '11px', opacity: 0.8 }}>Net Cash</div>
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
              background: `linear-gradient(135deg, ${BRAND_COLORS.success}, #2ECC71)`,
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
            boxShadow: '0 4px 20px rgba(39, 174, 96, 0.1)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
              <Target size={20} style={{ color: BRAND_COLORS.success }} />
              <h3 style={{ fontSize: '18px', fontWeight: '600', color: BRAND_COLORS.success }}>
                Customer Insights
              </h3>
            </div>
            
            {/* Awards Section */}
            <div style={{
              background: `linear-gradient(135deg, ${BRAND_COLORS.gray[50]}, #f0fdf4)`,
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '16px',
              border: `1px solid ${BRAND_COLORS.success}33`
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                <Award size={16} style={{ color: BRAND_COLORS.success }} />
                <span style={{ fontSize: '14px', fontWeight: '600', color: BRAND_COLORS.success }}>
                  Customer Champions
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                <div onClick={() => showRanking("operating")} style={{
                  background: 'white',
                  borderRadius: '8px',
                  padding: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  border: `1px solid ${BRAND_COLORS.primary}33`,
                  cursor: 'pointer'
                }}>
                  <span style={{ fontSize: '20px' }}>💰</span>
                  <div>
                    <div style={{ fontSize: '11px', color: BRAND_COLORS.primary, fontWeight: '600' }}>
                      CASH KING
                    </div>
                    <div style={{ fontSize: '10px', color: '#64748b' }}>
                      {cashKing}
                    </div>
                  </div>
                </div>
                <div onClick={() => showRanking("netCash")} style={{
                  background: 'white',
                  borderRadius: '8px',
                  padding: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  border: `1px solid ${BRAND_COLORS.success}33`,
                  cursor: 'pointer'
                }}>
                  <span style={{ fontSize: '20px' }}>⚡</span>
                  <div>
                    <div style={{ fontSize: '11px', color: BRAND_COLORS.success, fontWeight: '600' }}>
                      FLOW MASTER
                    </div>
                    <div style={{ fontSize: '10px', color: '#64748b' }}>
                      {flowMaster}
                    </div>
                  </div>
                </div>
                <div onClick={() => showRanking("investing")} style={{
                  background: 'white',
                  borderRadius: '8px',
                  padding: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  border: `1px solid ${BRAND_COLORS.warning}33`,
                  cursor: 'pointer'
                }}>
                  <span style={{ fontSize: '20px' }}>🎯</span>
                  <div>
                    <div style={{ fontSize: '11px', color: BRAND_COLORS.warning, fontWeight: '600' }}>
                      EFFICIENCY ACE
                    </div>
                    <div style={{ fontSize: '10px', color: '#64748b' }}>
                      {properties.find(p => (p.investing || 0) === Math.min(...properties.map(prop => prop.investing || 0)))?.name}
                    </div>
                  </div>
                </div>
                <div onClick={() => showRanking("stability")} style={{
                  background: 'white',
                  borderRadius: '8px',
                  padding: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  border: `1px solid ${BRAND_COLORS.secondary}33`,
                  cursor: 'pointer'
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
              </div>
            </div>

            <div style={{ display: 'grid', gap: '12px' }}>
              {insights.map((insight, index) => {
                const Icon = insight.icon;
                const bgColor = insight.type === 'success' ? '#f0fdf4' :
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

          {/* Enhanced Customer KPI Boxes */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
            {properties.map((p) => {
              const isCashKing = p.name === cashKing;
              const isFlowMaster = p.name === flowMaster;
              
              return (
                <div
                  key={p.name}
                  onClick={() => handlePropertySelect(p.name)}
                  style={{
                    background: selectedProperty === p.name 
                      ? `linear-gradient(135deg, ${BRAND_COLORS.success}15, #2ECC7115)` 
                      : 'white',
                    border: selectedProperty === p.name 
                      ? `3px solid ${BRAND_COLORS.success}` 
                      : `2px solid ${BRAND_COLORS.gray[200]}`,
                    borderRadius: '16px',
                    padding: '18px',
                    cursor: 'pointer',
                    transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: selectedProperty === p.name 
                      ? `0 8px 32px ${BRAND_COLORS.success}40, 0 0 0 1px ${BRAND_COLORS.success}20` 
                      : '0 4px 16px rgba(0, 0, 0, 0.08)',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                  onMouseOver={(e) => {
                    if (selectedProperty !== p.name) {
                      e.currentTarget.style.borderColor = BRAND_COLORS.success;
                      e.currentTarget.style.transform = 'translateY(-4px) scale(1.02)';
                      e.currentTarget.style.boxShadow = `0 12px 32px ${BRAND_COLORS.success}30`;
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
                    background: `linear-gradient(135deg, ${BRAND_COLORS.success}20, #2ECC7110)`,
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
                      {isCashKing && (
                        <div style={{
                          background: `linear-gradient(135deg, ${BRAND_COLORS.primary}, #0ea5e9)`,
                          borderRadius: '12px',
                          padding: '4px 6px',
                          boxShadow: '0 2px 8px rgba(14, 165, 233, 0.3)'
                        }}>
                          <span style={{ fontSize: '16px' }}>💰</span>
                        </div>
                      )}
                      {isFlowMaster && (
                        <div style={{
                          background: `linear-gradient(135deg, ${BRAND_COLORS.success}, #22c55e)`,
                          borderRadius: '12px',
                          padding: '4px 6px',
                          boxShadow: '0 2px 8px rgba(34, 197, 94, 0.3)'
                        }}>
                          <span style={{ fontSize: '16px' }}>⚡</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div style={{ display: 'grid', gap: '6px' }}>
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between',
                      padding: '6px 10px',
                      background: `${BRAND_COLORS.primary}08`,
                      borderRadius: '6px',
                      border: `1px solid ${BRAND_COLORS.primary}20`
                    }}>
                      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '500' }}>Operating</span>
                      <span style={{ 
                        fontSize: '12px', 
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
                      padding: '6px 10px',
                      background: `${BRAND_COLORS.secondary}08`,
                      borderRadius: '6px',
                      border: `1px solid ${BRAND_COLORS.secondary}20`
                    }}>
                      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '500' }}>Financing</span>
                      <span style={{ 
                        fontSize: '12px', 
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
                      padding: '6px 10px',
                      background: `${BRAND_COLORS.warning}08`,
                      borderRadius: '6px',
                      border: `1px solid ${BRAND_COLORS.warning}20`
                    }}>
                      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '500' }}>Investing</span>
                      <span style={{ 
                        fontSize: '12px', 
                        fontWeight: '700',
                        color: BRAND_COLORS.warning,
                        textShadow: '0 1px 2px rgba(0,0,0,0.1)'
                      }}>
                        {formatCompactCurrency(p.investing || 0)}
                      </span>
                    </div>
                    
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between',
                      padding: '10px',
                      background: `linear-gradient(135deg, ${BRAND_COLORS.success}10, #2ECC7105)`,
                      borderRadius: '8px',
                      border: `2px solid ${BRAND_COLORS.success}30`,
                      boxShadow: `0 4px 12px ${BRAND_COLORS.success}20`
                    }}>
                      <span style={{ fontSize: '12px', fontWeight: '700', color: BRAND_COLORS.success }}>Net Cash</span>
                      <span style={{ 
                        fontSize: '14px', 
                        fontWeight: '800',
                        color: ((p.operating || 0) + (p.financing || 0) + (p.investing || 0)) >= 0 ? BRAND_COLORS.success : BRAND_COLORS.danger,
                        textShadow: '0 1px 3px rgba(0,0,0,0.2)'
                      }}>
                        {formatCompactCurrency((p.operating || 0) + (p.financing || 0) + (p.investing || 0))}
                      </span>
                    </div>
                  </div>
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
                color: BRAND_COLORS.success
              }}
            >
              Company Total Net Cash Flow
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
              color: BRAND_COLORS.success,
              marginBottom: '20px',
              cursor: 'pointer'
            }}
          >
            <ChevronLeft size={20} style={{ marginRight: '4px' }} />
            Back to Overview
          </button>

          <div
            style={{
              background: `linear-gradient(135deg, ${BRAND_COLORS.success}, #2ECC71)`,
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
                <span style={{ fontWeight: '600', color: BRAND_COLORS.success }}>
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
              color: BRAND_COLORS.success,
              marginBottom: '20px',
              cursor: 'pointer'
            }}
          >
            <ChevronLeft size={20} style={{ marginRight: '4px' }} /> 
            Back to Customers
          </button>
          
          <div style={{
            background: `linear-gradient(135deg, ${BRAND_COLORS.success}, #2ECC71)`,
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '24px',
            color: 'white'
          }}>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
              {selectedProperty || "Company Total"} - Cash Flow Statement
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

            {/* Investing Activities Section */}
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
                Investing Activities
              </h3>
              {cfData.investing.map((cat) => (
                <div
                  key={cat.name}
                  onClick={() => handleCategory(cat.name, "investing")}
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
              color: cfTotals.net >= 0 ? BRAND_COLORS.success : BRAND_COLORS.danger,
            }}
          >
            Net Cash Flow: {formatCurrency(cfTotals.net)}
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
              color: BRAND_COLORS.success,
              marginBottom: '20px',
              cursor: 'pointer'
            }}
          >
            <ChevronLeft size={20} style={{ marginRight: '4px' }} />
            Back to Cash Flow
          </button>

          <div style={{
            background: `linear-gradient(135deg, ${BRAND_COLORS.success}, #2ECC71)`,
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: '8px', fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>
                  <div style={{ fontWeight: '600' }}>DATE</div>
                  <div style={{ fontWeight: '600' }}>PAYEE/CUSTOMER</div>
                  <div style={{ fontWeight: '600' }}>INVOICE #</div>
                  <div style={{ fontWeight: '600' }}>MEMO</div>
                  <div style={{ fontWeight: '600', textAlign: 'right' }}>AMOUNT</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: '8px', alignItems: 'center' }}>
                  <div style={{ fontSize: '14px', fontWeight: '500' }}>
                    {formatDate(t.date)}
                  </div>
                  <div>
                    {t.payee && <div style={{ fontSize: '13px', color: '#475569', fontWeight: '500' }}>{t.payee}</div>}
                    {t.customer && <div style={{ fontSize: '11px', color: '#94a3b8' }}>{t.customer}</div>}
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: '500', color: '#475569' }}>
                    {t.invoiceNumber}
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>{t.memo}</div>
                  <div style={{ fontSize: '14px', fontWeight: '700', textAlign: 'right', color: t.amount >= 0 ? BRAND_COLORS.success : BRAND_COLORS.danger }}>
                    {formatCurrency(t.amount)}
                  </div>
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
              color: transactionTotal >= 0 ? BRAND_COLORS.success : BRAND_COLORS.danger
            }}
          >
            Total Net Cash Flow: {formatCurrency(transactionTotal)}
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
            <div style={{ overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '8px', fontSize: '12px', color: '#475569' }}>Date</th>
                    <th style={{ textAlign: 'left', padding: '8px', fontSize: '12px', color: '#475569' }}>Account</th>
                    <th style={{ textAlign: 'left', padding: '8px', fontSize: '12px', color: '#475569' }}>Memo</th>
                    <th style={{ textAlign: 'left', padding: '8px', fontSize: '12px', color: '#475569' }}>Customer</th>
                    <th style={{ textAlign: 'right', padding: '8px', fontSize: '12px', color: '#475569' }}>Debit</th>
                    <th style={{ textAlign: 'right', padding: '8px', fontSize: '12px', color: '#475569' }}>Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {journalEntryLines.map((line, idx) => (
                    <tr key={idx} style={{ borderTop: `1px solid ${BRAND_COLORS.gray[100]}` }}>
                      <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>{formatDate(line.date)}</td>
                      <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>{line.account}</td>
                      <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>{line.memo}</td>
                      <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>{line.customer || ''}</td>
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
  );
}
