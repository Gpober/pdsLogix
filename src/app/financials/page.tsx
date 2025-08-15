"use client";

import React from "react";
import { useState, useEffect, useRef } from "react";
import {
  Download,
  RefreshCw,
  TrendingUp,
  LucidePieChart,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Calendar,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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
};

// Types
type FinancialTransaction = {
  idx: number;
  id: string;
  entry_number: string;
  line_sequence: number;
  date: string;
  type: string;
  number: string;
  due_date: string | null;
  open_balance: number | null;
  payment_date: string | null;
  payment_method: string | null;
  adj: string | null;
  created: string;
  created_by: string;
  name: string;
  customer: string | null;
  vendor: string | null;
  employee: string | null;
  class: string | null;
  product_service: string | null;
  memo: string | null;
  qty: number | null;
  rate: number | null;
  account: string;
  ar_paid: number | null;
  ap_paid: number | null;
  clr: string | null;
  check_printed: string | null;
  debit: string | null;
  credit: string | null;
  online_banking: string | null;
  account_type: string;
  detail_type: string | null;
  account_behavior: string | null;
  report_category: string | null;
  normal_balance: string | null;
  property: string | null;
  is_cash_account: boolean | null;
  created_at: string;
  entry_bank_account: string | null;
};

interface JournalEntryLine {
  date: string;
  account: string;
  memo: string | null;
  class: string | null;
  debit: string | number | null;
  credit: string | number | null;
}

type TimePeriod = "Monthly" | "Quarterly" | "YTD" | "Trailing 12" | "Custom";
type ViewMode = "Total" | "Detail" | "Class";
type NotificationState = {
  show: boolean;
  message: string;
  type: "info" | "success" | "error";
};

// P&L Account Structure
interface PLAccount {
  account: string;
  parent_account: string;
  sub_account: string | null;
  is_sub_account: boolean;
  amount: number;
  category: "INCOME" | "EXPENSES";
  account_type: string;
  transactions: FinancialTransaction[];
}

// Smart debugging configuration
const DEBUG_CONFIG = {
  isDevelopment: process.env.NODE_ENV === "development",
  isDebugMode:
    typeof window !== "undefined" &&
    (localStorage.getItem("iam-cfo-debug") === "true" ||
      process.env.NEXT_PUBLIC_DEBUG === "true"),
  enableDataValidation: true,
  enablePerformanceTracking: true,
};

// Smart console logging
const smartLog = (
  message: string,
  data?: any,
  level: "info" | "warn" | "error" = "info",
) => {
  if (DEBUG_CONFIG.isDevelopment || DEBUG_CONFIG.isDebugMode) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

    switch (level) {
      case "warn":
        console.warn(prefix, message, data);
        break;
      case "error":
        console.error(prefix, message, data);
        break;
      default:
        console.log(prefix, message, data);
    }
  }
};

// TIMEZONE-INDEPENDENT DATE UTILITIES
// Extract date parts directly from string without timezone conversion
const getDateParts = (dateString: string) => {
  const dateOnly = dateString.split("T")[0]; // Get YYYY-MM-DD part only
  const [year, month, day] = dateOnly.split("-").map(Number);
  return { year, month, day, dateOnly };
};

// Get month name from date string without timezone issues
const getMonthYear = (dateString: string) => {
  const { year, month } = getDateParts(dateString);
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
  ];
  return `${monthNames[month - 1]} ${year}`;
};

// Compare dates as strings (YYYY-MM-DD format)
const isDateInRange = (
  dateString: string,
  startDate: string,
  endDate: string,
): boolean => {
  const { dateOnly } = getDateParts(dateString);
  return dateOnly >= startDate && dateOnly <= endDate;
};

