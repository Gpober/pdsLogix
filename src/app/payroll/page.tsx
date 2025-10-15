"use client";

import React, { useEffect, useMemo, useState, useRef } from "react";
import {
  Download,
  RefreshCw,
  ChevronDown,
  Users,
  DollarSign,
  TrendingUp,
  PieChart as PieIcon,
  Search,
  BarChart3,
  Calendar,
  LineChart as LineChartIcon,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Send,
  Check,
  X,
  AlertCircle,
  User,
  ClipboardCheck,
  CheckCircle,
  XCircle,
  ChevronLeft,
} from "lucide-react";
import {
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Bar,
  Line,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  BarChart,
  LineChart,
} from "recharts";
import { supabase } from "@/lib/supabaseClient";
import DateRangePicker from "@/components/DateRangePicker";

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

type Payment = {
  id?: number;
  last_name: string | null;
  first_name: string | null;
  department: string | null;
  payment_method: string | null;
  date: string | null;
  total_amount: number | null;
};

type TimePeriod = "Monthly" | "Quarterly" | "YTD" | "Trailing 12" | "Custom";

type ViewMode = "analytics" | "approvals";

interface PendingSubmission {
  id: string;
  location_id: string;
  location_name?: string;
  pay_date: string;
  payroll_group: 'A' | 'B';
  period_start: string;
  period_end: string;
  total_amount: number;
  employee_count: number;
  submitted_by: string;
  submitted_at: string;
  status: string;
}

interface LocationStatus {
  location_id: string;
  location_name: string;
  submission_id?: string;
  status: 'approved' | 'pending' | 'not_submitted';
  total_amount?: number;
  employee_count?: number;
  pay_date?: string;
  payroll_group?: 'A' | 'B';
  submitted_at?: string;
}

interface SubmissionDetail {
  employee_id: string;
  employee_name: string;
  hours: number | null;
  units: number | null;
  amount: number;
  notes: string | null;
}

// I AM CFO Logo
const IAMCFOLogo = ({ className = "w-8 h-8" }: { className?: string }) => (
  <div className={`${className} flex items-center justify-center relative`}>
    <svg viewBox="0 0 120 120" className="w-full h-full">
      <circle cx="60" cy="60" r="55" fill="#E2E8F0" stroke="#CBD5E1" strokeWidth="2" />
      <circle cx="60" cy="60" r="42" fill={BRAND_COLORS.primary} />
      <g fill="white">
        <rect x="35" y="70" width="6" height="15" rx="1" />
        <rect x="44" y="65" width="6" height="20" rx="1" />
        <rect x="53" y="55" width="6" height="30" rx="1" />
        <rect x="62" y="50" width="6" height="35" rx="1" />
        <rect x="71" y="60" width="6" height="25" rx="1" />
        <rect x="80" y="45" width="6" height="40" rx="1" />
        <path d="M35 72 L44 67 L53 57 L62 52 L71 62 L80 47" stroke="#FFFFFF" strokeWidth="2.5" fill="none" />
        <circle cx="35" cy="72" r="2.5" fill="#FFFFFF" />
        <circle cx="44" cy="67" r="2.5" fill="#FFFFFF" />
        <circle cx="53" cy="57" r="2.5" fill="#FFFFFF" />
        <circle cx="62" cy="52" r="2.5" fill="#FFFFFF" />
        <circle cx="71" cy="62" r="2.5" fill="#FFFFFF" />
        <circle cx="80" cy="47" r="2.5" fill="#FFFFFF" />
      </g>
      <text x="60" y="95" textAnchor="middle" fill="white" fontSize="11" fontWeight="bold" fontFamily="Arial, sans-serif">
        CFO
      </text>
    </svg>
  </div>
);

const formatDate = (date: string) =>
  new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

