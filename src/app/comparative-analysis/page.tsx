"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import DateRangePicker from "@/components/DateRangePicker";
import CustomerMultiSelect from "@/components/CustomerMultiSelect";
import { 
  Download, 
  RefreshCw, 
  X, 
  TrendingUp, 
  TrendingDown, 
  AlertCircle,
  CheckCircle2,
  Sparkles
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { parse } from "date-fns";

const BRAND_COLORS = {
  primary: "#56B6E9",
  success: "#10B981",
  warning: "#F59E0B", 
  danger: "#EF4444",
  gray: {
    50: '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#D1D5DB',
    600: '#4B5563',
    700: '#374151',
    800: '#1F2937'
  }
};

type KPIs = {
  revenue: number;
  cogs: number;
  grossProfit: number;
  opEx: number;
  netIncome: number;
};

type Insight = {
  type: 'positive' | 'negative' | 'neutral' | 'warning';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
};

export default function EnhancedComparativeAnalysis() {
  const [startA, setStartA] = useState("");
  const [endA, setEndA] = useState("");
  const [startB, setStartB] = useState("");
  const [endB, setEndB] = useState("");
  const [selectedCustomers, setSelectedCustomers] = useState<Set<string>>(new Set(["All Customers"]));
  const [customers, setCustomers] = useState<string[]>([]);
  const [dataA, setDataA] = useState<KPIs | null>(null);
  const [dataB, setDataB] = useState<KPIs | null>(null);
  const [varianceRows, setVarianceRows] = useState<{
    income: any[];
    cogs: any[];
    expenses: any[];
  }>({ income: [], cogs: [], expenses: [] });
  const [weeklyData, setWeeklyData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allLinesA, setAllLinesA] = useState<any[]>([]);
  const [allLinesB, setAllLinesB] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalTransactions, setModalTransactions] = useState<any[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);

  // Labels for display
  const [labelA, setLabelA] = useState("A");
  const [labelB, setLabelB] = useState("B");

  useEffect(() => {
    fetchCustomers();
  }, []);

  // Update labels when selections change
  useEffect(() => {
    const formatPeriodLabel = (start: string, end: string) => {
      if (!start || !end) return "";
      const startDate = parse(start, "yyyy-MM-dd", new Date());
      const endDate = parse(end, "yyyy-MM-dd", new Date());
      if (start === end) {
        return startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      }
      return `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    };

    setLabelA(formatPeriodLabel(startA, endA) || "Period A");
    setLabelB(formatPeriodLabel(startB, endB) || "Period B");
  }, [startA, endA, startB, endB]);

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

  const fetchLines = async (start: string, end: string, customersFilter?: string[]) => {
    let query = supabase
      .from("journal_entry_lines")
      .select("account, account_type, debit, credit, class, date, customer")
      .gte("date", start)
      .lte("date", end);

    if (
      customersFilter &&
      customersFilter.length > 0 &&
      !customersFilter.includes("All Customers")
    ) {
      query = query.in("customer", customersFilter);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  };

  const computeKPIs = (lines: any[]): KPIs => {
    let revenue = 0, cogs = 0, opEx = 0;
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

  const generateInsights = (dataA: KPIs, dataB: KPIs, labelA: string, labelB: string): Insight[] => {
    const insights: Insight[] = [];
    
    // Revenue comparison - focus on dollar amounts
    const revDifference = dataA.revenue - dataB.revenue;
    if (Math.abs(revDifference) > 10000) { // Only show if difference is meaningful ($10k+)
      const winner = revDifference > 0 ? labelA : labelB;
      const loser = revDifference > 0 ? labelB : labelA;
      insights.push({
        type: revDifference > 0 ? 'positive' : 'negative',
        title: `${winner} Outperforming in Revenue`,
        description: `${winner} generated ${formatCurrency(Math.abs(revDifference))} more revenue than ${loser}. This represents a significant performance gap that should be investigated.`,
        impact: Math.abs(revDifference) > 100000 ? 'high' : Math.abs(revDifference) > 50000 ? 'medium' : 'low'
      });
    }

    // Profit comparison - focus on dollar amounts
    const profitDifference = dataA.netIncome - dataB.netIncome;
    if (Math.abs(profitDifference) > 5000) { // Only show if difference is meaningful ($5k+)
      const winner = profitDifference > 0 ? labelA : labelB;
      const loser = profitDifference > 0 ? labelB : labelA;
      insights.push({
        type: profitDifference > 0 ? 'positive' : 'negative',
        title: `${winner} More Profitable`,
        description: `${winner} made ${formatCurrency(Math.abs(profitDifference))} more profit than ${loser}. This shows ${winner} is operating more efficiently or has better cost control.`,
        impact: Math.abs(profitDifference) > 50000 ? 'high' : Math.abs(profitDifference) > 25000 ? 'medium' : 'low'
      });
    }

    // Cost efficiency comparison
    const expenseDifference = Math.abs(dataA.opEx) - Math.abs(dataB.opEx);
    if (Math.abs(expenseDifference) > 5000) { // Only show if difference is meaningful ($5k+)
      const moreEfficient = expenseDifference < 0 ? labelA : labelB;
      const lessEfficient = expenseDifference < 0 ? labelB : labelA;
      insights.push({
        type: 'neutral',
        title: `${moreEfficient} Operating More Efficiently`,
        description: `${moreEfficient} spent ${formatCurrency(Math.abs(expenseDifference))} less on operating expenses than ${lessEfficient}. This cost advantage contributes to better profitability.`,
        impact: Math.abs(expenseDifference) > 25000 ? 'high' : Math.abs(expenseDifference) > 15000 ? 'medium' : 'low'
      });
    }

    // Gross profit comparison
    const grossProfitDifference = dataA.grossProfit - dataB.grossProfit;
    if (Math.abs(grossProfitDifference) > 10000) { // Only show if difference is meaningful ($10k+)
      const winner = grossProfitDifference > 0 ? labelA : labelB;
      const loser = grossProfitDifference > 0 ? labelB : labelA;
      insights.push({
        type: grossProfitDifference > 0 ? 'positive' : 'warning',
        title: `${winner} Generating More Gross Profit`,
        description: `${winner} achieved ${formatCurrency(Math.abs(grossProfitDifference))} more gross profit than ${loser}. This indicates better pricing, lower costs, or higher sales volume.`,
        impact: Math.abs(grossProfitDifference) > 75000 ? 'high' : Math.abs(grossProfitDifference) > 35000 ? 'medium' : 'low'
      });
    }

    return insights.slice(0, 3); // Keep top 3 insights
  };

  const aggregateWeekly = (linesA: any[], linesB: any[]) => {
    const weeks = new Map<string, { A: KPIs; B: KPIs }>();
    
    const processLines = (lines: any[], key: 'A' | 'B') => {
      lines.forEach((line) => {
        const date = parse(line.date, "yyyy-MM-dd", new Date());
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        const weekKey = weekStart.toISOString().split('T')[0];
        
        if (!weeks.has(weekKey)) {
          weeks.set(weekKey, {
            A: { revenue: 0, cogs: 0, grossProfit: 0, opEx: 0, netIncome: 0 },
            B: { revenue: 0, cogs: 0, grossProfit: 0, opEx: 0, netIncome: 0 }
          });
        }
        
        const week = weeks.get(weekKey)!;
        const amount = (Number(line.credit) || 0) - (Number(line.debit) || 0);
        const type = (line.account_type || "").toLowerCase();
        
        if (type.includes("income") || type.includes("revenue")) {
          week[key].revenue += amount;
        } else if (type.includes("cost of goods sold")) {
          week[key].cogs += amount;
        } else if (type.includes("expense")) {
          week[key].opEx += amount;
        }
      });
    };
    
    processLines(linesA, 'A');
    processLines(linesB, 'B');
    
    return Array.from(weeks.entries())
      .map(([week, data]) => {
        data.A.grossProfit = data.A.revenue + data.A.cogs;
        data.A.netIncome = data.A.grossProfit + data.A.opEx;
        data.B.grossProfit = data.B.revenue + data.B.cogs;
        data.B.netIncome = data.B.grossProfit + data.B.opEx;
        
        return {
          week,
          revenueA: data.A.revenue,
          revenueB: data.B.revenue,
          netIncomeA: data.A.netIncome,
          netIncomeB: data.B.netIncome,
          marginA: data.A.revenue ? (data.A.grossProfit / data.A.revenue) * 100 : 0,
          marginB: data.B.revenue ? (data.B.grossProfit / data.B.revenue) * 100 : 0
        };
      })
      .sort((a, b) => a.week.localeCompare(b.week));
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

  const fetchData = async () => {
    if (!startA || !endA || !startB || !endB || selectedCustomers.size === 0)
      return;

    setLoading(true);
    setError(null);
    try {
      const customerFilter = Array.from(selectedCustomers);
      const [linesA, linesB] = await Promise.all([
        fetchLines(startA, endA, customerFilter),
        fetchLines(startB, endB, customerFilter),
      ]);

      const kpiA = computeKPIs(linesA);
      const kpiB = computeKPIs(linesB);
      setDataA(kpiA);
      setDataB(kpiB);
      setVarianceRows(computeVarianceTable(linesA, linesB));
      setWeeklyData(aggregateWeekly(linesA, linesB));
      setAllLinesA(linesA);
      setAllLinesB(linesB);
      setInsights(generateInsights(kpiA, kpiB, labelA, labelB));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
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
    const header = `Account,${labelA},${labelB},Var $,Var %\n`;
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
    const inc = sectionTotals(varianceRows.income);
    const cog = sectionTotals(varianceRows.cogs);
    const gpA = inc.a + cog.a;
    const gpB = inc.b + cog.b;
    const gpVar = gpA - gpB;
    const gpVarPct = gpB ? gpVar / Math.abs(gpB) : null;
    lines.push(
      [
        "GROSS PROFIT",
        gpA.toFixed(2),
        gpB.toFixed(2),
        gpVar.toFixed(2),
        gpVarPct !== null ? (gpVarPct * 100).toFixed(2) + "%" : "",
      ].join(","),
    );
    const csv = header + lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "comparative-analysis.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'positive': return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'negative': return <AlertCircle className="w-5 h-5 text-red-500" />;
      case 'warning': return <AlertCircle className="w-5 h-5 text-yellow-500" />;
      default: return <Sparkles className="w-5 h-5 text-blue-500" />;
    }
  };

  const formatPercentage = (value: number) => {
    const abs = Math.abs(value);
    const sign = value >= 0 ? '+' : '';
    return `${sign}${abs.toFixed(1)}%`;
  };

  const getChangeColor = (value: number) => {
    if (value > 0) return 'text-green-600';
    if (value < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  const getChangeIcon = (value: number) => {
    if (value > 0) return <TrendingUp className="w-4 h-4" />;
    if (value < 0) return <TrendingDown className="w-4 h-4" />;
    return null;
  };

  return (
    <div className="p-6 space-y-8 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Comparative Analysis</h1>

        <div className="flex flex-wrap items-end gap-4">
          <CustomerMultiSelect
            options={customers}
            selected={selectedCustomers}
            onChange={setSelectedCustomers}
            accentColor={BRAND_COLORS.primary}
            label="Customer"
          />

          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700 mb-2">Period A</label>
            <DateRangePicker
              startDate={startA}
              endDate={endA}
              onChange={(s, e) => {
                setStartA(s);
                setEndA(e);
              }}
              className="w-64"
            />
          </div>

          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700 mb-2">Period B</label>
            <DateRangePicker
              startDate={startB}
              endDate={endB}
              onChange={(s, e) => {
                setStartB(s);
                setEndB(e);
              }}
              className="w-64"
            />
          </div>

          <button
            onClick={fetchData}
            disabled={loading}
            className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 h-11"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Analyzing..." : "Analyze"}
          </button>
          
          <button
            onClick={handleExport}
            className="inline-flex items-center px-6 py-3 bg-gray-600 text-white rounded-lg text-sm font-medium hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 h-11"
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </button>
        </div>

        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}
      </div>

      {/* AI Insights */}
      {insights.length > 0 && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-6 border border-blue-100">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900">AI Analysis</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
            {insights.map((insight, idx) => (
              <div key={idx} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="flex items-start gap-3">
                  {getInsightIcon(insight.type)}
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900 mb-1">{insight.title}</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">{insight.description}</p>
                    <span className={`inline-block mt-2 px-2 py-1 rounded-full text-xs font-medium ${
                      insight.impact === 'high' ? 'bg-red-100 text-red-700' :
                      insight.impact === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-green-100 text-green-700'
                    }`}>
                      {insight.impact.toUpperCase()} IMPACT
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPI Comparison Cards */}
      {dataA && dataB && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          {[
            { key: 'revenue', label: 'Revenue', valueA: dataA.revenue, valueB: dataB.revenue },
            { key: 'grossProfit', label: 'Gross Profit', valueA: dataA.grossProfit, valueB: dataB.grossProfit },
            { key: 'opEx', label: 'Operating Expenses', valueA: Math.abs(dataA.opEx), valueB: Math.abs(dataB.opEx) },
            { key: 'netIncome', label: 'Net Income', valueA: dataA.netIncome, valueB: dataB.netIncome },
            { 
              key: 'margin', 
              label: 'Gross Margin', 
              valueA: dataA.revenue ? (dataA.grossProfit / dataA.revenue) * 100 : 0,
              valueB: dataB.revenue ? (dataB.grossProfit / dataB.revenue) * 100 : 0,
              isPercentage: true
            }
          ].map((metric) => {
            const change = metric.valueA - metric.valueB;
            const changePercent = metric.valueB !== 0 ? (change / Math.abs(metric.valueB)) * 100 : 0;
            
            return (
              <div key={metric.key} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-gray-600">{metric.label}</h3>
                  <div className={`flex items-center gap-1 ${getChangeColor(change)}`}>
                    {getChangeIcon(change)}
                    <span className="text-xs font-medium">
                      {formatPercentage(changePercent)}
                    </span>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">{labelA}</p>
                    <p className="text-xl font-bold text-gray-900">
                      {metric.isPercentage ? `${metric.valueA.toFixed(1)}%` : formatCurrency(metric.valueA)}
                    </p>
                  </div>
                  
                  <div>
                    <p className="text-xs text-gray-500 mb-1">{labelB}</p>
                    <p className="text-sm text-gray-600">
                      {metric.isPercentage ? `${metric.valueB.toFixed(1)}%` : formatCurrency(metric.valueB)}
                    </p>
                  </div>
                  
                  <div className="pt-2 border-t border-gray-100">
                    <p className="text-xs text-gray-500 mb-1">Variance</p>
                    <p className={`text-sm font-medium ${getChangeColor(change)}`}>
                      {metric.isPercentage ? 
                        `${change >= 0 ? '+' : ''}${change.toFixed(1)}pts` : 
                        `${change >= 0 ? '+' : ''}${formatCurrency(change)}`
                      }
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Weekly Trend Chart */}
      {weeklyData.length > 0 && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Weekly Performance Trends</h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Revenue Trend */}
            <div>
              <h3 className="text-lg font-medium text-gray-700 mb-4">Revenue Comparison</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={weeklyData} margin={{ left: 20, right: 20, top: 20, bottom: 20 }}>
                    <XAxis
                      dataKey="week"
                      tickFormatter={(value) =>
                        parse(value as string, "yyyy-MM-dd", new Date()).toLocaleDateString(
                          "en-US",
                          { month: "short", day: "numeric" },
                        )
                      }
                      stroke="#6B7280"
                      fontSize={12}
                    />
                    <YAxis 
                      tickFormatter={(v) => formatCurrency(v)} 
                      stroke="#6B7280"
                      fontSize={12}
                    />
                    <Tooltip
                      formatter={(value) => formatCurrency(Number(value))}
                      labelFormatter={(value) =>
                        `Week of ${parse(value as string, "yyyy-MM-dd", new Date()).toLocaleDateString()}`
                      }
                      contentStyle={{
                        backgroundColor: "white",
                        border: "1px solid #E5E7EB",
                        borderRadius: "8px",
                      }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="revenueA" 
                      stroke={BRAND_COLORS.primary}
                      strokeWidth={3}
                      dot={{ fill: BRAND_COLORS.primary, strokeWidth: 2, r: 4 }}
                      name={labelA}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="revenueB" 
                      stroke={BRAND_COLORS.gray[600]}
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={{ fill: BRAND_COLORS.gray[600], strokeWidth: 2, r: 3 }}
                      name={labelB}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Net Income Trend */}
            <div>
              <h3 className="text-lg font-medium text-gray-700 mb-4">Net Income Comparison</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={weeklyData} margin={{ left: 20, right: 20, top: 20, bottom: 20 }}>
                    <XAxis
                      dataKey="week"
                      tickFormatter={(value) =>
                        parse(value as string, "yyyy-MM-dd", new Date()).toLocaleDateString(
                          "en-US",
                          { month: "short", day: "numeric" },
                        )
                      }
                      stroke="#6B7280"
                      fontSize={12}
                    />
                    <YAxis 
                      tickFormatter={(v) => formatCurrency(v)} 
                      stroke="#6B7280"
                      fontSize={12}
                    />
                    <Tooltip
                      formatter={(value) => formatCurrency(Number(value))}
                      labelFormatter={(value) =>
                        `Week of ${parse(value as string, "yyyy-MM-dd", new Date()).toLocaleDateString()}`
                      }
                      contentStyle={{
                        backgroundColor: "white",
                        border: "1px solid #E5E7EB",
                        borderRadius: "8px",
                      }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="netIncomeA" 
                      stroke={BRAND_COLORS.success}
                      strokeWidth={3}
                      dot={{ fill: BRAND_COLORS.success, strokeWidth: 2, r: 4 }}
                      name={labelA}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="netIncomeB" 
                      stroke={BRAND_COLORS.gray[600]}
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={{ fill: BRAND_COLORS.gray[600], strokeWidth: 2, r: 3 }}
                      name={labelB}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detailed Variance Table */}
      {(varianceRows.income.length > 0 ||
        varianceRows.cogs.length > 0 ||
        varianceRows.expenses.length > 0) && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-xl font-semibold text-gray-900">Account-Level Analysis</h2>
            <p className="text-sm text-gray-600 mt-1">Detailed variance breakdown by account</p>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Account
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {labelA}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {labelB}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Variance $
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Variance %
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
                            <td className="px-6 py-4 text-sm font-bold text-green-800">
                              REVENUE
                            </td>
                            <td className="px-6 py-4 text-sm font-bold text-green-800 text-right">
                              {formatCurrency(t.a)}
                            </td>
                            <td className="px-6 py-4 text-sm font-bold text-green-800 text-right">
                              {formatCurrency(t.b)}
                            </td>
                            <td className="px-6 py-4 text-sm font-bold text-green-800 text-right">
                              {formatCurrency(t.var)}
                            </td>
                            <td className="px-6 py-4 text-sm font-bold text-green-800 text-right">
                              {t.varPct !== null
                                ? formatPercentage(t.varPct * 100)
                                : ""}
                            </td>
                          </>
                        );
                      })()}
                    </tr>
                    {varianceRows.income.slice(0, 10).map((r) => (
                      <tr
                        key={r.account}
                        onClick={() => showTransactionDetails(r.account)}
                        className="hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {r.account}
                        </td>
                        <td className="px-6 py-4 text-sm text-right text-gray-900">
                          {formatCurrency(r.a)}
                        </td>
                        <td className="px-6 py-4 text-sm text-right text-gray-600">
                          {formatCurrency(r.b)}
                        </td>
                        <td className={`px-6 py-4 text-sm text-right font-medium ${getChangeColor(r.var)}`}>
                          {formatCurrency(r.var)}
                        </td>
                        <td className={`px-6 py-4 text-sm text-right font-medium ${getChangeColor(r.var)}`}>
                          {r.varPct !== null
                            ? formatPercentage(r.varPct * 100)
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
                            <td className="px-6 py-4 text-sm font-bold text-yellow-800">
                              COST OF GOODS SOLD
                            </td>
                            <td className="px-6 py-4 text-sm font-bold text-yellow-800 text-right">
                              {formatCurrency(t.a)}
                            </td>
                            <td className="px-6 py-4 text-sm font-bold text-yellow-800 text-right">
                              {formatCurrency(t.b)}
                            </td>
                            <td className="px-6 py-4 text-sm font-bold text-yellow-800 text-right">
                              {formatCurrency(t.var)}
                            </td>
                            <td className="px-6 py-4 text-sm font-bold text-yellow-800 text-right">
                              {t.varPct !== null
                                ? formatPercentage(t.varPct * 100)
                                : ""}
                            </td>
                          </>
                        );
                      })()}
                    </tr>
                    {varianceRows.cogs.slice(0, 10).map((r) => (
                      <tr
                        key={r.account}
                        onClick={() => showTransactionDetails(r.account)}
                        className="hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {r.account}
                        </td>
                        <td className="px-6 py-4 text-sm text-right text-gray-900">
                          {formatCurrency(r.a)}
                        </td>
                        <td className="px-6 py-4 text-sm text-right text-gray-600">
                          {formatCurrency(r.b)}
                        </td>
                        <td className={`px-6 py-4 text-sm text-right font-medium ${getChangeColor(r.var)}`}>
                          {formatCurrency(r.var)}
                        </td>
                        <td className={`px-6 py-4 text-sm text-right font-medium ${getChangeColor(r.var)}`}>
                          {r.varPct !== null
                            ? formatPercentage(r.varPct * 100)
                            : ""}
                        </td>
                      </tr>
                    ))}
                  </>
                )}

                {/* Gross Profit Summary */}
                {(() => {
                  if (
                    varianceRows.income.length > 0 ||
                    varianceRows.cogs.length > 0
                  ) {
                    const inc = sectionTotals(varianceRows.income);
                    const cog = sectionTotals(varianceRows.cogs);
                    const a = inc.a + cog.a;
                    const b = inc.b + cog.b;
                    const v = a - b;
                    const vp = b ? v / Math.abs(b) : null;

                    return (
                      <tr className="bg-blue-50">
                        <td className="px-6 py-4 text-sm font-bold text-blue-800">
                          GROSS PROFIT
                        </td>
                        <td className="px-6 py-4 text-sm font-bold text-blue-800 text-right">
                          {formatCurrency(a)}
                        </td>
                        <td className="px-6 py-4 text-sm font-bold text-blue-800 text-right">
                          {formatCurrency(b)}
                        </td>
                        <td className={`px-6 py-4 text-sm font-bold text-right ${getChangeColor(v)}`}>
                          {formatCurrency(v)}
                        </td>
                        <td className={`px-6 py-4 text-sm font-bold text-right ${getChangeColor(v)}`}>
                          {vp !== null ? formatPercentage(vp * 100) : ""}
                        </td>
                      </tr>
                    );
                  }
                  return null;
                })()}

                {/* Expenses Section */}
                {varianceRows.expenses.length > 0 && (
                  <>
                    <tr className="bg-red-50">
                      {(() => {
                        const t = sectionTotals(varianceRows.expenses);
                        return (
                          <>
                            <td className="px-6 py-4 text-sm font-bold text-red-800">
                              OPERATING EXPENSES
                            </td>
                            <td className="px-6 py-4 text-sm font-bold text-red-800 text-right">
                              {formatCurrency(t.a)}
                            </td>
                            <td className="px-6 py-4 text-sm font-bold text-red-800 text-right">
                              {formatCurrency(t.b)}
                            </td>
                            <td className="px-6 py-4 text-sm font-bold text-red-800 text-right">
                              {formatCurrency(t.var)}
                            </td>
                            <td className="px-6 py-4 text-sm font-bold text-red-800 text-right">
                              {t.varPct !== null
                                ? formatPercentage(t.varPct * 100)
                                : ""}
                            </td>
                          </>
                        );
                      })()}
                    </tr>
                    {varianceRows.expenses.slice(0, 10).map((r) => (
                      <tr
                        key={r.account}
                        onClick={() => showTransactionDetails(r.account)}
                        className="hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {r.account}
                        </td>
                        <td className="px-6 py-4 text-sm text-right text-gray-900">
                          {formatCurrency(r.a)}
                        </td>
                        <td className="px-6 py-4 text-sm text-right text-gray-600">
                          {formatCurrency(r.b)}
                        </td>
                        <td className={`px-6 py-4 text-sm text-right font-medium ${getChangeColor(r.var)}`}>
                          {formatCurrency(r.var)}
                        </td>
                        <td className={`px-6 py-4 text-sm text-right font-medium ${getChangeColor(r.var)}`}>
                          {r.varPct !== null
                            ? formatPercentage(r.varPct * 100)
                            : ""}
                        </td>
                      </tr>
                    ))}
                  </>
                )}

                {/* Net Income Summary */}
                {(() => {
                  const inc = sectionTotals(varianceRows.income);
                  const cog = sectionTotals(varianceRows.cogs);
                  const exp = sectionTotals(varianceRows.expenses);
                  const a = inc.a + cog.a + exp.a;
                  const b = inc.b + cog.b + exp.b;
                  const v = a - b;
                  const vp = b ? v / Math.abs(b) : null;
                  
                  return (
                    <tr className="bg-gray-100 border-t-2 border-gray-300">
                      <td className="px-6 py-4 text-sm font-bold text-gray-900">
                        NET INCOME
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-gray-900 text-right">
                        {formatCurrency(a)}
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-gray-700 text-right">
                        {formatCurrency(b)}
                      </td>
                      <td className={`px-6 py-4 text-sm font-bold text-right ${getChangeColor(v)}`}>
                        {formatCurrency(v)}
                      </td>
                      <td className={`px-6 py-4 text-sm font-bold text-right ${getChangeColor(v)}`}>
                        {vp !== null ? formatPercentage(vp * 100) : ""}
                      </td>
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Transaction Details Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-5xl w-full max-h-[80vh] flex flex-col shadow-2xl">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-xl font-semibold text-gray-900">{modalTitle} - Transaction Details</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Description
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Customer
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Set
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {modalTransactions.map((t, idx) => {
                    const amt = (Number(t.credit) || 0) - (Number(t.debit) || 0);
                    return (
                      <tr key={idx} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 text-sm text-gray-900">{formatDate(t.date)}</td>
                        <td className="px-6 py-4 text-sm text-gray-900">{t.memo || t.account}</td>
                        <td className={`px-6 py-4 text-sm text-right font-medium ${getChangeColor(amt)}`}>
                          {formatCurrency(Math.abs(amt))}
                        </td>
                        <td className="px-6 py-4 text-sm text-center text-gray-600">
                          {t.customer || "-"}
                        </td>
                        <td className="px-6 py-4 text-sm text-center">
                          <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                            t.set === 'A' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                          }`}>
                            {t.set === 'A' ? labelA : labelB}
                          </span>
                        </td>
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
