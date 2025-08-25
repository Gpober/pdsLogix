"use client";

import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
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
  Bot,
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
  cogs?: number;
  expenses?: number;
  netIncome?: number;
  operating?: number;
  financing?: number;
  investing?: number;
  current?: number;
  days30?: number;
  days60?: number;
  days90?: number;
  over90?: number;
  total?: number;
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

interface ARTransaction {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  amount: number;
  daysOutstanding: number;
  customer: string;
  memo?: string | null;
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

const getMonthName = (m: number) =>
  new Date(0, m - 1).toLocaleString("en-US", { month: "long" });

const calculateDaysOutstanding = (dueDate: string) => {
  const due = new Date(dueDate);
  const today = new Date();
  const diff = today.getTime() - due.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
};

const getAgingBucket = (days: number): string => {
  if (days <= 30) return "current";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  if (days <= 120) return "91-120";
  return "120+";
};

const getAgingColor = (days: number) => {
  if (days <= 30) return BRAND_COLORS.success;
  if (days <= 60) return BRAND_COLORS.warning;
  if (days <= 90) return "#f59e0b";
  return BRAND_COLORS.danger;
};

type Insight = {
  title: string;
  message: string;
  icon: LucideIcon;
  type: "success" | "warning" | "info";
};

type RankingMetric =
  | "revenue"
  | "margin"
  | "netIncome"
  | "growth"
  | "operating"
  | "netCash"
  | "investing"
  | "stability"
  | "cogs"
  | "arTotal"
  | "arCurrent"
  | "arOverdue";

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
  const [reportType, setReportType] = useState<"pl" | "cf" | "ar">("pl");
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
  const [plData, setPlData] = useState<{ revenue: Category[]; cogs: Category[]; expenses: Category[] }>({
    revenue: [],
    cogs: [],
    expenses: [],
  });
  const [cfData, setCfData] = useState<{
    operating: Category[];
    financing: Category[];
    investing: Category[];
  }>({
    operating: [],
    financing: [],
    investing: [],
  });
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [arTransactions, setArTransactions] = useState<ARTransaction[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [rankingMetric, setRankingMetric] = useState<RankingMetric | null>(null);
  const [journalEntryLines, setJournalEntryLines] = useState<JournalEntryLine[]>([]);
  const [showJournalModal, setShowJournalModal] = useState(false);
  const [journalTitle, setJournalTitle] = useState("");

  // AI CFO State
  const [showModal, setShowModal] = useState(false);

  const buttonRef = useRef<HTMLDivElement>(null);

  const closeModal = () => {
    setShowModal(false);
  };

  const openAIModal = () => {
    setShowModal(true);
  };

  const transactionTotal = useMemo(
    () => transactions.reduce((sum, t) => sum + t.amount, 0),
    [transactions],
  );

  const arTransactionTotal = useMemo(
    () => arTransactions.reduce((sum, t) => sum + t.amount, 0),
    [arTransactions],
  );

  const filteredARTransactions = useMemo(() => {
    return arTransactions.filter((t) => {
      const bucket = getAgingBucket(t.daysOutstanding);
      if (selectedCategory === "90+") {
        return bucket === "91-120" || bucket === "120+";
      }
      return bucket === selectedCategory;
    });
  }, [arTransactions, selectedCategory]);

  const filteredARTotal = useMemo(
    () => filteredARTransactions.reduce((sum, t) => sum + t.amount, 0),
    [filteredARTransactions],
  );

  const bucketLabels: Record<string, string> = {
    current: "Current (0-30 Days)",
    "31-60": "31-60 Days",
    "61-90": "61-90 Days",
    "90+": "90+ Days",
  };

  const plTotals = useMemo(() => {
    const revenue = plData.revenue.reduce((sum, c) => sum + c.total, 0);
    const cogs = plData.cogs.reduce((sum, c) => sum + c.total, 0);
    const expenses = plData.expenses.reduce((sum, c) => sum + c.total, 0);
    const grossProfit = revenue - cogs;
    const net = grossProfit - expenses;
    return { revenue, cogs, grossProfit, expenses, net };
  }, [plData]);

  const cfTotals = useMemo(() => {
    const operating = cfData.operating.reduce((sum, c) => sum + c.total, 0);
    const financing = cfData.financing.reduce((sum, c) => sum + c.total, 0);
    const investing = cfData.investing.reduce((sum, c) => sum + c.total, 0);
    return { 
      operating, 
      financing, 
      investing,
      net: operating + financing + investing
    };
  }, [cfData]);

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
      if (reportType === "ar") {
        const { data } = await supabase
          .from("ar_aging_detail")
          .select("*")
          .gt("open_balance", 0);
        const map: Record<string, PropertySummary> = {};
        (data || []).forEach((rec: any) => {
          const customer = rec.customer || "General";
          if (!map[customer]) {
            map[customer] = {
              name: customer,
              current: 0,
              days30: 0,
              days60: 0,
              days90: 0,
              over90: 0,
              total: 0,
            };
          }
          const amt = Number(rec.open_balance) || 0;
          const days = calculateDaysOutstanding(rec.due_date);
          const bucket = getAgingBucket(days);
          if (bucket === "current") map[customer].current = (map[customer].current || 0) + amt;
          else if (bucket === "31-60") map[customer].days30 = (map[customer].days30 || 0) + amt;
          else if (bucket === "61-90") map[customer].days60 = (map[customer].days60 || 0) + amt;
          else if (bucket === "91-120") map[customer].days90 = (map[customer].days90 || 0) + amt;
          else map[customer].over90 = (map[customer].over90 || 0) + amt;
          map[customer].total = (map[customer].total || 0) + amt;
        });
        setProperties(Object.values(map));
        return;
      }

      const { start, end } = getDateRange();

      const selectColumns = "account_type, report_category, normal_balance, debit, credit, customer, date, entry_bank_account, is_cash_account";

      let query = supabase
        .from("journal_entry_lines")
        .select(selectColumns)
        .gte("date", start)
        .lte("date", end);

      if (reportType === "cf") {
        query = query
          .not("entry_bank_account", "is", null)
          .eq("is_cash_account", false)
          .neq("report_category", "transfer");
      }

      const { data } = await query;
      const map: Record<string, PropertySummary> = {};

      ((data as JournalRow[]) || []).forEach((row) => {
        const customer = row.customer || "General";
        if (!map[customer]) {
          map[customer] = {
            name: customer,
            revenue: 0,
            cogs: 0,
            expenses: 0,
            netIncome: 0,
            operating: 0,
            financing: 0,
            investing: 0,
          };
        }

        const debit = Number(row.debit) || 0;
        const credit = Number(row.credit) || 0;

        if (reportType === "pl") {
          const t = (row.account_type || "").toLowerCase();
          if (t.includes("income") || t.includes("revenue")) {
            map[customer].revenue = (map[customer].revenue || 0) + (credit - debit);
          } else if (t.includes("cost of goods sold") || t.includes("cogs")) {
            const amt = debit - credit;
            map[customer].cogs = (map[customer].cogs || 0) + amt;
          } else if (t.includes("expense")) {
            const amt = debit - credit;
            map[customer].expenses = (map[customer].expenses || 0) + amt;
          }
          map[customer].netIncome = (map[customer].revenue || 0) - (map[customer].cogs || 0) - (map[customer].expenses || 0);
        } else {
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
        }
      });

      const list = Object.values(map).filter((p) => {
        return reportType === "pl"
          ? (p.revenue || 0) !== 0 || (p.cogs || 0) !== 0 || (p.expenses || 0) !== 0 || (p.netIncome || 0) !== 0
          : (p.operating || 0) !== 0 || (p.financing || 0) !== 0 || (p.investing || 0) !== 0;
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

  const cogsChamp = useMemo(() => {
    if (reportType !== "pl" || !properties.length) return null;
    return properties.reduce((min, p) => {
      const cogsRatioP = p.revenue ? (p.cogs || 0) / p.revenue : Infinity;
      const cogsRatioMin = min.revenue ? (min.cogs || 0) / min.revenue : Infinity;
      return cogsRatioP < cogsRatioMin ? p : min;
    }, properties[0]).name;
  }, [properties, reportType]);

  const cashKing = useMemo(() => {
    if (reportType !== "cf" || !properties.length) return null;
    return properties.reduce((max, p) =>
      (p.operating || 0) > (max.operating || 0) ? p : max,
    properties[0]).name;
  }, [properties, reportType]);

  const flowMaster = useMemo(() => {
    if (reportType !== "cf" || !properties.length) return null;
    return properties.reduce((max, p) => {
      const netP = (p.operating || 0) + (p.financing || 0) + (p.investing || 0);
      const netM = (max.operating || 0) + (max.financing || 0) + (max.investing || 0);
      return netP > netM ? p : max;
    }, properties[0]).name;
  }, [properties, reportType]);

  const arKing = useMemo(() => {
    if (reportType !== "ar" || !properties.length) return null;
    return properties.reduce((max, p) =>
      (p.total || 0) > (max.total || 0) ? p : max,
    properties[0]).name;
  }, [properties, reportType]);

  const currentChamp = useMemo(() => {
    if (reportType !== "ar" || !properties.length) return null;
    return properties.reduce((max, p) => {
      const ratioP = p.total ? (p.current || 0) / (p.total || 1) : 0;
      const ratioM = max.total ? (max.current || 0) / (max.total || 1) : 0;
      return ratioP > ratioM ? p : max;
    }, properties[0]).name;
  }, [properties, reportType]);

  const overdueAlert = useMemo(() => {
    if (reportType !== "ar" || !properties.length) return null;
    return properties.reduce((max, p) => {
      const overdueP = (p.total || 0) - (p.current || 0);
      const overdueM = (max.total || 0) - (max.current || 0);
      return overdueP > overdueM ? p : max;
    }, properties[0]).name;
  }, [properties, reportType]);

  const avgDays = useMemo(() => {
    if (reportType !== "ar" || !properties.length) return 0;
    const weighted = properties.reduce((sum, p) =>
      sum + ((p.current || 0) * 15 + (p.days30 || 0) * 45 + (p.days60 || 0) * 75 + (p.days90 || 0) * 105 + (p.over90 || 0) * 135),
    0);
    const total = properties.reduce((sum, p) => sum + (p.total || 0), 0);
    return total ? Math.round(weighted / total) : 0;
  }, [properties, reportType]);

  const companyTotals = properties.reduce(
    (acc, p) => {
      if (reportType === "pl") {
        acc.revenue += p.revenue || 0;
        acc.cogs += p.cogs || 0;
        acc.expenses += p.expenses || 0;
        acc.net += p.netIncome || 0;
      } else if (reportType === "cf") {
        acc.operating += p.operating || 0;
        acc.financing += p.financing || 0;
        acc.investing += p.investing || 0;
        acc.net += (p.operating || 0) + (p.financing || 0) + (p.investing || 0);
      } else {
        acc.current += p.current || 0;
        acc.days30 += p.days30 || 0;
        acc.days60 += p.days60 || 0;
        acc.days90 += p.days90 || 0;
        acc.over90 += p.over90 || 0;
        acc.net += p.total || 0;
      }
      return acc;
    },
    {
      revenue: 0,
      cogs: 0,
      expenses: 0,
      net: 0,
      operating: 0,
      financing: 0,
      investing: 0,
      current: 0,
      days30: 0,
      days60: 0,
      days90: 0,
      over90: 0,
    },
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
    revenue: "Revenue",
    margin: "Margin",
    netIncome: "Net Income",
    cogs: "COGS Efficiency",
    growth: "Revenue",
    operating: "Operating Cash",
    netCash: "Net Cash",
    investing: "Investing",
    stability: "Net Cash",
    arTotal: "Total A/R",
    arCurrent: "Current Ratio",
    arOverdue: "Overdue A/R",
  };

  const rankedProperties = useMemo(() => {
    if (!rankingMetric) return [];
    const arr = [...properties];
    switch (rankingMetric) {
      case "revenue":
        return arr.sort((a, b) => (b.revenue || 0) - (a.revenue || 0));
      case "margin":
        return arr.sort((a, b) => {
          const mA = a.revenue ? (a.netIncome || 0) / (a.revenue || 1) : -Infinity;
          const mB = b.revenue ? (b.netIncome || 0) / (b.revenue || 1) : -Infinity;
          return mB - mA;
        });
      case "cogs":
        return arr.sort((a, b) => {
          const cogsRatioA = a.revenue ? (a.cogs || 0) / a.revenue : Infinity;
          const cogsRatioB = b.revenue ? (b.cogs || 0) / b.revenue : Infinity;
          return cogsRatioA - cogsRatioB; // Lower COGS ratio is better
        });
      case "netIncome":
        return arr.sort((a, b) => (b.netIncome || 0) - (a.netIncome || 0));
      case "growth":
        return arr.sort((a, b) => (b.revenue || 0) - (a.revenue || 0));
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
      case "arTotal":
        return arr.sort((a, b) => (b.total || 0) - (a.total || 0));
      case "arCurrent":
        return arr.sort((a, b) => {
          const rA = a.total ? (a.current || 0) / (a.total || 1) : 0;
          const rB = b.total ? (b.current || 0) / (b.total || 1) : 0;
          return rB - rA;
        });
      case "arOverdue":
        return arr.sort(
          (a, b) =>
            ((b.total || 0) - (b.current || 0)) -
            ((a.total || 0) - (a.current || 0)),
        );
      default:
        return arr;
    }
  }, [properties, rankingMetric]);

  const formatRankingValue = (p: PropertySummary) => {
    switch (rankingMetric) {
      case "margin":
        const m = p.revenue ? (p.netIncome || 0) / (p.revenue || 1) : 0;
        return `${(m * 100).toFixed(1)}%`;
      case "cogs":
        const cogsRatio = p.revenue ? (p.cogs || 0) / p.revenue : 0;
        return `${(cogsRatio * 100).toFixed(1)}%`;
      case "netCash":
        return formatCompactCurrency(
          (p.operating || 0) + (p.financing || 0) + (p.investing || 0),
        );
      case "operating":
        return formatCompactCurrency(p.operating || 0);
      case "investing":
        return formatCompactCurrency(p.investing || 0);
      case "revenue":
        return formatCompactCurrency(p.revenue || 0);
      case "growth":
        return formatCompactCurrency(p.revenue || 0);
      case "arTotal":
        return formatCompactCurrency(p.total || 0);
      case "arCurrent":
        const rc = p.total ? (p.current || 0) / (p.total || 1) : 0;
        return `${(rc * 100).toFixed(1)}%`;
      case "arOverdue":
        return formatCompactCurrency((p.total || 0) - (p.current || 0));
      case "netIncome":
      default:
        return formatCompactCurrency(p.netIncome || 0);
    }
  };

  const showRanking = (metric: RankingMetric) => {
    setRankingMetric(metric);
    setView("summary");
  };

  const showARTransactions = (bucket: string) => {
    setSelectedCategory(bucket);
    setView("detail");
  };

  const handlePropertySelect = async (name: string | null) => {
    setSelectedProperty(name);
    if (reportType === "pl") await loadPL(name);
    else if (reportType === "cf") await loadCF(name);
    else await loadAR(name);
    setView("report");
  };

  const loadPL = async (propertyName: string | null = selectedProperty) => {
    const { start, end } = getDateRange();
    let query = supabase
      .from("journal_entry_lines")
      .select("account, account_type, debit, credit, customer, date")
      .gte("date", start)
      .lte("date", end);
    if (propertyName) {
      query =
        propertyName === "General"
          ? query.is("customer", null)
          : query.eq("customer", propertyName);
    }
    const { data } = await query;
    const rev: Record<string, number> = {};
    const cogs: Record<string, number> = {};
    const exp: Record<string, number> = {};
    ((data as JournalRow[]) || []).forEach((row) => {
      const debit = Number(row.debit) || 0;
      const credit = Number(row.credit) || 0;
      const t = (row.account_type || "").toLowerCase();
      
      if (t.includes("income") || t.includes("revenue")) {
        const amount = credit - debit;
        rev[row.account] = (rev[row.account] || 0) + amount;
      } else if (t.includes("cost of goods sold") || t.includes("cogs")) {
        const cogsAmount = debit - credit;
        cogs[row.account] = (cogs[row.account] || 0) + cogsAmount;
      } else if (t.includes("expense")) {
        const expAmount = debit - credit;
        exp[row.account] = (exp[row.account] || 0) + expAmount;
      }
    });
    setPlData({
      revenue: Object.entries(rev).map(([name, total]) => ({ name, total })),
      cogs: Object.entries(cogs).map(([name, total]) => ({ name, total })),
      expenses: Object.entries(exp).map(([name, total]) => ({ name, total })),
    });
  };

  const loadCF = async (propertyName: string | null = selectedProperty) => {
    const { start, end } = getDateRange();
    
    // Enhanced query mirroring cash flow component
    const selectColumns = "account, account_type, report_category, normal_balance, debit, credit, customer, date, entry_bank_account, is_cash_account";
    
    let query = supabase
      .from("journal_entry_lines")
      .select(selectColumns)
      .gte("date", start)
      .lte("date", end)
      .not("entry_bank_account", "is", null)  // Must have bank account source
      .eq("is_cash_account", false)           // Only non-cash transactions
      .neq("report_category", "transfer");    // Exclude transfers

    if (propertyName) {
      query =
        propertyName === "General"
          ? query.is("customer", null)
          : query.eq("customer", propertyName);
    }
    
    const { data } = await query;
    const op: Record<string, number> = {};
    const fin: Record<string, number> = {};
    const inv: Record<string, number> = {};
    
    ((data as JournalRow[]) || []).forEach((row) => {
      const debit = Number(row.debit) || 0;
      const credit = Number(row.credit) || 0;
      
      // Enhanced cash impact calculation mirroring cash flow component
      const classification = classifyTransaction(row.account_type, row.report_category);
      
      if (classification !== "other" && classification !== "transfer") {
        const cashImpact = row.report_category === "transfer" 
          ? debit - credit  // Reverse for transfers
          : row.normal_balance || credit - debit;  // Normal for others
          
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
      investing: investingArr
    });
  };

  const loadAR = async (propertyName: string | null = selectedProperty) => {
    let query = supabase
      .from("ar_aging_detail")
      .select("*")
      .gt("open_balance", 0);
    if (propertyName) {
      query = query.eq("customer", propertyName);
    }
    const { data } = await query;
    const list: ARTransaction[] = (data as any[] || []).map((rec) => ({
      invoiceNumber: rec.number || "",
      invoiceDate: rec.date,
      dueDate: rec.due_date,
      amount: Number(rec.open_balance) || 0,
      daysOutstanding: calculateDaysOutstanding(rec.due_date),
      customer: rec.customer,
      memo: rec.memo || null,
    }));
    setArTransactions(list);
  };

  const handleCategory = async (
    account: string,
    type: "revenue" | "cogs" | "expense" | "operating" | "financing" | "investing",
  ) => {
    const { start, end } = getDateRange();
    let query = supabase
      .from("journal_entry_lines")
      .select(
        "date, debit, credit, account, customer, report_category, normal_balance, memo, vendor, name, entry_number, number",
      )
      .eq("account", account)
      .gte("date", start)
      .lte("date", end);

    if (reportType === "cf") {
      query = query
        .not("entry_bank_account", "is", null)
        .eq("is_cash_account", false)
        .neq("report_category", "transfer");
    }
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
        let amount = 0;
        if (reportType === "pl") {
          if (type === "revenue") {
            amount = credit - debit;
          } else {
            amount = debit - credit;
          }
        } else {
          // Enhanced cash flow calculation for transactions
          amount = row.report_category === "transfer" 
            ? debit - credit
            : row.normal_balance || credit - debit;
        }
        return {
          date: row.date,
          amount,
          running: 0,
          payee: row.vendor || row.name,
          memo: row.memo,
          customer: row.customer,
          entryNumber: row.entry_number,
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
        @keyframes ripple {
          0% { transform: scale(0.8); opacity: 1; }
          100% { transform: scale(2.4); opacity: 0; }
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
            {reportType === "pl" ? "P&L Dashboard" : reportType === "cf" ? "Cash Flow Dashboard" : "A/R Aging Report"}
          </h1>
          <p style={{ fontSize: '14px', opacity: 0.9 }}>
            {reportType === "ar" ? "As of Today" : `${getMonthName(month)} ${year}`} • {properties.length} Customers
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
          ) : reportType === "cf" ? (
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
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', textAlign: 'center' }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                  {formatCompactCurrency(companyTotals.current)}
                </div>
                <div style={{ fontSize: '11px', opacity: 0.8 }}>Current</div>
              </div>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                  {formatCompactCurrency(companyTotals.days30)}
                </div>
                <div style={{ fontSize: '11px', opacity: 0.8 }}>31-60</div>
              </div>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                  {formatCompactCurrency(companyTotals.days60)}
                </div>
                <div style={{ fontSize: '11px', opacity: 0.8 }}>61-90</div>
              </div>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                  {formatCompactCurrency(companyTotals.days90)}
                </div>
                <div style={{ fontSize: '11px', opacity: 0.8 }}>91-120</div>
              </div>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                  {formatCompactCurrency(companyTotals.over90)}
                </div>
                <div style={{ fontSize: '11px', opacity: 0.8 }}>120+</div>
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
              onChange={(e) => setReportType(e.target.value as "pl" | "cf" | "ar")}
            >
              <option value="pl">P&L Statement</option>
              <option value="cf">Cash Flow Statement</option>
              <option value="ar">A/R Aging Report</option>
            </select>
          </div>
          {reportType !== "ar" && (
            <>
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
            </>
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
                {reportType === "pl" ? (
                  <>
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
                  </>
                ) : reportType === "cf" ? (
                  <>
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
                  </>
                ) : (
                  <>
                    <div onClick={() => showRanking("arTotal")} style={{
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
                          A/R KING
                        </div>
                        <div style={{ fontSize: '10px', color: '#64748b' }}>
                          {arKing}
                        </div>
                      </div>
                    </div>
                    <div onClick={() => showRanking("arCurrent")} style={{
                      background: 'white',
                      borderRadius: '8px',
                      padding: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      border: `1px solid ${BRAND_COLORS.success}33`,
                      cursor: 'pointer'
                    }}>
                      <span style={{ fontSize: '20px' }}>⏰</span>
                      <div>
                        <div style={{ fontSize: '11px', color: BRAND_COLORS.success, fontWeight: '600' }}>
                          CURRENT CHAMP
                        </div>
                        <div style={{ fontSize: '10px', color: '#64748b' }}>
                          {currentChamp}
                        </div>
                      </div>
                    </div>
                    <div onClick={() => showRanking("arOverdue")} style={{
                      background: 'white',
                      borderRadius: '8px',
                      padding: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      border: `1px solid ${BRAND_COLORS.danger}33`,
                      cursor: 'pointer'
                    }}>
                      <span style={{ fontSize: '20px' }}>⚠️</span>
                      <div>
                        <div style={{ fontSize: '11px', color: BRAND_COLORS.danger, fontWeight: '600' }}>
                          OVERDUE ALERT
                        </div>
                        <div style={{ fontSize: '10px', color: '#64748b' }}>
                          {overdueAlert}
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
                      border: `1px solid ${BRAND_COLORS.accent}33`
                    }}>
                      <span style={{ fontSize: '20px' }}>📊</span>
                      <div>
                        <div style={{ fontSize: '11px', color: BRAND_COLORS.accent, fontWeight: '600' }}>
                          AVG DAYS
                        </div>
                        <div style={{ fontSize: '10px', color: '#64748b' }}>
                          {avgDays}
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

          {/* Enhanced Customer KPI Boxes */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
            {properties.map((p) => {
              const isRevenueKing = p.name === revenueKing;
              const isMarginMaster = p.name === marginMaster;
              const isCogsChamp = p.name === cogsChamp;
              const isCashKing = p.name === cashKing;
              const isFlowMaster = p.name === flowMaster;
              const isArKing = p.name === arKing;
              const isCurrentChamp = p.name === currentChamp;
              const isOverdueAlert = p.name === overdueAlert;
              
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
                      {reportType === "pl" && isCogsChamp && (
                        <div style={{
                          background: `linear-gradient(135deg, ${BRAND_COLORS.accent}, #0ea5e9)`,
                          borderRadius: '12px',
                          padding: '4px 6px',
                          boxShadow: '0 2px 8px rgba(14, 165, 233, 0.3)'
                        }}>
                          <span style={{ fontSize: '16px' }}>🎯</span>
                        </div>
                      )}
                      {reportType === "cf" && isCashKing && (
                        <div style={{
                          background: `linear-gradient(135deg, ${BRAND_COLORS.primary}, #0ea5e9)`,
                          borderRadius: '12px',
                          padding: '4px 6px',
                          boxShadow: '0 2px 8px rgba(14, 165, 233, 0.3)'
                        }}>
                          <span style={{ fontSize: '16px' }}>💰</span>
                        </div>
                      )}
                      {reportType === "cf" && isFlowMaster && (
                        <div style={{
                          background: `linear-gradient(135deg, ${BRAND_COLORS.success}, #22c55e)`,
                          borderRadius: '12px',
                          padding: '4px 6px',
                          boxShadow: '0 2px 8px rgba(34, 197, 94, 0.3)'
                        }}>
                          <span style={{ fontSize: '16px' }}>⚡</span>
                        </div>
                      )}
                      {reportType === "ar" && isArKing && (
                        <div style={{
                          background: `linear-gradient(135deg, ${BRAND_COLORS.primary}, #0ea5e9)`,
                          borderRadius: '12px',
                          padding: '4px 6px',
                          boxShadow: '0 2px 8px rgba(14,165,233,0.3)'
                        }}>
                          <span style={{ fontSize: '16px' }}>💰</span>
                        </div>
                      )}
                      {reportType === "ar" && isCurrentChamp && (
                        <div style={{
                          background: `linear-gradient(135deg, ${BRAND_COLORS.success}, #22c55e)`,
                          borderRadius: '12px',
                          padding: '4px 6px',
                          boxShadow: '0 2px 8px rgba(34,197,94,0.3)'
                        }}>
                          <span style={{ fontSize: '16px' }}>⏰</span>
                        </div>
                      )}
                      {reportType === "ar" && isOverdueAlert && (
                        <div style={{
                          background: `linear-gradient(135deg, ${BRAND_COLORS.danger}, #ef4444)`,
                          borderRadius: '12px',
                          padding: '4px 6px',
                          boxShadow: '0 2px 8px rgba(239,68,68,0.3)'
                        }}>
                          <span style={{ fontSize: '16px' }}>⚠️</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {reportType === "pl" ? (
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
                          color: BRAND_COLORS.success,
                          textShadow: '0 1px 2px rgba(0,0,0,0.1)'
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
                          color: BRAND_COLORS.warning,
                          textShadow: '0 1px 2px rgba(0,0,0,0.1)'
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
                          color: BRAND_COLORS.danger,
                          textShadow: '0 1px 2px rgba(0,0,0,0.1)'
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
                          color: (p.netIncome || 0) >= 0 ? BRAND_COLORS.success : BRAND_COLORS.danger,
                          textShadow: '0 1px 3px rgba(0,0,0,0.2)'
                        }}>
                          {formatCompactCurrency(p.netIncome || 0)}
                        </span>
                      </div>
                    </div>
                  ) : reportType === "cf" ? (
                    <div style={{ display: 'grid', gap: '8px' }}>
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
                        background: `linear-gradient(135deg, ${BRAND_COLORS.accent}10, ${BRAND_COLORS.primary}05)`,
                        borderRadius: '8px',
                        border: `2px solid ${BRAND_COLORS.accent}30`,
                        boxShadow: `0 4px 12px ${BRAND_COLORS.accent}20`
                      }}>
                        <span style={{ fontSize: '12px', fontWeight: '700', color: BRAND_COLORS.accent }}>Net Cash</span>
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
                  ) : (
                    <div style={{ display: 'grid', gap: '6px' }}>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '6px 10px',
                        background: `${BRAND_COLORS.success}20`,
                        borderRadius: '6px'
                      }}>
                        <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '500' }}>Current</span>
                        <span style={{ fontSize: '12px', fontWeight: '700', color: BRAND_COLORS.success }}>
                          {formatCompactCurrency(p.current || 0)}
                        </span>
                      </div>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '6px 10px',
                        background: `${BRAND_COLORS.warning}20`,
                        borderRadius: '6px'
                      }}>
                        <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '500' }}>31-60</span>
                        <span style={{ fontSize: '12px', fontWeight: '700', color: BRAND_COLORS.warning }}>
                          {formatCompactCurrency(p.days30 || 0)}
                        </span>
                      </div>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '6px 10px',
                        background: `${BRAND_COLORS.danger}20`,
                        borderRadius: '6px'
                      }}>
                        <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '500' }}>61+</span>
                        <span style={{ fontSize: '12px', fontWeight: '700', color: BRAND_COLORS.danger }}>
                          {formatCompactCurrency((p.days60 || 0) + (p.days90 || 0) + (p.over90 || 0))}
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
                        <span style={{ fontSize: '12px', fontWeight: '700', color: BRAND_COLORS.accent }}>Total A/R</span>
                        <span style={{ fontSize: '14px', fontWeight: '800', color: BRAND_COLORS.primary }}>
                          {formatCompactCurrency(p.total || 0)}
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
              Company Total {reportType === "pl" ? "Net Income" : reportType === "cf" ? "Net Cash" : "A/R"}
            </span>
            <div
              style={{
                fontSize: '20px',
                fontWeight: '800',
                marginTop: '4px',
                color: reportType === "ar" ? BRAND_COLORS.primary : companyTotals.net >= 0 ? BRAND_COLORS.success : BRAND_COLORS.danger
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
              {reportType === "ar" ? "As of Today" : `${getMonthName(month)} ${year}`}
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
              {selectedProperty || "Company Total"} - {reportType === "pl" ? "P&L Statement" : reportType === "cf" ? "Cash Flow Statement" : "A/R Aging"}
            </h2>
            <p style={{ fontSize: '14px', opacity: 0.9 }}>
              {reportType === "ar" ? "As of Today" : `${getMonthName(month)} ${year}`}
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
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = '#fef2f2';
                      e.currentTarget.style.borderColor = BRAND_COLORS.danger;
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = BRAND_COLORS.gray[50];
                      e.currentTarget.style.borderColor = BRAND_COLORS.gray[200];
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
                color:
                  plTotals.net >= 0 ? BRAND_COLORS.success : BRAND_COLORS.danger,
              }}
            >
              Net Income: {formatCurrency(plTotals.net)}
            </div>
            </>
          ) : reportType === "cf" ? (
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
                color:
                  cfTotals.net >= 0 ? BRAND_COLORS.success : BRAND_COLORS.danger,
              }}
            >
              Net Cash Flow: {formatCurrency(cfTotals.net)}
            </div>
              </>
            ) : (
              <div style={{ display: 'grid', gap: '12px' }}>
                <div onClick={() => showARTransactions('current')} style={{ background: `${BRAND_COLORS.success}20`, borderRadius: '8px', padding: '16px', cursor: 'pointer' }}>
                  <div style={{ fontWeight: '600', color: BRAND_COLORS.success }}>Current (0-30 Days)</div>
                  <div style={{ fontSize: '20px', fontWeight: '700', textAlign: 'right', color: BRAND_COLORS.success }}>
                    {formatCurrency((selectedProperty ? properties.find(p=>p.name===selectedProperty) : companyTotals).current || 0)}
                  </div>
                </div>
                <div onClick={() => showARTransactions('31-60')} style={{ background: `${BRAND_COLORS.warning}20`, borderRadius: '8px', padding: '16px', cursor: 'pointer' }}>
                  <div style={{ fontWeight: '600', color: BRAND_COLORS.warning }}>31-60 Days</div>
                  <div style={{ fontSize: '20px', fontWeight: '700', textAlign: 'right', color: BRAND_COLORS.warning }}>
                    {formatCurrency((selectedProperty ? properties.find(p=>p.name===selectedProperty) : companyTotals).days30 || 0)}
                  </div>
                </div>
                <div onClick={() => showARTransactions('61-90')} style={{ background: `#f59e0b20`, borderRadius: '8px', padding: '16px', cursor: 'pointer' }}>
                  <div style={{ fontWeight: '600', color: '#f59e0b' }}>61-90 Days</div>
                  <div style={{ fontSize: '20px', fontWeight: '700', textAlign: 'right', color: '#f59e0b' }}>
                    {formatCurrency((selectedProperty ? properties.find(p=>p.name===selectedProperty) : companyTotals).days60 || 0)}
                  </div>
                </div>
                <div onClick={() => showARTransactions('90+')} style={{ background: `${BRAND_COLORS.danger}20`, borderRadius: '8px', padding: '16px', cursor: 'pointer' }}>
                  <div style={{ fontWeight: '600', color: BRAND_COLORS.danger }}>90+ Days</div>
                  <div style={{ fontSize: '20px', fontWeight: '700', textAlign: 'right', color: BRAND_COLORS.danger }}>
                    {formatCurrency(((selectedProperty ? properties.find(p=>p.name===selectedProperty) : companyTotals).days90 || 0) + ((selectedProperty ? properties.find(p=>p.name===selectedProperty) : companyTotals).over90 || 0))}
                  </div>
                </div>
              </div>
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
            Back to {reportType === "pl" ? "P&L" : reportType === "cf" ? "Cash Flow" : "A/R"}
          </button>

          {reportType === "ar" ? (
            <>
              <div style={{
                background: `linear-gradient(135deg, ${BRAND_COLORS.accent}, ${BRAND_COLORS.secondary})`,
                borderRadius: '12px',
                padding: '20px',
                marginBottom: '24px',
                color: 'white'
              }}>
                <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '8px' }}>
                  {bucketLabels[selectedCategory || ""]}
                </h2>
                <p style={{ fontSize: '14px', opacity: 0.9 }}>
                  Invoice Details • As of Today
                </p>
              </div>
              <div style={{ display: 'grid', gap: '12px' }}>
                {filteredARTransactions.map((t, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: 'white',
                      borderRadius: '8px',
                      padding: '16px',
                      border: `1px solid ${BRAND_COLORS.gray[200]}`,
                      boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '600', marginBottom: '4px' }}>
                      <span>{t.invoiceNumber} - {t.customer}</span>
                      <span style={{ color: getAgingColor(t.daysOutstanding) }}>{formatCurrency(t.amount)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b' }}>
                      <span>
                        {new Date(t.invoiceDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        {" "}• Due {new Date(t.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                      <span style={{ color: getAgingColor(t.daysOutstanding), fontWeight: '600' }}>
                        {t.daysOutstanding} days
                      </span>
                    </div>
                    {t.memo && <div style={{ fontSize: '12px', marginTop: '4px' }}>{t.memo}</div>}
                  </div>
                ))}
              </div>
              <div
                style={{
                  marginTop: '16px',
                  textAlign: 'right',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: BRAND_COLORS.primary,
                }}
              >
                Total Outstanding: {formatCurrency(filteredARTotal)}
              </div>
            </>
          ) : (
            <>
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
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: '8px', fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>
                      <div style={{ fontWeight: '600' }}>DATE</div>
                      <div style={{ fontWeight: '600' }}>PAYEE/CUSTOMER</div>
                      <div style={{ fontWeight: '600' }}>INVOICE #</div>
                      <div style={{ fontWeight: '600' }}>MEMO</div>
                      <div style={{ fontWeight: '600', textAlign: 'right' }}>AMOUNT</div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: '8px', alignItems: 'center' }}>
                      <div style={{ fontSize: '14px', fontWeight: '500' }}>
                        {new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
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
                {reportType === "pl" ? "Total Net Income" : "Total Net Cash Flow"}: {formatCurrency(transactionTotal)}
              </div>
            </>
          )}
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

      {/* AI CFO Modal */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            backdropFilter: 'blur(10px)'
          }}
          onClick={closeModal}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.95), rgba(255,255,255,0.9))',
              borderRadius: '24px',
              padding: '32px',
              margin: '20px',
              maxWidth: '400px',
              width: '90%',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.3)',
              backdropFilter: 'blur(20px)',
              textAlign: 'center'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  background: `linear-gradient(135deg, ${BRAND_COLORS.primary}, ${BRAND_COLORS.secondary})`,
                  borderRadius: '12px',
                  padding: '8px',
                  boxShadow: `0 4px 16px ${BRAND_COLORS.primary}40`
                }}>
                  <Bot size={20} style={{ color: 'white' }} />
                </div>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: '700', margin: 0, color: BRAND_COLORS.accent }}>
                    AI CFO
                  </h3>
                  <p style={{ fontSize: '12px', margin: 0, color: '#64748b' }}>
                    Your Financial Assistant
                  </p>
                </div>
              </div>
              <button
                onClick={closeModal}
                style={{
                  background: 'rgba(0,0,0,0.1)',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px',
                  cursor: 'pointer',
                  color: '#64748b'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Siri Shortcut Info */}
            <div style={{ marginBottom: '24px', textAlign: 'center' }}>
              <div
                style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '50%',
                  background: `linear-gradient(135deg, ${BRAND_COLORS.primary}, ${BRAND_COLORS.secondary})`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                  boxShadow: `0 0 30px ${BRAND_COLORS.primary}60`
                }}
              >
                <Bot size={32} style={{ color: 'white' }} />
              </div>
              <p style={{ fontSize: '16px', fontWeight: '600', color: BRAND_COLORS.accent, margin: 0 }}>
                Ask AI CFO with Siri
              </p>
              <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 0' }}>
                Say “AI CFO” after adding the shortcut
              </p>
            </div>

            {/* Example Questions */}
            <div
              style={{
                background: 'rgba(255,255,255,0.6)',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '16px',
                border: `1px solid ${BRAND_COLORS.gray[200]}`,
                textAlign: 'left'
              }}
            >
              <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 12px', fontWeight: '600' }}>
                Try asking:
              </p>
              <div style={{ display: 'grid', gap: '8px' }}>
                <p style={{ fontSize: '13px', color: BRAND_COLORS.accent, margin: 0, padding: '8px', background: 'rgba(255,255,255,0.8)', borderRadius: '6px' }}>
                  "What's our total revenue this month?"
                </p>
                <p style={{ fontSize: '13px', color: BRAND_COLORS.accent, margin: 0, padding: '8px', background: 'rgba(255,255,255,0.8)', borderRadius: '6px' }}>
                  "Which customer has the highest profit margin?"
                </p>
                <p style={{ fontSize: '13px', color: BRAND_COLORS.accent, margin: 0, padding: '8px', background: 'rgba(255,255,255,0.8)', borderRadius: '6px' }}>
                  "Show me overdue receivables"
                </p>
              </div>
            </div>

            {/* Instructions */}
            <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0, lineHeight: '1.4' }}>
              Hold the Siri button and say “AI CFO,” or tap below to run the shortcut.
            </p>

            {/* Siri Shortcut Button */}
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '16px' }}>
              <a
                href="shortcuts://run-shortcut?name=AI%20CFO"
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: `linear-gradient(135deg, ${BRAND_COLORS.primary}, ${BRAND_COLORS.secondary})`,
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: `0 8px 32px ${BRAND_COLORS.primary}40`,
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  MozUserSelect: 'none',
                  textDecoration: 'none'
                }}
              >
                <Bot size={28} style={{ color: 'white' }} />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Floating AI CFO Button */}
      {!showModal && (
        <div
          ref={buttonRef}
          onClick={openAIModal}
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: `linear-gradient(135deg, ${BRAND_COLORS.primary}, ${BRAND_COLORS.secondary})`,
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 8px 32px ${BRAND_COLORS.primary}40`,
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            zIndex: 1000,
            userSelect: 'none',
            WebkitUserSelect: 'none',
            MozUserSelect: 'none'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = 'scale(1.05)';
            e.currentTarget.style.boxShadow = `0 12px 40px ${BRAND_COLORS.primary}50`;
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = `0 8px 32px ${BRAND_COLORS.primary}40`;
          }}
        >
          <Bot size={28} style={{ color: 'white' }} />
        </div>
      )}
    </div>
  );
}