export default function PayrollPage() {
  // UI state
  const [notification, setNotification] = useState<{ show: boolean; message: string; type: "info" | "success" | "error" | "warning" }>({ show: false, message: "", type: "info" });
  const [departmentFilter, setDepartmentFilter] = useState("All Departments");
  const [departmentDropdownOpen, setDepartmentDropdownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("Monthly");
  const [selectedMonth, setSelectedMonth] = useState(
    new Date().toLocaleString("en-US", { month: "long" })
  );
  const [selectedYear, setSelectedYear] = useState(
    String(new Date().getFullYear())
  );
  const [timePeriodDropdownOpen, setTimePeriodDropdownOpen] = useState(false);
  const [monthDropdownOpen, setMonthDropdownOpen] = useState(false);
  const [yearDropdownOpen, setYearDropdownOpen] = useState(false);
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [chartType, setChartType] = useState<"pie" | "bar">("pie");
  const [trendChartType, setTrendChartType] = useState<"line" | "bar">("line");
  const [summaryView, setSummaryView] = useState<"department" | "date">("department");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>("analytics");

  // Approval States
  const [pendingSubmissions, setPendingSubmissions] = useState<PendingSubmission[]>([]);
  const [allLocations, setAllLocations] = useState<LocationStatus[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<PendingSubmission | null>(null);
  const [submissionDetails, setSubmissionDetails] = useState<SubmissionDetail[]>([]);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [userId, setUserId] = useState<string | null>("demo-user-id");
  const [organizationId, setOrganizationId] = useState<string | null>("demo-org-id");

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
    String(new Date().getFullYear() - 5 + i)
  );

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

  const timePeriodDropdownRef = useRef<HTMLDivElement>(null);
  const monthDropdownRef = useRef<HTMLDivElement>(null);
  const yearDropdownRef = useRef<HTMLDivElement>(null);

  // Data state
  const [payments, setPayments] = useState<Payment[]>([]);

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
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const monthIndex = monthsList.indexOf(selectedMonth);
    const yearNum = parseInt(selectedYear, 10);

    const makeDate = (y: number, m: number, d: number) =>
      new Date(Date.UTC(y, m, d)).toISOString().split("T")[0];

    let start = "";
    let end = "";
    if (timePeriod === "Monthly") {
      start = makeDate(yearNum, monthIndex, 1);
      end = makeDate(yearNum, monthIndex + 1, 0);
    } else if (timePeriod === "Quarterly") {
      const qStart = Math.floor(monthIndex / 3) * 3;
      start = makeDate(yearNum, qStart, 1);
      end = makeDate(yearNum, qStart + 3, 0);
    } else if (timePeriod === "YTD") {
      start = makeDate(yearNum, 0, 1);
      end = makeDate(yearNum, monthIndex + 1, 0);
    } else if (timePeriod === "Trailing 12") {
      const endDate = makeDate(yearNum, monthIndex + 1, 0);
      const startDate = makeDate(yearNum, monthIndex - 11, 1);
      start = startDate;
      end = endDate;
    } else {
      start = customStartDate;
      end = customEndDate;
    }
    setStartDate(start);
    setEndDate(end);
  }, [timePeriod, selectedMonth, selectedYear, customStartDate, customEndDate]);

  const calculatePreviousDateRange = (startDate: string, endDate: string) => {
    const start = new Date(`${startDate}T00:00:00Z`);
    const end = new Date(`${endDate}T00:00:00Z`);

    if (timePeriod === "Monthly") {
      const monthIndex = monthsList.indexOf(selectedMonth);
      const year = parseInt(selectedYear, 10);
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
      const year = parseInt(selectedYear, 10);
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
      const year = parseInt(selectedYear, 10);
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
      prevStart.setUTCFullYear(prevStart.getUTCFullYear() - 1);
      prevEnd.setUTCFullYear(prevEnd.getUTCFullYear() - 1);
      return {
        prevStartDate: prevStart.toISOString().split("T")[0],
        prevEndDate: prevEnd.toISOString().split("T")[0],
      };
    } else {
      const diff =
        Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) +
        1;
      const prevEnd = new Date(start);
      prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
      const prevStart = new Date(prevEnd);
      prevStart.setUTCDate(prevStart.getUTCDate() - (diff - 1));
      return {
        prevStartDate: prevStart.toISOString().split("T")[0],
        prevEndDate: prevEnd.toISOString().split("T")[0],
      };
    }
  };

  const { prevStartDate, prevEndDate } = useMemo(() => {
    if (!startDate || !endDate) return { prevStartDate: "", prevEndDate: "" };
    return calculatePreviousDateRange(startDate, endDate);
  }, [startDate, endDate, timePeriod, selectedMonth, selectedYear]);

  // Load pending submissions and all locations
  useEffect(() => {
    loadPendingSubmissions();
    loadAllLocations();
  }, []);

  const loadPendingSubmissions = async () => {
    const { data: submissions, error } = await supabase
      .from('payroll_submissions')
      .select('*')
      .eq('status', 'pending')
      .order('submitted_at', { ascending: false });

    if (error) {
      console.error('Error loading pending submissions:', error);
      return;
    }

    const locationsIds = [...new Set(submissions?.map(s => s.location_id))];
    const { data: locations } = await supabase
      .from('locations')
      .select('id, name')
      .in('id', locationsIds);

    const locationsMap = new Map(locations?.map(l => [l.id, l.name]));

    const submissionsWithNames = (submissions || []).map(s => ({
      ...s,
      location_name: locationsMap.get(s.location_id) || 'Unknown Location'
    }));

    setPendingSubmissions(submissionsWithNames);
  };

  const loadAllLocations = async () => {
    const { data: locations, error: locationsError } = await supabase
      .from('locations')
      .select('id, name');

    if (locationsError) {
      console.error('Error loading locations:', locationsError);
      return;
    }

    const getNextFriday = () => {
      const today = new Date();
      const dayOfWeek = today.getDay();
      const daysUntilFriday = dayOfWeek <= 5 ? 5 - dayOfWeek : 7 - dayOfWeek + 5;
      const nextFriday = new Date(today);
      nextFriday.setDate(today.getDate() + daysUntilFriday);
      
      const year = nextFriday.getFullYear();
      const month = String(nextFriday.getMonth() + 1).padStart(2, '0');
      const day = String(nextFriday.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const nextFriday = getNextFriday();

    const { data: submissions } = await supabase
      .from('payroll_submissions')
      .select('*')
      .eq('pay_date', nextFriday);

    const submissionsMap = new Map(submissions?.map(s => [s.location_id, s]));

    const locationStatuses: LocationStatus[] = (locations || []).map((location) => {
      const submission = submissionsMap.get(location.id);

      if (submission) {
        return {
          location_id: location.id,
          location_name: location.name,
          submission_id: submission.id,
          status: submission.status as 'approved' | 'pending',
          total_amount: submission.total_amount,
          employee_count: submission.employee_count,
          pay_date: submission.pay_date,
          payroll_group: submission.payroll_group as 'A' | 'B',
          submitted_at: submission.submitted_at
        };
      } else {
        return {
          location_id: location.id,
          location_name: location.name,
          status: 'not_submitted' as const
        };
      }
    });

    setAllLocations(locationStatuses);
  };

  const handleReviewSubmission = async (submission: PendingSubmission) => {
    setSelectedSubmission(submission);

    const { data: details, error } = await supabase
      .from('payroll_submission_details')
      .select('*')
      .eq('submission_id', submission.id);

    if (error) {
      console.error('Error loading submission details:', error);
      return;
    }

    const employeeIds = details?.map(d => d.employee_id) || [];
    const { data: employees } = await supabase
      .from('employees')
      .select('id, first_name, last_name')
      .in('id', employeeIds);

    const employeesMap = new Map(
      employees?.map(e => [e.id, `${e.first_name} ${e.last_name}`])
    );

    const detailsWithNames = (details || []).map(d => ({
      ...d,
      employee_name: employeesMap.get(d.employee_id) || 'Unknown Employee'
    }));

    setSubmissionDetails(detailsWithNames);
    setShowApprovalModal(true);
  };

  const handleApprove = async () => {
    if (!selectedSubmission || !userId) return;

    setIsApproving(true);

    try {
      const paymentsToInsert = submissionDetails.map(detail => ({
        first_name: detail.employee_name.split(' ')[0],
        last_name: detail.employee_name.split(' ').slice(1).join(' '),
        department: selectedSubmission.location_name,
        date: selectedSubmission.pay_date,
        total_amount: detail.amount,
        payment_method: 'Payroll'
      }));

      const { error: paymentsError } = await supabase
        .from('payments')
        .insert(paymentsToInsert);

      if (paymentsError) throw paymentsError;

      const { error: updateError } = await supabase
        .from('payroll_submissions')
        .update({
          status: 'approved',
          approved_by: userId,
          approved_at: new Date().toISOString()
        })
        .eq('id', selectedSubmission.id);

      if (updateError) throw updateError;

      showNotification('Payroll approved successfully!', 'success');
      setShowApprovalModal(false);
      setSelectedSubmission(null);
      loadPendingSubmissions();
      loadAllLocations();
      fetchPayments();

    } catch (error) {
      console.error('Error approving payroll:', error);
      showNotification('Failed to approve payroll. Please try again.', 'error');
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    if (!selectedSubmission || !userId) return;

    setIsApproving(true);

    try {
      const { error } = await supabase
        .from('payroll_submissions')
        .update({
          status: 'rejected',
          approved_by: userId,
          approved_at: new Date().toISOString()
        })
        .eq('id', selectedSubmission.id);

      if (error) throw error;

      showNotification('Payroll rejected. Location manager can resubmit.', 'warning');
      setShowApprovalModal(false);
      setSelectedSubmission(null);
      loadPendingSubmissions();
      loadAllLocations();

    } catch (error) {
      console.error('Error rejecting payroll:', error);
      showNotification('Failed to reject payroll. Please try again.', 'error');
    } finally {
      setIsApproving(false);
    }
  };

  // Fetch payments
  const fetchPayments = async () => {
    const { data, error } = await supabase
      .from("payments")
      .select(
        "id, last_name, first_name, department, payment_method, date, total_amount"
      )
      .order("date", { ascending: false })
      .limit(5000);
    if (error) {
      showNotification(error.message, "error");
      return;
    }
    setPayments((data ?? []) as Payment[]);
  };

  useEffect(() => {
    fetchPayments();
  }, []);

  // Derived data
  const departments = useMemo(() => {
    const set = new Set<string>(["All Departments"]);
    payments.forEach((p) => {
      if (p.department && p.department.trim() !== "") set.add(p.department);
    });
    return Array.from(set);
  }, [payments]);

  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      const matchesDept =
        departmentFilter === "All Departments" || (p.department ?? "") === departmentFilter;
      const fullName = `${p.first_name ?? ""} ${p.last_name ?? ""}`.toLowerCase();
      const hay = [
        fullName,
        (p.department ?? "").toLowerCase(),
        (p.payment_method ?? "").toLowerCase(),
      ].join(" ");
      const matchesSearch = searchTerm.trim() === "" || hay.includes(searchTerm.toLowerCase());
      const matchesDate =
        (!startDate || (p.date && Date.parse(p.date) >= Date.parse(startDate))) &&
        (!endDate || (p.date && Date.parse(p.date) <= Date.parse(endDate)));
      return matchesDept && matchesSearch && matchesDate;
    });
  }, [payments, departmentFilter, searchTerm, startDate, endDate]);

  const filteredPrevPayments = useMemo(() => {
    return payments.filter((p) => {
      const matchesDept =
        departmentFilter === "All Departments" || (p.department ?? "") === departmentFilter;
      const fullName = `${p.first_name ?? ""} ${p.last_name ?? ""}`.toLowerCase();
      const hay = [
        fullName,
        (p.department ?? "").toLowerCase(),
        (p.payment_method ?? "").toLowerCase(),
      ].join(" ");
      const matchesSearch = searchTerm.trim() === "" || hay.includes(searchTerm.toLowerCase());
      const matchesDate =
        (!prevStartDate || (p.date && Date.parse(p.date) >= Date.parse(prevStartDate))) &&
        (!prevEndDate || (p.date && Date.parse(p.date) <= Date.parse(prevEndDate)));
      return matchesDept && matchesSearch && matchesDate;
    });
  }, [payments, departmentFilter, searchTerm, prevStartDate, prevEndDate]);

  // KPIs
  const currentKpis = useMemo(() => {
    const totalTx = filteredPayments.length;
    let total = 0;
    for (const p of filteredPayments) {
      total += Number(p.total_amount || 0);
    }
    const avg = totalTx ? total / totalTx : 0;

    const byDept = new Map<string, number>();
    for (const p of filteredPayments) {
      const dept = (p.department || "Uncategorized").trim();
      byDept.set(dept, (byDept.get(dept) || 0) + Number(p.total_amount || 0));
    }
    const topDept = Array.from(byDept.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

    return { totalTx, total, avg, topDept };
  }, [filteredPayments]);

  const prevKpis = useMemo(() => {
    const totalTx = filteredPrevPayments.length;
    let total = 0;
    for (const p of filteredPrevPayments) {
      total += Number(p.total_amount || 0);
    }
    const avg = totalTx ? total / totalTx : 0;
    return { totalTx, total, avg };
  }, [filteredPrevPayments]);

  const calculateGrowth = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / Math.abs(previous)) * 100;
  };

  const kpiGrowth = useMemo(
    () => ({
      totalTx: calculateGrowth(currentKpis.totalTx, prevKpis.totalTx),
      total: calculateGrowth(currentKpis.total, prevKpis.total),
      avg: calculateGrowth(currentKpis.avg, prevKpis.avg),
    }),
    [currentKpis, prevKpis],
  );

  // Trend & Department totals
  const trendData = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const labels: { key: string; y: number; m: number }[] = [];
    for (let m = 0; m <= currentMonth; m++) {
      const key = monthsList[m].slice(0, 3) + " " + currentYear;
      labels.push({ key, y: currentYear, m });
    }
    const map = new Map<string, { month: string; grossPay: number; netPay: number }>();
    labels.forEach((l) => map.set(l.key, { month: l.key, grossPay: 0, netPay: 0 }));

    for (const p of filteredPayments) {
      if (!p.date) continue;
      const d = new Date(p.date);
      const key =
        monthsList[d.getUTCMonth()].slice(0, 3) + " " + d.getUTCFullYear();
      if (!map.has(key)) continue;
      const amt = Number(p.total_amount || 0);
      const bucket = map.get(key)!;
      bucket.grossPay += amt;
      bucket.netPay += amt;
    }

    return Array.from(map.values());
  }, [filteredPayments]);

  const departmentData = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of filteredPayments) {
      const dept = (p.department || "Uncategorized").trim();
      map.set(dept, (map.get(dept) || 0) + Number(p.total_amount || 0));
    }
    return Array.from(map.entries()).map(([department, cost]) => ({ department, cost }));
  }, [filteredPayments]);

  const departmentSummary = useMemo(() => {
    const map = new Map<
      string,
      { total: number; people: Map<string, number> }
    >();
    for (const p of filteredPayments) {
      const dept = (p.department || "Uncategorized").trim();
      const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Unknown";
      const amt = Number(p.total_amount || 0);
      if (!map.has(dept)) map.set(dept, { total: 0, people: new Map() });
      const info = map.get(dept)!;
      info.total += amt;
      info.people.set(name, (info.people.get(name) || 0) + amt);
    }
    return Array.from(map.entries())
      .map(([department, { total, people }]) => ({
        department,
        total,
        people: Array.from(people.entries()).map(([name, amount]) => ({
          name,
          amount,
        })),
      }))
      .sort((a, b) => b.total - a.total);
  }, [filteredPayments]);

  const dateSummary = useMemo(() => {
    const map = new Map<
      string,
      { total: number; people: Map<string, number> }
    >();
    for (const p of filteredPayments) {
      const date = p.date ? p.date.split("T")[0] : "Unknown";
      const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Unknown";
      const amt = Number(p.total_amount || 0);
      if (!map.has(date)) map.set(date, { total: 0, people: new Map() });
      const info = map.get(date)!;
      info.total += amt;
      info.people.set(name, (info.people.get(name) || 0) + amt);
    }
    return Array.from(map.entries())
      .map(([date, { total, people }]) => ({
        date,
        total,
        people: Array.from(people.entries()).map(([name, amount]) => ({
          name,
          amount,
        })),
      }))
      .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  }, [filteredPayments]);

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // UI helpers
  const CHART_COLORS = [BRAND_COLORS.primary, BRAND_COLORS.success, BRAND_COLORS.warning, BRAND_COLORS.danger, BRAND_COLORS.secondary];

  const ringStyle = {
    "--tw-ring-color": BRAND_COLORS.secondary + "33",
  } as React.CSSProperties;

  const formatCurrency = (amount: number): string =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

  const formatPercentage = (value: number): string =>
    `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;

  const renderDeptTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: Array<{ payload: { department: string; cost: number } }>;
  }) => {
    if (!active || !payload || !payload.length) return null;
    const data = payload[0].payload;
    return (
      <div className="bg-white p-2 border rounded shadow text-sm">
        <div className="font-medium">Department: {data.department}</div>
        <div>Total: {formatCurrency(Number(data.cost))}</div>
      </div>
    );
  };

  const showNotification = (message: string, type: "info" | "success" | "error" | "warning" = "info") => {
    setNotification({ show: true, message, type });
    setTimeout(() => setNotification({ show: false, message: "", type: "info" }), 3000);
  };

  const exportCSV = () => {
    const headers = ["date", "first_name", "last_name", "department", "payment_method", "total_amount"];
    const rows = filteredPayments.map((p) => [
      p.date ?? "",
      p.first_name ?? "",
      p.last_name ?? "",
      p.department ?? "",
      p.payment_method ?? "",
      String(p.total_amount ?? ""),
    ]);
    const csv = [headers, ...rows].map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payments_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification("Payments exported", "success");
  };

  const getLocationStatusColor = (status: LocationStatus['status']) => {
    switch (status) {
      case 'approved': return BRAND_COLORS.success;
      case 'pending': return BRAND_COLORS.warning;
      case 'not_submitted': return BRAND_COLORS.danger;
    }
  };

  const getLocationStatusText = (status: LocationStatus['status']) => {
    switch (status) {
      case 'approved': return 'Approved';
      case 'pending': return 'Pending Approval';
      case 'not_submitted': return 'Not Submitted';
    }
  };

  const getLocationStatusIcon = (status: LocationStatus['status']) => {
    switch (status) {
      case 'approved': return CheckCircle;
      case 'pending': return Clock;
      case 'not_submitted': return AlertCircle;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-center mb-4">
            <IAMCFOLogo className="w-8 h-8 mr-4" />
            <div>
              <div className="flex items-center justify-center space-x-3">
                <h1 className="text-2xl font-bold text-gray-900 text-center">I AM CFO</h1>
                <span className="text-sm px-3 py-1 rounded-full text-white" style={{ backgroundColor: BRAND_COLORS.primary }}>
                  Payroll Management
                </span>
              </div>
              <p className="text-sm text-gray-600 mt-1 text-center">
                Live payments from Supabase • Department insights • Approval workflow
              </p>
            </div>
          </div>

          {/* View Mode Toggle */}
          <div className="flex justify-center gap-2">
            <button
              onClick={() => setViewMode("analytics")}
              className={`px-6 py-2 rounded-lg font-medium transition-all ${
                viewMode === "analytics"
                  ? "text-white shadow-md"
                  : "bg-white text-gray-700 border border-gray-300 hover:border-gray-400"
              }`}
              style={viewMode === "analytics" ? { backgroundColor: BRAND_COLORS.primary } : {}}
            >
              📊 Analytics
            </button>
            <button
              onClick={() => setViewMode("approvals")}
              className={`px-6 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${
                viewMode === "approvals"
                  ? "text-white shadow-md"
                  : "bg-white text-gray-700 border border-gray-300 hover:border-gray-400"
              }`}
              style={viewMode === "approvals" ? { backgroundColor: BRAND_COLORS.accent } : {}}
            >
              <ClipboardCheck size={18} />
              Approvals
              {pendingSubmissions.length > 0 && (
                <span className="bg-red-500 text-white rounded-full px-2 py-0.5 text-xs font-bold">
                  {pendingSubmissions.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {viewMode === "analytics" ? (
          <div className="space-y-8">
            {/* Controls */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
              <h2 className="flex-1 text-3xl font-bold text-center" style={{ color: BRAND_COLORS.primary }}>
                Historical Overview
              </h2>
              <div className="flex flex-wrap gap-4 items-center justify-center lg:justify-end">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Search name, dept, or method…"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 transition-all w-64"
                    style={ringStyle}
                  />
                </div>

                {/* Department Filter */}
                <div className="relative">
                  <button
                    onClick={() => setDepartmentDropdownOpen((v) => !v)}
                    className="flex items-center justify-between w-56 px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm hover:border-blue-500 focus:outline-none focus:ring-2 transition-all"
                    style={ringStyle}
                  >
                    <span>{departmentFilter}</span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${departmentDropdownOpen ? "rotate-180" : ""}`} />
                  </button>
                  {departmentDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-50">
                      {departments.map((dept) => (
                        <div
                          key={dept}
                          className="px-4 py-2 hover:bg-gray-50 cursor-pointer text-sm"
                          onClick={() => {
                            setDepartmentFilter(dept);
                            setDepartmentDropdownOpen(false);
                          }}
                        >
                          {dept}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Time Period */}
                <div className="flex items-center gap-2">
                  <div className="relative" ref={timePeriodDropdownRef}>
                    <button
                      onClick={() => setTimePeriodDropdownOpen(!timePeriodDropdownOpen)}
                      className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm hover:border-blue-500 focus:outline-none focus:ring-2 transition-all"
                      style={ringStyle}
                    >
                      <Calendar className="w-4 h-4 mr-2" />
                      {timePeriod}
                      <ChevronDown className="w-4 h-4 ml-2" />
                    </button>
                    {timePeriodDropdownOpen && (
                      <div className="absolute z-10 mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg">
                        {(["Monthly", "Quarterly", "YTD", "Trailing 12", "Custom"] as TimePeriod[]).map((p) => (
                          <div
                            key={p}
                            className="px-4 py-2 hover:bg-gray-50 cursor-pointer text-sm"
                            onClick={() => {
                              setTimePeriod(p);
                              setTimePeriodDropdownOpen(false);
                            }}
                          >
                            {p}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {(timePeriod === "Monthly" ||
                    timePeriod === "Quarterly" ||
                    timePeriod === "YTD" ||
                    timePeriod === "Trailing 12") && (
                    <>
                      <div className="relative" ref={monthDropdownRef}>
                        <button
                          onClick={() => setMonthDropdownOpen(!monthDropdownOpen)}
                          className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm hover:border-blue-500 focus:outline-none focus:ring-2 transition-all"
                          style={ringStyle}
                        >
                          {selectedMonth}
                          <ChevronDown className="w-4 h-4 ml-2" />
                        </button>
                        {monthDropdownOpen && (
                          <div className="absolute z-10 mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                            {monthsList.map((m) => (
                              <div
                                key={m}
                                className="px-4 py-2 hover:bg-gray-50 cursor-pointer text-sm"
                                onClick={() => {
                                  setSelectedMonth(m);
                                  setMonthDropdownOpen(false);
                                }}
                              >
                                {m}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="relative" ref={yearDropdownRef}>
                        <button
                          onClick={() => setYearDropdownOpen(!yearDropdownOpen)}
                          className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm hover:border-blue-500 focus:outline-none focus:ring-2 transition-all"
                          style={ringStyle}
                        >
                          {selectedYear}
                          <ChevronDown className="w-4 h-4 ml-2" />
                        </button>
                        {yearDropdownOpen && (
                          <div className="absolute z-10 mt-1 w-32 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                            {yearsList.map((y) => (
                              <div
                                key={y}
                                className="px-4 py-2 hover:bg-gray-50 cursor-pointer text-sm"
                                onClick={() => {
                                  setSelectedYear(y);
                                  setYearDropdownOpen(false);
                                }}
                              >
                                {y}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {timePeriod === "Custom" && (
                    <DateRangePicker
                      startDate={customStartDate}
                      endDate={customEndDate}
                      onChange={(start, end) => {
                        setCustomStartDate(start);
                        setCustomEndDate(end);
                      }}
                      className="w-[260px]"
                    />
                  )}
                </div>

                {/* Export & Refresh */}
                <button
                  onClick={exportCSV}
                  className="flex items-center gap-2 px-4 py-2 text-white rounded-lg hover:opacity-90 transition-colors shadow-sm"
                  style={{ backgroundColor: BRAND_COLORS.success }}
                >
                  <Download className="w-4 h-4" />
                  Export
                </button>
                <button
                  onClick={async () => {
                    await fetchPayments();
                    showNotification("Payments refreshed", "info");
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors shadow-sm"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </button>
              </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 hover:shadow-md transition-shadow" style={{ borderLeftColor: BRAND_COLORS.primary }}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-gray-600 text-sm font-medium mb-2">Total Transactions</div>
                    <div className="text-3xl font-bold text-gray-900 mb-1">{currentKpis.totalTx}</div>
                    <div className={`flex items-center text-xs font-medium ${kpiGrowth.totalTx >= 0 ? "text-red-600" : "text-green-600"}`}>
                      {kpiGrowth.totalTx >= 0 ? (
                        <ArrowUpRight className="w-3 h-3 mr-1" />
                      ) : (
                        <ArrowDownRight className="w-3 h-3 mr-1" />
                      )}
                      {formatPercentage(kpiGrowth.totalTx)} {comparisonLabel}
                    </div>
                  </div>
                  <Users className="w-8 h-8" style={{ color: BRAND_COLORS.primary }} />
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 hover:shadow-md transition-shadow" style={{ borderLeftColor: BRAND_COLORS.success }}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-gray-600 text-sm font-medium mb-2">Total Payroll</div>
                    <div className="text-3xl font-bold text-gray-900 mb-1">{formatCurrency(currentKpis.total)}</div>
                    <div className={`flex items-center text-xs font-medium ${kpiGrowth.total >= 0 ? "text-red-600" : "text-green-600"}`}>
                      {kpiGrowth.total >= 0 ? (
                        <ArrowUpRight className="w-3 h-3 mr-1" />
                      ) : (
                        <ArrowDownRight className="w-3 h-3 mr-1" />
                      )}
                      {formatPercentage(kpiGrowth.total)} {comparisonLabel}
                    </div>
                  </div>
                  <DollarSign className="w-8 h-8" style={{ color: BRAND_COLORS.success }} />
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 hover:shadow-md transition-shadow" style={{ borderLeftColor: BRAND_COLORS.warning }}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-gray-600 text-sm font-medium mb-2">Average Payment</div>
                    <div className="text-3xl font-bold text-gray-900 mb-1">{formatCurrency(currentKpis.avg)}</div>
                    <div className={`flex items-center text-xs font-medium ${kpiGrowth.avg >= 0 ? "text-red-600" : "text-green-600"}`}>
                      {kpiGrowth.avg >= 0 ? (
                        <ArrowUpRight className="w-3 h-3 mr-1" />
                      ) : (
                        <ArrowDownRight className="w-3 h-3 mr-1" />
                      )}
                      {formatPercentage(kpiGrowth.avg)} {comparisonLabel}
                    </div>
                  </div>
                  <TrendingUp className="w-8 h-8" style={{ color: BRAND_COLORS.warning }} />
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 hover:shadow-md transition-shadow" style={{ borderLeftColor: BRAND_COLORS.accent }}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-gray-600 text-sm font-medium mb-2">Top Department</div>
                    <div className="text-3xl font-bold text-gray-900 mb-1">{currentKpis.topDept}</div>
                  </div>
                  <PieIcon className="w-8 h-8" style={{ color: BRAND_COLORS.accent }} />
                </div>
              </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Trend */}
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                  <div className="flex-1 text-center">
                    <h3 className="text-xl font-semibold text-gray-900 text-center">Year-to-Date Payments Trend</h3>
                    <p className="text-sm text-gray-600 mt-1 text-center">Monthly payroll history</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className={`p-2 rounded ${trendChartType === "line" ? "" : "bg-white text-gray-700 border border-gray-200"}`}
                      onClick={() => setTrendChartType("line")}
                    >
                      <LineChartIcon className="w-4 h-4" />
                    </button>
                    <button
                      className={`p-2 rounded ${trendChartType === "bar" ? "" : "bg-white text-gray-700 border border-gray-200"}`}
                      onClick={() => setTrendChartType("bar")}
                    >
                      <BarChart3 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="p-6">
                  <ResponsiveContainer width="100%" height={300}>
                    {trendChartType === "line" ? (
                      <LineChart data={trendData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}k`} />
                        <Tooltip formatter={(v) => [formatCurrency(Number(v)), "Total"]} />
                        <Line type="monotone" dataKey="grossPay" stroke={BRAND_COLORS.primary} strokeWidth={3} name="Total" />
                      </LineChart>
                    ) : (
                      <BarChart data={trendData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}k`} />
                        <Tooltip formatter={(v) => [formatCurrency(Number(v)), "Total"]} />
                        <Bar dataKey="grossPay" fill={BRAND_COLORS.primary} name="Total" />
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Department Totals */}
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                  <div className="flex-1 text-center">
                    <h3 className="text-xl font-semibold text-gray-900 text-center">Totals by Department</h3>
                    <p className="text-sm text-gray-600 mt-1 text-center">Distribution of payment totals</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className={`p-2 rounded ${chartType === "pie" ? "" : "bg-white text-gray-700 border border-gray-200"}`}
                      onClick={() => setChartType("pie")}
                    >
                      <PieIcon className="w-4 h-4" />
                    </button>
                    <button
                      className={`p-2 rounded ${chartType === "bar" ? "" : "bg-white text-gray-700 border border-gray-200"}`}
                      onClick={() => setChartType("bar")}
                    >
                      <BarChart3 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="p-6">
                  <ResponsiveContainer width="100%" height={300}>
                    {chartType === "pie" ? (
                      <RechartsPieChart>
                        <Tooltip content={renderDeptTooltip} />
                        <Pie
                          data={departmentData}
                          dataKey="cost"
                          nameKey="department"
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                        >
                          {departmentData.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                      </RechartsPieChart>
                    ) : (
                      <BarChart data={departmentData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="department" hide />
                        <YAxis tickFormatter={(v) => formatCurrency(Number(v))} />
                        <Tooltip content={renderDeptTooltip} />
                        <Bar dataKey="cost">
                          {departmentData.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden mt-8">
              <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center justify-center flex-1">
                  <IAMCFOLogo className="w-6 h-6 mr-2" />
                  <h3 className="text-xl font-semibold text-gray-900 text-center">
                    {summaryView === "department" ? "Department Summary" : "Date Summary"}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className={`px-3 py-1 text-sm rounded ${summaryView === "department" ? "" : "bg-white text-gray-700 border border-gray-200"}`}
                    onClick={() => setSummaryView("department")}
                  >
                    By Dept
                  </button>
                  <button
                    className={`px-3 py-1 text-sm rounded ${summaryView === "date" ? "" : "bg-white text-gray-700 border border-gray-200"}`}
                    onClick={() => setSummaryView("date")}
                  >
                    By Date
                  </button>
                </div>
              </div>
              <div className="p-6 space-y-4">
                {summaryView === "department" &&
                  departmentSummary.map((dept) => (
                    <div key={dept.department} className="border rounded-lg">
                      <button
                        onClick={() => toggleGroup(dept.department)}
                        className="w-full flex items-center justify-between px-4 py-2 bg-white hover:bg-gray-50"
                      >
                        <span className="font-medium">{dept.department}</span>
                        <div className="flex items-center gap-4">
                          <span>{formatCurrency(dept.total)}</span>
                          <ChevronDown
                            className={`w-4 h-4 transition-transform ${
                              expandedGroups.has(dept.department) ? "rotate-180" : ""
                            }`}
                          />
                        </div>
                      </button>
                      {expandedGroups.has(dept.department) && (
                        <div className="bg-gray-50 px-4 py-2 space-y-1">
                          {dept.people.map((person) => (
                            <div key={person.name} className="flex justify-between text-sm">
                              <span>{person.name}</span>
                              <span>{formatCurrency(person.amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                {summaryView === "date" &&
                  dateSummary.map((d) => (
                    <div key={d.date} className="border rounded-lg">
                      <button
                        onClick={() => toggleGroup(d.date)}
                        className="w-full flex items-center justify-between px-4 py-2 bg-white hover:bg-gray-50"
                      >
                        <span className="font-medium">
                          {d.date === "Unknown"
                            ? "Unknown"
                            : new Date(`${d.date}T00:00:00Z`).toLocaleDateString(
                                "en-US",
                                { timeZone: "UTC" }
                              )}
                        </span>
                        <div className="flex items-center gap-4">
                          <span>{formatCurrency(d.total)}</span>
                          <ChevronDown
                            className={`w-4 h-4 transition-transform ${
                              expandedGroups.has(d.date) ? "rotate-180" : ""
