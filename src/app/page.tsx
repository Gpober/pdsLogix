"use client";

import React from "react";
import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import {
  DollarSign,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  RefreshCw,
  BarChart3,
  AlertTriangle,
  Calendar,
  ChevronDown,
  Target,
  Activity,
  PieChart,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { supabase } from "@/lib/supabaseClient";
import DatePicker from "@/components/DatePicker";
import CustomerMultiSelect from "@/components/CustomerMultiSelect";

// I AM CFO Brand Colors
const BRAND_COLORS = {
  primary: "#56B6E9",
  secondary: "#3A9BD1",
  tertiary: "#7CC4ED",
  accent: "#2E86C1",
  success: "#27AE60",
  warning: "#F39C12",
  danger: "#E74C3C",
};

const CHART_COLORS = [
  BRAND_COLORS.primary,
  BRAND_COLORS.secondary,
  BRAND_COLORS.tertiary,
  BRAND_COLORS.accent,
  BRAND_COLORS.success,
  BRAND_COLORS.warning,
  "#8884d8",
  "#82ca9d",
];

// P&L Classification using the same logic as financials page
const classifyPLAccount = (accountType, reportCategory, accountName) => {
  const typeLower = accountType?.toLowerCase() || "";
  const nameLower = accountName?.toLowerCase() || "";
  const categoryLower = reportCategory?.toLowerCase() || "";

  // Exclude transfers and cash accounts first
  const isTransfer =
    categoryLower === "transfer" || nameLower.includes("transfer");
  const isCashAccount =
    typeLower.includes("bank") ||
    typeLower.includes("cash") ||
    nameLower.includes("checking") ||
    nameLower.includes("savings") ||
    nameLower.includes("cash");

  if (isCashAccount || isTransfer) return null;

  // INCOME ACCOUNTS - Based on account_type
  const isIncomeAccount =
    typeLower === "income" ||
    typeLower === "other income" ||
    typeLower.includes("income") ||
    typeLower.includes("revenue");

  // EXPENSE ACCOUNTS - Based on account_type
  const isExpenseAccount =
    typeLower === "expense" ||
    typeLower === "other expense" ||
    typeLower === "cost of goods sold" ||
    typeLower.includes("expense");

  if (isIncomeAccount) return "INCOME";
  if (isExpenseAccount) return "EXPENSES";

  return null; // Not a P&L account (likely Balance Sheet account)
};

// Cash Flow Classification using the same logic as cash-flow page
const classifyCashFlowTransaction = (accountType) => {
  const typeLower = accountType?.toLowerCase() || "";

  // Operating activities - Income and Expenses
  if (
    typeLower === "income" ||
    typeLower === "other income" ||
    typeLower === "expenses" ||
    typeLower === "expense" ||
    typeLower === "cost of goods sold" ||
    typeLower === "accounts receivable" ||
    typeLower === "accounts payable"
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

// ---------- String normalization + fuzzy match ----------
const norm = (s: string) =>
  (s || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[\s\-_.,/\\|]+/g, "")
    .replace(/[^a-z0-9]/g, "");

// Quick substring/containment match (cheap pass)
const looseContains = (a: string, b: string) => a.includes(b) || b.includes(a);

// Levenshtein distance (fast enough for small lists)
const levenshtein = (a: string, b: string) => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const v0 = new Array(b.length + 1).fill(0);
  const v1 = new Array(b.length + 1).fill(0);
  for (let i = 0; i <= b.length; i++) v0[i] = i;
  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= b.length; j++) v0[j] = v1[j];
  }
  return v1[b.length];
};

// Convert distance to similarity 0..1 (1 = identical)
const levSim = (a: string, b: string) => {
  if (!a && !b) return 1;
  const d = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length) || 1;
  return 1 - d / maxLen;
};

// Combined similarity: exact/containment first, else Levenshtein
const similarity = (rawA: string, rawB: string) => {
  const a = norm(rawA),
    b = norm(rawB);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (looseContains(a, b)) return 0.98; // strong positive if substring
  return levSim(a, b); // fallback
};

// Decide if a department matches any selected customers (threshold tuned)
const matchesSelectedCustomers = (
  department: string,
  selected: string[],
  threshold = 0.72,
) => {
  if (!selected.length) return true; // "All Customers"
  const dn = norm(department);
  if (!dn) return false;
  let best = 0;
  for (const cust of selected) {
    const score = similarity(department, cust);
    if (score > best) best = score;
    if (best >= 0.98) break; // early exit on strong match
  }
  return best >= threshold;
};

