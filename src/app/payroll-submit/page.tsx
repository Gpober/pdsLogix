"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuthClient } from "@/lib/supabase/auth-client";
import { getDataClient, syncDataClientSession } from "@/lib/supabase/client";
import {
  LogOut,
  DollarSign,
  Clock,
  Users,
  CheckCircle2,
  AlertCircle,
  X,
  Save,
  Send,
  Plus,
  Trash2,
  MapPin,
  ChevronDown,
} from "lucide-react";

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

type PayrollGroup = "A" | "B";
type CompensationType = "hourly" | "production" | "fixed";

type Location = {
  id: string;
  name: string;
};

type Employee = {
  id: string;
  first_name: string;
  last_name: string;
  payroll_group: PayrollGroup;
  compensation_type: CompensationType;
  hourly_rate: number | null;
  piece_rate: number | null;
  fixed_pay: number | null;
};

type EmployeeRow = Employee & {
  hours: string;
  units: string;
  count: string;
  adjustment: string;
  notes: string;
  amount: number;
};

type Alert = {
  type: "success" | "error";
  message: string;
};

const IAMCFOLogo = ({ className = "w-8 h-8" }: { className?: string }) => (
  <div className={`${className} flex items-center justify-center`}>
    <img 
      src="/apple-touch-icon.png" 
      alt="I AM CFO Logo" 
      className="w-full h-full object-contain"
    />
  </div>
);

