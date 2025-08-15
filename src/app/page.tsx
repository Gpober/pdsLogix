"use client";

import React from "react";
import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import {
  DollarSign,
  TrendingUp,
  Building2,
  CreditCard,
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

export default function FinancialOverviewPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState("June");
  const [selectedYear, setSelectedYear] = useState("2024");
  type TimePeriod = "Monthly" | "Quarterly" | "YTD" | "Trailing 12" | "Custom";
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("YTD");
  const [timePeriodDropdownOpen, setTimePeriodDropdownOpen] = useState(false);
  const [monthDropdownOpen, setMonthDropdownOpen] = useState(false);
  const [yearDropdownOpen, setYearDropdownOpen] = useState(false);
  const [classDropdownOpen, setClassDropdownOpen] = useState(false);
  const timePeriodDropdownRef = useRef<HTMLDivElement>(null);
  const monthDropdownRef = useRef<HTMLDivElement>(null);
  const yearDropdownRef = useRef<HTMLDivElement>(null);
  const classDropdownRef = useRef<HTMLDivElement>(null);
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
  const [selectedClasses, setSelectedClasses] = useState<Set<string>>(
    new Set(["All Classes"]),
  );
  const [availableClasses, setAvailableClasses] = useState<string[]>([
    "All Classes",
  ]);
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

  // Click outside handler for dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        classDropdownRef.current &&
        !classDropdownRef.current.contains(event.target as Node)
      ) {
        setClassDropdownOpen(false);
      }
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

  // Load available classes for filter dropdown
  const fetchAvailableClasses = async () => {
    try {
      const { data, error } = await supabase
        .from("journal_entry_lines")
        .select("class")
        .not("class", "is", null);
      if (error) throw error;
      const classes = new Set<string>();
      data.forEach((row) => {
        if (row.class && row.class.trim()) {
          classes.add(row.class.trim());
        }
      });
      setAvailableClasses(["All Classes", ...Array.from(classes).sort()]);
    } catch (err) {
      console.error("Error fetching classes:", err);
    }
  };

  useEffect(() => {
    fetchAvailableClasses();
  }, []);

  // Fetch financial data from Supabase (same connection as other pages)
  const fetchFinancialData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { startDate, endDate } = calculateDateRange();
      const monthIndex = monthsList.indexOf(selectedMonth);
      const year = Number.parseInt(selectedYear);
      const selectedClassList = Array.from(selectedClasses).filter(
        (c) => c !== "All Classes",
      );

      console.log(
        `🔍 FINANCIAL OVERVIEW - Fetching data for ${selectedMonth} ${selectedYear}`,
      );
      console.log(`📅 Date range: ${startDate} to ${endDate}`);
      console.log(
        `🏢 Class Filter: ${
          selectedClassList.length > 0
            ? selectedClassList.join(", ")
            : "All Classes"
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

      if (selectedClassList.length > 0) {
        currentQuery = currentQuery.in("class", selectedClassList);
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
      const prevMonthIndex = monthIndex === 0 ? 11 : monthIndex - 1;
      const prevYear = monthIndex === 0 ? year - 1 : year;
      const prevStartDate = `${prevYear}-${String(prevMonthIndex + 1).padStart(2, "0")}-01`;

      const prevDaysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      let prevLastDay = prevDaysInMonth[prevMonthIndex];
      if (
        prevMonthIndex === 1 &&
        ((prevYear % 4 === 0 && prevYear % 100 !== 0) || prevYear % 400 === 0)
      ) {
        prevLastDay = 29;
      }
      const prevEndDate = `${prevYear}-${String(prevMonthIndex + 1).padStart(2, "0")}-${String(prevLastDay).padStart(2, "0")}`;

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

      if (selectedClassList.length > 0) {
        prevQuery = prevQuery.in("class", selectedClassList);
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

        if (selectedClassList.length > 0) {
          monthQuery = monthQuery.in("class", selectedClassList);
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
      const selectedClassList = Array.from(selectedClasses).filter(
        (c) => c !== "All Classes",
      );
      const classQuery =
        selectedClassList.length > 0
          ? `&classId=${encodeURIComponent(selectedClassList.join(","))}`
          : "";
      const res = await fetch(
        `/api/organizations/${orgId}/trend-data?months=12&endMonth=${endMonth}&endYear=${selectedYear}${classQuery}`,
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

  const handleSync = async () => {
    try {
      await fetch("/api/sync", { method: "POST" });
    } catch (e) {
      console.error("Sync failed", e);
    } finally {
      loadTrendData();
      loadPropertyData();
    }
  };

  // Load data on component mount and when filters change
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    fetchFinancialData();
    loadTrendData();
    loadPropertyData();
  }, [
    timePeriod,
    selectedMonth,
    selectedYear,
    selectedClasses,
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

  // Quick actions configuration
  const quickActions = [
    {
      title: "P&L Statement",
      description: "Detailed profit and loss analysis",
      href: "/financials",
      icon: BarChart3,
      color: BRAND_COLORS.primary,
    },
    {
      title: "Cash Flow Analysis",
      description: "Track cash inflows and outflows",
      href: "/cash-flow",
      icon: TrendingUp,
      color: BRAND_COLORS.success,
    },
    {
      title: "Balance Sheet",
      description: "Assets, liabilities, and equity",
      href: "/balance-sheet",
      icon: Building2,
      color: BRAND_COLORS.secondary,
    },
    {
      title: "Accounts Receivable",
      description: "Customer payments and aging",
      href: "/accounts-receivable",
      icon: CreditCard,
      color: BRAND_COLORS.warning,
    },
  ];

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
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm hover:border-blue-500 focus:outline-none focus:ring-2 transition-all"
                  style={
                    {
                      "--tw-ring-color": BRAND_COLORS.primary + "33",
                    } as React.CSSProperties
                  }
                />
                <span className="text-gray-500">to</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm hover:border-blue-500 focus:outline-none focus:ring-2 transition-all"
                  style={
                    {
                      "--tw-ring-color": BRAND_COLORS.primary + "33",
                    } as React.CSSProperties
                  }
                />
              </div>
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
                      {formatPercentage(financialData.growth.revenue)} vs last
                      month
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
                      {formatPercentage(financialData.growth.netIncome)} vs last
                      month
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
                      {formatPercentage(financialData.growth.cashFlow)} vs last
                      month
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
                    <div className="relative" ref={classDropdownRef}>
                      <button
                        onClick={() => setClassDropdownOpen(!classDropdownOpen)}
                        className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2"
                        style={
                          {
                            "--tw-ring-color": BRAND_COLORS.primary + "33",
                          } as React.CSSProperties
                        }
                      >
                        Class: {Array.from(selectedClasses).join(", ")}
                        <ChevronDown className="w-4 h-4 ml-1" />
                      </button>

                      {classDropdownOpen && (
                        <div className="absolute right-0 z-10 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          {availableClasses.map((cls) => (
                            <label
                              key={cls}
                              className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={selectedClasses.has(cls)}
                                onChange={(e) => {
                                  const newSelected = new Set(selectedClasses);
                                  if (e.target.checked) {
                                    if (cls === "All Classes") {
                                      newSelected.clear();
                                      newSelected.add("All Classes");
                                    } else {
                                      newSelected.delete("All Classes");
                                      newSelected.add(cls);
                                    }
                                  } else {
                                    newSelected.delete(cls);
                                    if (newSelected.size === 0) {
                                      newSelected.add("All Classes");
                                    }
                                  }
                                  setSelectedClasses(newSelected);
                                }}
                                className="mr-3 rounded"
                                style={{ accentColor: BRAND_COLORS.primary }}
                              />
                              {cls}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button
                      className={`h-8 w-8 p-0 ${chartType === "line" ? "" : "bg-white text-gray-700 border border-gray-200"}`}
                      onClick={() => setChartType("line")}
                    >
                      <TrendingUp className="h-4 w-4" />
                    </Button>
                    <Button
                      className={`h-8 w-8 p-0 ${chartType === "bar" ? "" : "bg-white text-gray-700 border border-gray-200"}`}
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
                              : "bg-white text-gray-700 border border-gray-200"
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
                            : "bg-white text-gray-700 border border-gray-200"
                        }`}
                        onClick={() => setCustomerChartType("pie")}
                      >
                        <PieChart className="h-4 w-4" />
                      </Button>
                      <Button
                        className={`h-8 w-8 p-0 ${
                          customerChartType === "bar"
                            ? ""
                            : "bg-white text-gray-700 border border-gray-200"
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
              {/* Quick Actions */}
              <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Quick Actions
                  </h3>
                  <div className="text-sm text-gray-600 mt-1">
                    Access detailed financial reports
                  </div>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {quickActions.map((action) => (
                      <Link
                        key={action.title}
                        href={action.href}
                        className="group p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-md transition-all"
                      >
                        <div className="flex items-center mb-3">
                          <action.icon
                            className="w-6 h-6 mr-3"
                            style={{ color: action.color }}
                          />
                          <h4 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                            {action.title}
                          </h4>
                        </div>
                        <p className="text-sm text-gray-600">
                          {action.description}
                        </p>
                        <div className="mt-2 text-xs text-blue-600 font-medium">
                          View Details →
                        </div>
                      </Link>
                    ))}
                  </div>
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