export default function FinancialOverviewPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(
    () => new Date().toLocaleString("en-US", { month: "long" }),
  );
  const [selectedYear, setSelectedYear] = useState(
    () => new Date().getFullYear().toString(),
  );
  type TimePeriod = "Monthly" | "Quarterly" | "YTD" | "Trailing 12" | "Custom";
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("YTD");
  const [timePeriodDropdownOpen, setTimePeriodDropdownOpen] = useState(false);
  const [monthDropdownOpen, setMonthDropdownOpen] = useState(false);
  const [yearDropdownOpen, setYearDropdownOpen] = useState(false);
  const timePeriodDropdownRef = useRef<HTMLDivElement>(null);
  const monthDropdownRef = useRef<HTMLDivElement>(null);
  const yearDropdownRef = useRef<HTMLDivElement>(null);
  const [financialData, setFinancialData] = useState(null);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [chartType, setChartType] = useState<"line" | "bar">("line");
  type MonthlyPoint = {
    monthName: string;
    year: number;
    totalRevenue: number;
    totalExpenses: number;
    netProfit: number;
  };
  type TrendPoint = {
    month: string;
    totalIncome: number;
    netIncome: number;
    expenses: number;
  };
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  type PropertyPoint = {
    name: string;
    revenue: number;
    grossProfit: number;
    operatingExpenses: number;
    netIncome: number;
    cogs: number;
  };
  const [propertyData, setPropertyData] = useState<PropertyPoint[]>([]);
  const [propertyChartMetric, setPropertyChartMetric] = useState<
    "income" | "gp" | "ni" | "expenses" | "cogs"
  >("income");
  const [customerChartType, setCustomerChartType] = useState<"pie" | "bar">(
    "pie",
  );
  const [loadingTrend, setLoadingTrend] = useState(false);
  const [loadingProperty, setLoadingProperty] = useState(false);
  const [trendError, setTrendError] = useState<string | null>(null);
  const [propertyError, setPropertyError] = useState<string | null>(null);
  type PayrollSummary = {
    employees: number;
    w2: number;
    contractors: number;
    netPay: number;
    grossPayroll: number;
    employerTaxes: number;
    benefits: number;
    contractorPayments: number;
  };
  const [payrollSummary, setPayrollSummary] = useState<PayrollSummary | null>(null);
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [payrollError, setPayrollError] = useState<string | null>(null);
  const [selectedCustomers, setSelectedCustomers] = useState<Set<string>>(
    new Set(["All Customers"]),
  );
  const [availableCustomers, setAvailableCustomers] = useState<string[]>([
    "All Customers",
  ]);
  const comparisonLabel = useMemo(() => {
    switch (timePeriod) {
      case "Monthly":
        return "vs last month";
      case "Quarterly":
        return "vs last quarter";
      case "YTD":
        return "vs prior YTD";
      case "Trailing 12":
        return "vs prior 12 months";
      default:
        return "vs previous period";
    }
  }, [timePeriod]);
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  type SortColumn =
    | "revenue"
    | "expenses"
    | "netIncome"
    | "margin"
    | "transactionCount";
  const [sortColumn, setSortColumn] = useState<SortColumn>("netIncome");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const orgId = "1";

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      window.location.href = "/mobile-dashboard";
    }
  }, []);

  // Generate months and years lists (same as other pages)
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
  ];
  const yearsList = Array.from({ length: 10 }, (_, i) =>
    (new Date().getFullYear() - 5 + i).toString(),
  );

  // Date utilities (same as financials page)
  const getDateParts = (dateString) => {
    const dateOnly = dateString.split("T")[0];
    const [year, month, day] = dateOnly.split("-").map(Number);
    return { year, month, day, dateOnly };
  };

  // Removed unused getMonthYear function

  const isDateInRange = (dateString, startDate, endDate) => {
    const { dateOnly } = getDateParts(dateString);
    return dateOnly >= startDate && dateOnly <= endDate;
  };

  // Calculate date range (matches financials page logic)
  const calculateDateRange = () => {
    let startDate: string;
    let endDate: string;

    if (timePeriod === "Custom") {
      startDate = customStartDate || "2025-01-01";
      endDate = customEndDate || "2025-06-30";
    } else if (timePeriod === "YTD") {
      const monthIndex = monthsList.indexOf(selectedMonth);
      const year = Number.parseInt(selectedYear);
      startDate = `${year}-01-01`;

      const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      let lastDay = daysInMonth[monthIndex];
      if (
        monthIndex === 1 &&
        ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0)
      ) {
        lastDay = 29;
      }
      endDate = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    } else if (timePeriod === "Monthly") {
      const monthIndex = monthsList.indexOf(selectedMonth);
      const year = Number.parseInt(selectedYear);
      startDate = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;

      const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      let lastDay = daysInMonth[monthIndex];
      if (
        monthIndex === 1 &&
        ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0)
      ) {
        lastDay = 29;
      }
      endDate = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    } else if (timePeriod === "Quarterly") {
      const monthIndex = monthsList.indexOf(selectedMonth);
      const year = Number.parseInt(selectedYear);
      const quarter = Math.floor(monthIndex / 3);
      const quarterStartMonth = quarter * 3;
      startDate = `${year}-${String(quarterStartMonth + 1).padStart(2, "0")}-01`;

      const quarterEndMonth = quarterStartMonth + 2;
      const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      let lastDay = daysInMonth[quarterEndMonth];
      if (
        quarterEndMonth === 1 &&
        ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0)
      ) {
        lastDay = 29;
      }
      endDate = `${year}-${String(quarterEndMonth + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    } else if (timePeriod === "Trailing 12") {
      const monthIndex = monthsList.indexOf(selectedMonth);
      const year = Number.parseInt(selectedYear);

      let startYear = year;
      let startMonth = monthIndex + 1 - 11;
      if (startMonth <= 0) {
        startMonth += 12;
        startYear -= 1;
      }
      startDate = `${startYear}-${String(startMonth).padStart(2, "0")}-01`;

      const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      let lastDay = daysInMonth[monthIndex];
      if (
        monthIndex === 1 &&
        ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0)
      ) {
        lastDay = 29;
      }
      endDate = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    } else {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;
      let startYear = currentYear;
      let startMonth = currentMonth - 12;
      if (startMonth <= 0) {
        startMonth += 12;
        startYear -= 1;
      }
      startDate = `${startYear}-${String(startMonth).padStart(2, "0")}-01`;

      const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      let lastDay = daysInMonth[currentMonth - 1];
      if (
        currentMonth === 2 &&
        ((currentYear % 4 === 0 && currentYear % 100 !== 0) ||
          currentYear % 400 === 0)
      ) {
        lastDay = 29;
      }
      endDate = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    }

    return { startDate, endDate };
  };

  const calculatePreviousDateRange = (startDate: string, endDate: string) => {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (timePeriod === "Monthly") {
      const monthIndex = monthsList.indexOf(selectedMonth);
      const year = Number.parseInt(selectedYear);
      const prevMonthIndex = monthIndex === 0 ? 11 : monthIndex - 1;
      const prevYear = monthIndex === 0 ? year - 1 : year;
      const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      let lastDay = daysInMonth[prevMonthIndex];
      if (
        prevMonthIndex === 1 &&
        ((prevYear % 4 === 0 && prevYear % 100 !== 0) || prevYear % 400 === 0)
      ) {
        lastDay = 29;
      }
      return {
        prevStartDate: `${prevYear}-${String(prevMonthIndex + 1).padStart(2, "0")}-01`,
        prevEndDate: `${prevYear}-${String(prevMonthIndex + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
      };
    } else if (timePeriod === "Quarterly") {
      const monthIndex = monthsList.indexOf(selectedMonth);
      const year = Number.parseInt(selectedYear);
      const quarter = Math.floor(monthIndex / 3);
      const prevQuarterStartMonth = quarter * 3 - 3;
      const adjustedStartMonth = (prevQuarterStartMonth + 12) % 12;
      const prevYear = prevQuarterStartMonth < 0 ? year - 1 : year;
      const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      const prevQuarterEndMonth = adjustedStartMonth + 2;
      let lastDay = daysInMonth[prevQuarterEndMonth];
      if (
        prevQuarterEndMonth === 1 &&
        ((prevYear % 4 === 0 && prevYear % 100 !== 0) || prevYear % 400 === 0)
      ) {
        lastDay = 29;
      }
      return {
        prevStartDate: `${prevYear}-${String(adjustedStartMonth + 1).padStart(2, "0")}-01`,
        prevEndDate: `${prevYear}-${String(prevQuarterEndMonth + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
      };
    } else if (timePeriod === "YTD") {
      const monthIndex = monthsList.indexOf(selectedMonth);
      const year = Number.parseInt(selectedYear);
      const prevYear = year - 1;
      const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      let lastDay = daysInMonth[monthIndex];
      if (
        monthIndex === 1 &&
        ((prevYear % 4 === 0 && prevYear % 100 !== 0) || prevYear % 400 === 0)
      ) {
        lastDay = 29;
      }
      return {
        prevStartDate: `${prevYear}-01-01`,
        prevEndDate: `${prevYear}-${String(monthIndex + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
      };
    } else if (timePeriod === "Trailing 12") {
      const prevStart = new Date(start);
      const prevEnd = new Date(end);
      prevStart.setFullYear(prevStart.getFullYear() - 1);
      prevEnd.setFullYear(prevEnd.getFullYear() - 1);
      return {
        prevStartDate: prevStart.toISOString().split("T")[0],
        prevEndDate: prevEnd.toISOString().split("T")[0],
      };
    } else {
      const diff =
        Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) +
        1;
      const prevEnd = new Date(start);
      prevEnd.setDate(prevEnd.getDate() - 1);
      const prevStart = new Date(prevEnd);
      prevStart.setDate(prevStart.getDate() - (diff - 1));
      return {
        prevStartDate: prevStart.toISOString().split("T")[0],
        prevEndDate: prevEnd.toISOString().split("T")[0],
      };
    }
  };

  // Click outside handler for dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        timePeriodDropdownRef.current &&
        !timePeriodDropdownRef.current.contains(event.target as Node)
      ) {
        setTimePeriodDropdownOpen(false);
      }
      if (
        monthDropdownRef.current &&
        !monthDropdownRef.current.contains(event.target as Node)
      ) {
        setMonthDropdownOpen(false);
      }
      if (
        yearDropdownRef.current &&
        !yearDropdownRef.current.contains(event.target as Node)
      ) {
        setYearDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Load available customers for filter dropdown
  const fetchAvailableCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from("journal_entry_lines")
        .select("customer")
        .not("customer", "is", null);
      if (error) throw error;
      const customers = new Set<string>();
      data.forEach((row) => {
        if (row.customer && row.customer.trim()) {
          customers.add(row.customer.trim());
        }
      });
      setAvailableCustomers(["All Customers", ...Array.from(customers).sort()]);
    } catch (err) {
      console.error("Error fetching customers:", err);
    }
  };

  useEffect(() => {
    fetchAvailableCustomers();
  }, []);

  // Fetch financial data from Supabase (same connection as other pages)
  const fetchFinancialData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { startDate, endDate } = calculateDateRange();
      const monthIndex = monthsList.indexOf(selectedMonth);
      const year = Number.parseInt(selectedYear);
      const selectedCustomerList = Array.from(selectedCustomers).filter(
        (c) => c !== "All Customers",
      );

      console.log(
        `🔍 FINANCIAL OVERVIEW - Fetching data for ${selectedMonth} ${selectedYear}`,
      );
      console.log(`📅 Date range: ${startDate} to ${endDate}`);
      console.log(
        `🏢 Customer Filter: ${
          selectedCustomerList.length > 0
            ? selectedCustomerList.join(", ")
            : "All Customers"
        }`,
      );

      // Fetch current period data using same query structure as other pages
      let currentQuery = supabase
        .from("journal_entry_lines")
        .select(
          `
          entry_number,
          class,
          date,
          account,
          account_type,
          debit,
          credit,
          memo,
          customer,
          vendor,
          name,
          entry_bank_account,
          normal_balance,
          report_category,
          is_cash_account,
          detail_type,
          account_behavior
        `,
        )
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: true });

      if (selectedCustomerList.length > 0) {
        currentQuery = currentQuery.in("customer", selectedCustomerList);
      }

      const { data: currentTransactions, error: currentError } =
        await currentQuery;
      if (currentError) throw currentError;

      // Filter transactions using timezone-independent date comparison
      const filteredCurrentTransactions = currentTransactions.filter((tx) => {
        return isDateInRange(tx.date, startDate, endDate);
      });

      console.log(
        `📊 Current period: ${filteredCurrentTransactions.length} transactions`,
      );

      // Fetch previous period for comparison
      const { prevStartDate, prevEndDate } = calculatePreviousDateRange(
        startDate,
        endDate,
      );

      let prevQuery = supabase
        .from("journal_entry_lines")
        .select(
          `
          entry_number,
          class,
          date,
          account,
          account_type,
          debit,
          credit,
          memo,
          customer,
          vendor,
          name,
          entry_bank_account,
          normal_balance,
          report_category,
          is_cash_account,
          detail_type,
          account_behavior
        `,
        )
        .gte("date", prevStartDate)
        .lte("date", prevEndDate)
        .order("date", { ascending: true });

      if (selectedCustomerList.length > 0) {
        prevQuery = prevQuery.in("customer", selectedCustomerList);
      }

      const { data: prevTransactions, error: prevError } = await prevQuery;

      const filteredPrevTransactions =
        prevTransactions && !prevError
          ? prevTransactions.filter((tx) =>
              isDateInRange(tx.date, prevStartDate, prevEndDate),
            )
          : [];

      console.log(
        `📊 Previous period: ${filteredPrevTransactions.length} transactions`,
      );

      // Fetch last 12 months for trend analysis
      const trendData = [];
      for (let i = 11; i >= 0; i--) {
        const trendMonthIndex = (monthIndex - i + 12) % 12;
        const trendYear = monthIndex - i < 0 ? year - 1 : year;
        const trendStartDate = `${trendYear}-${String(trendMonthIndex + 1).padStart(2, "0")}-01`;

        const trendDaysInMonth = [
          31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
        ];
        let trendLastDay = trendDaysInMonth[trendMonthIndex];
        if (
          trendMonthIndex === 1 &&
          ((trendYear % 4 === 0 && trendYear % 100 !== 0) ||
            trendYear % 400 === 0)
        ) {
          trendLastDay = 29;
        }
        const trendEndDate = `${trendYear}-${String(trendMonthIndex + 1).padStart(2, "0")}-${String(trendLastDay).padStart(2, "0")}`;

        let monthQuery = supabase
          .from("journal_entry_lines")
          .select(
            `
            entry_number,
            class,
            date,
            account,
            account_type,
            debit,
            credit,
            memo,
            customer,
            vendor,
            name,
            entry_bank_account,
            normal_balance,
            report_category,
            is_cash_account,
            detail_type,
            account_behavior
          `,
          )
          .gte("date", trendStartDate)
          .lte("date", trendEndDate)
          .order("date", { ascending: true });

        if (selectedCustomerList.length > 0) {
          monthQuery = monthQuery.in("customer", selectedCustomerList);
        }

        const { data: monthData } = await monthQuery;

        const filteredMonthData = monthData
          ? monthData.filter((tx) =>
              isDateInRange(tx.date, trendStartDate, trendEndDate),
            )
          : [];

        const monthName = monthsList[trendMonthIndex];
        trendData.push({
          month: `${monthName.substring(0, 3)} ${trendYear}`,
          data: filteredMonthData,
        });
      }

      console.log(`📈 Trend data: ${trendData.length} months`);

      // Process the data using same logic as other pages
      const processedData = processFinancialData(
        filteredCurrentTransactions,
        filteredPrevTransactions,
        trendData,
      );
      setFinancialData(processedData);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("❌ Error fetching financial data:", err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Process financial data using same logic as P&L and Cash Flow pages
  const processFinancialData = (currentData, prevData, trendData) => {
    // Process P&L data (same as financials page)
    const current = processPLTransactions(currentData);
    const previous = processPLTransactions(prevData);

    // Process cash flow data (same as cash-flow page)
    const currentCashFlow = processCashFlowTransactions(currentData);
    const previousCashFlow = processCashFlowTransactions(prevData);

    // Process trend data
    const trends = trendData.map(({ month, data }) => ({
      month,
      ...processPLTransactions(data),
      ...processCashFlowTransactions(data),
    }));

    // Calculate growth rates
    const calculateGrowth = (current, previous) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / Math.abs(previous)) * 100;
    };

    // Get property breakdown
    const propertyBreakdown = getPropertyBreakdown(currentData);

    // Generate alerts
    const alerts = generateAlerts(
      current,
      previous,
      currentCashFlow,
      propertyBreakdown,
    );

    return {
      current: { ...current, ...currentCashFlow },
      previous: { ...previous, ...previousCashFlow },
      trends,
      growth: {
        revenue: calculateGrowth(current.totalIncome, previous.totalIncome),
        netIncome: calculateGrowth(current.netIncome, previous.netIncome),
        expenses: calculateGrowth(
          current.totalExpenses,
          previous.totalExpenses,
        ),
        cashFlow: calculateGrowth(
          currentCashFlow.netCashFlow,
          previousCashFlow.netCashFlow,
        ),
      },
      propertyBreakdown,
      alerts,
      summary: {
        totalTransactions: currentData.length,
        activeProperties: [
          ...new Set(currentData.map((t) => t.class).filter(Boolean)),
        ].length,
        profitMargin: current.totalIncome
          ? (current.netIncome / current.totalIncome) * 100
          : 0,
      },
    };
  };

  // Process P&L transactions (same logic as financials page)
  const processPLTransactions = (transactions) => {
    const accountMap = new Map();

    transactions.forEach((tx) => {
      const classification = classifyPLAccount(
        tx.account_type,
        tx.report_category,
        tx.account,
      );
      if (!classification) return; // Skip non-P&L accounts

      const account = tx.account;
      if (!accountMap.has(account)) {
        accountMap.set(account, {
          account,
          category: classification,
          account_type: tx.account_type,
          transactions: [],
          totalCredits: 0,
          totalDebits: 0,
        });
      }

      const accountData = accountMap.get(account);
      accountData.transactions.push(tx);

      const debitValue = tx.debit ? Number.parseFloat(tx.debit.toString()) : 0;
      const creditValue = tx.credit
        ? Number.parseFloat(tx.credit.toString())
        : 0;

      if (!isNaN(debitValue) && debitValue > 0) {
        accountData.totalDebits += debitValue;
      }
      if (!isNaN(creditValue) && creditValue > 0) {
        accountData.totalCredits += creditValue;
      }
    });

    // Calculate totals
    let totalIncome = 0;
    let totalCogs = 0;
    let totalExpenses = 0;

    for (const [, data] of accountMap.entries()) {
      let amount;
      if (data.category === "INCOME") {
        amount = data.totalCredits - data.totalDebits;
        totalIncome += amount;
      } else {
        amount = data.totalDebits - data.totalCredits;
        if (data.account_type?.toLowerCase().includes("cost of goods sold")) {
          totalCogs += amount;
        } else {
          totalExpenses += amount;
        }
      }
    }

    const grossProfit = totalIncome - totalCogs;
    const netIncome = grossProfit - totalExpenses;

    return {
      totalIncome,
      totalCogs,
      totalExpenses,
      grossProfit,
      netIncome,
      accounts: Array.from(accountMap.values()),
    };
  };

  // Process cash flow transactions (same logic as cash-flow page)
  const processCashFlowTransactions = (transactions) => {
    let operatingCashFlow = 0;
    let financingCashFlow = 0;
    let investingCashFlow = 0;

    transactions.forEach((tx) => {
      if (!tx.entry_bank_account) return; // Must have bank account source

      const classification = classifyCashFlowTransaction(
        tx.account_type,
        tx.report_category,
      );
      const cashImpact =
        tx.report_category === "transfer"
          ? Number.parseFloat(tx.debit) - Number.parseFloat(tx.credit) // Reverse for transfers
          : tx.normal_balance ||
            Number.parseFloat(tx.credit) - Number.parseFloat(tx.debit); // Normal for others

      if (classification === "operating") {
        operatingCashFlow += cashImpact;
      } else if (classification === "financing") {
        financingCashFlow += cashImpact;
      } else if (classification === "investing") {
        investingCashFlow += cashImpact;
      }
    });

    const netCashFlow =
      operatingCashFlow + financingCashFlow + investingCashFlow;

    return {
      operatingCashFlow,
      financingCashFlow,
      investingCashFlow,
      netCashFlow,
    };
  };

  // Get property performance breakdown
  const getPropertyBreakdown = (transactions) => {
    const properties = {};

    transactions.forEach((transaction) => {
      const property = transaction.customer || "Unassigned";
      const category = classifyPLAccount(
        transaction.account_type,
        transaction.report_category,
        transaction.account,
      );

      if (!category) return;

      if (!properties[property]) {
        properties[property] = {
          revenue: 0,
          expenses: 0,
          netIncome: 0,
          transactionCount: 0,
        };
      }

      const debitValue = transaction.debit
        ? Number.parseFloat(transaction.debit.toString())
        : 0;
      const creditValue = transaction.credit
        ? Number.parseFloat(transaction.credit.toString())
        : 0;
      properties[property].transactionCount++;

      if (category === "INCOME") {
        const amount = creditValue - debitValue;
        properties[property].revenue += amount;
      } else {
        const amount = debitValue - creditValue;
        properties[property].expenses += amount;
      }

      properties[property].netIncome =
        properties[property].revenue - properties[property].expenses;
    });

    return Object.entries(properties)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.netIncome - a.netIncome);
  };

  // Generate financial alerts
  const generateAlerts = (current, previous, currentCashFlow, properties) => {
    const alerts = [];

    // Revenue decline alert
    if (
      previous.totalIncome > 0 &&
      current.totalIncome < previous.totalIncome * 0.9
    ) {
      alerts.push({
        id: "revenue-decline",
        type: "warning",
        title: "Revenue Decline",
        message: `Revenue decreased by ${(((previous.totalIncome - current.totalIncome) / previous.totalIncome) * 100).toFixed(1)}% from last month`,
        action: "View P&L Details",
        href: "/financials",
      });
    }

    // High expense growth alert
    if (
      previous.totalExpenses > 0 &&
      current.totalExpenses > previous.totalExpenses * 1.15
    ) {
      alerts.push({
        id: "expense-growth",
        type: "warning",
        title: "Rising Expenses",
        message: `Expenses increased by ${(((current.totalExpenses - previous.totalExpenses) / previous.totalExpenses) * 100).toFixed(1)}% from last month`,
        action: "Review Expenses",
        href: "/financials",
      });
    }

    // Cash flow alert
    if (currentCashFlow.netCashFlow < 0) {
      alerts.push({
        id: "negative-cash-flow",
        type: "warning",
        title: "Negative Cash Flow",
        message: `Net cash flow is ${formatCurrency(currentCashFlow.netCashFlow)} this month`,
        action: "View Cash Flow",
        href: "/cash-flow",
      });
    } else if (currentCashFlow.netCashFlow > 0) {
      alerts.push({
        id: "positive-cash-flow",
        type: "success",
        title: "Positive Cash Flow",
        message: `Strong ${formatCurrency(currentCashFlow.netCashFlow)} net cash flow this month`,
        action: "View Cash Flow",
        href: "/cash-flow",
      });
    }

    // Profitable customers
    const profitableCustomers = properties.filter((p) => p.netIncome > 0);
    if (profitableCustomers.length > 0) {
      alerts.push({
        id: "profitable-customers",
        type: "success",
        title: "Strong Customer Performance",
        message: `${profitableCustomers.length} of ${properties.length} customers are profitable`,
        action: "View Customers",
        href: "/financials",
      });
    }

    // Low margin alert
    const margin = current.totalIncome
      ? (current.netIncome / current.totalIncome) * 100
      : 0;
    if (margin < 10 && margin > -100) {
      alerts.push({
        id: "low-margin",
        type: "warning",
        title: "Low Profit Margin",
        message: `Current profit margin is ${margin.toFixed(1)}% - consider cost optimization`,
        action: "Analyze Costs",
        href: "/financials",
      });
    }

    // Strong performance alert
    if (margin > 20) {
      alerts.push({
        id: "strong-performance",
        type: "success",
        title: "Excellent Margins",
        message: `Strong ${margin.toFixed(1)}% profit margin indicates healthy operations`,
        action: "View Details",
        href: "/financials",
      });
    }

    return alerts;
  };

  const loadTrendData = async () => {
    try {
      setLoadingTrend(true);
      setTrendError(null);
      const endMonth = monthsList.indexOf(selectedMonth) + 1;
      const selectedCustomerList = Array.from(selectedCustomers).filter(
        (c) => c !== "All Customers",
      );
      const customerQuery =
        selectedCustomerList.length > 0
          ? `&customerId=${encodeURIComponent(selectedCustomerList.join(","))}`
          : "";
      const res = await fetch(
        `/api/organizations/${orgId}/trend-data?months=12&endMonth=${endMonth}&endYear=${selectedYear}${customerQuery}`,
      );
      if (!res.ok) throw new Error("Failed to fetch trend data");
      const json: { monthlyData: MonthlyPoint[] } = await res.json();
      const mapped: TrendPoint[] = (json.monthlyData || []).map((d) => ({
        month: `${d.monthName} ${d.year}`,
        totalIncome: d.totalRevenue,
        netIncome: d.netProfit,
        expenses: d.totalExpenses,
      }));
      setTrendData(mapped);
    } catch (e) {
      const err = e as Error;
      setTrendError(err.message || "Failed to load trend data");
      setTrendData([]);
    } finally {
      setLoadingTrend(false);
    }
  };

  const loadPropertyData = async () => {
    try {
      setLoadingProperty(true);
      setPropertyError(null);
      const { startDate, endDate } = calculateDateRange();
      const res = await fetch(
        `/api/organizations/${orgId}/dashboard-summary?start=${startDate}&end=${endDate}&includeProperties=true`,
      );
      if (!res.ok) throw new Error("Failed to fetch customer data");
      const json: { propertyBreakdown: PropertyPoint[] } = await res.json();
      setPropertyData(json.propertyBreakdown || []);
    } catch (e) {
      const err = e as Error;
      setPropertyError(err.message || "Failed to load customer data");
      setPropertyData([]);
    } finally {
      setLoadingProperty(false);
    }
  };

  const fetchPayrollSummary = async () => {
    try {
      setPayrollLoading(true);
      setPayrollError(null);
      const { startDate, endDate } = calculateDateRange();
      let query = supabase.from("payments").select("*");
      if (startDate) query = query.gte("date", startDate);
      if (endDate) query = query.lte("date", endDate);
      const { data, error } = await query;
      if (error) throw error;
      const rows = (data || []) as any[];
      const selected = Array.from(selectedCustomers).filter(
        (c) => c !== "All Customers",
      );
      const filtered = rows.filter((r) =>
        matchesSelectedCustomers(r.department || "", selected),
      );

      const w2Ids = new Set<string>();
      const contractorIds = new Set<string>();
      let netPay = 0;
      let grossPayroll = 0;
      let employerTaxes = 0;
      let benefits = 0;
      let contractorPayments = 0;

      const pick = (obj: any, keys: string[]) => {
        for (const k of keys) {
          const v = obj?.[k];
          if (v !== undefined && v !== null) return v;
        }
        return undefined;
      };

      for (const r of filtered) {
        const id = String(
          pick(r, ["employee_id", "employeeid", "emp_id"]) ??
            pick(r, ["employee_name", "employee", "name", "full_name"]),
        );
        const type = String(
          pick(r, ["employee_type", "worker_type", "employment_type", "type"]),
        ).toLowerCase();
        if (id) {
          if (type.includes("contract")) contractorIds.add(id);
          else w2Ids.add(id);
        }
        netPay += Number(
          pick(r, ["net_pay", "net", "net_payment", "netpay"]) || 0,
        );
        grossPayroll += Number(
          pick(r, ["gross_pay", "gross", "gross_payroll", "total_amount"]) ||
            0,
        );
        employerTaxes += Number(
          pick(r, ["employer_taxes", "employer_tax", "taxes", "tax"]) || 0,
        );
        benefits += Number(
          pick(r, ["benefits", "benefit", "total_benefits"]) || 0,
        );
        contractorPayments += Number(
          pick(r, ["contractor_pay", "contractors", "contractor", "contractor_amount"]) ||
            0,
        );
      }

      setPayrollSummary({
        employees: new Set([...w2Ids, ...contractorIds]).size,
        w2: w2Ids.size,
        contractors: contractorIds.size,
        netPay,
        grossPayroll,
        employerTaxes,
        benefits,
        contractorPayments,
      });
    } catch (e) {
      const err = e as Error;
      setPayrollError(err.message);
      setPayrollSummary(null);
    } finally {
      setPayrollLoading(false);
    }
  };

  const handleSync = async () => {
    try {
      await fetch("/api/sync", { method: "POST" });
    } catch (e) {
      console.error("Sync failed", e);
    } finally {
      loadTrendData();
      loadPropertyData();
      fetchPayrollSummary();
    }
  };

  // Load data on component mount and when filters change
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    fetchFinancialData();
    loadTrendData();
    loadPropertyData();
    fetchPayrollSummary();
  }, [
    timePeriod,
    selectedMonth,
    selectedYear,
    selectedCustomers,
    customStartDate,
    customEndDate,
  ]);
  /* eslint-enable react-hooks/exhaustive-deps */

  // Helper functions
  const formatCurrency = (value) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value || 0);
  };

  const formatCompactCurrency = (value) => {
    if (Math.abs(value) >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    } else if (Math.abs(value) >= 1000) {
      return `${(value / 1000).toFixed(1)}K`;
    }
    return formatCurrency(value);
  };

  const formatPercentage = (value) => {
    return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
  };

  const formatDate = (dateString: string) => {
    const { year, month, day } = getDateParts(dateString);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const propertyChartData = useMemo(() => {
    const key = {
      income: "revenue",
      gp: "grossProfit",
      ni: "netIncome",
      expenses: "operatingExpenses",
      cogs: "cogs",
    }[propertyChartMetric] as keyof PropertyPoint;
    return propertyData
      .map((p) => ({ ...p, value: p[key] as number }))
      .filter((p) => p.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [propertyData, propertyChartMetric]);

  const totalPropertyValue = useMemo(
    () => propertyChartData.reduce((sum, p) => sum + p.value, 0),
    [propertyChartData],
  );

  const metricLabels = {
    income: "Revenue",
    gp: "Gross Profit",
    ni: "Net Income",
    expenses: "Expenses",
    cogs: "COGS",
  };

  const metricOptions = [
    { key: "income", label: "Revenue" },
    { key: "cogs", label: "COGS" },
    { key: "gp", label: "Gross Profit" },
    { key: "expenses", label: "Expenses" },
    { key: "ni", label: "Net Income" },
  ] as const;

  const { startDate: propertyStart, endDate: propertyEnd } =
    calculateDateRange();
  const sortLabels = {
    revenue: "revenue",
    expenses: "expenses",
    netIncome: "net income",
    margin: "margin",
    transactionCount: "transactions",
  } as const;
  const customerSubtitle =
    timePeriod === "Monthly"
      ? `Top 10 customers sorted by ${sortLabels[sortColumn]} for ${selectedMonth} ${selectedYear}`
      : `Top 10 customers sorted by ${sortLabels[sortColumn]} for ${formatDate(propertyStart)} - ${formatDate(propertyEnd)}`;

  const sortedCustomers = useMemo(() => {
    if (!financialData?.propertyBreakdown) return [];
    return [...financialData.propertyBreakdown]
      .map((p) => ({
        ...p,
        margin: p.revenue ? (p.netIncome / p.revenue) * 100 : 0,
      }))
      .sort((a, b) => {
        const aVal =
          sortColumn === "margin" ? a.margin : (a as any)[sortColumn];
        const bVal =
          sortColumn === "margin" ? b.margin : (b as any)[sortColumn];
        return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
      })
      .slice(0, 10);
  }, [financialData, sortColumn, sortDirection]);

  const topCustomerTotals = useMemo(() => {
    const totals = sortedCustomers.reduce(
      (acc, p) => {
        acc.revenue += p.revenue || 0;
        acc.expenses += p.expenses || 0;
        acc.netIncome += p.netIncome || 0;
        return acc;
      },
      { revenue: 0, expenses: 0, netIncome: 0 },
    );
    return {
      ...totals,
      margin: totals.revenue ? (totals.netIncome / totals.revenue) * 100 : 0,
    };
  }, [sortedCustomers]);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
  };

  const TrendTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const revenue =
        payload.find((p) => p.dataKey === "totalIncome")?.value || 0;
      const net = payload.find((p) => p.dataKey === "netIncome")?.value || 0;
      const margin = revenue ? (net / revenue) * 100 : 0;
      return (
        <div className="rounded-md border bg-white p-2 text-xs shadow">
          <div className="font-semibold">{label}</div>
          <div>Revenue: {formatCurrency(revenue)}</div>
          <div>Net Income: {formatCurrency(net)}</div>
          <div>Margin: {margin.toFixed(1)}%</div>
        </div>
      );
    }
    return null;
  };

  const PropertyTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const percent = totalPropertyValue
        ? (data.value / totalPropertyValue) * 100
        : 0;
      return (
        <div className="rounded-md border bg-white p-2 text-xs shadow">
          <div className="font-semibold">{data.name}</div>
          <div>
            {metricLabels[propertyChartMetric]}: {formatCurrency(data.value)}
          </div>
          <div>{percent.toFixed(1)}%</div>
        </div>
      );
    }
    return null;
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-sm max-w-md w-full">
          <div className="text-center">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Unable to Load Data
            </h2>
            <p className="text-gray-600 mb-4">{error}</p>
            <button
              onClick={fetchFinancialData}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="relative flex justify-center">
            <div className="flex flex-col items-center text-center">
              <h1 className="text-2xl font-bold text-gray-900">
                Financial Overview
              </h1>
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
              {lastUpdated && (
                <p className="text-xs text-gray-500 mt-1">
                  Last updated: {lastUpdated.toLocaleString()}
                </p>
              )}
            </div>
            <button
              onClick={fetchFinancialData}
              disabled={isLoading}
              className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors shadow-sm disabled:opacity-50"
            >
              <RefreshCw
                className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`}
              />
              {isLoading ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-wrap items-center justify-center gap-4 w-full">
            {/* Time Period Dropdown */}
            <div className="relative" ref={timePeriodDropdownRef}>
              <button
                onClick={() =>
                  setTimePeriodDropdownOpen(!timePeriodDropdownOpen)
                }
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2"
                style={
                  {
                    "--tw-ring-color": BRAND_COLORS.primary + "33",
                  } as React.CSSProperties
                }
              >
                <Calendar className="w-4 h-4 mr-2" />
                {timePeriod}
                <ChevronDown className="w-4 h-4 ml-2" />
              </button>

              {timePeriodDropdownOpen && (
                <div className="absolute z-10 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg">
                  {(
                    [
                      "Monthly",
                      "Quarterly",
                      "YTD",
                      "Trailing 12",
                      "Custom",
                    ] as TimePeriod[]
                  ).map((period) => (
                    <button
                      key={period}
                      onClick={() => {
                        setTimePeriod(period);
                        setTimePeriodDropdownOpen(false);
                      }}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg"
                    >
                      {period}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Month/Year dropdowns for Monthly, Quarterly, YTD, and Trailing 12 */}
            {(timePeriod === "Monthly" ||
              timePeriod === "Quarterly" ||
              timePeriod === "YTD" ||
              timePeriod === "Trailing 12") && (
              <>
                <div className="relative" ref={monthDropdownRef}>
                  <button
                    onClick={() => setMonthDropdownOpen(!monthDropdownOpen)}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2"
                    style={
                      {
                        "--tw-ring-color": BRAND_COLORS.primary + "33",
                      } as React.CSSProperties
                    }
                  >
                    {selectedMonth}
                    <ChevronDown className="w-4 h-4 ml-2" />
                  </button>

                  {monthDropdownOpen && (
                    <div className="absolute z-10 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {monthsList.map((month) => (
                        <button
                          key={month}
                          onClick={() => {
                            setSelectedMonth(month);
                            setMonthDropdownOpen(false);
                          }}
                          className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg"
                        >
                          {month}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="relative" ref={yearDropdownRef}>
                  <button
                    onClick={() => setYearDropdownOpen(!yearDropdownOpen)}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2"
                    style={
                      {
                        "--tw-ring-color": BRAND_COLORS.primary + "33",
                      } as React.CSSProperties
                    }
                  >
                    {selectedYear}
                    <ChevronDown className="w-4 h-4 ml-2" />
                  </button>

                  {yearDropdownOpen && (
                    <div className="absolute z-10 mt-1 w-32 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {yearsList.map((year) => (
                        <button
                          key={year}
                          onClick={() => {
                            setSelectedYear(year);
                            setYearDropdownOpen(false);
                          }}
                          className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg"
                        >
                          {year}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Custom Date Range */}
            {timePeriod === "Custom" && (
              <DatePicker
                startDate={customStartDate}
                endDate={customEndDate}
                onChange={(start, end) => {
                  setCustomStartDate(start);
                  setCustomEndDate(end);
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isLoading && !financialData ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 animate-spin text-blue-600 mr-3" />
            <span className="text-lg text-gray-600">
              Loading financial data from Supabase...
            </span>
          </div>
        ) : financialData ? (
          <div className="space-y-8">
            {/* Key Performance Indicators */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div
                className="bg-white p-6 rounded-lg shadow-sm border-l-4"
                style={{ borderLeftColor: BRAND_COLORS.primary }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-gray-600 text-sm font-medium mb-2">
                      Total Revenue
                    </div>
                    <div className="text-2xl font-bold text-gray-900">
                      {formatCompactCurrency(financialData.current.totalIncome)}
                    </div>
                    <div
                      className={`flex items-center text-xs font-medium mt-1 ${
                        financialData.growth.revenue >= 0
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {financialData.growth.revenue >= 0 ? (
                        <ArrowUpRight className="w-3 h-3 mr-1" />
                      ) : (
                        <ArrowDownRight className="w-3 h-3 mr-1" />
                      )}
                      {formatPercentage(financialData.growth.revenue)} {comparisonLabel}
                    </div>
                  </div>
                  <DollarSign
                    className="w-8 h-8"
                    style={{ color: BRAND_COLORS.primary }}
                  />
                </div>
              </div>

              <div
                className="bg-white p-6 rounded-lg shadow-sm border-l-4"
                style={{ borderLeftColor: BRAND_COLORS.success }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-gray-600 text-sm font-medium mb-2">
                      Net Income
                    </div>
                    <div className="text-2xl font-bold text-gray-900">
                      {formatCompactCurrency(financialData.current.netIncome)}
                    </div>
                    <div
                      className={`flex items-center text-xs font-medium mt-1 ${
                        financialData.growth.netIncome >= 0
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {financialData.growth.netIncome >= 0 ? (
                        <ArrowUpRight className="w-3 h-3 mr-1" />
                      ) : (
                        <ArrowDownRight className="w-3 h-3 mr-1" />
                      )}
                      {formatPercentage(financialData.growth.netIncome)} {comparisonLabel}
                    </div>
                  </div>
                  <TrendingUp className="w-8 h-8 text-green-500" />
                </div>
              </div>

              <div
                className="bg-white p-6 rounded-lg shadow-sm border-l-4"
                style={{ borderLeftColor: BRAND_COLORS.warning }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-gray-600 text-sm font-medium mb-2">
                      Net Cash Flow
                    </div>
                    <div className="text-2xl font-bold text-gray-900">
                      {formatCompactCurrency(financialData.current.netCashFlow)}
                    </div>
                    <div
                      className={`flex items-center text-xs font-medium mt-1 ${
                        financialData.growth.cashFlow >= 0
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {financialData.growth.cashFlow >= 0 ? (
                        <ArrowUpRight className="w-3 h-3 mr-1" />
                      ) : (
                        <ArrowDownRight className="w-3 h-3 mr-1" />
                      )}
                      {formatPercentage(financialData.growth.cashFlow)} {comparisonLabel}
                    </div>
                  </div>
                  <Activity
                    className="w-8 h-8"
                    style={{ color: BRAND_COLORS.warning }}
                  />
                </div>
              </div>

              <div
                className="bg-white p-6 rounded-lg shadow-sm border-l-4"
                style={{ borderLeftColor: BRAND_COLORS.secondary }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-gray-600 text-sm font-medium mb-2">
                      Profit Margin
                    </div>
                    <div className="text-2xl font-bold text-gray-900">
                      {financialData.summary.profitMargin.toFixed(1)}%
                    </div>
                    <div className="text-xs text-gray-600 font-medium mt-1">
                      {financialData.summary.activeProperties} active properties
                    </div>
                  </div>
                  <Target
                    className="w-8 h-8"
                    style={{ color: BRAND_COLORS.secondary }}
                  />
                </div>
              </div>
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Revenue & Net Income Trend */}
              <Card>
                <CardHeader className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-gray-600" />
                    <CardTitle className="text-lg font-semibold">
                      Revenue & Net Income Trend
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <CustomerMultiSelect
                      options={availableCustomers}
                      selected={selectedCustomers}
                      onChange={setSelectedCustomers}
                      accentColor={BRAND_COLORS.primary}
                      label="Customer"
                    />
                    <Button
                      className={`h-8 w-8 p-0 ${
                        chartType === "line"
                          ? ""
                          : "!bg-white !text-gray-700 border border-gray-200"
                      }`}
                      onClick={() => setChartType("line")}
                    >
                      <TrendingUp className="h-4 w-4" />
                    </Button>
                    <Button
                      className={`h-8 w-8 p-0 ${
                        chartType === "bar"
                          ? ""
                          : "!bg-white !text-gray-700 border border-gray-200"
                      }`}
                      onClick={() => setChartType("bar")}
                    >
                      <BarChart3 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {trendError && (
                    <div className="text-sm text-red-500 mb-2">
                      {trendError}
                    </div>
                  )}
                  {loadingTrend && (
                    <div className="text-sm text-gray-500">
                      Loading trends...
                    </div>
                  )}
                  {!loadingTrend && trendData.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-8 text-gray-500">
                      <p>No trend data available</p>
                      <Button
                        className="mt-4 flex items-center gap-2"
                        onClick={handleSync}
                      >
                        <RefreshCw className="h-4 w-4" /> Sync
                      </Button>
                    </div>
                  )}
                  {!loadingTrend && trendData.length > 0 && (
                    <ResponsiveContainer width="100%" height={300}>
                      {chartType === "line" ? (
                        <LineChart data={trendData}>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#f1f5f9"
                          />
                          <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                          <YAxis
                            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                            tick={{ fontSize: 12 }}
                          />
                          <Tooltip content={<TrendTooltip />} />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="totalIncome"
                            stroke={BRAND_COLORS.tertiary}
                            strokeWidth={2}
                            dot={false}
                          />
                          <Line
                            type="monotone"
                            dataKey="netIncome"
                            stroke={BRAND_COLORS.primary}
                            strokeWidth={2}
                            dot={false}
                          />
                        </LineChart>
                      ) : (
                        <BarChart data={trendData}>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#f1f5f9"
                          />
                          <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                          <YAxis
                            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                            tick={{ fontSize: 12 }}
                          />
                          <Tooltip content={<TrendTooltip />} />
                          <Legend />
                          <Bar
                            dataKey="totalIncome"
                            fill={BRAND_COLORS.tertiary}
                          />
                          <Bar dataKey="netIncome">
                            {trendData.map((entry, idx) => (
                              <Cell
                                key={idx}
                                fill={
                                  entry.netIncome < 0
                                    ? BRAND_COLORS.danger
                                    : BRAND_COLORS.primary
                                }
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      )}
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Customer Performance Pie Chart */}
              <Card>
                <CardHeader className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <PieChart className="h-4 w-4 text-gray-600" />
                    <CardTitle className="text-lg font-semibold">
                      Customer Performance
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex flex-wrap gap-2">
                      {metricOptions.map((m) => (
                        <Button
                          key={m.key}
                          className={`h-8 px-2 text-xs ${
                            propertyChartMetric === m.key
                              ? ""
                              : "!bg-white !text-gray-700 border border-gray-200"
                          }`}
                          onClick={() => setPropertyChartMetric(m.key)}
                        >
                          {m.label}
                        </Button>
                      ))}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        className={`h-8 w-8 p-0 ${
                          customerChartType === "pie"
                            ? ""
                            : "!bg-white !text-gray-700 border border-gray-200"
                        }`}
                        onClick={() => setCustomerChartType("pie")}
                      >
                        <PieChart className="h-4 w-4" />
                      </Button>
                      <Button
                        className={`h-8 w-8 p-0 ${
                          customerChartType === "bar"
                            ? ""
                            : "!bg-white !text-gray-700 border border-gray-200"
                        }`}
                        onClick={() => setCustomerChartType("bar")}
                      >
                        <BarChart3 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {propertyError && (
                    <div className="text-sm text-red-500 mb-2">
                      {propertyError}
                    </div>
                  )}
                  {loadingProperty && (
                    <div className="text-sm text-gray-500">
                      Loading customers...
                    </div>
                  )}
                  {!loadingProperty && propertyChartData.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-8 text-gray-500">
                      <p>No customer data available</p>
                      <Button
                        className="mt-4 flex items-center gap-2"
                        onClick={handleSync}
                      >
                        <RefreshCw className="h-4 w-4" /> Sync
                      </Button>
                    </div>
                  )}
                  {!loadingProperty && propertyChartData.length > 0 && (
                    <ResponsiveContainer width="100%" height={300}>
                      {customerChartType === "pie" ? (
                        <RechartsPieChart>
                          <Pie
                            data={propertyChartData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={40}
                            outerRadius={100}
                          paddingAngle={2}
                          >
                            {propertyChartData.map((entry, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={
                                  CHART_COLORS[index % CHART_COLORS.length]
                                }
                                stroke="#fff"
                              />
                            ))}
                          </Pie>
                          <Tooltip content={<PropertyTooltip />} />
                        </RechartsPieChart>
                      ) : (
                        <BarChart data={propertyChartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" hide />
                          <YAxis />
                          <Tooltip
                            formatter={(value) => formatCurrency(value as number)}
                          />
                          <Bar dataKey="value">
                            {propertyChartData.map((entry, index) => (
                              <Cell
                                key={`bar-cell-${index}`}
                                fill={
                                  CHART_COLORS[index % CHART_COLORS.length]
                                }
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      )}
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Financial Health Summary */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Payroll Summary */}
              <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Payroll Summary
                  </h3>
                  <div className="text-sm text-gray-600 mt-1">
                    Overview of payroll activity
                  </div>
                </div>
                <div className="p-6">
                  {payrollLoading ? (
                    <div className="text-sm text-gray-500">Loading...</div>
                  ) : payrollError ? (
                    <div className="text-sm text-red-500">{payrollError}</div>
                  ) : payrollSummary ? (
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-gray-500">Employees Paid</div>
                        <div className="text-lg font-semibold">
                          {payrollSummary.employees}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500">W-2 Headcount</div>
                        <div className="text-lg font-semibold">
                          {payrollSummary.w2}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500">
                          Contractor Headcount
                        </div>
                        <div className="text-lg font-semibold">
                          {payrollSummary.contractors}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500">Net Pay</div>
                        <div className="text-lg font-semibold">
                          {formatCurrency(payrollSummary.netPay)}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500">Gross Payroll</div>
                        <div className="text-lg font-semibold">
                          {formatCurrency(payrollSummary.grossPayroll)}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500">Employer Taxes</div>
                        <div className="text-lg font-semibold">
                          {formatCurrency(payrollSummary.employerTaxes)}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500">Benefits</div>
                        <div className="text-lg font-semibold">
                          {formatCurrency(payrollSummary.benefits)}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500">Contractors</div>
                        <div className="text-lg font-semibold">
                          {formatCurrency(payrollSummary.contractorPayments)}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500">
                      No payroll data
                    </div>
                  )}
                </div>
              </div>

              {/* Alerts & Notifications */}
              <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Financial Alerts
                  </h3>
                  <div className="text-sm text-gray-600 mt-1">
                    Important insights and notifications
                  </div>
                </div>
                <div className="p-6">
                  {financialData.alerts.length > 0 ? (
                    <div className="space-y-4">
                      {financialData.alerts.map((alert) => (
                        <div
                          key={alert.id}
                          className={`p-4 rounded-lg border-l-4 ${
                            alert.type === "warning"
                              ? "bg-yellow-50 border-yellow-400"
                              : alert.type === "success"
                                ? "bg-green-50 border-green-400"
                                : "bg-blue-50 border-blue-400"
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center mb-1">
                                {alert.type === "warning" && (
                                  <AlertTriangle className="w-4 h-4 text-yellow-600 mr-2" />
                                )}
                                {alert.type === "success" && (
                                  <TrendingUp className="w-4 h-4 text-green-600 mr-2" />
                                )}
                                {alert.type === "info" && (
                                  <BarChart3 className="w-4 h-4 text-blue-600 mr-2" />
                                )}
                                <h4 className="font-semibold text-gray-900">
                                  {alert.title}
                                </h4>
                              </div>
                              <p className="text-sm text-gray-600 mb-2">
                                {alert.message}
                              </p>
                              <Link
                                href={alert.href}
                                className={`text-xs font-medium hover:underline ${
                                  alert.type === "warning"
                                    ? "text-yellow-700"
                                    : alert.type === "success"
                                      ? "text-green-700"
                                      : "text-blue-700"
                                }`}
                              >
                                {alert.action} →
                              </Link>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <Activity className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                      <p>No alerts at this time</p>
                      <p className="text-sm mt-1">Your finances look stable</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Top Customers Performance */}
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  Top Performing Customers
                </h3>
                <div className="text-sm text-gray-600 mt-1">
                  {customerSubtitle}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Customer
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <button
                          type="button"
                          onClick={() => handleSort("revenue")}
                          className="flex items-center"
                        >
                          Revenue
                          {sortColumn === "revenue" ? (
                            sortDirection === "asc" ? (
                              <ArrowUp className="ml-1 h-4 w-4" />
                            ) : (
                              <ArrowDown className="ml-1 h-4 w-4" />
                            )
                          ) : (
                            <ArrowUpDown className="ml-1 h-4 w-4" />
                          )}
                        </button>
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <button
                          type="button"
                          onClick={() => handleSort("expenses")}
                          className="flex items-center"
                        >
                          Expenses
                          {sortColumn === "expenses" ? (
                            sortDirection === "asc" ? (
                              <ArrowUp className="ml-1 h-4 w-4" />
                            ) : (
                              <ArrowDown className="ml-1 h-4 w-4" />
                            )
                          ) : (
                            <ArrowUpDown className="ml-1 h-4 w-4" />
                          )}
                        </button>
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <button
                          type="button"
                          onClick={() => handleSort("netIncome")}
                          className="flex items-center"
                        >
                          Net Income
                          {sortColumn === "netIncome" ? (
                            sortDirection === "asc" ? (
                              <ArrowUp className="ml-1 h-4 w-4" />
                            ) : (
                              <ArrowDown className="ml-1 h-4 w-4" />
                            )
                          ) : (
                            <ArrowUpDown className="ml-1 h-4 w-4" />
                          )}
                        </button>
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <button
                          type="button"
                          onClick={() => handleSort("margin")}
                          className="flex items-center"
                        >
                          Margin
                          {sortColumn === "margin" ? (
                            sortDirection === "asc" ? (
                              <ArrowUp className="ml-1 h-4 w-4" />
                            ) : (
                              <ArrowDown className="ml-1 h-4 w-4" />
                            )
                          ) : (
                            <ArrowUpDown className="ml-1 h-4 w-4" />
                          )}
                        </button>
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <button
                          type="button"
                          onClick={() => handleSort("transactionCount")}
                          className="flex items-center"
                        >
                          Transactions
                          {sortColumn === "transactionCount" ? (
                            sortDirection === "asc" ? (
                              <ArrowUp className="ml-1 h-4 w-4" />
                            ) : (
                              <ArrowDown className="ml-1 h-4 w-4" />
                            )
                          ) : (
                            <ArrowUpDown className="ml-1 h-4 w-4" />
                          )}
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {sortedCustomers.map((customer, index) => {
                      const margin = customer.margin;
                      return (
                        <tr key={customer.name} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div
                                className={`w-3 h-3 rounded-full mr-3 ${
                                  index === 0
                                    ? "bg-yellow-400"
                                    : index === 1
                                      ? "bg-gray-400"
                                      : index === 2
                                        ? "bg-yellow-600"
                                        : "bg-gray-300"
                                }`}
                              ></div>
                              <div className="text-sm font-medium text-gray-900">
                                {customer.name}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatCurrency(customer.revenue)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatCurrency(customer.expenses)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`text-sm font-medium ${
                                customer.netIncome >= 0
                                  ? "text-green-600"
                                  : "text-red-600"
                              }`}
                            >
                              {formatCurrency(customer.netIncome)}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`text-sm ${
                                margin >= 20
                                  ? "text-green-600"
                                  : margin >= 10
                                    ? "text-yellow-600"
                                    : "text-red-600"
                              }`}
                            >
                              {margin.toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {customer.transactionCount}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Top Customers Summary */}
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-6 border border-blue-200">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {formatCurrency(topCustomerTotals.revenue)}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">Revenue</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    {formatCurrency(topCustomerTotals.expenses)}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">Expenses</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {formatCurrency(topCustomerTotals.netIncome)}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">Net Income</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">
                    {topCustomerTotals.margin.toFixed(1)}%
                  </div>
                  <div className="text-sm text-gray-600 mt-1">Margin</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No Data Available
            </h3>
            <p className="text-gray-600">
              No financial data found for {selectedMonth} {selectedYear}.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
