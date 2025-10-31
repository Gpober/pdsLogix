"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
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
  Target,
  Award,
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
import { getAuthClient, getDataClient, syncDataClientSession } from '@/lib/supabase/client';
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
  status: 'approved' | 'pending' | 'not_submitted' | 'rejected';
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
  fixed_count: number | null;
  adjustment_amount: number | null;
  amount: number;
  notes: string | null;
  organization_id: string;
}

const formatDate = (date: string) =>
  new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

const formatCurrency = (amount: number | null) => {
  if (amount === null || amount === undefined) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
};

export default function PayrollPage() {
  const authClient = useMemo(() => getAuthClient(), []);
  const dataClient = useMemo(() => getDataClient(), []);
  
  // State management
  const [notification, setNotification] = useState<{ 
    show: boolean; 
    message: string; 
    type: "info" | "success" | "error" | "warning" 
  }>({ show: false, message: "", type: "info" });
  
  const [viewMode, setViewMode] = useState<ViewMode>("analytics");
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

  // Payroll data
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [totalPayroll, setTotalPayroll] = useState(0);
  const [employeeCount, setEmployeeCount] = useState(0);
  const [avgPayment, setAvgPayment] = useState(0);
  const [departments, setDepartments] = useState<string[]>([]);
  
  // Approval data
  const [pendingSubmissions, setPendingSubmissions] = useState<PendingSubmission[]>([]);
  const [allLocations, setAllLocations] = useState<LocationStatus[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<PendingSubmission | null>(null);
  const [submissionDetails, setSubmissionDetails] = useState<SubmissionDetail[]>([]);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [rejectionNote, setRejectionNote] = useState('');
  
  // User context
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [subdomainOrgId, setSubdomainOrgId] = useState<string | null>(null);

  const showNotification = useCallback((message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    setNotification({ show: true, message, type });
    setTimeout(() => setNotification({ show: false, message: "", type: "info" }), 3000);
  }, []);

  // Get organization from subdomain
  useEffect(() => {
    const getOrgFromSubdomain = async () => {
      const hostname = window.location.hostname;
      const parts = hostname.split('.');

      if (parts.length >= 3) {
        const subdomain = parts[0];
        console.log('🌐 Detected subdomain:', subdomain);

        const { data: { session } } = await authClient.auth.getSession();

        if (!session) {
          return;
        }

        await syncDataClientSession(session);

        const { data: org, error } = await dataClient
          .from('organizations')
          .select('id')
          .eq('subdomain', subdomain)
          .single();

        if (error) {
          console.error('❌ Error fetching organization:', error);
          return;
        }

        if (org) {
          console.log('✅ Found organization:', org.id);
          setSubdomainOrgId(org.id);
        }
      }
    };

    getOrgFromSubdomain();
  }, [authClient, dataClient]);

  // Get user context
  useEffect(() => {
    const getUserContext = async () => {
      try {
        const { data: { session } } = await authClient.auth.getSession();
        
        if (!session) {
          console.log('❌ No session found');
          return;
        }

        await syncDataClientSession(session);
        
        const currentUserId = session.user.id;
        setUserId(currentUserId);

        const { data: profile, error: profileError } = await dataClient
          .from('profiles')
          .select('role, organization_id')
          .eq('id', currentUserId)
          .single();

        if (profileError) {
          console.error('Error fetching profile:', profileError);
          return;
        }

        setUserRole(profile.role);
        
        const targetOrgId = subdomainOrgId || profile.organization_id;
        setOrganizationId(targetOrgId);
        
        console.log('✅ User context loaded:', {
          userId: currentUserId,
          role: profile.role,
          organizationId: targetOrgId
        });
      } catch (error) {
        console.error('❌ Error in getUserContext:', error);
      }
    };

    if (subdomainOrgId !== null) {
      getUserContext();
    }
  }, [authClient, dataClient, subdomainOrgId]);

  // Load pending submissions for approvals
  const loadPendingSubmissions = useCallback(async () => {
    if (!organizationId) return;

    try {
      console.log('📥 Loading pending submissions for org:', organizationId);

      const { data: submissions, error } = await supabase
        .from('payroll_submissions')
        .select(`
          *,
          locations (name)
        `)
        .eq('organization_id', organizationId)
        .eq('status', 'pending')
        .order('submitted_at', { ascending: false });

      if (error) {
        console.error('❌ Error loading submissions:', error);
        return;
      }

      const formattedSubmissions = submissions.map(sub => ({
        ...sub,
        location_name: sub.locations?.name || 'Unknown Location'
      }));

      console.log('✅ Loaded submissions:', formattedSubmissions.length);
      setPendingSubmissions(formattedSubmissions);

      await loadAllLocationsStatus();
    } catch (error) {
      console.error('❌ Error in loadPendingSubmissions:', error);
    }
  }, [organizationId]);

  // Load all locations status
  const loadAllLocationsStatus = useCallback(async () => {
    if (!organizationId) return;

    try {
      const { data: locations, error: locError } = await supabase
        .from('locations')
        .select('id, name')
        .eq('organization_id', organizationId)
        .order('name');

      if (locError) {
        console.error('❌ Error loading locations:', locError);
        return;
      }

      const { data: submissions, error: subError } = await supabase
        .from('payroll_submissions')
        .select('*')
        .eq('organization_id', organizationId)
        .order('submitted_at', { ascending: false });

      if (subError) {
        console.error('❌ Error loading submissions:', subError);
        return;
      }

      const locationStatuses: LocationStatus[] = locations.map(loc => {
        const latestSub = submissions.find(s => s.location_id === loc.id);
        
        if (!latestSub) {
          return {
            location_id: loc.id,
            location_name: loc.name,
            status: 'not_submitted' as const
          };
        }

        return {
          location_id: loc.id,
          location_name: loc.name,
          submission_id: latestSub.id,
          status: latestSub.status === 'rejected' ? 'not_submitted' as const : latestSub.status as 'approved' | 'pending',
          total_amount: latestSub.total_amount,
          employee_count: latestSub.employee_count,
          pay_date: latestSub.pay_date,
          payroll_group: latestSub.payroll_group,
          submitted_at: latestSub.submitted_at
        };
      });

      setAllLocations(locationStatuses);
    } catch (error) {
      console.error('❌ Error in loadAllLocationsStatus:', error);
    }
  }, [organizationId]);

  // Open approval modal
  const openApprovalModal = useCallback(async (submission: PendingSubmission) => {
    setSelectedSubmission(submission);
    setRejectionNote('');

    try {
      const { data: details, error } = await supabase
        .from('payroll_entries')
        .select(`
          employee_id,
          hours,
          units,
          fixed_count,
          adjustment_amount,
          amount,
          notes,
          employees (first_name, last_name),
          organization_id
        `)
        .eq('submission_id', submission.id);

      if (error) {
        console.error('❌ Error loading submission details:', error);
        showNotification('Failed to load submission details', 'error');
        return;
      }

      const formattedDetails: SubmissionDetail[] = details.map(d => ({
        employee_id: d.employee_id,
        employee_name: `${d.employees.first_name} ${d.employees.last_name}`,
        hours: d.hours,
        units: d.units,
        fixed_count: d.fixed_count,
        adjustment_amount: d.adjustment_amount,
        amount: d.amount,
        notes: d.notes,
        organization_id: d.organization_id
      }));

      setSubmissionDetails(formattedDetails);
      setShowApprovalModal(true);
    } catch (error) {
      console.error('❌ Error in openApprovalModal:', error);
      showNotification('Failed to open approval modal', 'error');
    }
  }, [showNotification]);

  // Handle approval
  const handleApprove = useCallback(async () => {
    if (!selectedSubmission || !userId) return;

    setIsApproving(true);

    try {
      console.log('✅ Starting approval process for submission:', selectedSubmission.id);

      // Step 1: Update submission status to 'approved'
      const { error: updateError } = await supabase
        .from('payroll_submissions')
        .update({
          status: 'approved',
          approved_by: userId,
          approved_at: new Date().toISOString()
        })
        .eq('id', selectedSubmission.id);

      if (updateError) {
        throw new Error(`Failed to update submission: ${updateError.message}`);
      }

      // Step 2: Get entries and insert into payments
      const { data: entries, error: entriesError } = await supabase
        .from('payroll_entries')
        .select(`
          *,
          employees (first_name, last_name, department)
        `)
        .eq('submission_id', selectedSubmission.id);

      if (entriesError) {
        throw new Error(`Failed to fetch entries: ${entriesError.message}`);
      }

      // Step 3: Insert payments
      const paymentRecords = entries.map(entry => ({
        organization_id: entry.organization_id,
        first_name: entry.employees.first_name,
        last_name: entry.employees.last_name,
        department: entry.employees.department || 'General',
        date: selectedSubmission.pay_date,
        total_amount: entry.amount,
        payment_method: 'Direct Deposit'
      }));

      const { error: paymentsError } = await supabase
        .from('payments')
        .insert(paymentRecords);

      if (paymentsError) {
        throw new Error(`Failed to create payments: ${paymentsError.message}`);
      }

      // Step 4: Update submission to 'posted'
      const { error: postError } = await supabase
        .from('payroll_submissions')
        .update({ status: 'posted' })
        .eq('id', selectedSubmission.id);

      if (postError) {
        throw new Error(`Failed to mark as posted: ${postError.message}`);
      }

      // Step 5: Create audit log
      const { error: auditError } = await supabase
        .from('payroll_approvals')
        .insert({
          submission_id: selectedSubmission.id,
          approved_by: userId,
          approved_at: new Date().toISOString(),
          action: 'approved',
          organization_id: organizationId
        });

      if (auditError) {
        console.warn('⚠️ Failed to create audit log:', auditError);
      }

      console.log('✅ Approval complete!');
      showNotification('Payroll approved and posted successfully!', 'success');
      
      setShowApprovalModal(false);
      setSelectedSubmission(null);
      setRejectionNote('');
      
      await loadPendingSubmissions();
      
    } catch (error: any) {
      console.error('❌ Error approving payroll:', error);
      showNotification(error.message || 'Failed to approve payroll', 'error');
    } finally {
      setIsApproving(false);
    }
  }, [selectedSubmission, userId, organizationId, showNotification, loadPendingSubmissions]);

  // Handle rejection
  const handleReject = useCallback(async () => {
    if (!selectedSubmission || !userId) return;

    setIsApproving(true);

    try {
      console.log('🚫 Rejecting submission:', selectedSubmission.id);

      const { error: updateError } = await supabase
        .from('payroll_submissions')
        .update({
          status: 'rejected',
          rejected_by: userId,
          rejected_at: new Date().toISOString(),
          rejection_note: rejectionNote || null
        })
        .eq('id', selectedSubmission.id);

      if (updateError) {
        throw new Error(`Failed to reject submission: ${updateError.message}`);
      }

      const { error: auditError } = await supabase
        .from('payroll_approvals')
        .insert({
          submission_id: selectedSubmission.id,
          approved_by: userId,
          approved_at: new Date().toISOString(),
          action: 'rejected',
          notes: rejectionNote || null,
          organization_id: organizationId
        });

      if (auditError) {
        console.warn('⚠️ Failed to create audit log:', auditError);
      }

      console.log('✅ Rejection complete!');
      showNotification('Payroll rejected. Location manager can edit and resubmit.', 'warning');
      
      setShowApprovalModal(false);
      setSelectedSubmission(null);
      setRejectionNote('');
      
      await loadPendingSubmissions();
      
    } catch (error: any) {
      console.error('❌ Error rejecting payroll:', error);
      showNotification(error.message || 'Failed to reject payroll', 'error');
    } finally {
      setIsApproving(false);
    }
  }, [selectedSubmission, userId, rejectionNote, organizationId, showNotification, loadPendingSubmissions]);

  // Load approvals data
  useEffect(() => {
    if (viewMode === 'approvals' && organizationId) {
      loadPendingSubmissions();
    }
  }, [viewMode, organizationId, loadPendingSubmissions]);

  // Load analytics data
  const loadPayrollData = useCallback(async () => {
    if (!organizationId || viewMode !== 'analytics') return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: true });

      if (error) throw error;

      const filteredData = departmentFilter === "All Departments"
        ? data
        : data.filter((p) => p.department === departmentFilter);

      const searchFiltered = searchTerm
        ? filteredData.filter(
            (p) =>
              `${p.first_name} ${p.last_name}`
                .toLowerCase()
                .includes(searchTerm.toLowerCase()) ||
              p.department?.toLowerCase().includes(searchTerm.toLowerCase())
          )
        : filteredData;

      setPayments(searchFiltered || []);

      const total = searchFiltered.reduce((sum, p) => sum + (p.total_amount || 0), 0);
      const uniqueEmployees = new Set(searchFiltered.map((p) => `${p.first_name} ${p.last_name}`)).size;
      
      setTotalPayroll(total);
      setEmployeeCount(uniqueEmployees);
      setAvgPayment(uniqueEmployees > 0 ? total / uniqueEmployees : 0);

      const uniqueDepts = Array.from(new Set(data.map((p) => p.department).filter(Boolean)));
      setDepartments(uniqueDepts as string[]);
    } catch (error) {
      console.error("Error loading payroll data:", error);
      showNotification("Failed to load payroll data", "error");
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, viewMode, startDate, endDate, departmentFilter, searchTerm, showNotification]);

  useEffect(() => {
    if (viewMode === 'analytics') {
      loadPayrollData();
    }
  }, [viewMode, loadPayrollData]);

  // Calculate date range
  useEffect(() => {
    const calculateDateRange = () => {
      const now = new Date();
      const year = parseInt(selectedYear);
      const monthIndex = new Date(`${selectedMonth} 1`).getMonth();

      if (timePeriod === "Monthly") {
        const start = new Date(year, monthIndex, 1);
        const end = new Date(year, monthIndex + 1, 0);
        setStartDate(start.toISOString().split("T")[0]);
        setEndDate(end.toISOString().split("T")[0]);
      } else if (timePeriod === "Quarterly") {
        const quarter = Math.floor(monthIndex / 3);
        const start = new Date(year, quarter * 3, 1);
        const end = new Date(year, quarter * 3 + 3, 0);
        setStartDate(start.toISOString().split("T")[0]);
        setEndDate(end.toISOString().split("T")[0]);
      } else if (timePeriod === "YTD") {
        setStartDate(`${year}-01-01`);
        setEndDate(now.toISOString().split("T")[0]);
      } else if (timePeriod === "Trailing 12") {
        const start = new Date(now);
        start.setMonth(start.getMonth() - 12);
        setStartDate(start.toISOString().split("T")[0]);
        setEndDate(now.toISOString().split("T")[0]);
      } else if (timePeriod === "Custom" && customStartDate && customEndDate) {
        setStartDate(customStartDate);
        setEndDate(customEndDate);
      }
    };

    calculateDateRange();
  }, [timePeriod, selectedMonth, selectedYear, customStartDate, customEndDate]);

  // Department summary
  const departmentSummary = useMemo(() => {
    const deptMap = new Map<string, { total: number; people: { name: string; amount: number }[] }>();
    
    payments.forEach((p) => {
      const dept = p.department || "Unassigned";
      const name = `${p.first_name} ${p.last_name}`;
      const amount = p.total_amount || 0;

      if (!deptMap.has(dept)) {
        deptMap.set(dept, { total: 0, people: [] });
      }
      
      const deptData = deptMap.get(dept)!;
      deptData.total += amount;
      
      const existingPerson = deptData.people.find((per) => per.name === name);
      if (existingPerson) {
        existingPerson.amount += amount;
      } else {
        deptData.people.push({ name, amount });
      }
    });

    return Array.from(deptMap.entries())
      .map(([department, { total, people }]) => ({
        department,
        total,
        people: people.sort((a, b) => b.amount - a.amount),
      }))
      .sort((a, b) => b.total - a.total);
  }, [payments]);

  // Date summary
  const dateSummary = useMemo(() => {
    const dateMap = new Map<string, { total: number; people: { name: string; amount: number }[] }>();
    
    payments.forEach((p) => {
      const date = p.date || "Unknown";
      const name = `${p.first_name} ${p.last_name}`;
      const amount = p.total_amount || 0;

      if (!dateMap.has(date)) {
        dateMap.set(date, { total: 0, people: [] });
      }
      
      const dateData = dateMap.get(date)!;
      dateData.total += amount;
      
      const existingPerson = dateData.people.find((per) => per.name === name);
      if (existingPerson) {
        existingPerson.amount += amount;
      } else {
        dateData.people.push({ name, amount });
      }
    });

    return Array.from(dateMap.entries())
      .map(([date, { total, people }]) => ({
        date,
        total,
        people: people.sort((a, b) => b.amount - a.amount),
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [payments]);

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  };

  const exportCSV = () => {
    const headers = ["First Name", "Last Name", "Department", "Date", "Amount"];
    const rows = payments.map((p) => [
      p.first_name,
      p.last_name,
      p.department,
      p.date,
      p.total_amount,
    ]);
    
    const csvContent = [headers, ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payroll_${startDate}_${endDate}.csv`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <ClipboardCheck size={28} style={{ color: BRAND_COLORS.primary }} />
              <h1 className="text-2xl font-bold text-gray-900">Payroll Dashboard</h1>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => setViewMode('analytics')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  viewMode === 'analytics' ? 'text-white' : 'bg-gray-100 text-gray-600'
                }`}
                style={viewMode === 'analytics' ? { backgroundColor: BRAND_COLORS.primary } : {}}
              >
                <BarChart3 size={18} className="inline mr-2" />
                Analytics
              </button>
              <button
                onClick={() => setViewMode('approvals')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  viewMode === 'approvals' ? 'text-white' : 'bg-gray-100 text-gray-600'
                }`}
                style={viewMode === 'approvals' ? { backgroundColor: BRAND_COLORS.primary } : {}}
              >
                <ClipboardCheck size={18} className="inline mr-2" />
                Approvals
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* APPROVALS VIEW */}
        {viewMode === 'approvals' && (
          <div className="space-y-6">
            {/* Pending Submissions */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Clock size={24} style={{ color: BRAND_COLORS.warning }} />
                  <h2 className="text-xl font-bold text-gray-900">
                    Pending Approvals ({pendingSubmissions.length})
                  </h2>
                </div>
                <button
                  onClick={loadPendingSubmissions}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  <RefreshCw size={18} />
                  Refresh
                </button>
              </div>

              {pendingSubmissions.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {pendingSubmissions.map((sub) => (
                    <div
                      key={sub.id}
                      onClick={() => openApprovalModal(sub)}
                      className="border-2 rounded-xl p-4 cursor-pointer hover:shadow-lg transition-all"
                      style={{ borderColor: BRAND_COLORS.warning }}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-semibold text-gray-900">{sub.location_name}</h3>
                          <p className="text-sm text-gray-600">Group {sub.payroll_group}</p>
                        </div>
                        <div className="px-3 py-1 rounded-full text-xs font-medium text-white" style={{ backgroundColor: BRAND_COLORS.warning }}>
                          Pending
                        </div>
                      </div>
                      
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Pay Date:</span>
                          <span className="font-medium">{formatDate(sub.pay_date)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Employees:</span>
                          <span className="font-medium">{sub.employee_count}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Total:</span>
                          <span className="font-bold" style={{ color: BRAND_COLORS.success }}>
                            {formatCurrency(sub.total_amount)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <CheckCircle size={48} className="mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">No pending approvals</p>
                  <p className="text-sm mt-2">All payroll submissions are processed</p>
                </div>
              )}
            </div>

            {/* All Locations Status */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <div className="flex items-center gap-3 mb-6">
                <Target size={24} style={{ color: BRAND_COLORS.accent }} />
                <h2 className="text-xl font-bold text-gray-900">All Locations Status</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {allLocations.map((loc) => (
                  <div
                    key={loc.location_id}
                    className="border-2 rounded-xl p-4"
                    style={{
                      borderColor:
                        loc.status === 'approved'
                          ? BRAND_COLORS.success
                          : loc.status === 'pending'
                          ? BRAND_COLORS.warning
                          : BRAND_COLORS.gray[300],
                    }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-gray-900">{loc.location_name}</h3>
                      <div
                        className="px-2 py-1 rounded-full text-xs font-medium text-white"
                        style={{
                          backgroundColor:
                            loc.status === 'approved'
                              ? BRAND_COLORS.success
                              : loc.status === 'pending'
                              ? BRAND_COLORS.warning
                              : BRAND_COLORS.gray[400],
                        }}
                      >
                        {loc.status === 'approved' ? '✓ Approved' : loc.status === 'pending' ? 'Pending' : 'Not Submitted'}
                      </div>
                    </div>
                    
                    {loc.status !== 'not_submitted' && (
                      <div className="text-sm space-y-1 mt-3">
                        <div className="flex justify-between text-gray-600">
                          <span>Amount:</span>
                          <span className="font-medium">{formatCurrency(loc.total_amount || 0)}</span>
                        </div>
                        <div className="flex justify-between text-gray-600">
                          <span>Employees:</span>
                          <span className="font-medium">{loc.employee_count}</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ANALYTICS VIEW */}
        {viewMode === 'analytics' && (
          <div className="space-y-6">
            {/* Filters */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Time Period */}
                <div className="relative">
                  <button
                    onClick={() => setTimePeriodDropdownOpen(!timePeriodDropdownOpen)}
                    className="w-full px-4 py-2 bg-gray-100 rounded-lg flex items-center justify-between"
                  >
                    <span>{timePeriod}</span>
                    <ChevronDown size={18} />
                  </button>
                  {timePeriodDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white border rounded-lg shadow-lg z-50">
                      {["Monthly", "Quarterly", "YTD", "Trailing 12", "Custom"].map((period) => (
                        <button
                          key={period}
                          onClick={() => {
                            setTimePeriod(period as TimePeriod);
                            setTimePeriodDropdownOpen(false);
                          }}
                          className="w-full px-4 py-2 text-left hover:bg-gray-50"
                        >
                          {period}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Month */}
                {timePeriod === "Monthly" && (
                  <div className="relative">
                    <button
                      onClick={() => setMonthDropdownOpen(!monthDropdownOpen)}
                      className="w-full px-4 py-2 bg-gray-100 rounded-lg flex items-center justify-between"
                    >
                      <span>{selectedMonth}</span>
                      <ChevronDown size={18} />
                    </button>
                    {monthDropdownOpen && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white border rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                        {Array.from({ length: 12 }, (_, i) => new Date(0, i).toLocaleString("en-US", { month: "long" })).map((month) => (
                          <button
                            key={month}
                            onClick={() => {
                              setSelectedMonth(month);
                              setMonthDropdownOpen(false);
                            }}
                            className="w-full px-4 py-2 text-left hover:bg-gray-50"
                          >
                            {month}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Year */}
                <div className="relative">
                  <button
                    onClick={() => setYearDropdownOpen(!yearDropdownOpen)}
                    className="w-full px-4 py-2 bg-gray-100 rounded-lg flex items-center justify-between"
                  >
                    <span>{selectedYear}</span>
                    <ChevronDown size={18} />
                  </button>
                  {yearDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white border rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                      {Array.from({ length: 10 }, (_, i) => String(new Date().getFullYear() - i)).map((year) => (
                        <button
                          key={year}
                          onClick={() => {
                            setSelectedYear(year);
                            setYearDropdownOpen(false);
                          }}
                          className="w-full px-4 py-2 text-left hover:bg-gray-50"
                        >
                          {year}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Department Filter */}
                <div className="relative">
                  <button
                    onClick={() => setDepartmentDropdownOpen(!departmentDropdownOpen)}
                    className="w-full px-4 py-2 bg-gray-100 rounded-lg flex items-center justify-between"
                  >
                    <span>{departmentFilter}</span>
                    <ChevronDown size={18} />
                  </button>
                  {departmentDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white border rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                      <button
                        onClick={() => {
                          setDepartmentFilter("All Departments");
                          setDepartmentDropdownOpen(false);
                        }}
                        className="w-full px-4 py-2 text-left hover:bg-gray-50"
                      >
                        All Departments
                      </button>
                      {departments.map((dept) => (
                        <button
                          key={dept}
                          onClick={() => {
                            setDepartmentFilter(dept);
                            setDepartmentDropdownOpen(false);
                          }}
                          className="w-full px-4 py-2 text-left hover:bg-gray-50"
                        >
                          {dept}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Custom Date Range */}
              {timePeriod === "Custom" && (
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="px-4 py-2 border rounded-lg"
                  />
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="px-4 py-2 border rounded-lg"
                  />
                </div>
              )}

              {/* Search */}
              <div className="mt-4 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search employees or departments..."
                  className="w-full pl-10 pr-4 py-2 border rounded-lg"
                />
              </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-xl shadow-sm border p-6">
                <div className="flex items-center gap-3 mb-2">
                  <DollarSign size={24} style={{ color: BRAND_COLORS.success }} />
                  <h3 className="text-sm font-medium text-gray-600">Total Payroll</h3>
                </div>
                <p className="text-3xl font-bold" style={{ color: BRAND_COLORS.success }}>
                  {formatCurrency(totalPayroll)}
                </p>
              </div>

              <div className="bg-white rounded-xl shadow-sm border p-6">
                <div className="flex items-center gap-3 mb-2">
                  <Users size={24} style={{ color: BRAND_COLORS.primary }} />
                  <h3 className="text-sm font-medium text-gray-600">Employees</h3>
                </div>
                <p className="text-3xl font-bold" style={{ color: BRAND_COLORS.primary }}>
                  {employeeCount}
                </p>
              </div>

              <div className="bg-white rounded-xl shadow-sm border p-6">
                <div className="flex items-center gap-3 mb-2">
                  <TrendingUp size={24} style={{ color: BRAND_COLORS.accent }} />
                  <h3 className="text-sm font-medium text-gray-600">Avg Per Employee</h3>
                </div>
                <p className="text-3xl font-bold" style={{ color: BRAND_COLORS.accent }}>
                  {formatCurrency(avgPayment)}
                </p>
              </div>
            </div>

            {/* Summary */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Detailed Summary</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSummaryView("department")}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      summaryView === "department" ? "text-white" : "bg-gray-100 text-gray-600"
                    }`}
                    style={summaryView === "department" ? { backgroundColor: BRAND_COLORS.primary } : {}}
                  >
                    By Department
                  </button>
                  <button
                    onClick={() => setSummaryView("date")}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      summaryView === "date" ? "text-white" : "bg-gray-100 text-gray-600"
                    }`}
                    style={summaryView === "date" ? { backgroundColor: BRAND_COLORS.primary } : {}}
                  >
                    By Date
                  </button>
                  <button
                    onClick={exportCSV}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    <Download size={18} />
                    Export CSV
                  </button>
                </div>
              </div>

              <div className="space-y-3 max-h-96 overflow-y-auto">
                {summaryView === "department" ? (
                  departmentSummary.map((dept, idx) => (
                    <div key={idx} className="border-2 rounded-lg overflow-hidden" style={{ borderColor: BRAND_COLORS.gray[200] }}>
                      <button
                        onClick={() => toggleGroup(dept.department)}
                        className="w-full px-4 py-3 bg-gray-50 flex items-center justify-between hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <ChevronDown
                            className={`w-5 h-5 transition-transform ${expandedGroups.has(dept.department) ? "" : "-rotate-90"}`}
                            style={{ color: BRAND_COLORS.primary }}
                          />
                          <span className="font-semibold text-gray-900">{dept.department}</span>
                          <span className="text-sm text-gray-500">({dept.people.length} employees)</span>
                        </div>
                        <span className="text-lg font-bold" style={{ color: BRAND_COLORS.primary }}>
                          {formatCurrency(dept.total)}
                        </span>
                      </button>
                      {expandedGroups.has(dept.department) && (
                        <div className="p-4 space-y-2">
                          {dept.people.map((person, pidx) => (
                            <div
                              key={pidx}
                              className="flex items-center justify-between py-2 px-3 bg-white rounded-lg border"
                              style={{ borderColor: BRAND_COLORS.gray[200] }}
                            >
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
                      <button
                        onClick={() => toggleGroup(dateGroup.date)}
                        className="w-full px-4 py-3 bg-gray-50 flex items-center justify-between hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <ChevronDown
                            className={`w-5 h-5 transition-transform ${expandedGroups.has(dateGroup.date) ? "" : "-rotate-90"}`}
                            style={{ color: BRAND_COLORS.primary }}
                          />
                          <span className="font-semibold text-gray-900">{formatDate(dateGroup.date)}</span>
                          <span className="text-sm text-gray-500">({dateGroup.people.length} employees)</span>
                        </div>
                        <span className="text-lg font-bold" style={{ color: BRAND_COLORS.primary }}>
                          {formatCurrency(dateGroup.total)}
                        </span>
                      </button>
                      {expandedGroups.has(dateGroup.date) && (
                        <div className="p-4 space-y-2">
                          {dateGroup.people.map((person, pidx) => (
                            <div
                              key={pidx}
                              className="flex items-center justify-between py-2 px-3 bg-white rounded-lg border"
                              style={{ borderColor: BRAND_COLORS.gray[200] }}
                            >
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

        {/* Notification */}
        {notification.show && (
          <div
            className={`fixed top-5 right-5 z-50 px-6 py-4 rounded-lg text-white font-medium shadow-lg ${
              notification.type === "success"
                ? "bg-green-500"
                : notification.type === "error"
                ? "bg-red-500"
                : notification.type === "warning"
                ? "bg-yellow-500"
                : "bg-blue-500"
            }`}
          >
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
                <h2 className="text-2xl font-bold mb-1" style={{ color: BRAND_COLORS.accent }}>
                  Review Payroll
                </h2>
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
                  <div className="font-semibold text-sm">
                    {formatDate(selectedSubmission.period_start)} - {formatDate(selectedSubmission.period_end)}
                  </div>
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
                        <span className="text-xl font-bold" style={{ color: BRAND_COLORS.accent }}>
                          {formatCurrency(detail.amount)}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600">
                        {detail.hours
                          ? `${detail.hours} hours`
                          : detail.units
                          ? `${detail.units} units`
                          : detail.fixed_count
                          ? `Fixed (${detail.fixed_count} pay periods)`
                          : 'Unknown compensation type'}
                        {detail.adjustment_amount && detail.adjustment_amount !== 0 && (
                          <span className="ml-2 text-blue-600">
                            {detail.adjustment_amount > 0 ? '+' : ''}{formatCurrency(detail.adjustment_amount)} adjustment
                          </span>
                        )}
                      </div>
                      {detail.notes && (
                        <div className="text-xs text-gray-500 mt-2 italic">Note: {detail.notes}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div
                className="bg-gradient-to-r from-green-50 to-green-100 rounded-lg p-6 text-center border-2"
                style={{ borderColor: BRAND_COLORS.success }}
              >
                <div className="text-sm text-gray-600 mb-2">Total Amount</div>
                <div className="text-4xl font-bold" style={{ color: BRAND_COLORS.success }}>
                  {formatCurrency(selectedSubmission.total_amount)}
                </div>
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
                <button
                  onClick={handleReject}
                  disabled={isApproving}
                  className="flex-1 px-6 py-4 rounded-lg font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50 hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: BRAND_COLORS.danger }}
                >
                  <XCircle size={20} />
                  Reject
                </button>
                <button
                  onClick={handleApprove}
                  disabled={isApproving}
                  className="flex-1 px-6 py-4 rounded-lg font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50 hover:opacity-90 transition-opacity"
                  style={{ background: `linear-gradient(135deg, ${BRAND_COLORS.success}, #229954)` }}
                >
                  {isApproving ? (
                    "Approving..."
                  ) : (
                    <>
                      <CheckCircle size={20} />
                      Approve & Post
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