// Format date for display without timezone conversion
const formatDateDisplay = (dateString: string) => {
  const { year, month, day } = getDateParts(dateString);
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${monthNames[month - 1]} ${day}, ${year}`;
};

export default function FinancialsPage() {
  const [selectedMonth, setSelectedMonth] = useState<string>("June");
  const [selectedYear, setSelectedYear] = useState<string>("2025");
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("YTD");
  const [viewMode, setViewMode] = useState<ViewMode>("Total");
  const [notification, setNotification] = useState<NotificationState>({
    show: false,
    message: "",
    type: "info",
  });
  const [timePeriodDropdownOpen, setTimePeriodDropdownOpen] = useState(false);
  const [propertyDropdownOpen, setPropertyDropdownOpen] = useState(false);
  const [monthDropdownOpen, setMonthDropdownOpen] = useState(false);
  const [yearDropdownOpen, setYearDropdownOpen] = useState(false);
  const [selectedProperties, setSelectedProperties] = useState<Set<string>>(
    new Set(["All Properties"]),
  );
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(
    new Set(),
  );
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [plAccounts, setPlAccounts] = useState<PLAccount[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);
  const [availableProperties, setAvailableProperties] = useState<string[]>([
    "All Properties",
  ]);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [transactionModalTitle, setTransactionModalTitle] = useState("");
  const [modalTransactionDetails, setModalTransactionDetails] = useState<
    FinancialTransaction[]
  >([]);
  const [journalEntryLines, setJournalEntryLines] = useState<
    JournalEntryLine[]
  >([]);
  const [showJournalEntryModal, setShowJournalEntryModal] = useState(false);
  const [journalEntryTitle, setJournalEntryTitle] = useState("");
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);

  // Refs for click outside functionality
  const propertyDropdownRef = useRef<HTMLDivElement>(null);
  const timePeriodDropdownRef = useRef<HTMLDivElement>(null);
  const monthDropdownRef = useRef<HTMLDivElement>(null);
  const yearDropdownRef = useRef<HTMLDivElement>(null);
  const exportDropdownRef = useRef<HTMLDivElement>(null);

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
  ];

  const yearsList = Array.from({ length: 10 }, (_, i) =>
    (new Date().getFullYear() - 5 + i).toString(),
  );

  const calculateMonthlyValue = (acc: PLAccount, monthYear: string) => {
    const txs = acc.transactions.filter(
      (tx) => getMonthYear(tx.date) === monthYear,
    );
    const credits = txs.reduce((sum, tx) => {
      const val = tx.credit ? Number.parseFloat(tx.credit.toString()) : 0;
      return sum + (isNaN(val) ? 0 : val);
    }, 0);
    const debits = txs.reduce((sum, tx) => {
      const val = tx.debit ? Number.parseFloat(tx.debit.toString()) : 0;
      return sum + (isNaN(val) ? 0 : val);
    }, 0);
    return acc.category === "INCOME" ? credits - debits : debits - credits;
  };

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        propertyDropdownRef.current &&
        !propertyDropdownRef.current.contains(event.target as Node)
      ) {
        setPropertyDropdownOpen(false);
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
      if (
        exportDropdownRef.current &&
        !exportDropdownRef.current.contains(event.target as Node)
      ) {
        setExportDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Calculate date range based on selected period - COMPLETELY TIMEZONE INDEPENDENT
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

      // Calculate last day of selected month without Date object
      const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      let lastDay = daysInMonth[monthIndex];

      // Handle leap year for February
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

      // Calculate last day of month without Date object to avoid timezone issues
      const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      let lastDay = daysInMonth[monthIndex];

      // Handle leap year for February
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

      // Handle leap year for February
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

      // Start date is 11 months before the selected month
      let startYear = year;
      let startMonth = monthIndex + 1 - 11;
      if (startMonth <= 0) {
        startMonth += 12;
        startYear -= 1;
      }
      startDate = `${startYear}-${String(startMonth).padStart(2, "0")}-01`;

      // End date is the last day of the selected month
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
      // Fallback: use current date for trailing 12
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

  // CORRECTED: P&L Classification using account_type field
  const classifyPLAccount = (
    accountType: string,
    accountName: string,
    reportCategory: string,
  ) => {
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
      typeLower === "expenses" ||
      typeLower === "other expense" ||
      typeLower === "cost of goods sold" ||
      typeLower.includes("expense");

    if (isIncomeAccount) return "INCOME";
    if (isExpenseAccount) return "EXPENSES";

    return null; // Not a P&L account (likely Balance Sheet account)
  };

  // Fetch P&L data using ENHANCED database strategy with TIMEZONE-INDEPENDENT dates
  const fetchPLData = async () => {
    setIsLoadingData(true);
    setDataError(null);

    try {
      const { startDate, endDate } = calculateDateRange();
      const selectedProperty =
        Array.from(selectedProperties)[0] || "All Properties";

      smartLog(`🔍 TIMEZONE-INDEPENDENT P&L DATA FETCH`);
      smartLog(`📅 Period: ${startDate} to ${endDate}`);
      smartLog(`🏢 Property Filter: "${selectedProperty}"`);

      // ENHANCED QUERY: Use the new database structure with better field selection
      let query = supabase
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

      // Apply property filter
      if (selectedProperty !== "All Properties") {
        query = query.eq("class", selectedProperty);
      }

      const { data: allTransactions, error } = await query;

      if (error) throw error;

      smartLog(`📊 Fetched ${allTransactions.length} total transactions`);

      // Filter transactions using TIMEZONE-INDEPENDENT date comparison
      const filteredTransactions = allTransactions.filter((tx) => {
        return isDateInRange(tx.date, startDate, endDate);
      });

      smartLog(
        `📅 After timezone-independent date filtering: ${filteredTransactions.length} transactions`,
      );
      smartLog(`📅 Date range check: ${startDate} to ${endDate}`);
      smartLog(
        `📅 Sample dates:`,
        filteredTransactions.slice(0, 5).map((tx) => ({
          original: tx.date,
          dateOnly: getDateParts(tx.date).dateOnly,
          monthYear: getMonthYear(tx.date),
          formatted: formatDateDisplay(tx.date),
        })),
      );

      // Filter for P&L accounts using enhanced classification
      const plTransactions = filteredTransactions.filter((tx) => {
        const classification = classifyPLAccount(
          tx.account_type,
          tx.account,
          tx.report_category,
        );
        return classification !== null;
      });

      smartLog(`📈 Filtered to ${plTransactions.length} P&L transactions`);
      smartLog(`🔍 Sample P&L transactions:`, plTransactions.slice(0, 5));

      // Get unique properties for filter dropdown using 'class' field
      const properties = new Set<string>();
      plTransactions.forEach((tx) => {
        if (tx.class && tx.class.trim()) {
          properties.add(tx.class.trim());
        }
      });
      setAvailableProperties([
        "All Properties",
        ...Array.from(properties).sort(),
      ]);

      // Process transactions using ENHANCED logic
      const processedAccounts = await processPLTransactionsEnhanced(
        plTransactions,
      );
      setPlAccounts(processedAccounts);

      smartLog(
        `✅ Processed ${processedAccounts.length} P&L accounts using timezone-independent strategy`,
      );

      setNotification({
        show: true,
        message: `Loaded ${plTransactions.length} P&L transactions successfully using timezone-independent date handling`,
        type: "success",
      });

      // Hide notification after 3 seconds
      setTimeout(() => {
        setNotification({ show: false, message: "", type: "info" });
      }, 3000);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";
      setDataError(errorMessage);
      setNotification({
        show: true,
        message: `Error loading data: ${errorMessage}`,
        type: "error",
      });
      smartLog(
        "❌ Error fetching timezone-independent P&L data:",
        err,
        "error",
      );
    } finally {
      setIsLoadingData(false);
    }
  };

  const handleExportExcel = () => {
    const months = Array.from(
      new Set(
        plAccounts.flatMap((acc) =>
          acc.transactions.map((tx) => getMonthYear(tx.date)),
        ),
      ),
    ).sort((a, b) => {
      const [monthA, yearA] = a.split(" ");
      const [monthB, yearB] = b.split(" ");
      const monthIndexA = monthsList.indexOf(monthA);
      const monthIndexB = monthsList.indexOf(monthB);
      return Number(yearA) - Number(yearB) || monthIndexA - monthIndexB;
    });

    const incomeAccounts = plAccounts.filter(
      (acc) => acc.category === "INCOME",
    );
    const cogsAccounts = plAccounts.filter(
      (acc) =>
        acc.category === "EXPENSES" &&
        acc.account_type?.toLowerCase().includes("cost of goods sold"),
    );
    const expenseAccounts = plAccounts.filter(
      (acc) =>
        acc.category === "EXPENSES" &&
        !acc.account_type?.toLowerCase().includes("cost of goods sold"),
    );

    const header = ["Account", ...months, "Total"];
    const sheetData: (string | number | { f: string; z?: string })[][] = [
      header,
    ];
    const colLetters = months.map((_, i) => XLSX.utils.encode_col(i + 1));
    const totalCol = XLSX.utils.encode_col(months.length + 1);
    let currentRow = 1;

    const rowTotalFormula = (rowNum: number) =>
      `SUM(${colLetters[0]}${rowNum}:${colLetters[colLetters.length - 1]}${rowNum})`;

    const addAccountRows = (accounts: PLAccount[]) => {
      const start = currentRow + 1;
      accounts.forEach((acc) => {
        const excelRow = currentRow + 1;
        const values = months.map((m) => calculateMonthlyValue(acc, m));
        const row: (string | number | { f: string })[] = [
          acc.account,
          ...values,
        ];
        row.push({ f: rowTotalFormula(excelRow) });
        sheetData.push(row);
        currentRow++;
      });
      const end = currentRow;
      return { start, end };
    };

    const incomeRange = addAccountRows(incomeAccounts);
    const totalIncomeRowIdx = currentRow + 1;
    const totalIncomeRow = [
      "Total Income",
      ...colLetters.map((letter) =>
        incomeAccounts.length > 0
          ? { f: `SUM(${letter}${incomeRange.start}:${letter}${incomeRange.end})` }
          : 0,
      ),
      incomeAccounts.length > 0 ? { f: rowTotalFormula(totalIncomeRowIdx) } : 0,
    ];
    sheetData.push(totalIncomeRow);
    currentRow++;

    const cogsRange = addAccountRows(cogsAccounts);
    const totalCogsRowIdx = currentRow + 1;
    const totalCogsRow = [
      "Total COGS",
      ...colLetters.map((letter) =>
        cogsAccounts.length > 0
          ? { f: `SUM(${letter}${cogsRange.start}:${letter}${cogsRange.end})` }
          : 0,
      ),
      cogsAccounts.length > 0 ? { f: rowTotalFormula(totalCogsRowIdx) } : 0,
    ];
    sheetData.push(totalCogsRow);
    currentRow++;

    const grossProfitRowIdx = currentRow + 1;
    const grossProfitRow = [
      "Gross Profit",
      ...colLetters.map((letter) => ({
        f: `${letter}${totalIncomeRowIdx}-${letter}${totalCogsRowIdx}`,
      })),
      { f: `${totalCol}${totalIncomeRowIdx}-${totalCol}${totalCogsRowIdx}` },
    ];
    sheetData.push(grossProfitRow);
    currentRow++;

    const gpPercentRowIdx = currentRow + 1;
    const gpPercentRow = [
      "Gross Profit %",
      ...colLetters.map((letter) => ({
        f: `IF(${letter}${totalIncomeRowIdx}=0,0,${letter}${grossProfitRowIdx}/${letter}${totalIncomeRowIdx})`,
        z: "0.00%",
      })),
      {
        f: `IF(${totalCol}${totalIncomeRowIdx}=0,0,${totalCol}${grossProfitRowIdx}/${totalCol}${totalIncomeRowIdx})`,
        z: "0.00%",
      },
    ];
    sheetData.push(gpPercentRow);
    currentRow++;

    // Blank row
    sheetData.push([]);
    currentRow++;

    const expenseRange = addAccountRows(expenseAccounts);
    const totalExpenseRowIdx = currentRow + 1;
    const totalExpenseRow = [
      "Total Expenses",
      ...colLetters.map((letter) =>
        expenseAccounts.length > 0
          ? { f: `SUM(${letter}${expenseRange.start}:${letter}${expenseRange.end})` }
          : 0,
      ),
      expenseAccounts.length > 0 ? { f: rowTotalFormula(totalExpenseRowIdx) } : 0,
    ];
    sheetData.push(totalExpenseRow);
    currentRow++;

    const netIncomeRowIdx = currentRow + 1;
    const netIncomeRow = [
      "Net Income",
      ...colLetters.map((letter) => ({
        f: `${letter}${grossProfitRowIdx}-${letter}${totalExpenseRowIdx}`,
      })),
      { f: `${totalCol}${grossProfitRowIdx}-${totalCol}${totalExpenseRowIdx}` },
    ];
    sheetData.push(netIncomeRow);
    currentRow++;

    const netIncomePercentRowIdx = currentRow + 1;
    const netIncomePercentRow = [
      "Net Income %",
      ...colLetters.map((letter) => ({
        f: `IF(${letter}${totalIncomeRowIdx}=0,0,${letter}${netIncomeRowIdx}/${letter}${totalIncomeRowIdx})`,
        z: "0.00%",
      })),
      {
        f: `IF(${totalCol}${totalIncomeRowIdx}=0,0,${totalCol}${netIncomeRowIdx}/${totalCol}${totalIncomeRowIdx})`,
        z: "0.00%",
      },
    ];
    sheetData.push(netIncomePercentRow);

    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);

    const applyStyleToRow = (rowIdx: number, style: any) => {
    const range = XLSX.utils.decode_range(worksheet["!ref"] as string);
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellRef = XLSX.utils.encode_cell({ r: rowIdx - 1, c: C });
      const cell = worksheet[cellRef];
      if (cell) {
        cell.s = {
          ...((cell as any).s || {}),
          ...(style.font
            ? { font: { ...(((cell as any).s || {}).font || {}), ...style.font } }
            : {}),
          ...(style.border
            ? { border: { ...(((cell as any).s || {}).border || {}), ...style.border } }
            : {}),
        };
      }
    }
  };

    [
      totalIncomeRowIdx,
      totalCogsRowIdx,
      grossProfitRowIdx,
      totalExpenseRowIdx,
      netIncomeRowIdx,
    ].forEach((r) =>
      applyStyleToRow(r, {
        font: { bold: true },
        border: { top: { style: "thin" } },
      }),
    );

    [gpPercentRowIdx, netIncomePercentRowIdx].forEach((r) =>
      applyStyleToRow(r, {
        font: { italic: true },
        border: { top: { style: "thin" } },
      }),
    );

    const financialFormat = "$#,##0.00;($#,##0.00)";
    const range = XLSX.utils.decode_range(worksheet["!ref"] as string);
    for (let R = 1; R <= range.e.r; ++R) {
      if (R + 1 === gpPercentRowIdx || R + 1 === netIncomePercentRowIdx) continue;
      for (let C = 1; C <= range.e.c; ++C) {
        const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = worksheet[cellRef];
        if (cell) {
          cell.z = financialFormat;
        }
      }
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "P&L");
    XLSX.writeFile(workbook, "pl_accounts.xlsx");
  };

  const handleExportPdf = () => {
    const months = Array.from(
      new Set(
        plAccounts.flatMap((acc) =>
          acc.transactions.map((tx) => getMonthYear(tx.date)),
        ),
      ),
    ).sort((a, b) => {
      const [monthA, yearA] = a.split(" ");
      const [monthB, yearB] = b.split(" ");
      const monthIndexA = monthsList.indexOf(monthA);
      const monthIndexB = monthsList.indexOf(monthB);
      return Number(yearA) - Number(yearB) || monthIndexA - monthIndexB;
    });

    const doc = new jsPDF();
    const tableColumn = ["Account", ...months];
    const tableRows = plAccounts.map((acc) => {
      const row = months.map((monthYear) =>
        calculateMonthlyValue(acc, monthYear),
      );
      return [acc.account, ...row];
    });

    const incomeAccounts = plAccounts.filter(
      (acc) => acc.category === "INCOME",
    );
    const cogsAccounts = plAccounts.filter(
      (acc) =>
        acc.category === "EXPENSES" &&
        acc.account_type?.toLowerCase().includes("cost of goods sold"),
    );
    const expenseAccounts = plAccounts.filter(
      (acc) =>
        acc.category === "EXPENSES" &&
        !acc.account_type?.toLowerCase().includes("cost of goods sold"),
    );

    const totalIncomeArr: number[] = [];
    const totalCogs: number[] = [];
    const grossProfit: number[] = [];
    const grossProfitPct: number[] = [];
    const totalExpenses: number[] = [];
    const netIncome: number[] = [];

    months.forEach((monthYear) => {
      const income = incomeAccounts.reduce(
        (sum, acc) => sum + calculateMonthlyValue(acc, monthYear),
        0,
      );
      const cogs = cogsAccounts.reduce(
        (sum, acc) => sum + calculateMonthlyValue(acc, monthYear),
        0,
      );
      const expenses = expenseAccounts.reduce(
        (sum, acc) => sum + calculateMonthlyValue(acc, monthYear),
        0,
      );
      const gp = income - cogs;
      const net = gp - expenses;
      totalIncomeArr.push(income);
      totalCogs.push(cogs);
      grossProfit.push(gp);
      grossProfitPct.push(income !== 0 ? gp / income : 0);
      totalExpenses.push(expenses);
      netIncome.push(net);
    });

    tableRows.push(
      ["Total Income", ...totalIncomeArr],
      ["Total COGS", ...totalCogs],
      ["Gross Profit", ...grossProfit],
      [
        "Gross Profit %",
        ...grossProfitPct.map((p) => `${(p * 100).toFixed(2)}%`),
      ],
      ["Total Expenses", ...totalExpenses],
      ["Net Income", ...netIncome],
    );

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
    });
    doc.save("pl_accounts.pdf");
  };

  // ENHANCED: Process transactions with improved calculation logic
  const processPLTransactionsEnhanced = async (
    transactions: any[],
  ): Promise<PLAccount[]> => {
    const accountMap = new Map<string, PLAccount>();

    smartLog(
      `🔄 Processing ${transactions.length} P&L transactions with timezone-independent strategy`,
    );

    // Group transactions by account (EXACTLY like SQL GROUP BY)
    const accountGroups = new Map<string, any[]>();

    transactions.forEach((tx) => {
      const account = tx.account;
      if (!accountGroups.has(account)) {
        accountGroups.set(account, []);
      }
      accountGroups.get(account)!.push(tx);
    });

    smartLog(`📊 Grouped into ${accountGroups.size} unique accounts`);

    // Process each account group using ENHANCED calculation
    for (const [account, txList] of accountGroups.entries()) {
      const sampleTx = txList[0];
      const accountType = sampleTx.account_type;
      const reportCategory = sampleTx.report_category;

      // Calculate totals using ENHANCED logic with proper null handling
      let totalCredits = 0;
      let totalDebits = 0;

      txList.forEach((tx) => {
        // Parse debit and credit values more carefully
        const debitValue = tx.debit
          ? Number.parseFloat(tx.debit.toString())
          : 0;
        const creditValue = tx.credit
          ? Number.parseFloat(tx.credit.toString())
          : 0;

        // Only add if values are valid numbers
        if (!isNaN(debitValue) && debitValue > 0) {
          totalDebits += debitValue;
        }
        if (!isNaN(creditValue) && creditValue > 0) {
          totalCredits += creditValue;
        }
      });

      // Determine category and amount using ENHANCED classification
      const classification = classifyPLAccount(
        accountType,
        account,
        reportCategory,
      );
      if (!classification) continue; // Skip non-P&L accounts

      let amount: number;
      if (classification === "INCOME") {
        // For income accounts: Credits increase income, debits decrease income
        amount = totalCredits - totalDebits;
      } else {
        // For expense accounts: Debits increase expenses, credits decrease expenses
        amount = totalDebits - totalCredits;
      }

      // Skip if no activity (HAVING clause equivalent) - but allow small negative adjustments
      if (Math.abs(amount) <= 0.01) continue;

      // Parse parent/sub structure EXACTLY like before
      let parentAccount: string;
      let subAccount: string | null;
      let isSubAccount: boolean;

      if (account.includes(":")) {
        const parts = account.split(":");
        parentAccount = parts[0].trim();
        subAccount = parts[1]?.trim() || null;
        isSubAccount = true;
      } else {
        parentAccount = account;
        subAccount = null;
        isSubAccount = false;
      }

      smartLog(
        `💰 Account: ${account}, Classification: ${classification}, Amount: ${amount}, Credits: ${totalCredits}, Debits: ${totalDebits}`,
      );

      accountMap.set(account, {
        account,
        parent_account: parentAccount,
        sub_account: subAccount,
        is_sub_account: isSubAccount,
        amount,
        category: classification,
        account_type: accountType,
        transactions: txList,
      });
    }

    // Convert to array and sort by alphabetical order instead of amount
    const accounts = Array.from(accountMap.values());

    // Sort: INCOME first (alphabetically), then EXPENSES (alphabetically)
    accounts.sort((a, b) => {
      if (a.category !== b.category) {
        return a.category === "INCOME" ? -1 : 1;
      }
      // Sort alphabetically by account name within each category
      return a.account.localeCompare(b.account);
    });

    smartLog(
      `✅ Final result: ${accounts.length} P&L accounts processed with timezone-independent strategy`,
    );
    smartLog(
      `📊 Income accounts: ${accounts.filter((a) => a.category === "INCOME").length}`,
    );
    smartLog(
      `📊 Expense accounts: ${accounts.filter((a) => a.category === "EXPENSES").length}`,
    );

    return accounts;
  };

  // Load data when filters change
  useEffect(() => {
    fetchPLData();
  }, [
    timePeriod,
    selectedMonth,
    selectedYear,
    customStartDate,
    customEndDate,
    selectedProperties,
  ]);

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Format percentage
  const formatPercentage = (value: number) => {
    return `${(value * 100).toFixed(2)}%`;
  };

  // Group accounts for display
  const getGroupedAccounts = () => {
    const income = plAccounts.filter((acc) => acc.category === "INCOME");
    const cogs = plAccounts.filter(
      (acc) =>
        acc.category === "EXPENSES" &&
        acc.account_type?.toLowerCase().includes("cost of goods sold"),
    );
    const expenses = plAccounts.filter(
      (acc) =>
        acc.category === "EXPENSES" &&
        !acc.account_type?.toLowerCase().includes("cost of goods sold"),
    );

    // Group parent/sub accounts
    const groupedIncome = groupParentSubAccounts(income);
    const groupedCogs = groupParentSubAccounts(cogs);
    const groupedExpenses = groupParentSubAccounts(expenses);

    return {
      income: groupedIncome,
      cogs: groupedCogs,
      expenses: groupedExpenses,
    };
  };

  // Group parent and sub accounts together - MODIFIED to show combined totals when collapsed
  const groupParentSubAccounts = (accounts: PLAccount[]) => {
    const parentMap = new Map<
      string,
      { parent: PLAccount | null; subs: PLAccount[] }
    >();
    const regularAccounts: PLAccount[] = [];

    // First pass: identify parents and subs
    accounts.forEach((acc) => {
      if (acc.is_sub_account) {
        if (!parentMap.has(acc.parent_account)) {
          parentMap.set(acc.parent_account, { parent: null, subs: [] });
        }
        parentMap.get(acc.parent_account)!.subs.push(acc);
      } else {
        // Check if this account has sub-accounts
        const hasSubs = accounts.some(
          (other) =>
            other.is_sub_account && other.parent_account === acc.account,
        );

        if (hasSubs) {
          if (!parentMap.has(acc.account)) {
            parentMap.set(acc.account, { parent: null, subs: [] });
          }
          parentMap.get(acc.account)!.parent = acc;
        } else {
          regularAccounts.push(acc);
        }
      }
    });

    // Create final grouped structure
    const result: Array<{
      account: PLAccount;
      subAccounts?: PLAccount[];
      combinedAmount: number;
    }> = [];

    // Add parent accounts with their subs
    for (const [parentName, group] of parentMap.entries()) {
      if (group.parent) {
        // Calculate combined amount using all unique transactions to avoid double counting
        const combinedTransactions = [
          ...group.parent.transactions,
          ...group.subs.flatMap((sub) => sub.transactions),
        ];

        const combinedAmount = combinedTransactions.reduce((sum, tx) => {
          const debitValue = tx.debit
            ? Number.parseFloat(tx.debit.toString())
            : 0;
          const creditValue = tx.credit
            ? Number.parseFloat(tx.credit.toString())
            : 0;
          return group.parent!.category === "INCOME"
            ? sum + (creditValue - debitValue)
            : sum + (debitValue - creditValue);
        }, 0);

        result.push({
          account: group.parent,
          subAccounts: group.subs.sort((a, b) =>
            a.account.localeCompare(b.account),
          ),
          combinedAmount,
        });
      } else {
        // Orphaned sub-accounts (create virtual parent)
        const combinedTransactions = group.subs.flatMap(
          (sub) => sub.transactions,
        );
        const combinedAmount = combinedTransactions.reduce((sum, tx) => {
          const debitValue = tx.debit
            ? Number.parseFloat(tx.debit.toString())
            : 0;
          const creditValue = tx.credit
            ? Number.parseFloat(tx.credit.toString())
            : 0;
          return group.subs[0].category === "INCOME"
            ? sum + (creditValue - debitValue)
            : sum + (debitValue - creditValue);
        }, 0);

        const virtualParent: PLAccount = {
          account: parentName,
          parent_account: parentName,
          sub_account: null,
          is_sub_account: false,
          amount: combinedAmount,
          category: group.subs[0].category,
          account_type: group.subs[0].account_type,
          transactions: combinedTransactions,
        };

        result.push({
          account: virtualParent,
          subAccounts: group.subs.sort((a, b) =>
            a.account.localeCompare(b.account),
          ),
          combinedAmount,
        });
      }
    }

    // Add regular accounts
    regularAccounts.forEach((acc) => {
      result.push({
        account: acc,
        combinedAmount: acc.amount,
      });
    });

    // Sort by alphabetical order instead of amount (descending by absolute value)
    return result.sort((a, b) =>
      a.account.account.localeCompare(b.account.account),
    );
  };

  // Get column headers based on view mode - TIMEZONE INDEPENDENT
  const getColumnHeaders = () => {
    if (viewMode === "Total") {
      return [];
    } else if (viewMode === "Class") {
      return availableProperties.filter((p) => p !== "All Properties");
    } else if (viewMode === "Detail") {
      // For Detail view, show months in the date range using timezone-independent method
      const { startDate, endDate } = calculateDateRange();
      const months = [];

      // Parse start and end dates
      const startParts = getDateParts(startDate);
      const endParts = getDateParts(endDate);

      let currentYear = startParts.year;
      let currentMonth = startParts.month;

      while (
        currentYear < endParts.year ||
        (currentYear === endParts.year && currentMonth <= endParts.month)
      ) {
        const monthKey = `${monthsList[currentMonth - 1]} ${currentYear}`;
        months.push(monthKey);

        currentMonth++;
        if (currentMonth > 12) {
          currentMonth = 1;
          currentYear++;
        }
      }

      return months;
    }
    return [];
  };

  // Get cell value based on view mode - TIMEZONE INDEPENDENT
  const getCellValue = (
    account: PLAccount,
    header: string,
    isParentCombined = false,
    subAccounts?: PLAccount[],
  ) => {
    let transactions = account.transactions;

    // If this is a combined parent view, include sub-account transactions
    if (isParentCombined && subAccounts) {
      transactions = [
        ...account.transactions,
        ...subAccounts.flatMap((sub) => sub.transactions),
      ];
    }

    if (viewMode === "Class") {
      // Filter transactions by property and calculate total
      const filteredTransactions = transactions.filter(
        (tx) => tx.class === header,
      );
      const credits = filteredTransactions.reduce((sum, tx) => {
        const creditValue = tx.credit
          ? Number.parseFloat(tx.credit.toString())
          : 0;
        return sum + (isNaN(creditValue) ? 0 : creditValue);
      }, 0);
      const debits = filteredTransactions.reduce((sum, tx) => {
        const debitValue = tx.debit
          ? Number.parseFloat(tx.debit.toString())
          : 0;
        return sum + (isNaN(debitValue) ? 0 : debitValue);
      }, 0);

      if (account.category === "INCOME") {
        return credits - debits; // Income: Credit minus Debit
      } else {
        return debits - credits; // Expenses: Debit minus Credit
      }
    } else if (viewMode === "Detail") {
      // Filter transactions by month using timezone-independent method
      const filteredTransactions = transactions.filter((tx) => {
        return getMonthYear(tx.date) === header;
      });

      const credits = filteredTransactions.reduce((sum, tx) => {
        const creditValue = tx.credit
          ? Number.parseFloat(tx.credit.toString())
          : 0;
        return sum + (isNaN(creditValue) ? 0 : creditValue);
      }, 0);
      const debits = filteredTransactions.reduce((sum, tx) => {
        const debitValue = tx.debit
          ? Number.parseFloat(tx.debit.toString())
          : 0;
        return sum + (isNaN(debitValue) ? 0 : debitValue);
      }, 0);

      if (account.category === "INCOME") {
        return credits - debits; // Income: Credit minus Debit
      } else {
        return debits - credits; // Expenses: Debit minus Credit
      }
    }
    return 0;
  };

  // Handle account expansion
  const toggleAccountExpansion = (accountName: string) => {
    const newExpanded = new Set(expandedAccounts);
    if (newExpanded.has(accountName)) {
      newExpanded.delete(accountName);
    } else {
      newExpanded.add(accountName);
    }
    setExpandedAccounts(newExpanded);
  };

  // Show transaction details - TIMEZONE INDEPENDENT
  const showTransactionDetails = (
    account: PLAccount,
    subAccount?: PLAccount,
    period?: string,
    property?: string,
    isParentCombined = false,
    subAccounts?: PLAccount[],
  ) => {
    const targetAccount = subAccount || account;
    let transactions = targetAccount.transactions || [];

    // If this is a combined parent view, include sub-account transactions
    if (isParentCombined && subAccounts && !subAccount) {
      transactions = [
        ...account.transactions,
        ...subAccounts.flatMap((sub) => sub.transactions),
      ];
    }

    // If this is a parent account being clicked (not a sub-account), show only its own transactions when expanded
    if (!subAccount && !isParentCombined && account.transactions) {
      transactions = account.transactions.filter(
        (tx) => tx.account === account.account,
      );
    }

    // Filter by period if specified (Detail view) - TIMEZONE INDEPENDENT
    if (period && viewMode === "Detail") {
      transactions = transactions.filter((tx) => {
        return getMonthYear(tx.date) === period;
      });
    }

    // Filter by property if specified (Class view)
    if (property && viewMode === "Class") {
      transactions = transactions.filter((tx) => tx.class === property);
    }

    let title = subAccount
      ? `${account.parent_account}: ${subAccount.sub_account}`
      : account.account;

    if (isParentCombined) {
      title += " (Combined)";
    }

    if (period) {
      title += ` - ${period}`;
    }

    if (property) {
      title += ` - ${property}`;
    }

    setTransactionModalTitle(title);
    setModalTransactionDetails(transactions);
    setShowTransactionModal(true);
  };

  const openJournalEntry = async (entryNumber?: string) => {
    if (!entryNumber) return;
    const { data, error } = await supabase
      .from("journal_entry_lines")
      .select("date, account, memo, class, debit, credit")
      .eq("entry_number", entryNumber)
      .order("line_sequence");
    if (error) {
      console.error("Error fetching journal entry lines:", error);
      return;
    }
    setJournalEntryLines(data || []);
    setJournalEntryTitle(`Journal Entry ${entryNumber}`);
    setShowJournalEntryModal(true);
  };

  const columnHeaders = getColumnHeaders();
  const groupedAccounts = getGroupedAccounts();

  // Calculate totals using combined amounts
  const totalIncome = groupedAccounts.income.reduce(
    (sum, group) => sum + group.combinedAmount,
    0,
  );
  const totalCogs = groupedAccounts.cogs.reduce(
    (sum, group) => sum + group.combinedAmount,
    0,
  );
  const grossProfit = totalIncome - totalCogs;
  const totalExpenses = groupedAccounts.expenses.reduce(
    (sum, group) => sum + group.combinedAmount,
    0,
  );
  const netIncome = grossProfit - totalExpenses;
  const grossProfitPercent = totalIncome !== 0 ? grossProfit / totalIncome : 0;

  // Get current date range for header display
  const { startDate: currentStartDate, endDate: currentEndDate } =
    calculateDateRange();

  return (
    <div className="min-h-screen bg-gray-50">
      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}</style>

      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center space-x-4">
              <TrendingUp
                className="w-8 h-8"
                style={{ color: BRAND_COLORS.primary }}
              />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Profit & Loss Statement
                </h1>
                <p className="text-sm text-gray-600">
                  {timePeriod === "Custom"
                    ? `${formatDateDisplay(currentStartDate)} - ${formatDateDisplay(currentEndDate)}`
                    : timePeriod === "Monthly"
                      ? `${selectedMonth} ${selectedYear}`
                      : timePeriod === "Quarterly"
                        ? `Q${Math.floor(monthsList.indexOf(selectedMonth) / 3) + 1} ${selectedYear}`
                        : timePeriod === "YTD"
                          ? `January - ${selectedMonth} ${selectedYear}`
                          : timePeriod === "Trailing 12"
                            ? `${formatDateDisplay(currentStartDate)} - ${formatDateDisplay(currentEndDate)}`
                            : `${timePeriod} Period`}
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  💰 Using timezone-independent date handling for precise P&L
                  classification
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={fetchPLData}
                disabled={isLoadingData}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50"
                style={
                  {
                    "--tw-ring-color": BRAND_COLORS.primary + "33",
                  } as React.CSSProperties
                }
              >
                <RefreshCw
                  className={`w-4 h-4 mr-2 ${isLoadingData ? "animate-spin" : ""}`}
                />
                {isLoadingData ? "Loading..." : "Refresh"}
              </button>

              <div className="relative" ref={exportDropdownRef}>
                <button
                  onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
                  className="inline-flex items-center px-4 py-2 text-white rounded-lg text-sm font-medium hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2"
                  style={
                    {
                      backgroundColor: BRAND_COLORS.primary,
                      "--tw-ring-color": BRAND_COLORS.primary + "33",
                    } as React.CSSProperties
                  }
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export
                  <ChevronDown className="w-4 h-4 ml-2" />
                </button>
                {exportDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-36 bg-white border border-gray-200 rounded-lg shadow-lg">
                    <button
                      onClick={handleExportExcel}
                      className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                    >
                      Excel
                    </button>
                    <button
                      onClick={handleExportPdf}
                      className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                    >
                      PDF
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-wrap items-center gap-4">
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


            {/* Property Filter */}
            <div className="relative" ref={propertyDropdownRef}>
              <button
                onClick={() => setPropertyDropdownOpen(!propertyDropdownOpen)}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2"
                style={
                  {
                    "--tw-ring-color": BRAND_COLORS.primary + "33",
                  } as React.CSSProperties
                }
              >
                Properties: {Array.from(selectedProperties).join(", ")}
                <ChevronDown className="w-4 h-4 ml-2" />
              </button>

              {propertyDropdownOpen && (
                <div className="absolute z-10 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {availableProperties.map((property) => (
                    <label
                      key={property}
                      className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedProperties.has(property)}
                        onChange={(e) => {
                          const newSelected = new Set(selectedProperties);
                          if (e.target.checked) {
                            if (property === "All Properties") {
                              newSelected.clear();
                              newSelected.add("All Properties");
                            } else {
                              newSelected.delete("All Properties");
                              newSelected.add(property);
                            }
                          } else {
                            newSelected.delete(property);
                            if (newSelected.size === 0) {
                              newSelected.add("All Properties");
                            }
                          }
                          setSelectedProperties(newSelected);
                        }}
                        className="mr-3 rounded"
                        style={{ accentColor: BRAND_COLORS.primary }}
                      />
                      {property}
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center border border-gray-300 rounded-lg">
              <button
                onClick={() => setViewMode("Total")}
                className={`px-4 py-2 text-sm font-medium rounded-l-lg ${
                  viewMode === "Total"
                    ? "text-white"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
                style={{
                  backgroundColor:
                    viewMode === "Total" ? BRAND_COLORS.primary : undefined,
                }}
              >
                Total
              </button>
              <button
                onClick={() => setViewMode("Detail")}
                className={`px-4 py-2 text-sm font-medium border-l border-gray-300 ${
                  viewMode === "Detail"
                    ? "text-white"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
                style={{
                  backgroundColor:
                    viewMode === "Detail" ? BRAND_COLORS.primary : undefined,
                }}
              >
                Detail
              </button>
              <button
                onClick={() => setViewMode("Class")}
                className={`px-4 py-2 text-sm font-medium rounded-r-lg border-l border-gray-300 ${
                  viewMode === "Class"
                    ? "text-white"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
                style={{
                  backgroundColor:
                    viewMode === "Class" ? BRAND_COLORS.primary : undefined,
                }}
              >
                Class
              </button>
            </div>

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

      {/* Notification */}
      {notification.show && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div
            className={`p-4 rounded-lg ${
              notification.type === "success"
                ? "bg-green-50 text-green-800 border border-green-200"
                : notification.type === "error"
                  ? "bg-red-50 text-red-800 border border-red-200"
                  : "bg-blue-50 text-blue-800 border border-blue-200"
            }`}
          >
            {notification.message}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {dataError ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h3 className="text-lg font-medium text-red-800 mb-2">
              Error Loading Data
            </h3>
            <p className="text-red-700">{dataError}</p>
            <button
              onClick={fetchPLData}
              className="mt-4 inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-xl shadow-sm border">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">
                      Total Income
                    </p>
                    <p className="text-2xl font-bold text-green-600">
                      {formatCurrency(totalIncome)}
                    </p>
                  </div>
                  <div
                    className="p-3 rounded-full"
                    style={{ backgroundColor: BRAND_COLORS.success + "20" }}
                  >
                    <TrendingUp
                      className="w-6 h-6"
                      style={{ color: BRAND_COLORS.success }}
                    />
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">
                      Total Expenses
                    </p>
                    <p className="text-2xl font-bold text-red-600">
                      {formatCurrency(totalExpenses)}
                    </p>
                  </div>
                  <div
                    className="p-3 rounded-full"
                    style={{ backgroundColor: BRAND_COLORS.danger + "20" }}
                  >
                    <BarChart3
                      className="w-6 h-6"
                      style={{ color: BRAND_COLORS.danger }}
                    />
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">
                      Net Income
                    </p>
                    <p
                      className={`text-2xl font-bold ${netIncome >= 0 ? "text-green-600" : "text-red-600"}`}
                    >
                      {formatCurrency(netIncome)}
                    </p>
                  </div>
                  <div
                    className="p-3 rounded-full"
                    style={{
                      backgroundColor:
                        (netIncome >= 0
                          ? BRAND_COLORS.success
                          : BRAND_COLORS.danger) + "20",
                    }}
                  >
                    <LucidePieChart
                      className="w-6 h-6"
                      style={{
                        color:
                          netIncome >= 0
                            ? BRAND_COLORS.success
                            : BRAND_COLORS.danger,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* P&L Statement Table */}
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">
                  Profit & Loss Statement - {viewMode} View
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  {plAccounts.length} accounts • Timezone-independent date
                  handling • Using account_type for P&L classification
                  {viewMode === "Detail" && " • Monthly breakdown"}
                  {viewMode === "Class" && " • By property"}
                </p>
              </div>

              {isLoadingData ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="w-6 h-6 animate-spin mr-2" />
                  <span>Loading timezone-independent P&L data...</span>
                </div>
              ) : (
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="min-w-full divide-y divide-gray-200 sticky-first-col">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Account
                        </th>
                        {columnHeaders.map((header) => (
                          <th
                            key={header}
                            className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
                          >
                            {viewMode === "Detail"
                              ? header.substring(0, 3)
                              : header}
                          </th>
                        ))}
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {/* INCOME Section */}
                      <tr className="bg-green-50">
                        <td className="!bg-green-50 px-6 py-4 whitespace-nowrap text-sm font-bold text-green-800">
                          INCOME
                        </td>
                        {columnHeaders.map((header) => (
                          <td
                            key={header}
                            className="px-6 py-4 whitespace-nowrap text-sm font-bold text-green-800 text-right"
                          >
                            {formatCurrency(
                              groupedAccounts.income.reduce((sum, group) => {
                                return (
                                  sum +
                                  getCellValue(
                                    group.account,
                                    header,
                                    true,
                                    group.subAccounts,
                                  )
                                );
                              }, 0),
                            )}
                          </td>
                        ))}
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-green-800 text-right">
                          {formatCurrency(totalIncome)}
                        </td>
                      </tr>

                      {groupedAccounts.income.map((group) => (
                        <React.Fragment key={group.account.account}>
                          {/* Parent Account - Show combined total when collapsed, individual when expanded */}
                          <tr className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 pl-12">
                              <div className="flex items-center">
                                {group.subAccounts &&
                                  group.subAccounts.length > 0 && (
                                    <button
                                      onClick={() =>
                                        toggleAccountExpansion(
                                          group.account.account,
                                        )
                                      }
                                      className="mr-2 p-1 hover:bg-gray-200 rounded"
                                    >
                                      <ChevronRight
                                        className={`w-4 h-4 transition-transform ${
                                          expandedAccounts.has(
                                            group.account.account,
                                          )
                                            ? "rotate-90"
                                            : ""
                                        }`}
                                      />
                                    </button>
                                  )}
                                <span
                                  className={
                                    group.subAccounts ? "font-semibold" : ""
                                  }
                                >
                                  {group.account.account}
                                </span>
                              </div>
                            </td>
                            {columnHeaders.map((header) => (
                              <td
                                key={header}
                                className="px-6 py-4 whitespace-nowrap text-sm text-green-600 text-right"
                              >
                                <button
                                  onClick={() =>
                                    showTransactionDetails(
                                      group.account,
                                      undefined,
                                      viewMode === "Detail"
                                        ? header
                                        : undefined,
                                      viewMode === "Class" ? header : undefined,
                                      !expandedAccounts.has(
                                        group.account.account,
                                      ), // Show combined if collapsed
                                      group.subAccounts,
                                    )
                                  }
                                  className="font-medium hover:underline"
                                >
                                  {formatCurrency(
                                    getCellValue(
                                      group.account,
                                      header,
                                      !expandedAccounts.has(
                                        group.account.account,
                                      ), // Combined if collapsed
                                      group.subAccounts,
                                    ),
                                  )}
                                </button>
                              </td>
                            ))}
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 text-right">
                              <button
                                onClick={() =>
                                  showTransactionDetails(
                                    group.account,
                                    undefined,
                                    undefined,
                                    undefined,
                                    !expandedAccounts.has(
                                      group.account.account,
                                    ), // Show combined if collapsed
                                    group.subAccounts,
                                  )
                                }
                                className="font-medium hover:underline"
                              >
                                {formatCurrency(
                                  expandedAccounts.has(group.account.account)
                                    ? group.account.amount // Individual amount when expanded
                                    : group.combinedAmount, // Combined amount when collapsed
                                )}
                              </button>
                            </td>
                          </tr>

                          {/* Sub Accounts (if expanded) */}
                          {group.subAccounts &&
                            expandedAccounts.has(group.account.account) &&
                            group.subAccounts.map((subAccount) => (
                              <tr
                                key={subAccount.account}
                                className="hover:bg-gray-50 bg-gray-25"
                              >
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 pl-20">
                                  <div className="flex items-center">
                                    <span className="text-gray-400 mr-2">
                                      └
                                    </span>
                                    {subAccount.sub_account}
                                  </div>
                                </td>
                                {columnHeaders.map((header) => (
                                  <td
                                    key={header}
                                    className="px-6 py-4 whitespace-nowrap text-sm text-green-600 text-right"
                                  >
                                    <button
                                      onClick={() =>
                                        showTransactionDetails(
                                          group.account,
                                          subAccount,
                                          viewMode === "Detail"
                                            ? header
                                            : undefined,
                                          viewMode === "Class"
                                            ? header
                                            : undefined,
                                        )
                                      }
                                      className="hover:underline"
                                    >
                                      {formatCurrency(
                                        getCellValue(subAccount, header),
                                      )}
                                    </button>
                                  </td>
                                ))}
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 text-right">
                                  <button
                                    onClick={() =>
                                      showTransactionDetails(
                                        group.account,
                                        subAccount,
                                      )
                                    }
                                    className="hover:underline"
                                  >
                                    {formatCurrency(subAccount.amount)}
                                  </button>
                                </td>
                              </tr>
                            ))}
                        </React.Fragment>
                      ))}

                      {/* Total Income */}
                      <tr className="bg-green-100 font-semibold">
                        <td className="!bg-green-100 px-6 py-4 whitespace-nowrap text-sm text-green-800">
                          TOTAL INCOME
                        </td>
                        {columnHeaders.map((header) => (
                          <td
                            key={header}
                            className="px-6 py-4 whitespace-nowrap text-sm font-bold text-green-800 text-right"
                          >
                            {formatCurrency(
                              groupedAccounts.income.reduce((sum, group) => {
                                return (
                                  sum +
                                  getCellValue(
                                    group.account,
                                    header,
                                    true,
                                    group.subAccounts,
                                  )
                                );
                              }, 0),
                            )}
                          </td>
                        ))}
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-green-800 text-right">
                          {formatCurrency(totalIncome)}
                        </td>
                      </tr>

                      {/* COGS Section */}
                      <tr className="bg-yellow-50">
                        <td className="!bg-yellow-50 px-6 py-4 whitespace-nowrap text-sm font-bold text-yellow-800">
                          COGS
                        </td>
                        {columnHeaders.map((header) => (
                          <td
                            key={header}
                            className="px-6 py-4 whitespace-nowrap text-sm font-bold text-yellow-800 text-right"
                          >
                            {formatCurrency(
                              groupedAccounts.cogs.reduce((sum, group) => {
                                return (
                                  sum +
                                  getCellValue(
                                    group.account,
                                    header,
                                    true,
                                    group.subAccounts,
                                  )
                                );
                              }, 0),
                            )}
                          </td>
                        ))}
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-yellow-800 text-right">
                          {formatCurrency(totalCogs)}
                        </td>
                      </tr>

                      {groupedAccounts.cogs.map((group) => (
                        <React.Fragment key={group.account.account}>
                          {/* Parent Account - Show combined total when collapsed, individual when expanded */}
                          <tr className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 pl-12">
                              <div className="flex items-center">
                                {group.subAccounts &&
                                  group.subAccounts.length > 0 && (
                                    <button
                                      onClick={() =>
                                        toggleAccountExpansion(
                                          group.account.account,
                                        )
                                      }
                                      className="mr-2 p-1 hover:bg-gray-200 rounded"
                                    >
                                      <ChevronRight
                                        className={`w-4 h-4 transition-transform ${
                                          expandedAccounts.has(
                                            group.account.account,
                                          )
                                            ? "rotate-90"
                                            : ""
                                        }`}
                                      />
                                    </button>
                                  )}
                                <span
                                  className={
                                    group.subAccounts ? "font-semibold" : ""
                                  }
                                >
                                  {group.account.account}
                                </span>
                              </div>
                            </td>
                            {columnHeaders.map((header) => (
                              <td
                                key={header}
                                className="px-6 py-4 whitespace-nowrap text-sm text-red-600 text-right"
                              >
                                <button
                                  onClick={() =>
                                    showTransactionDetails(
                                      group.account,
                                      undefined,
                                      viewMode === "Detail"
                                        ? header
                                        : undefined,
                                      viewMode === "Class" ? header : undefined,
                                      !expandedAccounts.has(
                                        group.account.account,
                                      ), // Show combined if collapsed
                                      group.subAccounts,
                                    )
                                  }
                                  className="font-medium hover:underline"
                                >
                                  {formatCurrency(
                                    getCellValue(
                                      group.account,
                                      header,
                                      !expandedAccounts.has(
                                        group.account.account,
                                      ), // Combined if collapsed
                                      group.subAccounts,
                                    ),
                                  )}
                                </button>
                              </td>
                            ))}
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 text-right">
                              <button
                                onClick={() =>
                                  showTransactionDetails(
                                    group.account,
                                    undefined,
                                    undefined,
                                    undefined,
                                    !expandedAccounts.has(
                                      group.account.account,
                                    ), // Show combined if collapsed
                                    group.subAccounts,
                                  )
                                }
                                className="font-medium hover:underline"
                              >
                                {formatCurrency(
                                  expandedAccounts.has(group.account.account)
                                    ? group.account.amount // Individual amount when expanded
                                    : group.combinedAmount, // Combined amount when collapsed
                                )}
                              </button>
                            </td>
                          </tr>

                          {/* Sub Accounts (if expanded) */}
                          {group.subAccounts &&
                            expandedAccounts.has(group.account.account) &&
                            group.subAccounts.map((subAccount) => (
                              <tr
                                key={subAccount.account}
                                className="hover:bg-gray-50 bg-gray-25"
                              >
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 pl-20">
                                  <div className="flex items-center">
                                    <span className="text-gray-400 mr-2">
                                      └
                                    </span>
                                    {subAccount.sub_account}
                                  </div>
                                </td>
                                {columnHeaders.map((header) => (
                                  <td
                                    key={header}
                                    className="px-6 py-4 whitespace-nowrap text-sm text-red-600 text-right"
                                  >
                                    <button
                                      onClick={() =>
                                        showTransactionDetails(
                                          group.account,
                                          subAccount,
                                          viewMode === "Detail"
                                            ? header
                                            : undefined,
                                          viewMode === "Class"
                                            ? header
                                            : undefined,
                                        )
                                      }
                                      className="hover:underline"
                                    >
                                      {formatCurrency(
                                        getCellValue(subAccount, header),
                                      )}
                                    </button>
                                  </td>
                                ))}
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 text-right">
                                  <button
                                    onClick={() =>
                                      showTransactionDetails(
                                        group.account,
                                        subAccount,
                                      )
                                    }
                                    className="hover:underline"
                                  >
                                    {formatCurrency(subAccount.amount)}
                                  </button>
                                </td>
                              </tr>
                            ))}
                        </React.Fragment>
                      ))}

                      {/* Total COGS */}
                      <tr className="bg-yellow-100 font-semibold">
                        <td className="!bg-yellow-100 px-6 py-4 whitespace-nowrap text-sm text-yellow-800">
                          TOTAL COGS
                        </td>
                        {columnHeaders.map((header) => (
                          <td
                            key={header}
                            className="px-6 py-4 whitespace-nowrap text-sm font-bold text-yellow-800 text-right"
                          >
                            {formatCurrency(
                              groupedAccounts.cogs.reduce((sum, group) => {
                                return (
                                  sum +
                                  getCellValue(
                                    group.account,
                                    header,
                                    true,
                                    group.subAccounts,
                                  )
                                );
                              }, 0),
                            )}
                          </td>
                        ))}
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-yellow-800 text-right">
                          {formatCurrency(totalCogs)}
                        </td>
                      </tr>

                      {/* Gross Profit */}
                      <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
                        <td className="!bg-gray-100 px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          GROSS PROFIT
                        </td>
                        {columnHeaders.map((header) => {
                          const headerIncome = groupedAccounts.income.reduce(
                            (sum, group) => {
                              return (
                                sum +
                                getCellValue(
                                  group.account,
                                  header,
                                  true,
                                  group.subAccounts,
                                )
                              );
                            },
                            0,
                          );
                          const headerCogs = groupedAccounts.cogs.reduce(
                            (sum, group) => {
                              return (
                                sum +
                                getCellValue(
                                  group.account,
                                  header,
                                  true,
                                  group.subAccounts,
                                )
                              );
                            },
                            0,
                          );
                          const headerGross = headerIncome - headerCogs;
                          return (
                            <td
                              key={header}
                              className={`px-6 py-4 whitespace-nowrap text-sm text-right font-bold ${
                                headerGross >= 0
                                  ? "text-green-700"
                                  : "text-red-700"
                              }`}
                            >
                              {formatCurrency(headerGross)}
                            </td>
                          );
                        })}
                        <td
                          className={`px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-xl ${
                            grossProfit >= 0 ? "text-green-700" : "text-red-700"
                          }`}
                        >
                          {formatCurrency(grossProfit)}
                        </td>
                      </tr>

                      {/* Gross Profit Percentage */}
                      <tr>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          Gross Profit %
                        </td>
                        {columnHeaders.map((header) => {
                          const headerIncome = groupedAccounts.income.reduce(
                            (sum, group) => {
                              return (
                                sum +
                                getCellValue(
                                  group.account,
                                  header,
                                  true,
                                  group.subAccounts,
                                )
                              );
                            },
                            0,
                          );
                          const headerCogs = groupedAccounts.cogs.reduce(
                            (sum, group) => {
                              return (
                                sum +
                                getCellValue(
                                  group.account,
                                  header,
                                  true,
                                  group.subAccounts,
                                )
                              );
                            },
                            0,
                          );
                          const headerGross = headerIncome - headerCogs;
                          const pct =
                            headerIncome !== 0 ? headerGross / headerIncome : 0;
                          return (
                            <td
                              key={header}
                              className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right"
                            >
                              {formatPercentage(pct)}
                            </td>
                          );
                        })}
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                          {formatPercentage(grossProfitPercent)}
                        </td>
                      </tr>

                      {/* Spacer */}
                      <tr>
                        <td
                          colSpan={columnHeaders.length + 2}
                          className="py-2"
                        ></td>
                      </tr>

                      {/* EXPENSES Section */}
                      <tr className="bg-red-50">
                        <td className="!bg-red-50 px-6 py-4 whitespace-nowrap text-sm font-bold text-red-800">
                          EXPENSES
                        </td>
                        {columnHeaders.map((header) => (
                          <td
                            key={header}
                            className="px-6 py-4 whitespace-nowrap text-sm font-bold text-red-800 text-right"
                          >
                            {formatCurrency(
                              groupedAccounts.expenses.reduce((sum, group) => {
                                return (
                                  sum +
                                  getCellValue(
                                    group.account,
                                    header,
                                    true,
                                    group.subAccounts,
                                  )
                                );
                              }, 0),
                            )}
                          </td>
                        ))}
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-red-800 text-right">
                          {formatCurrency(totalExpenses)}
                        </td>
                      </tr>

                      {groupedAccounts.expenses.map((group) => (
                        <React.Fragment key={group.account.account}>
                          {/* Parent Account - Show combined total when collapsed, individual when expanded */}
                          <tr className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 pl-12">
                              <div className="flex items-center">
                                {group.subAccounts &&
                                  group.subAccounts.length > 0 && (
                                    <button
                                      onClick={() =>
                                        toggleAccountExpansion(
                                          group.account.account,
                                        )
                                      }
                                      className="mr-2 p-1 hover:bg-gray-200 rounded"
                                    >
                                      <ChevronRight
                                        className={`w-4 h-4 transition-transform ${
                                          expandedAccounts.has(
                                            group.account.account,
                                          )
                                            ? "rotate-90"
                                            : ""
                                        }`}
                                      />
                                    </button>
                                  )}
                                <span
                                  className={
                                    group.subAccounts ? "font-semibold" : ""
                                  }
                                >
                                  {group.account.account}
                                </span>
                              </div>
                            </td>
                            {columnHeaders.map((header) => (
                              <td
                                key={header}
                                className="px-6 py-4 whitespace-nowrap text-sm text-red-600 text-right"
                              >
                                <button
                                  onClick={() =>
                                    showTransactionDetails(
                                      group.account,
                                      undefined,
                                      viewMode === "Detail"
                                        ? header
                                        : undefined,
                                      viewMode === "Class" ? header : undefined,
                                      !expandedAccounts.has(
                                        group.account.account,
                                      ), // Show combined if collapsed
                                      group.subAccounts,
                                    )
                                  }
                                  className="font-medium hover:underline"
                                >
                                  {formatCurrency(
                                    getCellValue(
                                      group.account,
                                      header,
                                      !expandedAccounts.has(
                                        group.account.account,
                                      ), // Combined if collapsed
                                      group.subAccounts,
                                    ),
                                  )}
                                </button>
                              </td>
                            ))}
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 text-right">
                              <button
                                onClick={() =>
                                  showTransactionDetails(
                                    group.account,
                                    undefined,
                                    undefined,
                                    undefined,
                                    !expandedAccounts.has(
                                      group.account.account,
                                    ), // Show combined if collapsed
                                    group.subAccounts,
                                  )
                                }
                                className="font-medium hover:underline"
                              >
                                {formatCurrency(
                                  expandedAccounts.has(group.account.account)
                                    ? group.account.amount // Individual amount when expanded
                                    : group.combinedAmount, // Combined amount when collapsed
                                )}
                              </button>
                            </td>
                          </tr>

                          {/* Sub Accounts (if expanded) */}
                          {group.subAccounts &&
                            expandedAccounts.has(group.account.account) &&
                            group.subAccounts.map((subAccount) => (
                              <tr
                                key={subAccount.account}
                                className="hover:bg-gray-50 bg-gray-25"
                              >
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 pl-20">
                                  <div className="flex items-center">
                                    <span className="text-gray-400 mr-2">
                                      └
                                    </span>
                                    {subAccount.sub_account}
                                  </div>
                                </td>
                                {columnHeaders.map((header) => (
                                  <td
                                    key={header}
                                    className="px-6 py-4 whitespace-nowrap text-sm text-red-600 text-right"
                                  >
                                    <button
                                      onClick={() =>
                                        showTransactionDetails(
                                          group.account,
                                          subAccount,
                                          viewMode === "Detail"
                                            ? header
                                            : undefined,
                                          viewMode === "Class"
                                            ? header
                                            : undefined,
                                        )
                                      }
                                      className="hover:underline"
                                    >
                                      {formatCurrency(
                                        getCellValue(subAccount, header),
                                      )}
                                    </button>
                                  </td>
                                ))}
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 text-right">
                                  <button
                                    onClick={() =>
                                      showTransactionDetails(
                                        group.account,
                                        subAccount,
                                      )
                                    }
                                    className="hover:underline"
                                  >
                                    {formatCurrency(subAccount.amount)}
                                  </button>
                                </td>
                              </tr>
                            ))}
                        </React.Fragment>
                      ))}

                      {/* Total Expenses */}
                      <tr className="bg-red-100 font-semibold">
                        <td className="!bg-red-100 px-6 py-4 whitespace-nowrap text-sm text-red-800">
                          TOTAL EXPENSES
                        </td>
                        {columnHeaders.map((header) => (
                          <td
                            key={header}
                            className="px-6 py-4 whitespace-nowrap text-sm font-bold text-red-800 text-right"
                          >
                            {formatCurrency(
                              groupedAccounts.expenses.reduce((sum, group) => {
                                return (
                                  sum +
                                  getCellValue(
                                    group.account,
                                    header,
                                    true,
                                    group.subAccounts,
                                  )
                                );
                              }, 0),
                            )}
                          </td>
                        ))}
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-red-800 text-right">
                          {formatCurrency(totalExpenses)}
                        </td>
                      </tr>

                      {/* Net Income */}
                      <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
                        <td className="!bg-gray-100 px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          NET INCOME
                        </td>
                        {columnHeaders.map((header) => {
                          const headerIncome = groupedAccounts.income.reduce(
                            (sum, group) => {
                              return (
                                sum +
                                getCellValue(
                                  group.account,
                                  header,
                                  true,
                                  group.subAccounts,
                                )
                              );
                            },
                            0,
                          );
                          const headerCogs = groupedAccounts.cogs.reduce(
                            (sum, group) => {
                              return (
                                sum +
                                getCellValue(
                                  group.account,
                                  header,
                                  true,
                                  group.subAccounts,
                                )
                              );
                            },
                            0,
                          );
                          const headerExpenses =
                            groupedAccounts.expenses.reduce((sum, group) => {
                              return (
                                sum +
                                getCellValue(
                                  group.account,
                                  header,
                                  true,
                                  group.subAccounts,
                                )
                              );
                            }, 0);
                          const headerNet =
                            headerIncome - headerCogs - headerExpenses;
                          return (
                            <td
                              key={header}
                              className={`px-6 py-4 whitespace-nowrap text-sm text-right font-bold ${
                                headerNet >= 0
                                  ? "text-green-700"
                                  : "text-red-700"
                              }`}
                            >
                              {formatCurrency(headerNet)}
                            </td>
                          );
                        })}
                        <td
                          className={`px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-xl ${
                            netIncome >= 0 ? "text-green-700" : "text-red-700"
                          }`}
                        >
                          {formatCurrency(netIncome)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Transaction Details Modal */}
      {showTransactionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-200 flex-shrink-0">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 text-center">
                    {transactionModalTitle}
                  </h3>
                  <p className="text-sm text-gray-600 text-center">
                    {modalTransactionDetails.length} transactions
                  </p>
                </div>
                <button
                  onClick={() => setShowTransactionModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Transaction Totals */}
              {modalTransactionDetails.length > 0 && (
                <div className="mt-4 grid grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
                  <div className="text-center">
                    <div className="text-sm text-gray-600 text-center">
                      Total Debits
                    </div>
                    <div className="text-lg font-semibold text-red-600 text-center">
                      {formatCurrency(
                        modalTransactionDetails.reduce((sum, t) => {
                          const debitValue = t.debit
                            ? Number.parseFloat(
                                t.debit.toString().replace(/[^0-9.-]/g, ""),
                              ) || 0
                            : 0;
                          return sum + debitValue;
                        }, 0),
                      )}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-gray-600 text-center">
                      Total Credits
                    </div>
                    <div className="text-lg font-semibold text-green-600 text-center">
                      {formatCurrency(
                        modalTransactionDetails.reduce((sum, t) => {
                          const creditValue = t.credit
                            ? Number.parseFloat(
                                t.credit.toString().replace(/[^0-9.-]/g, ""),
                              ) || 0
                            : 0;
                          return sum + creditValue;
                        }, 0),
                      )}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-gray-600 text-center">
                      Net Impact
                    </div>
                    <div
                      className={`text-lg font-semibold text-center ${
                        modalTransactionDetails.reduce((sum, t) => {
                          const creditValue = t.credit
                            ? Number.parseFloat(
                                t.credit.toString().replace(/[^0-9.-]/g, ""),
                              ) || 0
                            : 0;
                          const debitValue = t.debit
                            ? Number.parseFloat(
                                t.debit.toString().replace(/[^0-9.-]/g, ""),
                              ) || 0
                            : 0;
                          return sum + (creditValue - debitValue);
                        }, 0) >= 0
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {formatCurrency(
                        Math.abs(
                          modalTransactionDetails.reduce((sum, t) => {
                            const creditValue = t.credit
                              ? Number.parseFloat(
                                  t.credit.toString().replace(/[^0-9.-]/g, ""),
                                ) || 0
                              : 0;
                            const debitValue = t.debit
                              ? Number.parseFloat(
                                  t.debit.toString().replace(/[^0-9.-]/g, ""),
                                ) || 0
                              : 0;
                            return sum + (creditValue - debitValue);
                          }, 0),
                        ),
                      )}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-gray-600 text-center">
                      Transactions
                    </div>
                    <div className="text-lg font-semibold text-blue-600 text-center">
                      {modalTransactionDetails.length}
                    </div>
                  </div>
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
                    {modalTransactionDetails.map((transaction, index) => {
                      // Calculate the net amount for this transaction
                      const debitValue = transaction.debit
                        ? Number.parseFloat(
                            transaction.debit
                              .toString()
                              .replace(/[^0-9.-]/g, ""),
                          ) || 0
                        : 0;
                      const creditValue = transaction.credit
                        ? Number.parseFloat(
                            transaction.credit
                              .toString()
                              .replace(/[^0-9.-]/g, ""),
                          ) || 0
                        : 0;
                      const netAmount = creditValue - debitValue;

                      return (
                      <tr
                        key={index}
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => openJournalEntry(transaction.entry_number)}
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatDateDisplay(transaction.date)}
                        </td>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            {transaction.name ||
                              transaction.vendor ||
                              transaction.customer ||
                              "N/A"}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500">
                            {transaction.memo || "N/A"}
                          </td>
                          <td
                            className={`px-6 py-4 whitespace-nowrap text-sm text-right font-medium ${
                              netAmount >= 0 ? "text-green-600" : "text-red-600"
                            }`}
                          >
                            {formatCurrency(Math.abs(netAmount))}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            {transaction.class && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                {transaction.class}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
      {showJournalEntryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center flex-shrink-0">
              <h3 className="text-lg font-semibold text-gray-900">{journalEntryTitle}</h3>
              <button
                onClick={() => setShowJournalEntryModal(false)}
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
                        {formatDateDisplay(line.date)}
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
  );
}
