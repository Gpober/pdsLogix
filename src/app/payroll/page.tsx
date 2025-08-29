"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Calendar, Download, RefreshCw, ChevronDown, Users, DollarSign,
  TrendingUp, PieChart as PieIcon, Search, Receipt
} from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Bar, Line,
  PieChart as RechartsPieChart, Pie, Cell
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
  date: string | null;           // Supabase returns ISO date string
  total_amount: number | null;   // numeric in Postgres -> number here
};

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

export default function PayrollPage() {
  // UI state
  const [notification, setNotification] = useState<{ show: boolean; message: string; type: "info" | "success" | "error" | "warning" }>({ show: false, message: "", type: "info" });
  const [departmentFilter, setDepartmentFilter] = useState("All Departments");
  const [departmentDropdownOpen, setDepartmentDropdownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Data state
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Fetch payments
  const fetchPayments = async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from("payments")
      .select("id, last_name, first_name, department, payment_method, date, total_amount")
      .order("date", { ascending: false })
      .limit(5000); // adjust as needed
    if (error) setLoadError(error.message);
    setPayments((data ?? []) as Payment[]);
    setLoading(false);
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
      const matchesDept = departmentFilter === "All Departments" || (p.department ?? "") === departmentFilter;
      const fullName = `${p.first_name ?? ""} ${p.last_name ?? ""}`.toLowerCase();
      const hay = [fullName, (p.department ?? "").toLowerCase(), (p.payment_method ?? "").toLowerCase()].join(" ");
      const matchesSearch = searchTerm.trim() === "" || hay.includes(searchTerm.toLowerCase());
      return matchesDept && matchesSearch;
    });
  }, [payments, departmentFilter, searchTerm]);

  // KPIs
  const kpis = useMemo(() => {
    const totalTx = filteredPayments.length;
    let total = 0;
    let monthTotal = 0;

    const now = new Date();
    const m = now.getMonth();
    const y = now.getFullYear();

    for (const p of filteredPayments) {
      const amt = Number(p.total_amount || 0);
      total += amt;
      if (p.date) {
        const d = new Date(p.date);
        if (d.getMonth() === m && d.getFullYear() === y) monthTotal += amt;
      }
    }
    const avg = totalTx ? total / totalTx : 0;

    // top department by total
    const byDept = new Map<string, number>();
    for (const p of filteredPayments) {
      const dept = (p.department || "Uncategorized").trim();
      byDept.set(dept, (byDept.get(dept) || 0) + Number(p.total_amount || 0));
    }
    const topDept = Array.from(byDept.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

    return { totalTx, total, monthTotal, avg, topDept };
  }, [filteredPayments]);

  // Trend (last 6 months) & Department pie (live)
  const trendData = useMemo(() => {
    // buckets for last 6 months
    const now = new Date();
    const labels: { key: string; y: number; m: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      labels.push({
        key: d.toLocaleString("en-US", { month: "short" }) + " " + d.getFullYear(),
        y: d.getFullYear(),
        m: d.getMonth(),
      });
    }
    const map = new Map<string, { month: string; grossPay: number; netPay: number }>();
    labels.forEach((l) => map.set(l.key, { month: l.key, grossPay: 0, netPay: 0 }));

    for (const p of filteredPayments) {
      if (!p.date) continue;
      const d = new Date(p.date);
      const key = d.toLocaleString("en-US", { month: "short" }) + " " + d.getFullYear();
      if (!map.has(key)) continue;
      const amt = Number(p.total_amount || 0);
      const bucket = map.get(key)!;
      bucket.grossPay += amt;
      bucket.netPay += amt; // no split columns; using same metric
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

  // UI helpers
  const CHART_COLORS = [BRAND_COLORS.primary, BRAND_COLORS.success, BRAND_COLORS.warning, BRAND_COLORS.danger, BRAND_COLORS.secondary];

  const formatCurrency = (amount: number): string =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

  const formatDate = (dateString?: string | null): string =>
    dateString ? new Date(dateString).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

  const showNotification = (message: string, type: "info" | "success" | "error" | "warning" = "info") => {
    setNotification({ show: true, message, type });
    setTimeout(() => setNotification({ show: false, message: "", type: "info" }), 2500);
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center">
            <IAMCFOLogo className="w-8 h-8 mr-4" />
            <div>
              <div className="flex items-center space-x-3">
                <h1 className="text-2xl font-bold text-gray-900">I AM CFO</h1>
                <span className="text-sm px-3 py-1 rounded-full text-white" style={{ backgroundColor: BRAND_COLORS.primary }}>
                  Payroll Management
                </span>
              </div>
              <p className="text-sm text-gray-600 mt-1">Live payments from Supabase • Department insights • Simple exports</p>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          {/* Controls */}
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <h2 className="text-3xl font-bold" style={{ color: BRAND_COLORS.primary }}>
              Overview
            </h2>
            <div className="flex flex-wrap gap-4 items-center">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search name, dept, or method…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 transition-all w-64"
                  style={{ ["--tw-ring-color" as any]: BRAND_COLORS.secondary + "33" }}
                />
              </div>

              {/* Department Filter */}
              <div className="relative">
                <button
                  onClick={() => setDepartmentDropdownOpen((v) => !v)}
                  className="flex items-center justify-between w-56 px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm hover:border-blue-500 focus:outline-none focus:ring-2 transition-all"
                  style={{ ["--tw-ring-color" as any]: BRAND_COLORS.secondary + "33" }}
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
                  <div className="text-3xl font-bold text-gray-900 mb-1">{kpis.totalTx}</div>
                </div>
                <Users className="w-8 h-8" style={{ color: BRAND_COLORS.primary }} />
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 hover:shadow-md transition-shadow" style={{ borderLeftColor: BRAND_COLORS.success }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-gray-600 text-sm font-medium mb-2">This Month Total</div>
                  <div className="text-3xl font-bold text-gray-900 mb-1">{formatCurrency(kpis.monthTotal)}</div>
                </div>
                <DollarSign className="w-8 h-8" style={{ color: BRAND_COLORS.success }} />
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 hover:shadow-md transition-shadow" style={{ borderLeftColor: BRAND_COLORS.warning }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-gray-600 text-sm font-medium mb-2">Average Payment</div>
                  <div className="text-3xl font-bold text-gray-900 mb-1">{formatCurrency(kpis.avg)}</div>
                </div>
                <TrendingUp className="w-8 h-8" style={{ color: BRAND_COLORS.warning }} />
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 hover:shadow-md transition-shadow" style={{ borderLeftColor: BRAND_COLORS.accent }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-gray-600 text-sm font-medium mb-2">Top Department</div>
                  <div className="text-3xl font-bold text-gray-900 mb-1">{kpis.topDept}</div>
                </div>
                <PieIcon className="w-8 h-8" style={{ color: BRAND_COLORS.accent }} />
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Trend */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-xl font-semibold text-gray-900">6-Month Payments Trend</h3>
                <p className="text-sm text-gray-600 mt-1">Gross/Net show same value (no tax split in table)</p>
              </div>
              <div className="p-6">
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v) => [formatCurrency(Number(v)), ""]} />
                    <Legend />
                    <Bar dataKey="grossPay" fill={BRAND_COLORS.primary} name="Total" />
                    <Line type="monotone" dataKey="netPay" stroke={BRAND_COLORS.success} strokeWidth={3} name="Net (same)" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Department Pie */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-xl font-semibold text-gray-900">Totals by Department</h3>
                <p className="text-sm text-gray-600 mt-1">Distribution of payment totals</p>
              </div>
              <div className="p-6">
                <ResponsiveContainer width="100%" height={300}>
                  <RechartsPieChart>
                    <Tooltip formatter={(v) => [formatCurrency(Number(v)), "Total"]} />
                    <Pie
                      data={departmentData}
                      dataKey="cost"
                      nameKey="department"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={(entry) => `${entry.department}: ${((entry.cost /
                        (departmentData.reduce((s, x) => s + x.cost, 0) || 1)) * 100).toFixed(0)}%`}
                    >
                      {departmentData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                  </RechartsPieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Recent Payments */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden lg:col-span-2">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-xl font-semibold text-gray-900">Recent Payments</h3>
              </div>
              <div className="p-6">
                {loading && <div className="text-sm text-gray-600">Loading payments…</div>}
                {loadError && <div className="text-sm text-red-600">Error: {loadError}</div>}
                {!loading && !loadError && (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead>
                        <tr>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Date</th>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Employee</th>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Department</th>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Method</th>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {filteredPayments.map((p) => (
                          <tr key={p.id ?? `${p.first_name}-${p.last_name}-${p.date}`}>
                            <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{formatDate(p.date)}</td>
                            <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                              {(p.first_name ?? "") + " " + (p.last_name ?? "")}
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{p.department ?? "—"}</td>
                            <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{p.payment_method ?? "—"}</td>
                            <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{formatCurrency(Number(p.total_amount || 0))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {filteredPayments.length === 0 && (
                      <div className="text-sm text-gray-600 mt-4">No results match your filters.</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Notification */}
          {notification.show && (
            <div
              className={`fixed top-5 right-5 z-50 px-6 py-4 rounded-lg text-white font-medium shadow-lg transition-transform ${
                notification.type === "success"
                  ? "bg-green-500"
                  : notification.type === "error"
                  ? "bg-red-500"
                  : notification.type === "warning"
                  ? "bg-yellow-500"
                  : "bg-blue-500"
              } ${notification.show ? "translate-x-0" : "translate-x-full"}`}
            >
              {notification.message}
            </div>
          )}

          {/* Click-away for dropdown */}
          {departmentDropdownOpen && <div className="fixed inset-0 z-10" onClick={() => setDepartmentDropdownOpen(false)} />}
        </div>
      </main>
    </div>
  );
}
