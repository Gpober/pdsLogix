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
  Award,
  Target,
  Home,
  Clock,
  Check,
  AlertCircle,
  User,
  ChevronRight,
  CheckCircle,
  XCircle,
  ClipboardCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { getAuthClient } from '@/lib/supabase/auth-client';
import { getDataClient, syncDataClientSession } from '@/lib/supabase/client';

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
  expenses?: number;
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
}

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

type ViewMode = "overview" | "summary" | "report" | "detail" | "approvals";
type RankingMetric = "payrollDept" | "payrollEmployee";

const getMonthName = (m: number) =>
  new Date(0, m - 1).toLocaleString("en-US", { month: "long" });

const formatDate = (date: string) =>
  new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

export default function PayrollDashboard() {
  const router = useRouter();
  const authClient = useMemo(() => getAuthClient(), []);
  const dataClient = useMemo(() => getDataClient(), []);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportPeriod, setReportPeriod] = useState<
    "Monthly" | "Custom" | "Year to Date" | "Trailing 12" | "Quarterly"
  >("Monthly");
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [view, setView] = useState<ViewMode>("overview");
  const [properties, setProperties] = useState<PropertySummary[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [rankingMetric, setRankingMetric] = useState<RankingMetric | null>(null);
  const [employeeTotals, setEmployeeTotals] = useState<Category[]>([]);
  const [employeeBreakdown, setEmployeeBreakdown] = useState<Record<string, { total: number; payments: Transaction[] }>>({});
  const [payrollTotals, setPayrollTotals] = useState<number>(0);
  
  // Approval States
  const [pendingSubmissions, setPendingSubmissions] = useState<PendingSubmission[]>([]);
  const [allLocations, setAllLocations] = useState<LocationStatus[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<PendingSubmission | null>(null);
  const [submissionDetails, setSubmissionDetails] = useState<SubmissionDetail[]>([]);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [subdomainOrgId, setSubdomainOrgId] = useState<string | null>(null);

  const transactionTotal = useMemo(
    () => transactions.reduce((sum, t) => sum + t.amount, 0),
    [transactions],
  );

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

  useEffect(() => {
    const getOrgFromSubdomain = async () => {
      // Extract subdomain from URL
      const hostname = window.location.hostname;
      const parts = hostname.split('.');

      // Check if we have a subdomain (e.g., pdslogix.iamcfo.com)
      if (parts.length >= 3) {
        const subdomain = parts[0];
        console.log('🌐 Detected subdomain:', subdomain);

        const { data: { session } } = await authClient.auth.getSession();

        if (!session) {
          return;
        }

        await syncDataClientSession(session);

        // Look up organization by subdomain
        const { data: org, error } = await dataClient
          .from('organizations')
          .select('id')
          .eq('subdomain', subdomain)
          .single();

        if (!error && org) {
          console.log('🏢 Found organization for subdomain:', org.id);
          setSubdomainOrgId(org.id);
        } else {
          console.warn('⚠️ No organization found for subdomain:', subdomain);
        }
      }
    };

    getOrgFromSubdomain();
  }, []);

  // Check auth and role
  useEffect(() => {
    const checkAuth = async () => {
      console.log('🔍 Starting auth check...');
      const { data: { session }, error: authError } = await authClient.auth.getSession();

      if (authError || !session?.user) {
        console.log('❌ Auth error or no user:', authError);
        router.push('/login');
        return;
      }

      await syncDataClientSession(session);

      const user = session.user;

      console.log('👤 User ID:', user.id);
      setUserId(user.id);

      const { data: userData, error: userError } = await dataClient
        .from('users')
        .select('role, organization_id')
        .eq('id', user.id)
        .single();

      console.log('📋 User data from database:', userData);
      console.log('🏢 Organization ID:', userData?.organization_id);
      console.log('👔 User role:', userData?.role);

      if (userError || !userData) {
        console.error('❌ User error:', userError);
        router.push('/dashboard');
        return;
      }

      setUserRole(userData.role);
      setOrganizationId(userData.organization_id);

      console.log('✅ State will be set - userRole:', userData.role, 'orgId:', userData.organization_id);

      // Only allow admins/owners
      if (userData.role !== 'super_admin' && userData.role !== 'admin' && userData.role !== 'owner') {
        console.log('⛔ Access denied - role:', userData.role);
        router.push('/dashboard');
        return;
      }

      console.log('✅ Access granted, ready to load data');
    };

    checkAuth();
  }, [router]);

  // Load pending submissions and all locations
  useEffect(() => {
    console.log('🔄 useEffect triggered with:', { userRole, organizationId, subdomainOrgId });

    // For super_admin, use subdomain org; for others, use their org
    const effectiveOrgId = userRole === 'super_admin' ? subdomainOrgId : organizationId;

    if (userRole && effectiveOrgId) {
      console.log('✅ Conditions met, loading data with org:', effectiveOrgId);
      loadPendingSubmissions(effectiveOrgId);
      loadAllLocations(effectiveOrgId);
    } else {
      console.log('⚠️ Conditions NOT met:', {
        hasRole: !!userRole,
        hasOrgId: !!organizationId,
        hasSubdomainOrgId: !!subdomainOrgId,
        effectiveOrgId,
      });
    }
  }, [userRole, organizationId, subdomainOrgId]);

  const loadPendingSubmissions = async (orgId?: string) => {
    console.log('📥 Loading pending submissions for org:', orgId);

    let query = dataClient
      .from('payroll_submissions')
      .select('*')
      .eq('status', 'pending')
      .order('submitted_at', { ascending: false });

    if (orgId) {
      query = query.eq('organization_id', orgId);
    }

    const { data: submissions, error } = await query;

    if (error) {
      console.error('❌ Error loading pending submissions:', error);
      return;
    }

    console.log('📊 Found submissions:', submissions?.length || 0, submissions);

    // Get location names
    const locationsIds = [...new Set(submissions?.map(s => s.location_id))];
    console.log('📍 Location IDs to fetch:', locationsIds);

    const { data: locations } = await dataClient
      .from('locations')
      .select('id, name')
      .in('id', locationsIds);

    console.log('📍 Locations found:', locations);

    const locationsMap = new Map(locations?.map(l => [l.id, l.name]));

    const submissionsWithNames = (submissions || []).map(s => ({
      ...s,
      location_name: locationsMap.get(s.location_id) || 'Unknown Location'
    }));

    console.log('✅ Final submissions with names:', submissionsWithNames);
    setPendingSubmissions(submissionsWithNames);
  };

  const loadAllLocations = async (orgId?: string) => {
    console.log('📥 Loading all locations for organization:', orgId);

    if (!orgId) {
      console.warn('⚠️ No organizationId, skipping location load');
      return;
    }

    // Get all locations for this org
    const { data: locations, error: locationsError } = await dataClient
      .from('locations')
      .select('id, name')
      .eq('organization_id', orgId);

    if (locationsError) {
      console.error('❌ Error loading locations:', locationsError);
      return;
    }

    console.log('📍 Found locations:', locations?.length || 0, locations);

    // Get next Friday for default pay date
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
    console.log('📅 Next Friday (pay date):', nextFriday);

    // Get all submissions for this pay period
    const { data: submissions } = await dataClient
      .from('payroll_submissions')
      .select('*')
      .eq('organization_id', orgId)
      .eq('pay_date', nextFriday);

    console.log('📊 Submissions for this pay period:', submissions?.length || 0, submissions);

    const submissionsMap = new Map(submissions?.map(s => [s.location_id, s]));

    // Build location status array
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

    console.log('✅ Final location statuses:', locationStatuses);
    setAllLocations(locationStatuses);
  };

  const handleReviewSubmission = async (submission: PendingSubmission) => {
    setSelectedSubmission(submission);

    // Load submission details
    const { data: details, error } = await dataClient
      .from('payroll_entries')
      .select('*')
      .eq('submission_id', submission.id);

    if (error) {
      console.error('Error loading submission details:', error);
      return;
    }

    // Get employee names
    const employeeIds = details?.map(d => d.employee_id) || [];
    const { data: employees } = await dataClient
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
    // Get the location for this submission
    const { data: locationData } = await dataClient
      .from('locations')
      .select('id, name, organization_id')
      .eq('id', selectedSubmission.location_id)
      .single();

    if (!locationData) {
      throw new Error('Location not found');
    }

    // STEP 1: Update payroll_submissions status to 'approved'
    const { error: updateSubmissionError } = await dataClient
      .from('payroll_submissions')
      .update({
        status: 'approved',
        approved_by: userId,
        approved_at: new Date().toISOString()
      })
      .eq('id', selectedSubmission.id);

    if (updateSubmissionError) throw updateSubmissionError;

    // STEP 2: Update all payroll_entries for this submission to 'approved'
    const { error: updateEntriesError } = await dataClient
      .from('payroll_entries')
      .update({
        status: 'approved'
      })
      .eq('submission_id', selectedSubmission.id);

    if (updateEntriesError) throw updateEntriesError;

    // STEP 3: Create approval audit log
    const { error: approvalLogError } = await dataClient
      .from('payroll_approvals')
      .insert({
        organization_id: locationData.organization_id,
        submission_id: selectedSubmission.id,
        action: 'approved',
        approved_by: userId,
        previous_status: 'pending',
        notes: `Approved via mobile dashboard`
      });

    if (approvalLogError) {
      console.warn('Failed to create approval log:', approvalLogError);
      // Don't fail the whole process if audit log fails
    }

    // STEP 4: Post to payments table with ALL required fields
    const paymentsToInsert = submissionDetails.map(detail => ({
      // Link back to source data
      employee_id: detail.employee_id,
      submission_id: selectedSubmission.id,
      location_id: selectedSubmission.location_id,
      organization_id: locationData.organization_id,
      
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

    const { error: paymentsError } = await dataClient
      .from('payments')
      .insert(paymentsToInsert);

    if (paymentsError) throw paymentsError;

    // STEP 5: Update submission to 'posted' status
    const { error: postedError } = await dataClient
      .from('payroll_submissions')
      .update({
        status: 'posted',
        processed_by: userId,
        processed_at: new Date().toISOString()
      })
      .eq('id', selectedSubmission.id);

    if (postedError) throw postedError;

    // STEP 6: Update entries to 'posted'
    const { error: entriesPostedError } = await dataClient
      .from('payroll_entries')
      .update({
        status: 'posted'
      })
      .eq('submission_id', selectedSubmission.id);

    if (entriesPostedError) throw entriesPostedError;

    // Success!
    alert('✅ Payroll approved and posted successfully!');
    setShowApprovalModal(false);
    setSelectedSubmission(null);
    loadPendingSubmissions(locationData.organization_id);
    loadAllLocations(locationData.organization_id);
    
    // Reload historical data
    const load = async () => {
      const { start, end } = getDateRange();
      const { data } = await dataClient
        .from("payments")
        .select("department, total_amount, date, first_name, last_name")
        .gte("date", start)
        .lte("date", end);
        
      const deptMap: Record<string, PropertySummary> = {};
      const empMap: Record<string, Category> = {};
      
      (data || []).forEach((rec: any) => {
        const dept = rec.department || "Unknown";
        if (!deptMap[dept]) {
          deptMap[dept] = { name: dept, expenses: 0 };
        }
        deptMap[dept].expenses = (deptMap[dept].expenses || 0) + (Number(rec.total_amount) || 0);

        const emp = [rec.first_name, rec.last_name].filter(Boolean).join(" ") || "Unknown";
        if (!empMap[emp]) {
          empMap[emp] = { name: emp, total: 0 };
        }
        empMap[emp].total = (empMap[emp].total || 0) + (Number(rec.total_amount) || 0);
      });
      
      setProperties(Object.values(deptMap));
      setEmployeeTotals(Object.values(empMap).sort((a, b) => b.total - a.total));
    };
    load();

  } catch (error) {
    console.error('Error approving payroll:', error);
    alert('❌ Failed to approve payroll. Please try again.');
  } finally {
    setIsApproving(false);
  }
};

 const handleReject = async () => {
  if (!selectedSubmission || !userId) return;

  setIsApproving(true);

  try {
    // Get organization_id
    const { data: locationData } = await dataClient
      .from('locations')
      .select('organization_id')
      .eq('id', selectedSubmission.location_id)
      .single();

    // Update submission status
    const { error: submissionError } = await dataClient
      .from('payroll_submissions')
      .update({
        status: 'rejected',
        approved_by: userId,
        approved_at: new Date().toISOString()
      })
      .eq('id', selectedSubmission.id);

    if (submissionError) throw submissionError;

    // Update entries status
    const { error: entriesError } = await dataClient
      .from('payroll_entries')
      .update({
        status: 'rejected'
      })
      .eq('submission_id', selectedSubmission.id);

    if (entriesError) throw entriesError;

    // Log rejection
    const { error: approvalLogError } = await dataClient
      .from('payroll_approvals')
      .insert({
        organization_id: locationData?.organization_id,
        submission_id: selectedSubmission.id,
        action: 'rejected',
        approved_by: userId,
        previous_status: 'pending',
        notes: 'Rejected via mobile dashboard'
      });

    if (approvalLogError) {
      console.warn('Failed to create rejection log:', approvalLogError);
    }

    alert('❌ Payroll rejected. Location manager can resubmit.');
    setShowApprovalModal(false);
    setSelectedSubmission(null);
    const effectiveOrgId = locationData?.organization_id || (userRole === 'super_admin' ? subdomainOrgId : organizationId);
    loadPendingSubmissions(effectiveOrgId || undefined);
    loadAllLocations(effectiveOrgId || undefined);

  } catch (error) {
    console.error('Error rejecting payroll:', error);
    alert('Failed to reject payroll. Please try again.');
  } finally {
    setIsApproving(false);
  }
};

  // Load payroll data for view mode
  useEffect(() => {
    const load = async () => {
      const { start, end } = getDateRange();

      const { data } = await dataClient
        .from("payments")
        .select("department, total_amount, date, first_name, last_name")
        .gte("date", start)
        .lte("date", end);
        
      const deptMap: Record<string, PropertySummary> = {};
      const empMap: Record<string, Category> = {};
      
      (data || []).forEach((rec: any) => {
        const dept = rec.department || "Unknown";
        if (!deptMap[dept]) {
          deptMap[dept] = { name: dept, expenses: 0 };
        }
        deptMap[dept].expenses = (deptMap[dept].expenses || 0) + (Number(rec.total_amount) || 0);

        const emp = [rec.first_name, rec.last_name].filter(Boolean).join(" ") || "Unknown";
        if (!empMap[emp]) {
          empMap[emp] = { name: emp, total: 0 };
        }
        empMap[emp].total = (empMap[emp].total || 0) + (Number(rec.total_amount) || 0);
      });
      
      setProperties(Object.values(deptMap));
      setEmployeeTotals(Object.values(empMap).sort((a, b) => b.total - a.total));
    };
    load();
  }, [reportPeriod, month, year, customStart, customEnd, getDateRange]);

  const payrollKing = useMemo(() => {
    if (!properties.length) return null;
    return properties.reduce(
      (max, p) => (p.expenses || 0) > (max.expenses || 0) ? p : max,
      properties[0],
    ).name;
  }, [properties]);

  const payrollTopEmployee = useMemo(() => {
    if (!employeeTotals.length) return null;
    return employeeTotals.reduce(
      (max, e) => (e.total || 0) > (max.total || 0) ? e : max,
      employeeTotals[0],
    ).name;
  }, [employeeTotals]);

  const companyTotals = properties.reduce(
    (acc, p) => {
      acc.expenses += p.expenses || 0;
      acc.net += p.expenses || 0;
      return acc;
    },
    { expenses: 0, net: 0 }
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
    payrollDept: "Payroll",
    payrollEmployee: "Payroll",
  };

  const rankedProperties = useMemo(() => {
    if (!rankingMetric) return [];
    if (rankingMetric === "payrollDept") {
      return [...properties].sort((a, b) => (b.expenses || 0) - (a.expenses || 0));
    }
    return [...employeeTotals].sort((a, b) => b.total - a.total);
  }, [properties, employeeTotals, rankingMetric]);

  const formatRankingValue = (p: any) => {
    if (rankingMetric === "payrollDept") {
      return formatCompactCurrency(p.expenses || 0);
    }
    return formatCompactCurrency(p.total || 0);
  };

  const showRanking = (metric: RankingMetric) => {
    setRankingMetric(metric);
    setView("summary");
  };

  const handlePropertySelect = async (name: string | null) => {
    setSelectedProperty(name);
    await loadPayroll(name);
    setView("report");
  };

  const loadPayroll = async (department: string | null = selectedProperty) => {
    const { start, end } = getDateRange();

    let query = dataClient
      .from("payments")
      .select("date, total_amount, first_name, last_name, department")
      .gte("date", start)
      .lte("date", end);
      
    if (department) {
      query = query.eq("department", department);
    }

    const { data } = await query;
    const breakdown: Record<string, { total: number; payments: Transaction[] }> = {};

    ((data as any[]) || [])
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach((row) => {
        const amount = Number(row.total_amount) || 0;
        const name = [row.first_name, row.last_name].filter(Boolean).join(" ") || "Unknown";
        
        if (!breakdown[name]) {
          breakdown[name] = { total: 0, payments: [] };
        }
        
        breakdown[name].total += amount;
        breakdown[name].payments.push({
          date: row.date,
          amount,
          running: 0,
          payee: name,
          customer: row.department,
        });
      });
      
    setEmployeeBreakdown(breakdown);
    setTransactions([]);
    setPayrollTotals(Object.values(breakdown).reduce((sum, e) => sum + e.total, 0));
  };

  const showEmployeeTransactions = (employee: string) => {
    setSelectedCategory(employee);
    const breakdown = employeeBreakdown[employee];
    setTransactions(breakdown ? breakdown.payments : []);
    setView("detail");
  };

  const back = () => {
    if (view === "detail") setView("report");
    else if (view === "report") setView("overview");
    else if (view === "summary") {
      setRankingMetric(null);
      setView("overview");
    } else if (view === "approvals") {
      setView("overview");
    }
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
    <div style={{
      minHeight: '100vh',
      background: BRAND_COLORS.gray[50],
      padding: '16px',
      position: 'relative'
    }}>
      <style jsx>{`
        @keyframes slideDown { 
          0% { opacity: 0; transform: translateY(-10px); } 
          100% { opacity: 1; transform: translateY(0); } 
        }
      `}</style>

      {/* Enhanced Header */}
      <header style={{
        background: `linear-gradient(135deg, ${BRAND_COLORS.accent}, ${BRAND_COLORS.tertiary})`,
        borderRadius: '16px',
        padding: '20px',
        marginBottom: '24px',
        color: 'white',
        boxShadow: `0 8px 32px ${BRAND_COLORS.accent}33`
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
            onClick={() => setView("overview")}
            style={{ fontSize: '28px', fontWeight: 'bold', color: 'white', cursor: 'pointer' }}
          >
            I AM CFO
          </span>
        </div>

        <div style={{ textAlign: 'center', marginBottom: '16px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
            Payroll Dashboard
          </h1>
          <p style={{ fontSize: '14px', opacity: 0.9 }}>
            {getMonthName(month)} {year} • {properties.length} Departments
          </p>
        </div>

        {/* Approvals Button */}
        <button
          onClick={() => setView("approvals")}
          style={{
            width: '100%',
            padding: '12px',
            background: 'rgba(255, 255, 255, 0.2)',
            color: 'white',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            borderRadius: '10px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            marginBottom: '16px',
            transition: 'all 0.2s'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
          }}
        >
          <ClipboardCheck size={18} />
          Location Approvals
          {pendingSubmissions.length > 0 && (
            <span style={{
              background: BRAND_COLORS.danger,
              color: 'white',
              borderRadius: '12px',
              padding: '2px 8px',
              fontSize: '12px',
              fontWeight: '700'
            }}>
              {pendingSubmissions.length}
            </span>
          )}
        </button>

        <div
          style={{
            background: 'rgba(255, 255, 255, 0.15)',
            borderRadius: '12px',
            padding: '20px',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            transition: 'all 0.3s ease'
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: '14px', opacity: 0.9 }}>Total Payroll</span>
            <div style={{ fontSize: '32px', fontWeight: 'bold', margin: '8px 0' }}>
              {formatCompactCurrency(companyTotals.net)}
            </div>
          </div>
        </div>
      </header>

      {/* Hamburger Menu */}
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
              background: `linear-gradient(135deg, ${BRAND_COLORS.accent}, ${BRAND_COLORS.tertiary})`,
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
          {/* Pending Approvals Section */}
          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '20px',
            marginBottom: '24px',
            border: pendingSubmissions.length > 0 
              ? `2px solid ${BRAND_COLORS.warning}` 
              : `2px solid ${BRAND_COLORS.success}`,
            boxShadow: pendingSubmissions.length > 0 
              ? `0 4px 20px ${BRAND_COLORS.warning}33`
              : `0 4px 20px ${BRAND_COLORS.success}33`
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              {pendingSubmissions.length > 0 ? (
                <>
                  <Clock size={20} style={{ color: BRAND_COLORS.warning }} />
                  <h3 style={{ fontSize: '18px', fontWeight: '600', color: BRAND_COLORS.warning }}>
                    Pending Approvals ({pendingSubmissions.length})
                  </h3>
                </>
              ) : (
                <>
                  <CheckCircle size={20} style={{ color: BRAND_COLORS.success }} />
                  <h3 style={{ fontSize: '18px', fontWeight: '600', color: BRAND_COLORS.success }}>
                    Pending Approvals
                  </h3>
                </>
              )}
            </div>

            {pendingSubmissions.length > 0 ? (
              pendingSubmissions.map((submission) => (
                <div
                  key={submission.id}
                  onClick={() => handleReviewSubmission(submission)}
                  style={{
                    padding: '16px',
                    borderRadius: '12px',
                    marginBottom: '12px',
                    background: BRAND_COLORS.gray[50],
                    border: `2px solid ${BRAND_COLORS.warning}`,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: '700', color: BRAND_COLORS.accent, marginBottom: '4px' }}>
                        {submission.location_name}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>
                        Pay Date: {formatDate(submission.pay_date)} • Group {submission.payroll_group}
                      </div>
                    </div>
                    <div style={{
                      background: BRAND_COLORS.warning,
                      color: 'white',
                      padding: '6px 12px',
                      borderRadius: '20px',
                      fontSize: '11px',
                      fontWeight: '700'
                    }}>
                      PENDING
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{
                      background: `${BRAND_COLORS.success}15`,
                      padding: '10px',
                      borderRadius: '8px',
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '18px', fontWeight: 'bold', color: BRAND_COLORS.success }}>
                        {formatCurrency(submission.total_amount)}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>Total Amount</div>
                    </div>
                    <div style={{
                      background: `${BRAND_COLORS.primary}15`,
                      padding: '10px',
                      borderRadius: '8px',
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '18px', fontWeight: 'bold', color: BRAND_COLORS.primary }}>
                        {submission.employee_count || 0 /* Fallback to 0 when undefined */}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>Employees</div>
                    </div>
                  </div>

                  <div style={{ marginTop: '12px', fontSize: '11px', color: '#94a3b8', textAlign: 'center' }}>
                    Submitted {new Date(submission.submitted_at).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit'
                    })}
                  </div>
                </div>
              ))
            ) : (
              <div style={{
                background: `${BRAND_COLORS.success}10`,
                borderRadius: '12px',
                padding: '32px 20px',
                textAlign: 'center',
                border: `2px dashed ${BRAND_COLORS.success}`
              }}>
                <CheckCircle size={48} style={{ color: BRAND_COLORS.success, marginBottom: '12px' }} />
                <h4 style={{ fontSize: '18px', fontWeight: '700', color: BRAND_COLORS.success, marginBottom: '8px' }}>
                  All Caught Up!
                </h4>
                <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '0' }}>
                  No pending payroll submissions at this time.
                </p>
                <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '8px' }}>
                  New submissions will appear here for approval.
                </p>
              </div>
            )}
          </div>

          {/* Department Insights */}
          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '20px',
            marginBottom: '24px',
            border: `1px solid ${BRAND_COLORS.gray[200]}`,
            boxShadow: '0 4px 20px rgba(46, 134, 193, 0.1)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
              <Target size={20} style={{ color: BRAND_COLORS.accent }} />
              <h3 style={{ fontSize: '18px', fontWeight: '600', color: BRAND_COLORS.accent }}>
                Historical Analytics
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
                <Award size={16} style={{ color: BRAND_COLORS.accent }} />
                <span style={{ fontSize: '14px', fontWeight: '600', color: BRAND_COLORS.accent }}>
                  Team Champions
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                <div onClick={() => showRanking("payrollDept")} style={{
                  background: 'white',
                  borderRadius: '8px',
                  padding: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  border: `1px solid ${BRAND_COLORS.danger}33`,
                  cursor: 'pointer'
                }}>
                  <span style={{ fontSize: '20px' }}>🏢</span>
                  <div>
                    <div style={{ fontSize: '11px', color: BRAND_COLORS.danger, fontWeight: '600' }}>
                      TOP DEPT
                    </div>
                    <div style={{ fontSize: '10px', color: '#64748b' }}>
                      {payrollKing}
                    </div>
                  </div>
                </div>
                <div onClick={() => showRanking("payrollEmployee")} style={{
                  background: 'white',
                  borderRadius: '8px',
                  padding: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  border: `1px solid ${BRAND_COLORS.secondary}33`,
                  cursor: 'pointer'
                }}>
                  <span style={{ fontSize: '20px' }}>👤</span>
                  <div>
                    <div style={{ fontSize: '11px', color: BRAND_COLORS.secondary, fontWeight: '600' }}>
                      TOP EMP
                    </div>
                    <div style={{ fontSize: '10px', color: '#64748b' }}>
                      {payrollTopEmployee}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Department Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
            {properties.map((p) => {
              const isPayrollKing = p.name === payrollKing;
              
              return (
                <div
                  key={p.name}
                  onClick={() => handlePropertySelect(p.name)}
                  style={{
                    background: 'white',
                    borderRadius: '12px',
                    padding: '16px',
                    cursor: 'pointer',
                    border: isPayrollKing 
                      ? `2px solid ${BRAND_COLORS.danger}`
                      : `1px solid ${BRAND_COLORS.gray[200]}`,
                    boxShadow: isPayrollKing 
                      ? `0 4px 20px ${BRAND_COLORS.danger}33`
                      : '0 2px 8px rgba(0, 0, 0, 0.05)',
                    transition: 'all 0.3s ease',
                    position: 'relative'
                  }}
                >
                  {isPayrollKing && (
                    <div style={{
                      position: 'absolute',
                      top: '-8px',
                      right: '-8px',
                      background: BRAND_COLORS.danger,
                      borderRadius: '50%',
                      width: '24px',
                      height: '24px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px'
                    }}>
                      👑
                    </div>
                  )}
                  <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px', fontWeight: '500' }}>
                    {p.name}
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: BRAND_COLORS.accent }}>
                    {formatCompactCurrency(p.expenses || 0)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* APPROVALS VIEW - Location Status Grid */}
      {view === "approvals" && (
        <div>
          <button
            onClick={back}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'white',
              border: `1px solid ${BRAND_COLORS.gray[200]}`,
              borderRadius: '8px',
              padding: '12px 16px',
              marginBottom: '16px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              color: BRAND_COLORS.accent
            }}
          >
            <ChevronLeft size={20} />
            Back to Dashboard
          </button>

          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '20px',
            marginBottom: '16px',
            border: `1px solid ${BRAND_COLORS.gray[200]}`,
            boxShadow: '0 4px 20px rgba(46, 134, 193, 0.1)'
          }}>
            <h2 style={{ 
              fontSize: '20px', 
              fontWeight: 'bold', 
              marginBottom: '8px',
              color: BRAND_COLORS.accent 
            }}>
              Location Approvals
            </h2>
            <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '20px' }}>
              {allLocations.filter(l => l.status === 'approved').length} Approved • {' '}
              {allLocations.filter(l => l.status === 'pending').length} Pending • {' '}
              {allLocations.filter(l => l.status === 'not_submitted').length} Not Submitted
            </p>

            <div style={{ display: 'grid', gap: '12px' }}>
              {allLocations.map((location) => {
                const StatusIcon = getLocationStatusIcon(location.status);
                const statusColor = getLocationStatusColor(location.status);

                return (
                  <div
                    key={location.location_id}
                    onClick={() => {
                      if (location.status === 'pending' && location.submission_id) {
                        const submission = pendingSubmissions.find(s => s.id === location.submission_id);
                        if (submission) handleReviewSubmission(submission);
                      }
                    }}
                    style={{
                      padding: '16px',
                      borderRadius: '12px',
                      background: BRAND_COLORS.gray[50],
                      border: `3px solid ${statusColor}`,
                      cursor: location.status === 'pending' ? 'pointer' : 'default',
                      transition: 'all 0.2s',
                      position: 'relative'
                    }}
                  >
                    <div style={{
                      position: 'absolute',
                      top: '12px',
                      right: '12px',
                      background: statusColor,
                      borderRadius: '20px',
                      padding: '6px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      <StatusIcon size={14} style={{ color: 'white' }} />
                      <span style={{ 
                        fontSize: '11px', 
                        fontWeight: '700', 
                        color: 'white',
                        textTransform: 'uppercase'
                      }}>
                        {getLocationStatusText(location.status)}
                      </span>
                    </div>

                    <h3 style={{ 
                      fontSize: '18px', 
                      fontWeight: 'bold', 
                      marginBottom: '12px',
                      color: BRAND_COLORS.accent,
                      paddingRight: '140px'
                    }}>
                      {location.location_name}
                    </h3>

                   {location.status !== 'not_submitted' && location.total_amount !== undefined && (
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '12px',
                        marginTop: '12px'
                      }}>
                        <div style={{
                          background: 'white',
                          borderRadius: '8px',
                          padding: '10px',
                          textAlign: 'center'
                        }}>
                          <div style={{ fontSize: '16px', fontWeight: 'bold', color: BRAND_COLORS.success }}>
                            {formatCurrency(location.total_amount || 0)}
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>Total</div>
                        </div>
                        <div style={{
                          background: 'white',
                          borderRadius: '8px',
                          padding: '10px',
                          textAlign: 'center'
                        }}>
                          <div style={{ fontSize: '16px', fontWeight: 'bold', color: BRAND_COLORS.primary }}>
                            {location.employee_count !== undefined ? location.employee_count : 0}
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>Employees</div>
                        </div>
                      </div>
                    )}

                    {location.submitted_at && (
                      <div style={{
                        marginTop: '12px',
                        fontSize: '11px',
                        color: '#94a3b8',
                        textAlign: 'center'
                      }}>
                        Submitted {new Date(location.submitted_at).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit'
                        })}
                      </div>
                    )}

                    {location.status === 'not_submitted' && (
                      <div style={{
                        marginTop: '12px',
                        fontSize: '13px',
                        color: '#64748b',
                        textAlign: 'center',
                        fontStyle: 'italic'
                      }}>
                        Waiting for submission from location manager
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Summary/Ranking View */}
      {view === "summary" && rankingMetric && (
        <div>
          <button
            onClick={back}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'white',
              border: `1px solid ${BRAND_COLORS.gray[200]}`,
              borderRadius: '8px',
              padding: '12px 16px',
              marginBottom: '16px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              color: BRAND_COLORS.accent
            }}
          >
            <ChevronLeft size={20} />
            Back to Overview
          </button>

          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '20px',
            border: `1px solid ${BRAND_COLORS.gray[200]}`,
            boxShadow: '0 4px 20px rgba(46, 134, 193, 0.1)'
          }}>
            <h3 style={{ 
              fontSize: '20px', 
              fontWeight: 'bold', 
              marginBottom: '20px',
              color: BRAND_COLORS.accent 
            }}>
              {rankingMetric === 'payrollDept' ? 'Departments Ranked' : 'Employees Ranked'}
            </h3>

            {rankedProperties.map((p, i) => (
              <div
                key={i}
                onClick={() => rankingMetric === 'payrollDept' ? handlePropertySelect(p.name) : null}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '16px',
                  borderBottom: i < rankedProperties.length - 1 ? `1px solid ${BRAND_COLORS.gray[100]}` : 'none',
                  cursor: rankingMetric === 'payrollDept' ? 'pointer' : 'default',
                  transition: 'background 0.2s'
                }}
              >
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: i === 0 ? BRAND_COLORS.danger : i === 1 ? BRAND_COLORS.warning : BRAND_COLORS.gray[200],
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  color: i < 2 ? 'white' : '#64748b',
                  marginRight: '12px',
                  fontSize: '14px'
                }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '600', color: '#1e293b', fontSize: '14px' }}>
                    {p.name}
                  </div>
                </div>
                <div style={{ 
                  fontWeight: 'bold', 
                  color: BRAND_COLORS.accent,
                  fontSize: '16px'
                }}>
                  {formatRankingValue(p)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Department Report */}
      {view === "report" && (
        <div>
          <button
            onClick={back}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'white',
              border: `1px solid ${BRAND_COLORS.gray[200]}`,
              borderRadius: '8px',
              padding: '12px 16px',
              marginBottom: '16px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              color: BRAND_COLORS.accent
            }}
          >
            <ChevronLeft size={20} />
            Back to Overview
          </button>

          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '20px',
            marginBottom: '16px',
            border: `1px solid ${BRAND_COLORS.gray[200]}`,
            boxShadow: '0 4px 20px rgba(46, 134, 193, 0.1)'
          }}>
            <h2 style={{ 
              fontSize: '20px', 
              fontWeight: 'bold', 
              marginBottom: '16px',
              color: BRAND_COLORS.accent 
            }}>
              {selectedProperty}
            </h2>
            <div style={{
              background: BRAND_COLORS.gray[50],
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '16px'
            }}>
              <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '4px' }}>
                Total Payroll
              </div>
              <div style={{ fontSize: '28px', fontWeight: 'bold', color: BRAND_COLORS.accent }}>
                {formatCurrency(payrollTotals)}
              </div>
            </div>

            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: '#1e293b' }}>
              Employees ({Object.keys(employeeBreakdown).length})
            </h3>

            {Object.entries(employeeBreakdown)
              .sort(([, a], [, b]) => b.total - a.total)
              .map(([name, data]) => (
                <div
                  key={name}
                  onClick={() => showEmployeeTransactions(name)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px',
                    borderRadius: '8px',
                    marginBottom: '8px',
                    background: BRAND_COLORS.gray[50],
                    cursor: 'pointer',
                    border: `1px solid ${BRAND_COLORS.gray[100]}`,
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <User size={18} style={{ color: BRAND_COLORS.accent }} />
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '14px', color: '#1e293b' }}>
                        {name}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>
                        {data.payments.length} payment{data.payments.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ 
                      fontWeight: 'bold', 
                      color: BRAND_COLORS.accent,
                      fontSize: '16px'
                    }}>
                      {formatCompactCurrency(data.total)}
                    </div>
                    <ChevronRight size={18} style={{ color: '#94a3b8' }} />
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Transaction Detail */}
      {view === "detail" && (
        <div>
          <button
            onClick={back}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'white',
              border: `1px solid ${BRAND_COLORS.gray[200]}`,
              borderRadius: '8px',
              padding: '12px 16px',
              marginBottom: '16px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              color: BRAND_COLORS.accent
            }}
          >
            <ChevronLeft size={20} />
            Back
          </button>

          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '20px',
            border: `1px solid ${BRAND_COLORS.gray[200]}`,
            boxShadow: '0 4px 20px rgba(46, 134, 193, 0.1)'
          }}>
            <h3 style={{ 
              fontSize: '18px', 
              fontWeight: 'bold', 
              marginBottom: '12px',
              color: BRAND_COLORS.accent 
            }}>
              {selectedCategory}
            </h3>
            <div style={{
              background: BRAND_COLORS.gray[50],
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '16px'
            }}>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                Total Amount
              </div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: BRAND_COLORS.accent }}>
                {formatCurrency(transactionTotal)}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
              </div>
            </div>

            <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#1e293b' }}>
              Payment History
            </h4>

            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {transactions.map((t, i) => (
                <div
                  key={i}
                  style={{
                    padding: '12px',
                    borderBottom: i < transactions.length - 1 ? `1px solid ${BRAND_COLORS.gray[100]}` : 'none',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '500', color: '#1e293b', marginBottom: '4px' }}>
                      {formatDate(t.date)}
                    </div>
                    {t.customer && (
                      <div style={{ fontSize: '12px', color: '#64748b' }}>
                        {t.customer}
                      </div>
                    )}
                  </div>
                  <div style={{ 
                    fontSize: '16px', 
                    fontWeight: 'bold',
                    color: BRAND_COLORS.accent
                  }}>
                    {formatCurrency(t.amount)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Approval Modal */}
      {showApprovalModal && selectedSubmission && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
          padding: '16px'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '24px',
            maxWidth: '500px',
            width: '100%',
            maxHeight: '80vh',
            overflow: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '20px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: BRAND_COLORS.accent, marginBottom: '4px' }}>
                  Review Payroll
                </h2>
                <p style={{ fontSize: '14px', color: '#64748b' }}>
                  {selectedSubmission.location_name}
                </p>
              </div>
              <button
                onClick={() => setShowApprovalModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#64748b'
                }}
              >
                <X size={24} />
              </button>
            </div>

            <div style={{
              background: BRAND_COLORS.gray[50],
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '20px'
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Pay Date</div>
                  <div style={{ fontSize: '14px', fontWeight: '600' }}>{formatDate(selectedSubmission.pay_date)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Group</div>
                  <div style={{ fontSize: '14px', fontWeight: '600' }}>Group {selectedSubmission.payroll_group}</div>
                </div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Pay Period</div>
                <div style={{ fontSize: '14px', fontWeight: '600' }}>
                  {formatDate(selectedSubmission.period_start)} - {formatDate(selectedSubmission.period_end)}
                </div>
              </div>
            </div>

            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>
              Employee Details ({submissionDetails.length})
            </h3>

            <div style={{ marginBottom: '20px', maxHeight: '300px', overflow: 'auto' }}>
              {submissionDetails.map((detail, i) => (
                <div
                  key={i}
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    marginBottom: '8px',
                    background: BRAND_COLORS.gray[50],
                    border: `1px solid ${BRAND_COLORS.gray[200]}`
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b' }}>
                      {detail.employee_name}
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: 'bold', color: BRAND_COLORS.accent }}>
                      {formatCurrency(detail.amount)}
                    </div>
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>
                    {detail.hours ? `${detail.hours} hours` : `${detail.units} units`}
                  </div>
                  {detail.notes && (
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', fontStyle: 'italic' }}>
                      {detail.notes}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div style={{
              background: `${BRAND_COLORS.success}15`,
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '20px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                Total Payroll Amount
              </div>
              <div style={{ fontSize: '28px', fontWeight: 'bold', color: BRAND_COLORS.success }}>
                {formatCurrency(selectedSubmission.total_amount)}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={handleReject}
                disabled={isApproving}
                style={{
                  flex: 1,
                  padding: '14px',
                  background: BRAND_COLORS.danger,
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: isApproving ? 'not-allowed' : 'pointer',
                  opacity: isApproving ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <XCircle size={18} />
                Reject
              </button>
              <button
                onClick={handleApprove}
                disabled={isApproving}
                style={{
                  flex: 1,
                  padding: '14px',
                  background: `linear-gradient(135deg, ${BRAND_COLORS.success}, #229954)`,
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: isApproving ? 'not-allowed' : 'pointer',
                  opacity: isApproving ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                {isApproving ? (
                  'Approving...'
                ) : (
                  <>
                    <CheckCircle size={18} />
                    Approve & Post
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
