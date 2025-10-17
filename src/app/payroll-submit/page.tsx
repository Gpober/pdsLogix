"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { supabase as dataSupabase } from "@/lib/supabaseClient";
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
type CompensationType = "hourly" | "production";

type Location = {
  id: string;
  name: string;
};

type Employee = {
  id: string;
  first_name: string;
  last_name: string;
  employee_code: string;
  payroll_group: PayrollGroup;
  compensation_type: CompensationType;
  hourly_rate: number | null;
  piece_rate: number | null;
};

type EmployeeRow = Employee & {
  hours: string;
  units: string;
  notes: string;
  amount: number;
};

type Alert = {
  type: "success" | "error";
  message: string;
};

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
        <path
          d="M35 72 L44 67 L53 57 L62 52 L71 62 L80 47"
          stroke="#FFFFFF"
          strokeWidth="2.5"
          fill="none"
        />
        <circle cx="35" cy="72" r="2.5" fill="#FFFFFF" />
        <circle cx="44" cy="67" r="2.5" fill="#FFFFFF" />
        <circle cx="53" cy="57" r="2.5" fill="#FFFFFF" />
        <circle cx="62" cy="52" r="2.5" fill="#FFFFFF" />
        <circle cx="71" cy="62" r="2.5" fill="#FFFFFF" />
        <circle cx="80" cy="47" r="2.5" fill="#FFFFFF" />
      </g>
      <text
        x="60"
        y="95"
        textAnchor="middle"
        fill="white"
        fontSize="11"
        fontWeight="bold"
        fontFamily="Arial, sans-serif"
      >
        CFO
      </text>
    </svg>
  </div>
);

export default function DesktopPayrollSubmit() {
  const router = useRouter();
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
      console.log('🔐 Desktop Payroll: Starting auth check...');
      
      const authClient = createClient();
      const { data: { user }, error: authError } = await authClient.auth.getUser();

      if (authError || !user) {
        console.log('❌ Desktop Payroll: No user found');
        router.push("/login");
        return;
      }

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

      if (field === "hours" || field === "units" || field === "notes") {
        emp[field] = value;
      }

      // Recalculate amount
      if (emp.compensation_type === "hourly") {
        const hours = parseFloat(emp.hours) || 0;
        const rate = emp.hourly_rate || 0;
        emp.amount = hours * rate;
      } else {
        const units = parseFloat(emp.units) || 0;
        const rate = emp.piece_rate || 0;
        emp.amount = units * rate;
      }

      updated[index] = emp;
      return updated;
    });
  };

  const totalAmount = useMemo(() => {
    return employees.reduce((sum, emp) => sum + emp.amount, 0);
  }, [employees]);

  const handleSubmit = async () => {
    if (!selectedLocationId || !userId) {
      showAlert("Missing location or user information", "error");
      return;
    }

    const employeesWithData = employees.filter(
      (emp) =>
        (emp.compensation_type === "hourly" && parseFloat(emp.hours) > 0) ||
        (emp.compensation_type === "production" && parseFloat(emp.units) > 0)
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

      // Create submission details
      const details = employeesWithData.map((emp) => ({
        submission_id: submission.id,
        employee_id: emp.id,
        hours: emp.compensation_type === "hourly" ? parseFloat(emp.hours) : null,
        units:
          emp.compensation_type === "production" ? parseFloat(emp.units) : null,
        amount: emp.amount,
        notes: emp.notes || null,
      }));

      const { error: detailsError } = await dataSupabase
        .from("payroll_submission_details")
        .insert(details);

      if (detailsError) throw detailsError;

      showAlert("Payroll submitted successfully!", "success");
      
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
    const authClient = createClient();
    await authClient.auth.signOut();
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
                        Hours/Units
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
                        <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                          Loading employees...
                        </td>
                      </tr>
                    ) : employees.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
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
                            <div className="text-xs text-gray-500">{emp.employee_code}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className="px-2 py-1 text-xs font-medium rounded-full capitalize"
                              style={{
                                backgroundColor:
                                  emp.compensation_type === "hourly"
                                    ? BRAND_COLORS.primary + "20"
                                    : BRAND_COLORS.warning + "20",
                                color:
                                  emp.compensation_type === "hourly"
                                    ? BRAND_COLORS.primary
                                    : BRAND_COLORS.warning,
                              }}
                            >
                              {emp.compensation_type}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatCurrency(
                              emp.compensation_type === "hourly"
                                ? emp.hourly_rate || 0
                                : emp.piece_rate || 0
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
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
                <div>
                  <p className="text-sm text-gray-600">
                    {employees.filter((e) => e.amount > 0).length} employees with pay
                  </p>
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
    </div>
  );
}