export default function DesktopPayrollSubmit() {
  const router = useRouter();
  const authClient = useMemo(() => getAuthClient(), []);
  const dataSupabase = useMemo(() => getDataClient(), []);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auth state
  const [userId, setUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");

  // Multi-location support
  const [availableLocations, setAvailableLocations] = useState<Location[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);

  // Form state
  const [payDate, setPayDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [payrollGroup, setPayrollGroup] = useState<PayrollGroup>("A");
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [alert, setAlert] = useState<Alert | null>(null);
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [newEmployee, setNewEmployee] = useState({
    first_name: '',
    last_name: '',
    email: '',
    payroll_group: 'A' as PayrollGroup,
    compensation_type: 'hourly' as CompensationType,
    hourly_rate: '',
    piece_rate: '',
    fixed_pay: '',
  });

  // Get selected location name
  const selectedLocationName = useMemo(() => {
    const location = availableLocations.find(loc => loc.id === selectedLocationId);
    return location?.name || 'Select Location';
  }, [availableLocations, selectedLocationId]);

  useEffect(() => {
    initializeUser();
  }, []);

  const initializeUser = async () => {
    try {
      console.log('🔍 Desktop Payroll: Starting auth check...');

      const { data: { session }, error: authError } = await authClient.auth.getSession();

      if (authError || !session?.user) {
        console.log('❌ Desktop Payroll: No user found');
        router.push("/login");
        return;
      }

      await syncDataClientSession(session);

      const user = session.user;

      setUserId(user.id);
      console.log('✅ Desktop Payroll: User authenticated:', user.email);

      // Get user info from Auth Supabase
      const { data: userRecord, error: userError } = await authClient
        .from('users')
        .select('role, name')
        .eq('id', user.id)
        .single();

      if (userError || !userRecord) {
        console.error('❌ Desktop Payroll: User record error:', userError);
        showAlert('Failed to load user data. Please refresh.', 'error');
        setIsInitializing(false);
        return;
      }

      const role = userRecord.role as string;
      console.log('✅ Desktop Payroll: User role:', role);

      setUserRole(role);
      setUserName(userRecord.name || user.email || 'User');

      // Check role permissions
      if (role !== 'employee' && role !== 'super_admin' && role !== 'admin' && role !== 'owner') {
        console.log('❌ Desktop Payroll: Access denied for role:', role);
        router.push('/dashboard');
        return;
      }

      console.log('✅ Desktop Payroll: Access granted');

      // Load locations from location_managers table in Client Supabase
      const { data: locationManagerData, error: locMgrError } = await dataSupabase
        .from('location_managers')
        .select('location_id')
        .eq('user_id', user.id);

      if (locMgrError) {
        console.error('❌ Desktop Payroll: Error fetching location_managers:', locMgrError);
        showAlert('Failed to load your locations. Please contact support.', 'error');
        setIsInitializing(false);
        return;
      }

      if (!locationManagerData || locationManagerData.length === 0) {
        console.error('❌ Desktop Payroll: No locations found for user');
        showAlert('You are not assigned to any locations. Please contact support.', 'error');
        setIsInitializing(false);
        return;
      }

      const locationIds = locationManagerData.map(lm => lm.location_id);
      console.log('✅ Desktop Payroll: User has access to locations:', locationIds);

      // Fetch location details
      const { data: locationsData, error: locError } = await dataSupabase
        .from('locations')
        .select('id, name')
        .in('id', locationIds)
        .order('name');

      if (locError) {
        console.error('❌ Desktop Payroll: Error fetching locations:', locError);
        showAlert('Failed to load location details.', 'error');
        setIsInitializing(false);
        return;
      }

      setAvailableLocations(locationsData || []);
      
      // Auto-select first location
      if (locationsData && locationsData.length > 0) {
        setSelectedLocationId(locationsData[0].id);
        console.log('✅ Desktop Payroll: Auto-selected location:', locationsData[0].name);
      }

      setIsInitializing(false);
    } catch (error) {
      console.error('❌ Desktop Payroll: Critical error:', error);
      showAlert('Something went wrong. Please try again.', 'error');
      setIsInitializing(false);
    }
  };

  useEffect(() => {
    if (selectedLocationId && payrollGroup) {
      loadEmployees();
    }
  }, [selectedLocationId, payrollGroup]);

  const loadEmployees = async () => {
    if (!selectedLocationId) return;

    setIsLoading(true);
    try {
      const { data, error } = await dataSupabase
        .from("employees")
        .select("*")
        .eq("location_id", selectedLocationId)
        .eq("payroll_group", payrollGroup)
        .eq("is_active", true)
        .order("last_name");

      if (error) throw error;

      const rows: EmployeeRow[] = (data || []).map((emp) => ({
        ...emp,
        hours: "",
        units: "",
        count: "1",
        adjustment: "0",
        notes: "",
        amount: 0,
      }));

      setEmployees(rows);
      console.log('✅ Desktop Payroll: Loaded', rows.length, 'employees');
    } catch (error) {
      console.error("Error loading employees:", error);
      showAlert("Failed to load employees", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const updateEmployeeRow = (
    index: number,
    field: keyof EmployeeRow,
    value: string
  ) => {
    setEmployees((prev) => {
      const updated = [...prev];
      const emp = { ...updated[index] };

      if (field === "hours" || field === "units" || field === "count" || field === "adjustment" || field === "notes") {
        emp[field] = value;
      }

      // Recalculate amount
      if (emp.compensation_type === "hourly") {
        const hours = parseFloat(emp.hours) || 0;
        const rate = emp.hourly_rate || 0;
        emp.amount = hours * rate;
      } else if (emp.compensation_type === "production") {
        const units = parseFloat(emp.units) || 0;
        const rate = emp.piece_rate || 0;
        emp.amount = units * rate;
      } else if (emp.compensation_type === "fixed") {
        const count = parseFloat(emp.count) || 0;
        const adjustment = parseFloat(emp.adjustment) || 0;
        const baseAmount = count * (emp.fixed_pay || 0);
        emp.amount = baseAmount + adjustment;
      }

      updated[index] = emp;
      return updated;
    });
  };

  const totalAmount = useMemo(() => {
    return employees.reduce((sum, emp) => sum + emp.amount, 0);
  }, [employees]);


  const handleAddEmployee = async () => {
    if (!selectedLocationId) {
      showAlert("Please select a location first", "error");
      return;
    }

    if (!newEmployee.first_name || !newEmployee.last_name) {
      showAlert("Please fill in all required fields", "error");
      return;
    }

    if (newEmployee.compensation_type === 'hourly' && !newEmployee.hourly_rate) {
      showAlert("Please enter hourly rate", "error");
      return;
    }

    if (newEmployee.compensation_type === 'production' && !newEmployee.piece_rate) {
      showAlert("Please enter piece rate", "error");
      return;
    }

    if (newEmployee.compensation_type === 'fixed' && !newEmployee.fixed_pay) {
      showAlert("Please enter fixed pay amount", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      // Get organization_id from user's profile
      const { data: userData } = await authClient
        .from('users')
        .select('organization_id')
        .eq('id', userId)
        .single();

      const { data, error } = await dataSupabase
        .from('employees')
        .insert([
          {
            organization_id: userData?.organization_id || 'ba5ac7ab-ff03-42c8-9e63-3a5a444449ca',
            location_id: selectedLocationId,
            first_name: newEmployee.first_name,
            last_name: newEmployee.last_name,
            email: newEmployee.email || null,
            payroll_group: newEmployee.payroll_group,
            compensation_type: newEmployee.compensation_type,
            hourly_rate: newEmployee.compensation_type === 'hourly' ? parseFloat(newEmployee.hourly_rate) : null,
            piece_rate: newEmployee.compensation_type === 'production' ? parseFloat(newEmployee.piece_rate) : null,
            fixed_pay: newEmployee.compensation_type === 'fixed' ? parseFloat(newEmployee.fixed_pay) : null,
            is_active: true,
            hire_date: new Date().toISOString().split('T')[0],
          },
        ])
        .select();

      if (error) throw error;

      showAlert(`✓ Employee ${newEmployee.first_name} ${newEmployee.last_name} added successfully!`, "success");
      
      // Reset form
      setNewEmployee({
        first_name: '',
        last_name: '',
        email: '',
        payroll_group: 'A',
        compensation_type: 'hourly',
        hourly_rate: '',
        piece_rate: '',
        fixed_pay: '',
      });
      
      // Close modal and reload employees
      setShowAddEmployee(false);
      await loadEmployees();
    } catch (error: any) {
      console.error('Add employee error:', error);
      showAlert(error.message || 'Failed to add employee', "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedLocationId || !userId) {
      showAlert("Missing location or user information", "error");
      return;
    }

    const employeesWithData = employees.filter(
      (emp) =>
        (emp.compensation_type === "hourly" && parseFloat(emp.hours) > 0) ||
        (emp.compensation_type === "production" && parseFloat(emp.units) > 0) ||
        (emp.compensation_type === "fixed" && parseFloat(emp.count) > 0)
    );

    if (employeesWithData.length === 0) {
      showAlert("Please enter hours or units for at least one employee", "error");
      return;
    }

    setIsSubmitting(true);

    try {
      // Calculate period dates
      const payDateObj = new Date(payDate);
      const dayOfWeek = payDateObj.getDay();
      const daysToFriday = dayOfWeek === 5 ? 0 : dayOfWeek < 5 ? 5 - dayOfWeek : 7 - dayOfWeek + 5;
      const periodEnd = new Date(payDateObj);
      periodEnd.setDate(payDateObj.getDate() + daysToFriday - 1);
      const periodStart = new Date(periodEnd);
      periodStart.setDate(periodEnd.getDate() - 6);

      // Create submission
      const { data: submission, error: submissionError } = await dataSupabase
        .from("payroll_submissions")
        .insert([
          {
            location_id: selectedLocationId,
            pay_date: payDate,
            payroll_group: payrollGroup,
            period_start: periodStart.toISOString().split("T")[0],
            period_end: periodEnd.toISOString().split("T")[0],
            total_amount: totalAmount,
            employee_count: employeesWithData.length,
            submitted_by: userId,
            status: "pending",
          },
        ])
        .select()
        .single();

      if (submissionError) throw submissionError;

      // ✅ FIXED: Use "payroll_entries" instead of "payroll_submission_details"
      const details = employeesWithData.map((emp) => ({
        submission_id: submission.id,
        employee_id: emp.id,
        hours: emp.compensation_type === "hourly" ? parseFloat(emp.hours) : null,
        units: emp.compensation_type === "production" ? parseFloat(emp.units) : null,
        count: emp.compensation_type === "fixed" ? parseFloat(emp.count) : null,
        adjustment: emp.compensation_type === "fixed" ? parseFloat(emp.adjustment) : null,
        amount: emp.amount,
        notes: emp.notes || null,
        status: 'pending'
      }));

      const { error: detailsError } = await dataSupabase
        .from("payroll_entries")  // ✅ CORRECT TABLE NAME
        .insert(details);

      if (detailsError) throw detailsError;

      showAlert("✅ Payroll submitted successfully!", "success");
      
      // Reset form
      setTimeout(() => {
        loadEmployees();
        setPayDate(new Date().toISOString().split("T")[0]);
      }, 2000);
    } catch (error: any) {
      console.error("Submission error:", error);
      showAlert(error.message || "Failed to submit payroll", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const showAlert = (message: string, type: "success" | "error") => {
    setAlert({ message, type });
    setTimeout(() => setAlert(null), 5000);
  };

  const handleLogout = async () => {
    await authClient.auth.signOut();
    await syncDataClientSession(null);
    router.push("/login");
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div
            className="animate-spin rounded-full h-16 w-16 border-4 mx-auto mb-4"
            style={{
              borderColor: BRAND_COLORS.primary + "30",
              borderTopColor: BRAND_COLORS.primary,
            }}
          ></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div
        className="bg-white shadow-sm border-b"
        style={{ borderColor: BRAND_COLORS.gray[200] }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <IAMCFOLogo className="w-10 h-10" />
              <div>
                <h1
                  className="text-2xl font-bold"
                  style={{ color: BRAND_COLORS.accent }}
                >
                  Payroll Submit
                </h1>
                
                {/* Location Selector */}
                {availableLocations.length > 1 ? (
                  <div className="relative">
                    <button
                      onClick={() => setShowLocationDropdown(!showLocationDropdown)}
                      className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition"
                    >
                      <MapPin size={14} />
                      <span>{selectedLocationName}</span>
                      <ChevronDown size={14} />
                    </button>
                    
                    {showLocationDropdown && (
                      <div className="absolute top-full left-0 mt-2 bg-white border rounded-lg shadow-lg z-50 min-w-[200px]">
                        {availableLocations.map((location) => (
                          <button
                            key={location.id}
                            onClick={() => {
                              setSelectedLocationId(location.id);
                              setShowLocationDropdown(false);
                              setEmployees([]);
                            }}
                            className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 ${
                              location.id === selectedLocationId ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-700'
                            }`}
                          >
                            {location.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-600 flex items-center gap-2">
                    <MapPin size={14} />
                    {selectedLocationName}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">{userName}</p>
                <p className="text-xs text-gray-500 capitalize">{userRole}</p>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border rounded-lg hover:bg-gray-50"
                style={{ borderColor: BRAND_COLORS.gray[300] }}
              >
                <LogOut size={16} />
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Alert */}
      {alert && (
        <div
          className="fixed top-4 right-4 z-50 px-6 py-4 rounded-lg shadow-lg text-white font-medium animate-slide-in"
          style={{
            backgroundColor:
              alert.type === "success" ? BRAND_COLORS.success : BRAND_COLORS.danger,
          }}
        >
          <div className="flex items-center gap-3">
            {alert.type === "success" ? (
              <CheckCircle2 size={20} />
            ) : (
              <AlertCircle size={20} />
            )}
            <span>{alert.message}</span>
            <button onClick={() => setAlert(null)}>
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!selectedLocationId ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <MapPin className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Location Selected</h3>
            <p className="text-gray-600">Please select a location to continue.</p>
          </div>
        ) : (
          <>
            {/* Controls */}
            <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Pay Date
                  </label>
                  <input
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="w-full px-4 py-2 border-2 rounded-lg"
                    style={{ borderColor: BRAND_COLORS.gray[300] }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Payroll Group
                  </label>
                  <select
                    value={payrollGroup}
                    onChange={(e) => setPayrollGroup(e.target.value as PayrollGroup)}
                    className="w-full px-4 py-2 border-2 rounded-lg"
                    style={{ borderColor: BRAND_COLORS.gray[300] }}
                  >
                    <option value="A">Group A</option>
                    <option value="B">Group B</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Total Amount
                  </label>
                  <div
                    className="px-4 py-2 rounded-lg text-2xl font-bold"
                    style={{
                      backgroundColor: BRAND_COLORS.primary + "10",
                      color: BRAND_COLORS.primary,
                    }}
                  >
                    {formatCurrency(totalAmount)}
                  </div>
                </div>
              </div>
            </div>

            {/* Employee Table */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead style={{ backgroundColor: BRAND_COLORS.gray[50] }}>
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Employee
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Rate
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Hours/Units/Qty
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Adjustment
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Notes
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ divideColor: BRAND_COLORS.gray[200] }}>
                    {isLoading ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                          Loading employees...
                        </td>
                      </tr>
                    ) : employees.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                          No employees found for Group {payrollGroup}
                        </td>
                      </tr>
                    ) : (
                      employees.map((emp, idx) => (
                        <tr key={emp.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              {emp.first_name} {emp.last_name}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className="px-2 py-1 text-xs font-medium rounded-full capitalize"
                              style={{
                                backgroundColor:
                                  emp.compensation_type === "hourly"
                                    ? BRAND_COLORS.primary + "20"
                                    : emp.compensation_type === "production"
                                    ? BRAND_COLORS.warning + "20"
                                    : BRAND_COLORS.success + "20",
                                color:
                                  emp.compensation_type === "hourly"
                                    ? BRAND_COLORS.primary
                                    : emp.compensation_type === "production"
                                    ? BRAND_COLORS.warning
                                    : BRAND_COLORS.success,
                              }}
                            >
                              {emp.compensation_type}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {emp.compensation_type === "fixed" 
                              ? formatCurrency(emp.fixed_pay || 0)
                              : formatCurrency(
                                  emp.compensation_type === "hourly"
                                    ? emp.hourly_rate || 0
                                    : emp.piece_rate || 0
                                )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {emp.compensation_type === "fixed" ? (
                              <input
                                type="number"
                                step="1"
                                min="1"
                                value={emp.count}
                                onChange={(e) =>
                                  updateEmployeeRow(idx, "count", e.target.value)
                                }
                                placeholder="1"
                                className="w-20 px-3 py-2 border rounded-lg text-sm"
                                style={{ borderColor: BRAND_COLORS.gray[300] }}
                              />
                            ) : (
                              <input
                                type="number"
                                step="0.5"
                                min="0"
                                value={
                                  emp.compensation_type === "hourly" ? emp.hours : emp.units
                                }
                                onChange={(e) =>
                                  updateEmployeeRow(
                                    idx,
                                    emp.compensation_type === "hourly" ? "hours" : "units",
                                    e.target.value
                                  )
                                }
                                placeholder={emp.compensation_type === "hourly" ? "0.0" : "0"}
                                className="w-24 px-3 py-2 border rounded-lg text-sm"
                                style={{ borderColor: BRAND_COLORS.gray[300] }}
                              />
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {emp.compensation_type === "fixed" ? (
                              <input
                                type="number"
                                step="0.01"
                                value={emp.adjustment}
                                onChange={(e) =>
                                  updateEmployeeRow(idx, "adjustment", e.target.value)
                                }
                                placeholder="0.00"
                                className="w-24 px-3 py-2 border rounded-lg text-sm"
                                style={{ borderColor: BRAND_COLORS.gray[300] }}
                              />
                            ) : (
                              <span className="text-sm text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className="text-sm font-semibold"
                              style={{ color: BRAND_COLORS.success }}
                            >
                              {formatCurrency(emp.amount)}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <input
                              type="text"
                              value={emp.notes}
                              onChange={(e) =>
                                updateEmployeeRow(idx, "notes", e.target.value)
                              }
                              placeholder="Optional notes"
                              className="w-full px-3 py-2 border rounded-lg text-sm"
                              style={{ borderColor: BRAND_COLORS.gray[300] }}
                            />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Footer */}
              <div
                className="px-6 py-4 border-t flex items-center justify-between"
                style={{ borderColor: BRAND_COLORS.gray[200] }}
              >
                <div className="flex items-center gap-4">
                  <p className="text-sm text-gray-600">
                    {employees.filter((e) => e.amount > 0).length} employees with pay
                  </p>
                  <button
                    onClick={() => setShowAddEmployee(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-white font-medium"
                    style={{ backgroundColor: BRAND_COLORS.primary }}
                  >
                    <Plus size={18} />
                    Add Employee
                  </button>
                </div>
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting || totalAmount === 0}
                  className="flex items-center gap-2 px-6 py-3 rounded-lg text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: BRAND_COLORS.success }}
                >
                  {isSubmitting ? (
                    <>
                      <div
                        className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"
                      ></div>
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send size={20} />
                      Submit Payroll
                    </>
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      {/* Add Employee Modal */}
      {showAddEmployee && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between" style={{ borderColor: BRAND_COLORS.gray[200] }}>
              <h2 className="text-xl font-bold text-gray-900">Add New Employee</h2>
              <button
                onClick={() => setShowAddEmployee(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    First Name *
                  </label>
                  <input
                    type="text"
                    value={newEmployee.first_name}
                    onChange={(e) => setNewEmployee({ ...newEmployee, first_name: e.target.value })}
                    className="w-full px-4 py-2 border-2 rounded-lg"
                    style={{ borderColor: BRAND_COLORS.gray[300] }}
                    placeholder="John"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    value={newEmployee.last_name}
                    onChange={(e) => setNewEmployee({ ...newEmployee, last_name: e.target.value })}
                    className="w-full px-4 py-2 border-2 rounded-lg"
                    style={{ borderColor: BRAND_COLORS.gray[300] }}
                    placeholder="Doe"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email (Optional)
                </label>
                <input
                  type="email"
                  value={newEmployee.email}
                  onChange={(e) => setNewEmployee({ ...newEmployee, email: e.target.value })}
                  className="w-full px-4 py-2 border-2 rounded-lg"
                  style={{ borderColor: BRAND_COLORS.gray[300] }}
                  placeholder="john.doe@example.com"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Payroll Group *
                  </label>
                  <select
                    value={newEmployee.payroll_group}
                    onChange={(e) => setNewEmployee({ ...newEmployee, payroll_group: e.target.value as PayrollGroup })}
                    className="w-full px-4 py-2 border-2 rounded-lg"
                    style={{ borderColor: BRAND_COLORS.gray[300] }}
                  >
                    <option value="A">Group A</option>
                    <option value="B">Group B</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Compensation Type *
                  </label>
                  <select
                    value={newEmployee.compensation_type}
                    onChange={(e) => setNewEmployee({ ...newEmployee, compensation_type: e.target.value as CompensationType })}
                    className="w-full px-4 py-2 border-2 rounded-lg"
                    style={{ borderColor: BRAND_COLORS.gray[300] }}
                  >
                    <option value="hourly">Hourly</option>
                    <option value="production">Production</option>
                    <option value="fixed">Fixed Pay</option>
                  </select>
                </div>
              </div>

              {newEmployee.compensation_type === 'hourly' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Hourly Rate ($) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={newEmployee.hourly_rate}
                    onChange={(e) => setNewEmployee({ ...newEmployee, hourly_rate: e.target.value })}
                    className="w-full px-4 py-2 border-2 rounded-lg"
                    style={{ borderColor: BRAND_COLORS.gray[300] }}
                    placeholder="25.00"
                  />
                </div>
              )}

              {newEmployee.compensation_type === 'production' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Piece Rate ($) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={newEmployee.piece_rate}
                    onChange={(e) => setNewEmployee({ ...newEmployee, piece_rate: e.target.value })}
                    className="w-full px-4 py-2 border-2 rounded-lg"
                    style={{ borderColor: BRAND_COLORS.gray[300] }}
                    placeholder="5.00"
                  />
                </div>
              )}

              {newEmployee.compensation_type === 'fixed' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Fixed Pay Amount ($) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={newEmployee.fixed_pay}
                    onChange={(e) => setNewEmployee({ ...newEmployee, fixed_pay: e.target.value })}
                    className="w-full px-4 py-2 border-2 rounded-lg"
                    style={{ borderColor: BRAND_COLORS.gray[300] }}
                    placeholder="1000.00"
                  />
                </div>
              )}
            </div>

            <div className="sticky bottom-0 bg-gray-50 px-6 py-4 flex gap-3 border-t" style={{ borderColor: BRAND_COLORS.gray[200] }}>
              <button
                onClick={() => setShowAddEmployee(false)}
                className="flex-1 px-6 py-3 border-2 rounded-lg font-semibold text-gray-700 hover:bg-gray-100"
                style={{ borderColor: BRAND_COLORS.gray[300] }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddEmployee}
                disabled={isSubmitting}
                className="flex-1 px-6 py-3 rounded-lg text-white font-semibold disabled:opacity-50"
                style={{ backgroundColor: BRAND_COLORS.success }}
              >
                {isSubmitting ? 'Adding...' : 'Add Employee'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
