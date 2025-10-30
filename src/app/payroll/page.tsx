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
  BarChart as RechartsBarChart,
  LineChart as RechartsLineChart,
} from "recharts";
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
  rejection_note?: string | null;
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
  organization_id: string; // ✅ ADDED - Required for payments insert
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
  const [rejectionNote, setRejectionNote] = useState("");

  const monthsList = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const yearsList = Array.from({ length: 10 }, (_, i) => String(new Date().getFullYear() - 5 + i));

  const timePeriodDropdownRef = useRef<HTMLDivElement>(null);
  const monthDropdownRef = useRef<HTMLDivElement>(null);
  const yearDropdownRef = useRef<HTMLDivElement>(null);
  const departmentDropdownRef = useRef<HTMLDivElement>(null);

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
      if (departmentDropdownRef.current && !departmentDropdownRef.current.contains(event.target as Node)) {
        setDepartmentDropdownOpen(false);
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
    const diff = end.getTime() - start.getTime();
    const prevEnd = new Date(start.getTime() - 86400000);
    const prevStart = new Date(prevEnd.getTime() - diff);
    return {
      prevStartDate: prevStart.toISOString().split("T")[0],
      prevEndDate: prevEnd.toISOString().split("T")[0],
    };
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

    const { data: submissions } = await supabase
      .from('payroll_submissions')
      .select('*')
      .eq('pay_date', getNextFriday());
    
    const submissionsMap = new Map(submissions?.map(s => [s.location_id, s]));

    // ✅ FIXED: Helper function to properly map submission status to location status
    const mapSubmissionStatus = (submissionStatus: string): 'approved' | 'pending' | 'not_submitted' => {
      switch (submissionStatus) {
        case 'approved':
        case 'posted':  // ✅ Treat 'posted' as approved since it's already processed
          return 'approved';
        case 'pending':
          return 'pending';
        case 'rejected':
        case 'draft':
        default:
          return 'not_submitted';  // ✅ Rejected/draft submissions show as not submitted
      }
    };

    const locationStatuses: LocationStatus[] = (locations || []).map((location) => {
      const submission = submissionsMap.get(location.id);
      if (submission) {
        return {
          location_id: location.id,
          location_name: location.name,
          submission_id: submission.id,
          status: mapSubmissionStatus(submission.status), // ✅ FIXED: Use helper function
          total_amount: submission.total_amount,
          employee_count: submission.employee_count,
          pay_date: submission.pay_date,
          payroll_group: submission.payroll_group as 'A' | 'B',
          submitted_at: submission.submitted_at
        };
      }
      return { 
        location_id: location.id, 
        location_name: location.name, 
        status: 'not_submitted' as const 
      };
    });

    setAllLocations(locationStatuses);
  };

  const handleReviewSubmission = async (submission: PendingSubmission) => {
    setSelectedSubmission(submission);
    setRejectionNote(""); // Reset rejection note
    
    // ✅ Step 1: Get organization_id from location FIRST
    const { data: locationData, error: locationError } = await supabase
      .from('locations')
      .select('organization_id')
      .eq('id', submission.location_id)
      .single();

    if (locationError || !locationData) {
      console.error('Error fetching location:', locationError);
      showNotification('Failed to load location details', 'error');
      return;
    }

    console.log('🏢 Organization ID for submission:', locationData.organization_id);

    // Step 2: Fetch payroll entries
    const { data: details } = await supabase
      .from('payroll_entries')
      .select('*')
      .eq('submission_id', submission.id);
    
    const employeeIds = details?.map(d => d.employee_id) || [];
    const { data: employees } = await supabase
      .from('employees')
      .select('id, first_name, last_name')
      .in('id', employeeIds);
    
    const employeesMap = new Map(employees?.map(e => [e.id, `${e.first_name} ${e.last_name}`]));
    
    // ✅ Step 3: Combine entries with employee names AND organization_id
    const detailsWithNames = (details || []).map(d => ({
      ...d,
      employee_name: employeesMap.get(d.employee_id) || 'Unknown',
      organization_id: locationData.organization_id, // ✅ CRITICAL FIX
    }));
    
    console.log('✅ Submission details with org_id:', detailsWithNames);
    setSubmissionDetails(detailsWithNames);
    setShowApprovalModal(true);
  };

  const handleApprove = async () => {
    if (!selectedSubmission || !userId) return;
    setIsApproving(true);
    
    try {
      // ✅ Get organization_id from submissionDetails (already fetched in handleReviewSubmission)
      const organizationId = submissionDetails[0]?.organization_id;
      
      if (!organizationId) {
        throw new Error('Organization ID not found in submission details');
      }

      console.log('🎯 Approving with organization_id:', organizationId);

      // STEP 1: Update payroll_submissions status to 'approved'
      const { error: updateSubmissionError } = await supabase
        .from('payroll_submissions')
        .update({
          status: 'approved',
          approved_by: userId,
          approved_at: new Date().toISOString()
        })
        .eq('id', selectedSubmission.id);

      if (updateSubmissionError) throw updateSubmissionError;

      // STEP 2: Update all payroll_entries for this submission to 'approved'
      const { error: updateEntriesError } = await supabase
        .from('payroll_entries')
        .update({
          status: 'approved'
        })
        .eq('submission_id', selectedSubmission.id);

      if (updateEntriesError) throw updateEntriesError;

      // STEP 3: Create approval audit log
      const { error: approvalLogError } = await supabase
        .from('payroll_approvals')
        .insert({
          organization_id: organizationId,
          submission_id: selectedSubmission.id,
          action: 'approved',
          approved_by: userId,
          previous_status: 'pending',
          notes: `Approved via desktop dashboard`
        });

      if (approvalLogError) {
        console.warn('Failed to create approval log:', approvalLogError);
        // Don't fail the whole process if audit log fails
      }

      // STEP 4: Post to payments table with ALL required fields
      // ✅ organization_id now comes from submissionDetails
      const paymentsToInsert = submissionDetails.map(detail => ({
        // Link back to source data
        employee_id: detail.employee_id,
        submission_id: selectedSubmission.id,
        location_id: selectedSubmission.location_id,
        organization_id: detail.organization_id, // ✅ NOW PROPERLY DEFINED
        
        // Payment details
        first_name: detail.employee_name.split(' ')[0],
        last_name: detail.employee_name.split(' ').slice(1).join(' ') || detail.employee_name.split(' ')[0],
        department: selectedSubmission.location_name,
        date: selectedSubmission.pay_date,
        total_amount: detail.amount,
        payment_method: 'Direct Deposit',
        
        // Payroll details
        payroll_group: selectedSubmission.payroll_group,
        hours: detail.hours,
        units: detail.units,
        
        // Tracking
        source: 'system'
      }));

      console.log('💾 Inserting payments:', paymentsToInsert);

      const { error: paymentsError } = await supabase
        .from('payments')
        .insert(paymentsToInsert);

      if (paymentsError) {
        console.error('❌ Payments insert error:', paymentsError);
        throw paymentsError;
      }

      // STEP 5: Update submission to 'posted' status
      const { error: postedError } = await supabase
        .from('payroll_submissions')
        .update({
          status: 'posted',
          processed_by: userId,
          processed_at: new Date().toISOString()
        })
        .eq('id', selectedSubmission.id);

      if (postedError) throw postedError;

      // STEP 6: Update entries to 'posted'
      const { error: entriesPostedError } = await supabase
        .from('payroll_entries')
        .update({
          status: 'posted'
        })
        .eq('submission_id', selectedSubmission.id);

      if (entriesPostedError) throw entriesPostedError;

      // Success!
      showNotification('Payroll approved and posted successfully!', 'success');
      setShowApprovalModal(false);
      setSelectedSubmission(null);
      loadPendingSubmissions();
      loadAllLocations();
      fetchPayments();
    } catch (error) {
      console.error('Approval error:', error);
      showNotification('Failed to approve payroll', 'error');
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    if (!selectedSubmission || !userId) return;
    setIsApproving(true);
    
    try {
      // Get organization_id from submissionDetails (already loaded)
      const organizationId = submissionDetails[0]?.organization_id;

      if (!organizationId) {
        throw new Error('Organization ID not found');
      }

      // ✅ Update submission with rejection fields
      const { error: submissionError } = await supabase
        .from('payroll_submissions')
        .update({
          status: 'rejected',
          rejected_by: userId,
          rejected_at: new Date().toISOString(),
          rejection_note: rejectionNote || null
        })
        .eq('id', selectedSubmission.id);

      if (submissionError) throw submissionError;

      // Update entries status
      const { error: entriesError } = await supabase
        .from('payroll_entries')
        .update({
          status: 'rejected'
        })
        .eq('submission_id', selectedSubmission.id);

      if (entriesError) throw entriesError;

      // Log rejection
      const { error: approvalLogError } = await supabase
        .from('payroll_approvals')
        .insert({
          organization_id: organizationId,
          submission_id: selectedSubmission.id,
          action: 'rejected',
          approved_by: userId,
          previous_status: 'pending',
          notes: rejectionNote || 'Rejected via desktop dashboard'
        });

      if (approvalLogError) {
        console.warn('Failed to create rejection log:', approvalLogError);
      }

      showNotification('Payroll rejected - location can edit and resubmit', 'warning');
      setShowApprovalModal(false);
      setSelectedSubmission(null);
      setRejectionNote("");
      loadPendingSubmissions();
      loadAllLocations();
    } catch (error) {
      console.error('Rejection error:', error);
      showNotification('Failed to reject payroll', 'error');
    } finally {
      setIsApproving(false);
    }
  };

  const fetchPayments = async () => {
    const { data } = await supabase
      .from("payments")
      .select("id, last_name, first_name, department, payment_method, date, total_amount")
      .order("date", { ascending: false })
      .limit(5000);
    
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
                          {loc.status.toUpperCase().replace('_', ' ')}
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
          <div className="space-y-6">
            {/* Filters */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Time Period */}
                <div className="relative" ref={timePeriodDropdownRef}>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Time Period</label>
                  <button onClick={() => setTimePeriodDropdownOpen(!timePeriodDropdownOpen)} className="w-full px-4 py-3 text-left bg-white border-2 rounded-lg flex items-center justify-between hover:border-gray-400 transition-colors" style={ringStyle}>
                    <span className="font-medium">{timePeriod}</span>
                    <ChevronDown className={`w-5 h-5 transition-transform ${timePeriodDropdownOpen ? "rotate-180" : ""}`} />
                  </button>
                  {timePeriodDropdownOpen && (
                    <div className="absolute z-50 w-full mt-2 bg-white border-2 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {(["Monthly", "Quarterly", "YTD", "Trailing 12", "Custom"] as TimePeriod[]).map(period => (
                        <button key={period} onClick={() => { setTimePeriod(period); setTimePeriodDropdownOpen(false); }} className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors" style={timePeriod === period ? { backgroundColor: BRAND_COLORS.primary + "20", color: BRAND_COLORS.primary, fontWeight: 600 } : {}}>
                          {period}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Month/Year or Custom Date */}
                {timePeriod !== "Custom" ? (
                  <>
                    <div className="relative" ref={monthDropdownRef}>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Month</label>
                      <button onClick={() => setMonthDropdownOpen(!monthDropdownOpen)} className="w-full px-4 py-3 text-left bg-white border-2 rounded-lg flex items-center justify-between hover:border-gray-400 transition-colors" style={ringStyle}>
                        <span className="font-medium">{selectedMonth}</span>
                        <ChevronDown className={`w-5 h-5 transition-transform ${monthDropdownOpen ? "rotate-180" : ""}`} />
                      </button>
                      {monthDropdownOpen && (
                        <div className="absolute z-50 w-full mt-2 bg-white border-2 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          {monthsList.map(month => (
                            <button key={month} onClick={() => { setSelectedMonth(month); setMonthDropdownOpen(false); }} className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors" style={selectedMonth === month ? { backgroundColor: BRAND_COLORS.primary + "20", color: BRAND_COLORS.primary, fontWeight: 600 } : {}}>
                              {month}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="relative" ref={yearDropdownRef}>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Year</label>
                      <button onClick={() => setYearDropdownOpen(!yearDropdownOpen)} className="w-full px-4 py-3 text-left bg-white border-2 rounded-lg flex items-center justify-between hover:border-gray-400 transition-colors" style={ringStyle}>
                        <span className="font-medium">{selectedYear}</span>
                        <ChevronDown className={`w-5 h-5 transition-transform ${yearDropdownOpen ? "rotate-180" : ""}`} />
                      </button>
                      {yearDropdownOpen && (
                        <div className="absolute z-50 w-full mt-2 bg-white border-2 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          {yearsList.map(year => (
                            <button key={year} onClick={() => { setSelectedYear(year); setYearDropdownOpen(false); }} className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors" style={selectedYear === year ? { backgroundColor: BRAND_COLORS.primary + "20", color: BRAND_COLORS.primary, fontWeight: 600 } : {}}>
                              {year}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
                      <input type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} className="w-full px-4 py-3 border-2 rounded-lg" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
                      <input type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} className="w-full px-4 py-3 border-2 rounded-lg" />
                    </div>
                  </>
                )}
              </div>

              {/* Department & Search */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div className="relative" ref={departmentDropdownRef}>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Department</label>
                  <button onClick={() => setDepartmentDropdownOpen(!departmentDropdownOpen)} className="w-full px-4 py-3 text-left bg-white border-2 rounded-lg flex items-center justify-between hover:border-gray-400 transition-colors" style={ringStyle}>
                    <span className="font-medium">{departmentFilter}</span>
                    <ChevronDown className={`w-5 h-5 transition-transform ${departmentDropdownOpen ? "rotate-180" : ""}`} />
                  </button>
                  {departmentDropdownOpen && (
                    <div className="absolute z-50 w-full mt-2 bg-white border-2 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {departments.map(dept => (
                        <button key={dept} onClick={() => { setDepartmentFilter(dept); setDepartmentDropdownOpen(false); }} className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors" style={departmentFilter === dept ? { backgroundColor: BRAND_COLORS.primary + "20", color: BRAND_COLORS.primary, fontWeight: 600 } : {}}>
                          {dept}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Search Employee</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                    <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search by name..." className="w-full pl-10 pr-4 py-3 border-2 rounded-lg" />
                  </div>
                </div>
              </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white rounded-xl shadow-sm p-6" style={{ borderLeft: `4px solid ${BRAND_COLORS.primary}` }}>
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 rounded-lg" style={{ backgroundColor: BRAND_COLORS.primary + "20" }}>
                    <Users size={24} style={{ color: BRAND_COLORS.primary }} />
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-gray-600 text-sm font-medium">Total Transactions</p>
                  <p className="text-3xl font-bold text-gray-900">{currentKpis.totalTx.toLocaleString()}</p>
                  <div className="flex items-center gap-1">
                    {kpiGrowth.totalTx >= 0 ? <ArrowUpRight size={16} style={{ color: BRAND_COLORS.success }} /> : <ArrowDownRight size={16} style={{ color: BRAND_COLORS.danger }} />}
                    <span className="text-sm font-semibold" style={{ color: kpiGrowth.totalTx >= 0 ? BRAND_COLORS.success : BRAND_COLORS.danger }}>
                      {formatPercentage(kpiGrowth.totalTx)}
                    </span>
                    <span className="text-xs text-gray-500">{comparisonLabel}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-6" style={{ borderLeft: `4px solid ${BRAND_COLORS.success}` }}>
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 rounded-lg" style={{ backgroundColor: BRAND_COLORS.success + "20" }}>
                    <DollarSign size={24} style={{ color: BRAND_COLORS.success }} />
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-gray-600 text-sm font-medium">Total Payroll</p>
                  <p className="text-3xl font-bold text-gray-900">{formatCurrency(currentKpis.total)}</p>
                  <div className="flex items-center gap-1">
                    {kpiGrowth.total >= 0 ? <ArrowUpRight size={16} style={{ color: BRAND_COLORS.success }} /> : <ArrowDownRight size={16} style={{ color: BRAND_COLORS.danger }} />}
                    <span className="text-sm font-semibold" style={{ color: kpiGrowth.total >= 0 ? BRAND_COLORS.success : BRAND_COLORS.danger }}>
                      {formatPercentage(kpiGrowth.total)}
                    </span>
                    <span className="text-xs text-gray-500">{comparisonLabel}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-6" style={{ borderLeft: `4px solid ${BRAND_COLORS.accent}` }}>
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 rounded-lg" style={{ backgroundColor: BRAND_COLORS.accent + "20" }}>
                    <TrendingUp size={24} style={{ color: BRAND_COLORS.accent }} />
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-gray-600 text-sm font-medium">Avg Payment</p>
                  <p className="text-3xl font-bold text-gray-900">{formatCurrency(currentKpis.avg)}</p>
                  <div className="flex items-center gap-1">
                    {kpiGrowth.avg >= 0 ? <ArrowUpRight size={16} style={{ color: BRAND_COLORS.success }} /> : <ArrowDownRight size={16} style={{ color: BRAND_COLORS.danger }} />}
                    <span className="text-sm font-semibold" style={{ color: kpiGrowth.avg >= 0 ? BRAND_COLORS.success : BRAND_COLORS.danger }}>
                      {formatPercentage(kpiGrowth.avg)}
                    </span>
                    <span className="text-xs text-gray-500">{comparisonLabel}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-6" style={{ borderLeft: `4px solid ${BRAND_COLORS.warning}` }}>
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 rounded-lg" style={{ backgroundColor: BRAND_COLORS.warning + "20" }}>
                    <BarChart3 size={24} style={{ color: BRAND_COLORS.warning }} />
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-gray-600 text-sm font-medium">Top Department</p>
                  <p className="text-xl font-bold text-gray-900 truncate">{currentKpis.topDept}</p>
                  <p className="text-xs text-gray-500">by total payroll</p>
                </div>
              </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Trend Chart */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-gray-900">YTD Payroll Trend</h3>
                  <div className="flex gap-2">
                    <button onClick={() => setTrendChartType("line")} className={`p-2 rounded-lg transition-colors ${trendChartType === "line" ? "text-white" : "bg-gray-100 text-gray-600"}`} style={trendChartType === "line" ? { backgroundColor: BRAND_COLORS.primary } : {}}>
                      <LineChart size={18} />
                    </button>
                    <button onClick={() => setTrendChartType("bar")} className={`p-2 rounded-lg transition-colors ${trendChartType === "bar" ? "text-white" : "bg-gray-100 text-gray-600"}`} style={trendChartType === "bar" ? { backgroundColor: BRAND_COLORS.primary } : {}}>
                      <BarChart3 size={18} />
                    </button>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  {trendChartType === "line" ? (
                    <RechartsLineChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={BRAND_COLORS.gray[200]} />
                      <XAxis dataKey="month" stroke={BRAND_COLORS.gray[400]} style={{ fontSize: 12 }} />
                      <YAxis stroke={BRAND_COLORS.gray[400]} style={{ fontSize: 12 }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ borderRadius: 8, border: `1px solid ${BRAND_COLORS.gray[200]}` }} />
                      <Line type="monotone" dataKey="grossPay" stroke={BRAND_COLORS.primary} strokeWidth={3} dot={{ fill: BRAND_COLORS.primary, r: 4 }} activeDot={{ r: 6 }} />
                    </RechartsLineChart>
                  ) : (
                    <RechartsBarChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={BRAND_COLORS.gray[200]} />
                      <XAxis dataKey="month" stroke={BRAND_COLORS.gray[400]} style={{ fontSize: 12 }} />
                      <YAxis stroke={BRAND_COLORS.gray[400]} style={{ fontSize: 12 }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ borderRadius: 8, border: `1px solid ${BRAND_COLORS.gray[200]}` }} />
                      <Bar dataKey="grossPay" fill={BRAND_COLORS.primary} radius={[8, 8, 0, 0]} />
                    </RechartsBarChart>
                  )}
                </ResponsiveContainer>
              </div>

              {/* Department Distribution */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-gray-900">Department Distribution</h3>
                  <div className="flex gap-2">
                    <button onClick={() => setChartType("pie")} className={`p-2 rounded-lg transition-colors ${chartType === "pie" ? "text-white" : "bg-gray-100 text-gray-600"}`} style={chartType === "pie" ? { backgroundColor: BRAND_COLORS.primary } : {}}>
                      <PieChart size={18} />
                    </button>
                    <button onClick={() => setChartType("bar")} className={`p-2 rounded-lg transition-colors ${chartType === "bar" ? "text-white" : "bg-gray-100 text-gray-600"}`} style={chartType === "bar" ? { backgroundColor: BRAND_COLORS.primary } : {}}>
                      <BarChart3 size={18} />
                    </button>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  {chartType === "pie" ? (
                    <RechartsPieChart>
                      <Pie data={departmentData} dataKey="cost" nameKey="department" cx="50%" cy="50%" outerRadius={100} label={(entry) => entry.department}>
                        {departmentData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ borderRadius: 8, border: `1px solid ${BRAND_COLORS.gray[200]}` }} />
                    </RechartsPieChart>
                  ) : (
                    <RechartsBarChart data={departmentData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke={BRAND_COLORS.gray[200]} />
                      <XAxis type="number" stroke={BRAND_COLORS.gray[400]} style={{ fontSize: 12 }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="department" stroke={BRAND_COLORS.gray[400]} style={{ fontSize: 12 }} width={100} />
                      <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ borderRadius: 8, border: `1px solid ${BRAND_COLORS.gray[200]}` }} />
                      <Bar dataKey="cost" fill={BRAND_COLORS.primary} radius={[0, 8, 8, 0]} />
                    </RechartsBarChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>

            {/* Summary Views */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Detailed Summary</h3>
                <div className="flex gap-2">
                  <button onClick={() => setSummaryView("department")} className={`px-4 py-2 rounded-lg font-medium transition-colors ${summaryView === "department" ? "text-white" : "bg-gray-100 text-gray-600"}`} style={summaryView === "department" ? { backgroundColor: BRAND_COLORS.primary } : {}}>
                    By Department
                  </button>
                  <button onClick={() => setSummaryView("date")} className={`px-4 py-2 rounded-lg font-medium transition-colors ${summaryView === "date" ? "text-white" : "bg-gray-100 text-gray-600"}`} style={summaryView === "date" ? { backgroundColor: BRAND_COLORS.primary } : {}}>
                    By Date
                  </button>
                  <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors">
                    <Download size={18} />
                    Export CSV
                  </button>
                </div>
              </div>

              <div className="space-y-3 max-h-96 overflow-y-auto">
                {summaryView === "department" ? (
                  departmentSummary.map((dept, idx) => (
                    <div key={idx} className="border-2 rounded-lg overflow-hidden" style={{ borderColor: BRAND_COLORS.gray[200] }}>
                      <button onClick={() => toggleGroup(dept.department)} className="w-full px-4 py-3 bg-gray-50 flex items-center justify-between hover:bg-gray-100 transition-colors">
                        <div className="flex items-center gap-3">
                          <ChevronDown className={`w-5 h-5 transition-transform ${expandedGroups.has(dept.department) ? "" : "-rotate-90"}`} style={{ color: BRAND_COLORS.primary }} />
                          <span className="font-semibold text-gray-900">{dept.department}</span>
                          <span className="text-sm text-gray-500">({dept.people.length} employees)</span>
                        </div>
                        <span className="text-lg font-bold" style={{ color: BRAND_COLORS.primary }}>{formatCurrency(dept.total)}</span>
                      </button>
                      {expandedGroups.has(dept.department) && (
                        <div className="p-4 space-y-2">
                          {dept.people.map((person, pidx) => (
                            <div key={pidx} className="flex items-center justify-between py-2 px-3 bg-white rounded-lg border" style={{ borderColor: BRAND_COLORS.gray[200] }}>
                              <div className="flex items-center gap-2">
                                <User size={16} style={{ color: BRAND_COLORS.accent }} />
                                <span className="text-sm font-medium text-gray-700">{person.name}</span>
                              </div>
                              <span className="text-sm font-semibold text-gray-900">{formatCurrency(person.amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  dateSummary.map((dateGroup, idx) => (
                    <div key={idx} className="border-2 rounded-lg overflow-hidden" style={{ borderColor: BRAND_COLORS.gray[200] }}>
                      <button onClick={() => toggleGroup(dateGroup.date)} className="w-full px-4 py-3 bg-gray-50 flex items-center justify-between hover:bg-gray-100 transition-colors">
                        <div className="flex items-center gap-3">
                          <ChevronDown className={`w-5 h-5 transition-transform ${expandedGroups.has(dateGroup.date) ? "" : "-rotate-90"}`} style={{ color: BRAND_COLORS.primary }} />
                          <span className="font-semibold text-gray-900">{formatDate(dateGroup.date)}</span>
                          <span className="text-sm text-gray-500">({dateGroup.people.length} employees)</span>
                        </div>
                        <span className="text-lg font-bold" style={{ color: BRAND_COLORS.primary }}>{formatCurrency(dateGroup.total)}</span>
                      </button>
                      {expandedGroups.has(dateGroup.date) && (
                        <div className="p-4 space-y-2">
                          {dateGroup.people.map((person, pidx) => (
                            <div key={pidx} className="flex items-center justify-between py-2 px-3 bg-white rounded-lg border" style={{ borderColor: BRAND_COLORS.gray[200] }}>
                              <div className="flex items-center gap-2">
                                <User size={16} style={{ color: BRAND_COLORS.accent }} />
                                <span className="text-sm font-medium text-gray-700">{person.name}</span>
                              </div>
                              <span className="text-sm font-semibold text-gray-900">{formatCurrency(person.amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
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

              {/* Rejection Note Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Rejection Reason (optional)
                </label>
                <textarea
                  value={rejectionNote}
                  onChange={(e) => setRejectionNote(e.target.value)}
                  placeholder="E.g., 'Please verify John Smith's hours' or 'Missing overtime for Jane Doe'"
                  className="w-full px-4 py-3 border-2 rounded-lg resize-none"
                  style={{ borderColor: BRAND_COLORS.gray[300] }}
                  rows={3}
                />
                <p className="text-xs text-gray-500 mt-1">
                  This note will be shown to the location manager so they can fix the issues.
                </p>
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
