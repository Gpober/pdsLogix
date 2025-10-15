"use client";

import React, { useEffect, useMemo, useState, useRef } from "react";
import {
  Download,
  RefreshCw,
  ChevronDown,
  Users,
  DollarSign,
  TrendingUp,
  PieChart,
  Search,
  BarChart3,
  Calendar,
  LineChart,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  AlertCircle,
  User,
  ClipboardCheck,
  CheckCircle,
  XCircle,
  X,
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
  // State management
  const [notification, setNotification] = useState<{ show: boolean; message: string; type: "info" | "success" | "error" | "warning" }>({ show: false, message: "", type: "info" });
  const [departmentFilter, setDepartmentFilter] = useState("All Departments");
  const [departmentDropdownOpen, setDepartmentDropdownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("Monthly");
  const [selectedMonth, setSelectedMonth] = useState(new Date().toLocaleString("en-US", { month: "long" }));
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
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
  
  const [pendingSubmissions, setPendingSubmissions] = useState<PendingSubmission[]>([]);
  const [allLocations, setAllLocations] = useState<LocationStatus[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<PendingSubmission | null>(null);
  const [submissionDetails, setSubmissionDetails] = useState<SubmissionDetail[]>([]);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [userId, setUserId] = useState<string | null>("demo-user-id");
  const [payments, setPayments] = useState<Payment[]>([]);

  const monthsList = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const yearsList = Array.from({ length: 10 }, (_, i) => String(new Date().getFullYear() - 5 + i));

  const timePeriodDropdownRef = useRef<HTMLDivElement>(null);
  const monthDropdownRef = useRef<HTMLDivElement>(null);
  const yearDropdownRef = useRef<HTMLDivElement>(null);

  const comparisonLabel = useMemo(() => {
    switch (timePeriod) {
      case "Monthly": return "vs last month";
      case "Quarterly": return "vs last quarter";
      case "YTD": return "vs prior YTD";
      case "Trailing 12": return "vs prior 12 months";
      default: return "vs previous period";
    }
  }, [timePeriod]);

  // Click outside handlers
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (timePeriodDropdownRef.current && !timePeriodDropdownRef.current.contains(event.target as Node)) {
        setTimePeriodDropdownOpen(false);
      }
      if (monthDropdownRef.current && !monthDropdownRef.current.contains(event.target as Node)) {
        setMonthDropdownOpen(false);
      }
      if (yearDropdownRef.current && !yearDropdownRef.current.contains(event.target as Node)) {
        setYearDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Date range calculation
  useEffect(() => {
    const monthIndex = monthsList.indexOf(selectedMonth);
    const yearNum = parseInt(selectedYear, 10);
    const makeDate = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().split("T")[0];

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
      end = makeDate(yearNum, monthIndex + 1, 0);
      start = makeDate(yearNum, monthIndex - 11, 1);
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
      if (prevMonthIndex === 1 && ((prevYear % 4 === 0 && prevYear % 100 !== 0) || prevYear % 400 === 0)) {
        lastDay = 29;
      }
      return {
        prevStartDate: `${prevYear}-${String(prevMonthIndex + 1).padStart(2, "0")}-01`,
        prevEndDate: `${prevYear}-${String(prevMonthIndex + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
      };
    }
    // Add other period calculations as needed
    return { prevStartDate: "", prevEndDate: "" };
  };

  const { prevStartDate, prevEndDate } = useMemo(() => {
    if (!startDate || !endDate) return { prevStartDate: "", prevEndDate: "" };
    return calculatePreviousDateRange(startDate, endDate);
  }, [startDate, endDate, timePeriod, selectedMonth, selectedYear]);

  // Load data
  useEffect(() => {
    loadPendingSubmissions();
    loadAllLocations();
  }, []);

  useEffect(() => {
    fetchPayments();
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
    const { data: locations } = await supabase.from('locations').select('id, name');
    
    const getNextFriday = () => {
      const today = new Date();
      const dayOfWeek = today.getDay();
      const daysUntilFriday = dayOfWeek <= 5 ? 5 - dayOfWeek : 7 - dayOfWeek + 5;
      const nextFriday = new Date(today);
      nextFriday.setDate(today.getDate() + daysUntilFriday);
      return `${nextFriday.getFullYear()}-${String(nextFriday.getMonth() + 1).padStart(2, '0')}-${String(nextFriday.getDate()).padStart(2, '0')}`;
    };

    const { data: submissions } = await supabase.from('payroll_submissions').select('*').eq('pay_date', getNextFriday());
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
      }
      return { location_id: location.id, location_name: location.name, status: 'not_submitted' as const };
    });

    setAllLocations(locationStatuses);
  };

  const handleReviewSubmission = async (submission: PendingSubmission) => {
    setSelectedSubmission(submission);
    const { data: details } = await supabase.from('payroll_submission_details').select('*').eq('submission_id', submission.id);
    const employeeIds = details?.map(d => d.employee_id) || [];
    const { data: employees } = await supabase.from('employees').select('id, first_name, last_name').in('id', employeeIds);
    const employeesMap = new Map(employees?.map(e => [e.id, `${e.first_name} ${e.last_name}`]));
    const detailsWithNames = (details || []).map(d => ({ ...d, employee_name: employeesMap.get(d.employee_id) || 'Unknown' }));
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
      await supabase.from('payments').insert(paymentsToInsert);
      await supabase.from('payroll_submissions').update({ status: 'approved', approved_by: userId, approved_at: new Date().toISOString() }).eq('id', selectedSubmission.id);
      showNotification('Payroll approved successfully!', 'success');
      setShowApprovalModal(false);
      setSelectedSubmission(null);
      loadPendingSubmissions();
      loadAllLocations();
      fetchPayments();
    } catch (error) {
      showNotification('Failed to approve payroll', 'error');
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    if (!selectedSubmission || !userId) return;
    setIsApproving(true);
    try {
      await supabase.from('payroll_submissions').update({ status: 'rejected', approved_by: userId, approved_at: new Date().toISOString() }).eq('id', selectedSubmission.id);
      showNotification('Payroll rejected', 'warning');
      setShowApprovalModal(false);
      setSelectedSubmission(null);
      loadPendingSubmissions();
      loadAllLocations();
    } catch (error) {
      showNotification('Failed to reject payroll', 'error');
    } finally {
      setIsApproving(false);
    }
  };

  const fetchPayments = async () => {
    const { data } = await supabase.from("payments").select("id, last_name, first_name, department, payment_method, date, total_amount").order("date", { ascending: false }).limit(5000);
    setPayments((data ?? []) as Payment[]);
  };

  const departments = useMemo(() => {
    const set = new Set<string>(["All Departments"]);
    payments.forEach((p) => {
      if (p.department && p.department.trim() !== "") set.add(p.department);
    });
    return Array.from(set);
  }, [payments]);

  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      const matchesDept = departmentFilter === "All Departments" || (p.department ?? "") === departmentFilter;
      const fullName = `${p.first_name ?? ""} ${p.last_name ?? ""}`.toLowerCase();
      const matchesSearch = searchTerm.trim() === "" || fullName.includes(searchTerm.toLowerCase());
      const matchesDate = (!startDate || (p.date && Date.parse(p.date) >= Date.parse(startDate))) && (!endDate || (p.date && Date.parse(p.date) <= Date.parse(endDate)));
      return matchesDept && matchesSearch && matchesDate;
    });
  }, [payments, departmentFilter, searchTerm, startDate, endDate]);

  const filteredPrevPayments = useMemo(() => {
    return payments.filter((p) => {
      const matchesDept = departmentFilter === "All Departments" || (p.department ?? "") === departmentFilter;
      const matchesDate = (!prevStartDate || (p.date && Date.parse(p.date) >= Date.parse(prevStartDate))) && (!prevEndDate || (p.date && Date.parse(p.date) <= Date.parse(prevEndDate)));
      return matchesDept && matchesDate;
    });
  }, [payments, departmentFilter, prevStartDate, prevEndDate]);

  const currentKpis = useMemo(() => {
    const totalTx = filteredPayments.length;
    const total = filteredPayments.reduce((sum, p) => sum + Number(p.total_amount || 0), 0);
    const avg = totalTx ? total / totalTx : 0;
    const byDept = new Map<string, number>();
    filteredPayments.forEach(p => {
      const dept = (p.department || "Uncategorized").trim();
      byDept.set(dept, (byDept.get(dept) || 0) + Number(p.total_amount || 0));
    });
    const topDept = Array.from(byDept.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
    return { totalTx, total, avg, topDept };
  }, [filteredPayments]);

  const prevKpis = useMemo(() => {
    const totalTx = filteredPrevPayments.length;
    const total = filteredPrevPayments.reduce((sum, p) => sum + Number(p.total_amount || 0), 0);
    const avg = totalTx ? total / totalTx : 0;
    return { totalTx, total, avg };
  }, [filteredPrevPayments]);

  const calculateGrowth = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / Math.abs(previous)) * 100;
  };

  const kpiGrowth = useMemo(() => ({
    totalTx: calculateGrowth(currentKpis.totalTx, prevKpis.totalTx),
    total: calculateGrowth(currentKpis.total, prevKpis.total),
    avg: calculateGrowth(currentKpis.avg, prevKpis.avg),
  }), [currentKpis, prevKpis]);

  const trendData = useMemo(() => {
    const now = new Date();
    const labels: { key: string }[] = [];
    for (let m = 0; m <= now.getMonth(); m++) {
      labels.push({ key: monthsList[m].slice(0, 3) + " " + now.getFullYear() });
    }
    const map = new Map(labels.map(l => [l.key, { month: l.key, grossPay: 0 }]));
    filteredPayments.forEach(p => {
      if (!p.date) return;
      const d = new Date(p.date);
      const key = monthsList[d.getUTCMonth()].slice(0, 3) + " " + d.getUTCFullYear();
      if (map.has(key)) map.get(key)!.grossPay += Number(p.total_amount || 0);
    });
    return Array.from(map.values());
  }, [filteredPayments]);

  const departmentData = useMemo(() => {
    const map = new Map<string, number>();
    filteredPayments.forEach(p => {
      const dept = (p.department || "Uncategorized").trim();
      map.set(dept, (map.get(dept) || 0) + Number(p.total_amount || 0));
    });
    return Array.from(map.entries()).map(([department, cost]) => ({ department, cost }));
  }, [filteredPayments]);

  const departmentSummary = useMemo(() => {
    const map = new Map<string, { total: number; people: Map<string, number> }>();
    filteredPayments.forEach(p => {
      const dept = (p.department || "Uncategorized").trim();
      const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Unknown";
      const amt = Number(p.total_amount || 0);
      if (!map.has(dept)) map.set(dept, { total: 0, people: new Map() });
      const info = map.get(dept)!;
      info.total += amt;
      info.people.set(name, (info.people.get(name) || 0) + amt);
    });
    return Array.from(map.entries()).map(([department, { total, people }]) => ({
      department,
      total,
      people: Array.from(people.entries()).map(([name, amount]) => ({ name, amount })),
    })).sort((a, b) => b.total - a.total);
  }, [filteredPayments]);

  const dateSummary = useMemo(() => {
    const map = new Map<string, { total: number; people: Map<string, number> }>();
    filteredPayments.forEach(p => {
      const date = p.date ? p.date.split("T")[0] : "Unknown";
      const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Unknown";
      const amt = Number(p.total_amount || 0);
      if (!map.has(date)) map.set(date, { total: 0, people: new Map() });
      const info = map.get(date)!;
      info.total += amt;
      info.people.set(name, (info.people.get(name) || 0) + amt);
    });
    return Array.from(map.entries()).map(([date, { total, people }]) => ({
      date,
      total,
      people: Array.from(people.entries()).map(([name, amount]) => ({ name, amount })),
    })).sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  }, [filteredPayments]);

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const CHART_COLORS = [BRAND_COLORS.primary, BRAND_COLORS.success, BRAND_COLORS.warning, BRAND_COLORS.danger, BRAND_COLORS.secondary];
  const ringStyle = { "--tw-ring-color": BRAND_COLORS.secondary + "33" } as React.CSSProperties;
  const formatCurrency = (amount: number): string => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
  const formatPercentage = (value: number): string => `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
  
  const showNotification = (message: string, type: "info" | "success" | "error" | "warning" = "info") => {
    setNotification({ show: true, message, type });
    setTimeout(() => setNotification({ show: false, message: "", type: "info" }), 3000);
  };

  const exportCSV = () => {
    const headers = ["date", "first_name", "last_name", "department", "payment_method", "total_amount"];
    const rows = filteredPayments.map((p) => [p.date ?? "", p.first_name ?? "", p.last_name ?? "", p.department ?? "", p.payment_method ?? "", String(p.total_amount ?? "")]);
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
                <h1 className="text-2xl font-bold text-gray-900">I AM CFO</h1>
                <span className="text-sm px-3 py-1 rounded-full text-white" style={{ backgroundColor: BRAND_COLORS.primary }}>
                  Payroll Management
                </span>
              </div>
              <p className="text-sm text-gray-600 mt-1 text-center">
                Complete payroll workflow • Analytics • Approvals
              </p>
            </div>
          </div>

          <div className="flex justify-center gap-2">
            <button
              onClick={() => setViewMode("analytics")}
              className={`px-6 py-2 rounded-lg font-medium transition-all ${viewMode === "analytics" ? "text-white shadow-md" : "bg-white text-gray-700 border border-gray-300"}`}
              style={viewMode === "analytics" ? { backgroundColor: BRAND_COLORS.primary } : {}}
            >
              📊 Analytics
            </button>
            <button
              onClick={() => setViewMode("approvals")}
              className={`px-6 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${viewMode === "approvals" ? "text-white shadow-md" : "bg-white text-gray-700 border border-gray-300"}`}
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
        {viewMode === "approvals" ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-3xl font-bold" style={{ color: BRAND_COLORS.accent }}>Payroll Approvals</h2>
              <button onClick={() => { loadPendingSubmissions(); loadAllLocations(); showNotification("Refreshed", "info"); }} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700">
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            </div>

            {/* Pending Section */}
            <div className="bg-white rounded-xl shadow-sm p-6" style={{ borderLeft: `4px solid ${pendingSubmissions.length > 0 ? BRAND_COLORS.warning : BRAND_COLORS.success}` }}>
              <div className="flex items-center gap-3 mb-4">
                {pendingSubmissions.length > 0 ? (
                  <>
                    <Clock size={24} style={{ color: BRAND_COLORS.warning }} />
                    <h3 className="text-xl font-semibold" style={{ color: BRAND_COLORS.warning }}>Pending Approvals ({pendingSubmissions.length})</h3>
                  </>
                ) : (
                  <>
                    <CheckCircle size={24} style={{ color: BRAND_COLORS.success }} />
                    <h3 className="text-xl font-semibold" style={{ color: BRAND_COLORS.success }}>All Caught Up!</h3>
                  </>
                )}
              </div>

              {pendingSubmissions.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {pendingSubmissions.map(sub => (
                    <div key={sub.id} onClick={() => handleReviewSubmission(sub)} className="p-4 rounded-lg border-2 cursor-pointer hover:shadow-md transition-all" style={{ borderColor: BRAND_COLORS.warning, backgroundColor: `${BRAND_COLORS.warning}10` }}>
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h4 className="font-bold text-lg mb-1" style={{ color: BRAND_COLORS.accent }}>{sub.location_name}</h4>
                          <p className="text-xs text-gray-600">Pay: {formatDate(sub.pay_date)} • Group {sub.payroll_group}</p>
                        </div>
                        <span className="px-3 py-1 rounded-full text-xs font-bold text-white" style={{ backgroundColor: BRAND_COLORS.warning }}>PENDING</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white p-3 rounded-lg text-center">
                          <div className="text-lg font-bold" style={{ color: BRAND_COLORS.success }}>{formatCurrency(sub.total_amount)}</div>
                          <div className="text-xs text-gray-600">Amount</div>
                        </div>
                        <div className="bg-white p-3 rounded-lg text-center">
                          <div className="text-lg font-bold" style={{ color: BRAND_COLORS.primary }}>{sub.employee_count}</div>
                          <div className="text-xs text-gray-600">Employees</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 rounded-lg" style={{ backgroundColor: `${BRAND_COLORS.success}10`, border: `2px dashed ${BRAND_COLORS.success}` }}>
                  <CheckCircle size={64} style={{ color: BRAND_COLORS.success, margin: '0 auto 16px' }} />
                  <h4 className="text-xl font-bold mb-2" style={{ color: BRAND_COLORS.success }}>All Caught Up!</h4>
                  <p className="text-gray-600">No pending submissions</p>
                </div>
              )}
            </div>

            {/* All Locations */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-xl font-semibold mb-4">All Locations Status</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {allLocations.map(loc => {
                  const StatusIcon = getLocationStatusIcon(loc.status);
                  const color = getLocationStatusColor(loc.status);
                  return (
                    <div key={loc.location_id} onClick={() => { if (loc.status === 'pending' && loc.submission_id) { const sub = pendingSubmissions.find(s => s.id === loc.submission_id); if (sub) handleReviewSubmission(sub); } }} className="p-4 rounded-lg border-2" style={{ borderColor: color, backgroundColor: `${color}10`, cursor: loc.status === 'pending' ? 'pointer' : 'default' }}>
                      <div className="flex justify-between items-start mb-3">
                        <h4 className="font-bold text-lg" style={{ color: BRAND_COLORS.accent }}>{loc.location_name}</h4>
                        <span className="px-3 py-1 rounded-full text-xs font-bold text-white flex items-center gap-1" style={{ backgroundColor: color }}>
                          <StatusIcon size={12} />
                          {loc.status.toUpperCase()}
                        </span>
                      </div>
                      {loc.total_amount && (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-white p-3 rounded-lg text-center">
                            <div className="text-lg font-bold" style={{ color: BRAND_COLORS.success }}>{formatCurrency(loc.total_amount)}</div>
                            <div className="text-xs text-gray-600">Total</div>
                          </div>
                          <div className="bg-white p-3 rounded-lg text-center">
                            <div className="text-lg font-bold" style={{ color: BRAND_COLORS.primary }}>{loc.employee_count || 0}</div>
                            <div className="text-xs text-gray-600">Employees</div>
                          </div>
                        </div>
                      )}
                      {loc.status === 'not_submitted' && <p className="text-sm text-gray-600 text-center italic mt-2">Waiting for submission</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-600">Analytics view - Add your charts and KPIs here</p>
            <p className="text-sm text-gray-500 mt-2">Historical payroll data will display here</p>
          </div>
        )}

        {notification.show && (
          <div className={`fixed top-5 right-5 z-50 px-6 py-4 rounded-lg text-white font-medium shadow-lg ${notification.type === "success" ? "bg-green-500" : notification.type === "error" ? "bg-red-500" : notification.type === "warning" ? "bg-yellow-500" : "bg-blue-500"}`}>
            {notification.message}
          </div>
        )}
      </main>

      {/* Approval Modal */}
      {showApprovalModal && selectedSubmission && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-auto">
            <div className="sticky top-0 bg-white border-b p-6 flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-bold mb-1" style={{ color: BRAND_COLORS.accent }}>Review Payroll</h2>
                <p className="text-gray-600">{selectedSubmission.location_name}</p>
              </div>
              <button onClick={() => setShowApprovalModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="bg-gray-50 rounded-lg p-4 grid grid-cols-3 gap-4">
                <div>
                  <div className="text-xs text-gray-600 mb-1">Pay Date</div>
                  <div className="font-semibold">{formatDate(selectedSubmission.pay_date)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-600 mb-1">Group</div>
                  <div className="font-semibold">Group {selectedSubmission.payroll_group}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-600 mb-1">Period</div>
                  <div className="font-semibold text-sm">{formatDate(selectedSubmission.period_start)} - {formatDate(selectedSubmission.period_end)}</div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-3">Employees ({submissionDetails.length})</h3>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {submissionDetails.map((detail, i) => (
                    <div key={i} className="p-4 bg-gray-50 rounded-lg border">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <User size={16} style={{ color: BRAND_COLORS.accent }} />
                          <span className="font-semibold">{detail.employee_name}</span>
                        </div>
                        <span className="text-xl font-bold" style={{ color: BRAND_COLORS.accent }}>{formatCurrency(detail.amount)}</span>
                      </div>
                      <div className="text-sm text-gray-600">{detail.hours ? `${detail.hours} hours` : `${detail.units} units`}</div>
                      {detail.notes && <div className="text-xs text-gray-500 mt-2 italic">Note: {detail.notes}</div>}
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-gradient-to-r from-green-50 to-green-100 rounded-lg p-6 text-center border-2" style={{ borderColor: BRAND_COLORS.success }}>
                <div className="text-sm text-gray-600 mb-2">Total Amount</div>
                <div className="text-4xl font-bold" style={{ color: BRAND_COLORS.success }}>{formatCurrency(selectedSubmission.total_amount)}</div>
              </div>

              <div className="flex gap-4">
                <button onClick={handleReject} disabled={isApproving} className="flex-1 px-6 py-4 rounded-lg font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50" style={{ backgroundColor: BRAND_COLORS.danger }}>
                  <XCircle size={20} />
                  Reject
                </button>
                <button onClick={handleApprove} disabled={isApproving} className="flex-1 px-6 py-4 rounded-lg font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: `linear-gradient(135deg, ${BRAND_COLORS.success}, #229954)` }}>
                  {isApproving ? "Approving..." : <><CheckCircle size={20} />Approve & Post</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
