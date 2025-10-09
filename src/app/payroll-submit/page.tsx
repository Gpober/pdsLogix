"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import clsx from "clsx";

type PayrollGroup = "A" | "B";

type CompensationType = "hourly" | "production";

type EmployeeRecord = {
  id: string;
  employee_code: string;
  full_name: string;
  compensation_type: CompensationType;
  hourly_rate: number | null;
  piece_rate: number | null;
  primary_location_id: string;
  payroll_group: PayrollGroup;
  active: boolean;
};

type EntryState = {
  hours: string;
  units: string;
  notes: string;
};

type AlertState = {
  type: "success" | "error";
  message: string;
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

export default function PayrollSubmitPage() {
  const router = useRouter();

  const [isInitializing, setIsInitializing] = useState(true);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState<AlertState | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [locationName, setLocationName] = useState<string>("");

  const [payDate, setPayDate] = useState<string>(
    () => new Date().toISOString().slice(0, 10)
  );
  const [payrollGroup, setPayrollGroup] = useState<PayrollGroup | null>(null);

  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [entries, setEntries] = useState<Record<string, EntryState>>({});

  useEffect(() => {
    let isMounted = true;

    const initialize = async () => {
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
          router.replace("/login");
          return;
        }

        const { data: userRecord, error: userError } = await supabase
          .from("users")
          .select("role")
          .eq("id", user.id)
          .single();

        if (userError) {
          console.error("Unable to load user role", userError);
          setAlert({ type: "error", message: "Unable to load your user profile." });
          return;
        }

        const allowedRoles = new Set([
          "employee",
          "admin",
          "owner",
          "super_admin",
        ]);

        if (!userRecord || !allowedRoles.has(userRecord.role)) {
          router.replace("/dashboard");
          return;
        }

        const { data: locationRow, error: locationError } = await supabase
          .from("user_locations")
          .select("location_id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (locationError) {
          console.error("Unable to load assigned location", locationError);
          setAlert({
            type: "error",
            message: "Unable to determine your assigned location.",
          });
          return;
        }

        if (!locationRow?.location_id) {
          setAlert({
            type: "error",
            message: "You do not have an assigned location.",
          });
          return;
        }

        const locationUUID = locationRow.location_id as string;

        const { data: locationDetails } = await supabase
          .from("locations")
          .select("location_name")
          .eq("id", locationUUID)
          .maybeSingle();

        if (isMounted) {
          setUserId(user.id);
          setLocationId(locationUUID);
          setLocationName(locationDetails?.location_name ?? "");
        }
      } finally {
        if (isMounted) {
          setIsInitializing(false);
        }
      }
    };

    initialize();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const loadPayrollGroup = useCallback(
    async (date: string) => {
      if (!date) return;
      try {
        const { data, error } = await supabase.rpc("get_payroll_group", {
          target_date: date,
        });
        if (error) {
          console.error("Failed to determine payroll group", error);
          setAlert({
            type: "error",
            message: "Unable to determine payroll group for the selected date.",
          });
          return;
        }
        if (data === "A" || data === "B") {
          setPayrollGroup(data);
        } else {
          setPayrollGroup(null);
        }
      } catch (err) {
        console.error(err);
        setAlert({
          type: "error",
          message: "Unexpected error while determining payroll group.",
        });
      }
    },
    []
  );

  useEffect(() => {
    if (payDate) {
      loadPayrollGroup(payDate);
    }
  }, [payDate, loadPayrollGroup]);

  const fetchEmployees = useCallback(async () => {
    if (!locationId || !payrollGroup) {
      setEmployees([]);
      return;
    }

    setIsLoadingEmployees(true);
    try {
      const { data, error } = await supabase
        .from("employees")
        .select(
          "id, employee_code, full_name, compensation_type, hourly_rate, piece_rate, primary_location_id, payroll_group, active"
        )
        .eq("primary_location_id", locationId)
        .eq("payroll_group", payrollGroup)
        .eq("active", true)
        .order("full_name", { ascending: true });

      if (error) {
        console.error("Failed to load employees", error);
        setAlert({
          type: "error",
          message: "Unable to load employees for this payroll.",
        });
        setEmployees([]);
        return;
      }

      setEmployees(data ?? []);
      setEntries({});
    } finally {
      setIsLoadingEmployees(false);
    }
  }, [locationId, payrollGroup]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const updateEntry = useCallback(
    (employeeId: string, updater: (prev: EntryState) => EntryState) => {
      setEntries((prev) => {
        const current = prev[employeeId] ?? { hours: "", units: "", notes: "" };
        return {
          ...prev,
          [employeeId]: updater(current),
        };
      });
    },
    []
  );

  const parseNumber = (value: string) => {
    if (value.trim() === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const getRowError = useCallback(
    (employee: EmployeeRecord): string | null => {
      const entry = entries[employee.id];
      if (!entry) return null;

      if (employee.compensation_type === "hourly") {
        const hours = parseNumber(entry.hours);
        if (hours === null) return null;
        if (hours < 0) return "Hours cannot be negative";
        if (hours > 80) return "Maximum 80 hours";
        return null;
      }

      const units = parseNumber(entry.units);
      if (units === null) return null;
      if (units <= 0) return "Units must be positive";
      return null;
    },
    [entries]
  );

  const getRowAmount = useCallback(
    (employee: EmployeeRecord): number => {
      const entry = entries[employee.id];
      if (!entry) return 0;
      const rate =
        employee.compensation_type === "hourly"
          ? Number(employee.hourly_rate ?? 0)
          : Number(employee.piece_rate ?? 0);

      if (employee.compensation_type === "hourly") {
        const hours = parseNumber(entry.hours);
        if (hours === null || hours < 0 || hours > 80) return 0;
        return hours * rate;
      }

      const units = parseNumber(entry.units);
      if (units === null || units <= 0) return 0;
      return units * rate;
    },
    [entries]
  );

  const totals = useMemo(() => {
    let totalAmount = 0;
    let employeeCount = 0;

    employees.forEach((employee) => {
      const amount = getRowAmount(employee);
      if (amount > 0) {
        const entry = entries[employee.id];
        if (!entry) return;
        const value =
          employee.compensation_type === "hourly"
            ? parseNumber(entry.hours)
            : parseNumber(entry.units);
        if (value === null) return;
        if (employee.compensation_type === "hourly") {
          if (value <= 0 || value > 80) return;
        } else {
          if (value <= 0) return;
        }
        employeeCount += 1;
        totalAmount += amount;
      }
    });

    return { totalAmount, employeeCount };
  }, [employees, entries, getRowAmount]);

  const resetForm = useCallback(() => {
    setEntries({});
    setAlert({
      type: "success",
      message: "Payroll submitted successfully.",
    });
  }, []);

  const handleSubmit = async () => {
    if (!userId || !locationId || !payrollGroup) {
      setAlert({ type: "error", message: "Missing payroll context." });
      return;
    }

    const lines = employees
      .map((employee) => {
        const entry = entries[employee.id];
        if (!entry) return null;

        const amount = getRowAmount(employee);
        if (amount <= 0) return null;

        if (employee.compensation_type === "hourly") {
          const hours = parseNumber(entry.hours);
          if (hours === null || hours <= 0 || hours > 80) return null;
          return {
            employee_id: employee.id,
            hours_worked: hours,
            production_units: null,
            calculated_amount: amount,
            notes: entry.notes.trim() ? entry.notes.trim() : null,
          };
        }

        const units = parseNumber(entry.units);
        if (units === null || units <= 0) return null;
        return {
          employee_id: employee.id,
          hours_worked: null,
          production_units: units,
          calculated_amount: amount,
          notes: entry.notes.trim() ? entry.notes.trim() : null,
        };
      })
      .filter(Boolean) as {
      employee_id: string;
      hours_worked: number | null;
      production_units: number | null;
      calculated_amount: number;
      notes: string | null;
    }[];

    if (lines.length === 0) {
      setAlert({
        type: "error",
        message: "Enter hours or units for at least one employee before submitting.",
      });
      return;
    }

    const payload = {
      pay_date: payDate,
      payroll_group: payrollGroup,
      location_id: locationId,
      submitted_by: userId,
      total_amount: totals.totalAmount,
      lines,
    };

    setSubmitting(true);
    setAlert(null);
    try {
      const response = await fetch("/api/payroll/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to submit payroll");
      }

      resetForm();
    } catch (error) {
      console.error("Payroll submission failed", error);
      setAlert({
        type: "error",
        message: "Payroll submission failed. Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const renderTableBody = () => {
    if (isLoadingEmployees) {
      return (
        <tr>
          <td colSpan={6} className="py-10 text-center text-muted-foreground">
            Loading employees...
          </td>
        </tr>
      );
    }

    if (employees.length === 0) {
      return (
        <tr>
          <td colSpan={6} className="py-10 text-center text-muted-foreground">
            No employees found for this payroll group.
          </td>
        </tr>
      );
    }

    return employees.map((employee) => {
      const entry = entries[employee.id] ?? { hours: "", units: "", notes: "" };
      const errorMessage = getRowError(employee);
      const amount = getRowAmount(employee);
      const rate =
        employee.compensation_type === "hourly"
          ? Number(employee.hourly_rate ?? 0)
          : Number(employee.piece_rate ?? 0);

      return (
        <tr key={employee.id} className="border-b last:border-b-0">
          <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-slate-100">
            <div>{employee.full_name}</div>
            <div className="text-xs text-muted-foreground">{employee.employee_code}</div>
          </td>
          <td className="px-4 py-3 text-sm">
            <span
              className={clsx(
                "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
                employee.compensation_type === "hourly"
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-200"
                  : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200"
              )}
            >
              {employee.compensation_type === "hourly" ? "Hourly" : "Production"}
            </span>
          </td>
          <td className="px-4 py-3 text-sm text-right tabular-nums">
            {currencyFormatter.format(rate)}
          </td>
          <td className="px-4 py-3">
            {employee.compensation_type === "hourly" ? (
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={80}
                step={0.25}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-900"
                value={entry.hours}
                onChange={(event) =>
                  updateEntry(employee.id, (prev) => ({
                    ...prev,
                    hours: event.target.value,
                  }))
                }
              />
            ) : (
              <input
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-900"
                value={entry.units}
                onChange={(event) =>
                  updateEntry(employee.id, (prev) => ({
                    ...prev,
                    units: event.target.value,
                  }))
                }
              />
            )}
            {errorMessage ? (
              <p className="mt-1 text-xs text-red-600">{errorMessage}</p>
            ) : null}
          </td>
          <td className="px-4 py-3 text-sm text-right tabular-nums">
            {currencyFormatter.format(amount)}
          </td>
          <td className="px-4 py-3">
            <input
              type="text"
              placeholder="Notes (optional)"
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-900"
              value={entry.notes}
              onChange={(event) =>
                updateEntry(employee.id, (prev) => ({
                  ...prev,
                  notes: event.target.value,
                }))
              }
            />
          </td>
        </tr>
      );
    });
  };

  if (isInitializing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="rounded-md border border-slate-200 bg-white px-6 py-4 text-sm text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          Preparing payroll submission...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-8 py-10 dark:bg-slate-950">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Payroll Submission
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Submit payroll hours and production units for your assigned location.
            </p>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            <div>{locationName || "Assigned Location"}</div>
            {payrollGroup ? <div>Payroll Group {payrollGroup}</div> : null}
          </div>
        </header>

        {alert ? (
          <div
            className={clsx(
              "rounded-md border px-4 py-3 text-sm",
              alert.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200"
                : "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-900/30 dark:text-red-200"
            )}
          >
            {alert.message}
          </div>
        ) : null}

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="grid grid-cols-1 gap-4 border-b border-slate-200 p-4 md:grid-cols-3 dark:border-slate-800">
            <label className="flex flex-col text-sm font-medium text-slate-700 dark:text-slate-200">
              Pay Date
              <input
                type="date"
                value={payDate}
                onChange={(event) => setPayDate(event.target.value)}
                className="mt-1 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
            <div className="flex flex-col text-sm text-slate-600 dark:text-slate-300">
              <span className="font-medium text-slate-700 dark:text-slate-200">Payroll Group</span>
              <span className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">
                {payrollGroup ?? "--"}
              </span>
              <span className="text-xs text-muted-foreground">
                Determined automatically from pay date
              </span>
            </div>
            <div className="flex flex-col text-sm text-slate-600 dark:text-slate-300">
              <span className="font-medium text-slate-700 dark:text-slate-200">Employee Count</span>
              <span className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">
                {totals.employeeCount}
              </span>
              <span className="text-xs text-muted-foreground">
                Count of employees included in this submission
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
              <thead className="bg-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3 text-right">Rate</th>
                  <th className="px-4 py-3">Input</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm dark:divide-slate-800">
                {renderTableBody()}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-4 text-sm dark:border-slate-800">
            <div className="font-medium text-slate-600 dark:text-slate-300">
              Total Amount
            </div>
            <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {currencyFormatter.format(totals.totalAmount)}
            </div>
          </div>
        </section>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || totals.employeeCount === 0}
            className={clsx(
              "inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-blue-300",
              "hover:bg-blue-700"
            )}
          >
            {submitting ? "Submitting..." : "Submit Payroll"}
          </button>
        </div>
      </div>
    </div>
  );
}
