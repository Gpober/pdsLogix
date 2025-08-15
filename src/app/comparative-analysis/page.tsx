"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  BarChart as ReBarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, RefreshCw, X } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";

const BRAND_COLORS = {
  primary: "#56B6E9",
};

type KPIs = {
  revenue: number;
  cogs: number;
  grossProfit: number;
  opEx: number;
  netIncome: number;
};

export default function ComparativeAnalysisPage() {
  const [mode, setMode] = useState<"period" | "customer">("period");
  const [startA, setStartA] = useState("");
  const [endA, setEndA] = useState("");
  const [startB, setStartB] = useState("");
  const [endB, setEndB] = useState("");
  const [customerA, setCustomerA] = useState("All Customers");
  const [customerB, setCustomerB] = useState("All Customers");
  const [customers, setCustomers] = useState<string[]>([]);
  const [dataA, setDataA] = useState<KPIs | null>(null);
  const [dataB, setDataB] = useState<KPIs | null>(null);
  const [varianceRows, setVarianceRows] = useState<{
    income: any[];
    cogs: any[];
    expenses: any[];
  }>({ income: [], cogs: [], expenses: [] });
  const [lineData, setLineData] = useState<any[]>([]);
  const [selectedKpi, setSelectedKpi] = useState<keyof KPIs>("revenue");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allLinesA, setAllLinesA] = useState<any[]>([]);
  const [allLinesB, setAllLinesB] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalTransactions, setModalTransactions] = useState<any[]>([]);

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    const { data } = await supabase.from("journal_entry_lines").select("customer");
    if (data) {
      const unique = Array.from(
        new Set(
          data
            .map((d) => d.customer)
            .filter((c) => c && c.trim())
            .map((c) => c.trim()),
        ),
      );
      setCustomers(["All Customers", ...unique]);
    }
  };

  const fetchLines = async (start: string, end: string, property?: string) => {
    let query = supabase
      .from("journal_entry_lines")
      .select("account, account_type, debit, credit, class, date")
      .gte("date", start)
      .lte("date", end);

    if (property && property !== "All Customers") {
      query = query.eq("customer", property);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  };

  const computeKPIs = (lines: any[]): KPIs => {
    let revenue = 0,
      cogs = 0,
      opEx = 0;
    lines.forEach((l) => {
      const amount = (Number(l.credit) || 0) - (Number(l.debit) || 0);
      const type = (l.account_type || "").toLowerCase();
      if (type.includes("income") || type.includes("revenue")) {
        revenue += amount;
      } else if (type.includes("cost of goods sold")) {
        cogs += amount;
      } else if (type.includes("expense")) {
        opEx += amount;
      }
    });
    const grossProfit = revenue + cogs;
    const netIncome = grossProfit + opEx;
    return { revenue, cogs, grossProfit, opEx, netIncome };
  };

  const aggregateDaily = (lines: any[], kpi: keyof KPIs) => {
    const map = new Map<string, number>();
    lines.forEach((l) => {
      const date = l.date.slice(0, 10);
      const amount = (Number(l.credit) || 0) - (Number(l.debit) || 0);
      const type = (l.account_type || "").toLowerCase();
      let include = false;
      if (
        kpi === "revenue" &&
        (type.includes("income") || type.includes("revenue"))
      )
        include = true;
      else if (kpi === "cogs" && type.includes("cost of goods sold"))
        include = true;
      else if (
        kpi === "opEx" &&
        type.includes("expense") &&
        !type.includes("cost of goods sold")
      )
        include = true;
      else if (kpi === "grossProfit") include = true;
      else if (kpi === "netIncome") include = true;

      if (include) {
        map.set(date, (map.get(date) || 0) + amount);
      }
    });
    return map;
  };

  const computeVarianceTable = (linesA: any[], linesB: any[]) => {
    const map = new Map<
      string,
      { account: string; type: string; a: number; b: number }
    >();

    const addLine = (line: any, field: "a" | "b") => {
      const amount = (Number(line.credit) || 0) - (Number(line.debit) || 0);
      const type = (line.account_type || "").toLowerCase();
      if (
        !(
          type.includes("income") ||
          type.includes("revenue") ||
          type.includes("cost of goods sold") ||
          type.includes("expense")
        )
      )
        return;
      const key = line.account;
      const existing = map.get(key) || {
        account: key,
        type,
        a: 0,
        b: 0,
      };
      existing[field] += amount;
      existing.type = type;
      map.set(key, existing);
    };

    linesA.forEach((l) => addLine(l, "a"));
    linesB.forEach((l) => addLine(l, "b"));

    const rows = Array.from(map.values()).map((r) => ({
      ...r,
      var: r.a - r.b,
      varPct: r.b ? (r.a - r.b) / Math.abs(r.b) : null,
    }));

    rows.sort((a, b) => Math.abs(b.var) - Math.abs(a.var));

    return {
      income: rows.filter(
        (r) => r.type.includes("income") || r.type.includes("revenue"),
      ),
      cogs: rows.filter((r) => r.type.includes("cost of goods sold")),
      expenses: rows.filter(
        (r) =>
          r.type.includes("expense") && !r.type.includes("cost of goods sold"),
      ),
    };
  };

  const sectionTotals = (rows: any[]) => {
    const a = rows.reduce((s, r) => s + r.a, 0);
    const b = rows.reduce((s, r) => s + r.b, 0);
    const v = a - b;
    const vp = b ? v / Math.abs(b) : null;
    return { a, b, var: v, varPct: vp };
  };

  const buildLineData = (linesA: any[], linesB: any[], kpi: keyof KPIs) => {
    const mapA = aggregateDaily(linesA, kpi);
    const mapB = aggregateDaily(linesB, kpi);
    const dates = Array.from(new Set([...mapA.keys(), ...mapB.keys()])).sort();
    return dates.map((d) => ({
      date: d,
      A: mapA.get(d) || 0,
      B: mapB.get(d) || 0,
    }));
  };

  const fetchData = async () => {
    if (mode === "period" && (!startA || !endA || !startB || !endB)) return;
    if (mode === "customer" && (!startA || !endA)) return;

    setLoading(true);
    setError(null);
    try {
      const [linesA, linesB] = await Promise.all([
        fetchLines(startA, endA, mode === "customer" ? customerA : undefined),
        fetchLines(
          mode === "period" ? startB : startA,
          mode === "period" ? endB : endA,
          mode === "customer" ? customerB : undefined,
        ),
      ]);
      const kpiA = computeKPIs(linesA);
      const kpiB = computeKPIs(linesB);
      setDataA(kpiA);
      setDataB(kpiB);
      setVarianceRows(computeVarianceTable(linesA, linesB));
      setLineData(buildLineData(linesA, linesB, selectedKpi));
      setAllLinesA(linesA);
      setAllLinesB(linesB);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (allLinesA.length || allLinesB.length) {
      setLineData(buildLineData(allLinesA, allLinesB, selectedKpi));
    }
  }, [selectedKpi, allLinesA, allLinesB]);

  const barChartData =
    dataA && dataB
      ? [
          { kpi: "Revenue", A: dataA.revenue, B: dataB.revenue },
          { kpi: "COGS", A: dataA.cogs, B: dataB.cogs },
          {
            kpi: "Gross Profit",
            A: dataA.grossProfit,
            B: dataB.grossProfit,
          },
          { kpi: "OpEx", A: dataA.opEx, B: dataB.opEx },
          {
            kpi: "Net Income",
            A: dataA.netIncome,
            B: dataB.netIncome,
          },
        ]
      : [];

  const percent = (diff: number, base: number) => {
    if (!base) return 0;
    return (diff / Math.abs(base)) * 100;
  };

  const summaryBullets = () => {
    if (!dataA || !dataB) return [];
    const bullets = [];
    const revPct = percent(dataA.revenue - dataB.revenue, dataB.revenue);
    if (revPct)
      bullets.push(
        `Revenue ${revPct > 0 ? "up" : "down"} ${Math.abs(revPct).toFixed(2)}%`,
      );
    const opPct = percent(dataA.opEx - dataB.opEx, dataB.opEx);
    if (opPct)
      bullets.push(
        `OpEx ${opPct > 0 ? "up" : "down"} ${Math.abs(opPct).toFixed(2)}%`,
      );
    const netPct = percent(dataA.netIncome - dataB.netIncome, dataB.netIncome);
    if (netPct)
      bullets.push(
        `Net Income ${netPct > 0 ? "up" : "down"} ${Math.abs(netPct).toFixed(2)}%`,
      );
    return bullets.slice(0, 3);
  };

  const showTransactionDetails = (account: string) => {
    const combined = [
      ...allLinesA.map((l) => ({ ...l, set: "A" })),
      ...allLinesB.map((l) => ({ ...l, set: "B" })),
    ].filter((l) => l.account === account);
    setModalTitle(account);
    setModalTransactions(combined);
    setShowModal(true);
  };

  const handleExport = () => {
    const header = "Account,A,B,Var $,Var %\n";
    const sections = [
      { name: "INCOME", rows: varianceRows.income },
      { name: "COGS", rows: varianceRows.cogs },
      { name: "EXPENSES", rows: varianceRows.expenses },
    ];
    const lines: string[] = [];
    sections.forEach((sec) => {
      const t = sectionTotals(sec.rows);
      lines.push(
        [
          sec.name,
          t.a.toFixed(2),
          t.b.toFixed(2),
          t.var.toFixed(2),
          t.varPct !== null ? (t.varPct * 100).toFixed(2) + "%" : "",
        ].join(","),
      );
      sec.rows.forEach((r) => {
        lines.push(
          [
            r.account,
            r.a.toFixed(2),
            r.b.toFixed(2),
            r.var.toFixed(2),
            r.varPct !== null ? (r.varPct * 100).toFixed(2) + "%" : "",
          ].join(","),
        );
      });
    });
    const csv = header + lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "comparative-analysis.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const summary = summaryBullets();

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-2xl font-bold mb-2">Comparative Analysis</h1>

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col">
          <label className="text-sm text-gray-700 mb-1">Mode</label>
          <Select value={mode} onValueChange={(v) => setMode(v as any)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="period">Period vs Period</SelectItem>
              <SelectItem value="customer">Customer vs Customer</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col">
          <label className="text-sm text-gray-700 mb-1">Start A</label>
          <input
            type="date"
            value={startA}
            onChange={(e) => setStartA(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-gray-700 mb-1">End A</label>
          <input
            type="date"
            value={endA}
            onChange={(e) => setEndA(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          />
        </div>

        {mode === "period" && (
          <>
            <div className="flex flex-col">
              <label className="text-sm text-gray-700 mb-1">Start B</label>
              <input
                type="date"
                value={startB}
                onChange={(e) => setStartB(e.target.value)}
                className="border rounded px-2 py-1 text-sm"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-sm text-gray-700 mb-1">End B</label>
              <input
                type="date"
                value={endB}
                onChange={(e) => setEndB(e.target.value)}
                className="border rounded px-2 py-1 text-sm"
              />
            </div>
          </>
        )}

        {mode === "customer" && (
          <>
            <div className="flex flex-col">
          <label className="text-sm text-gray-700 mb-1">Customer A</label>
              <Select value={customerA} onValueChange={(v) => setCustomerA(v)}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col">
          <label className="text-sm text-gray-700 mb-1">Customer B</label>
              <Select value={customerB} onValueChange={(v) => setCustomerB(v)}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        <button
          onClick={fetchData}
          disabled={loading}
          className="inline-flex items-center px-4 py-2 text-white rounded-lg text-sm font-medium hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2"
          style={
            {
              backgroundColor: BRAND_COLORS.primary,
              "--tw-ring-color": BRAND_COLORS.primary + "33",
            } as React.CSSProperties
          }
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Loading..." : "Refresh"}
        </button>
        <button
          onClick={handleExport}
          className="inline-flex items-center px-4 py-2 text-white rounded-lg text-sm font-medium hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2"
          style={
            {
              backgroundColor: BRAND_COLORS.primary,
              "--tw-ring-color": BRAND_COLORS.primary + "33",
            } as React.CSSProperties
          }
        >
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </button>
      </div>

      {error && <div className="text-red-600 text-sm">{error}</div>}

      {summary.length > 0 && (
        <div className="bg-gray-50 p-4 rounded-md">
          {summary.map((s, idx) => (
            <p key={idx} className="text-sm text-gray-700">
              • {s}
            </p>
          ))}
        </div>
      )}

      {barChartData.length > 0 && (
        <div className="w-full h-64">
          <ResponsiveContainer>
            <ReBarChart data={barChartData}>
              <XAxis dataKey="kpi" />
              <YAxis tickFormatter={(v) => formatCurrency(v)} />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              <Legend />
              <Bar dataKey="A" fill="#56B6E9" />
              <Bar dataKey="B" fill="#94A3B8" />
            </ReBarChart>
          </ResponsiveContainer>
        </div>
      )}

      {lineData.length > 0 && (
        <div className="w-full">
          <div className="flex justify-end mb-2">
            <Select
              value={selectedKpi}
              onValueChange={(v) => setSelectedKpi(v as keyof KPIs)}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="revenue">Revenue</SelectItem>
                <SelectItem value="cogs">COGS</SelectItem>
                <SelectItem value="grossProfit">Gross Profit</SelectItem>
                <SelectItem value="opEx">OpEx</SelectItem>
                <SelectItem value="netIncome">Net Income</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={lineData} margin={{ left: 40, right: 20 }}>
                <XAxis dataKey="date" />
                <YAxis tickFormatter={(v) => formatCurrency(v)} />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Legend />
                <Line type="monotone" dataKey="A" stroke="#56B6E9" />
                <Line type="monotone" dataKey="B" stroke="#94A3B8" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {(varianceRows.income.length > 0 ||
        varianceRows.cogs.length > 0 ||
        varianceRows.expenses.length > 0) && (
        <div className="overflow-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Account
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                  A
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                  B
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                  Var $
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                  Var %
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {/* Income Section */}
              {varianceRows.income.length > 0 && (
                <>
                  <tr className="bg-green-50">
                    {(() => {
                      const t = sectionTotals(varianceRows.income);
                      return (
                        <>
                          <td className="!bg-green-50 px-4 py-2 text-sm font-bold text-green-800">
                            INCOME
                          </td>
                          <td className="px-4 py-2 text-sm font-bold text-green-800 text-right">
                            {formatCurrency(t.a)}
                          </td>
                          <td className="px-4 py-2 text-sm font-bold text-green-800 text-right">
                            {formatCurrency(t.b)}
                          </td>
                          <td className="px-4 py-2 text-sm font-bold text-green-800 text-right">
                            {formatCurrency(t.var)}
                          </td>
                          <td className="px-4 py-2 text-sm font-bold text-green-800 text-right">
                            {t.varPct !== null
                              ? (t.varPct * 100).toFixed(2) + "%"
                              : ""}
                          </td>
                        </>
                      );
                    })()}
                  </tr>
                  {varianceRows.income.map((r) => (
                    <tr
                      key={r.account}
                      onClick={() => showTransactionDetails(r.account)}
                      className="hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="px-4 py-2 text-sm text-gray-700">
                        {r.account}
                      </td>
                      <td className="px-4 py-2 text-sm text-right">
                        {formatCurrency(r.a)}
                      </td>
                      <td className="px-4 py-2 text-sm text-right">
                        {formatCurrency(r.b)}
                      </td>
                      <td className="px-4 py-2 text-sm text-right">
                        {formatCurrency(r.var)}
                      </td>
                      <td className="px-4 py-2 text-sm text-right">
                        {r.varPct !== null
                          ? (r.varPct * 100).toFixed(2) + "%"
                          : ""}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {/* COGS Section */}
              {varianceRows.cogs.length > 0 && (
                <>
                  <tr className="bg-yellow-50">
                    {(() => {
                      const t = sectionTotals(varianceRows.cogs);
                      return (
                        <>
                          <td className="!bg-yellow-50 px-4 py-2 text-sm font-bold text-yellow-800">
                            COGS
                          </td>
                          <td className="px-4 py-2 text-sm font-bold text-yellow-800 text-right">
                            {formatCurrency(t.a)}
                          </td>
                          <td className="px-4 py-2 text-sm font-bold text-yellow-800 text-right">
                            {formatCurrency(t.b)}
                          </td>
                          <td className="px-4 py-2 text-sm font-bold text-yellow-800 text-right">
                            {formatCurrency(t.var)}
                          </td>
                          <td className="px-4 py-2 text-sm font-bold text-yellow-800 text-right">
                            {t.varPct !== null
                              ? (t.varPct * 100).toFixed(2) + "%"
                              : ""}
                          </td>
                        </>
                      );
                    })()}
                  </tr>
                  {varianceRows.cogs.map((r) => (
                    <tr
                      key={r.account}
                      onClick={() => showTransactionDetails(r.account)}
                      className="hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="px-4 py-2 text-sm text-gray-700">
                        {r.account}
                      </td>
                      <td className="px-4 py-2 text-sm text-right">
                        {formatCurrency(r.a)}
                      </td>
                      <td className="px-4 py-2 text-sm text-right">
                        {formatCurrency(r.b)}
                      </td>
                      <td className="px-4 py-2 text-sm text-right">
                        {formatCurrency(r.var)}
                      </td>
                      <td className="px-4 py-2 text-sm text-right">
                        {r.varPct !== null
                          ? (r.varPct * 100).toFixed(2) + "%"
                          : ""}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {/* Expenses Section */}
              {varianceRows.expenses.length > 0 && (
                <>
                  <tr className="bg-red-50">
                    {(() => {
                      const t = sectionTotals(varianceRows.expenses);
                      return (
                        <>
                          <td className="!bg-red-50 px-4 py-2 text-sm font-bold text-red-800">
                            EXPENSES
                          </td>
                          <td className="px-4 py-2 text-sm font-bold text-red-800 text-right">
                            {formatCurrency(t.a)}
                          </td>
                          <td className="px-4 py-2 text-sm font-bold text-red-800 text-right">
                            {formatCurrency(t.b)}
                          </td>
                          <td className="px-4 py-2 text-sm font-bold text-red-800 text-right">
                            {formatCurrency(t.var)}
                          </td>
                          <td className="px-4 py-2 text-sm font-bold text-red-800 text-right">
                            {t.varPct !== null
                              ? (t.varPct * 100).toFixed(2) + "%"
                              : ""}
                          </td>
                        </>
                      );
                    })()}
                  </tr>
                  {varianceRows.expenses.map((r) => (
                    <tr
                      key={r.account}
                      onClick={() => showTransactionDetails(r.account)}
                      className="hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="px-4 py-2 text-sm text-gray-700">
                        {r.account}
                      </td>
                      <td className="px-4 py-2 text-sm text-right">
                        {formatCurrency(r.a)}
                      </td>
                      <td className="px-4 py-2 text-sm text-right">
                        {formatCurrency(r.b)}
                      </td>
                      <td className="px-4 py-2 text-sm text-right">
                        {formatCurrency(r.var)}
                      </td>
                      <td className="px-4 py-2 text-sm text-right">
                        {r.varPct !== null
                          ? (r.varPct * 100).toFixed(2) + "%"
                          : ""}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {/* Net Income */}
              {(() => {
                const inc = sectionTotals(varianceRows.income);
                const cog = sectionTotals(varianceRows.cogs);
                const exp = sectionTotals(varianceRows.expenses);
                const a = inc.a + cog.a + exp.a;
                const b = inc.b + cog.b + exp.b;
                const v = a - b;
                const vp = b ? v / Math.abs(b) : null;
                const color = (n: number) =>
                  n >= 0 ? "text-green-800" : "text-red-800";
                return (
                  <tr className="bg-gray-100">
                    <td className="!bg-gray-100 px-4 py-2 text-sm font-bold text-gray-800">
                      NET INCOME
                    </td>
                    <td
                      className={`px-4 py-2 text-sm font-bold text-right ${color(a)}`}
                    >
                      {formatCurrency(a)}
                    </td>
                    <td
                      className={`px-4 py-2 text-sm font-bold text-right ${color(b)}`}
                    >
                      {formatCurrency(b)}
                    </td>
                    <td
                      className={`px-4 py-2 text-sm font-bold text-right ${color(v)}`}
                    >
                      {formatCurrency(v)}
                    </td>
                    <td
                      className={`px-4 py-2 text-sm font-bold text-right ${color(v)}`}
                    >
                      {vp !== null ? (vp * 100).toFixed(2) + "%" : ""}
                    </td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[80vh] flex flex-col">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-semibold">{modalTitle} - Transaction Details</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Date
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Memo
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                      Amount
                    </th>
                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                      Customer
                    </th>
                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                      Set
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {modalTransactions.map((t, idx) => {
                    const amt = (Number(t.credit) || 0) - (Number(t.debit) || 0);
                    return (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-sm">{formatDate(t.date)}</td>
                        <td className="px-4 py-2 text-sm">{t.memo || ""}</td>
                        <td
                          className={`px-4 py-2 text-sm text-right ${
                            amt >= 0 ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {formatCurrency(Math.abs(amt))}
                        </td>
                        <td className="px-4 py-2 text-sm text-center">
                          {t.customer || ""}
                        </td>
                        <td className="px-4 py-2 text-sm text-center">{t.set}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
