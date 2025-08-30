// src/server/functions.js
import { supabase } from '../lib/supabaseClient'

/** ---------- Small utils ---------- */
const HARD_ROW_CAP = 5000;              // safety ceiling for any raw fetch
const DEFAULT_TOP_ACCOUNTS = 10;

const clampLimit = (n, d = 100, max = 1000) =>
  Math.max(1, Math.min(Number.isFinite(+n) ? +n : d, max));

const safeLike = (s) =>
  (s ?? '').replace(/[%_]/g, ch => '\\' + ch); // escape % and _

const toISO = (s) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
const todayISO = () => new Date().toISOString().slice(0, 10);

/** Normalize A/R args the AI may send */
function normalizeARArgs(args = {}) {
  const {
    customer,
    customerId,
    startDate,
    endDate,
    dueOnly,
    status,
    minPastDueDays,
    limit,
    offset,
  } = args;

  return {
    customer: (customer ?? customerId) || null,
    startDate: toISO(startDate),
    endDate: toISO(endDate),
    dueOnly: typeof dueOnly === 'boolean' ? dueOnly : false,
    status: typeof status === 'string' ? status.toLowerCase() : null, // open|paid|overdue
    minPastDueDays: Number.isFinite(+minPastDueDays) ? +minPastDueDays : null,
    limit: clampLimit(limit, 100),
    offset: Number.isFinite(+offset) && +offset >= 0 ? +offset : 0,
  };
}

/** Normalize Financial args */
function normalizeFinArgs(args = {}) {
  const {
    startDate,
    endDate,
    accountLike,
    entity,
    groupByMonth,
    limit,
    offset,
  } = args;
  return {
    startDate: toISO(startDate),
    endDate: toISO(endDate),
    accountLike: accountLike ? safeLike(String(accountLike)) : null,
    entity: entity ? safeLike(String(entity)) : null,
    groupByMonth: !!groupByMonth,
    limit: clampLimit(limit, 500),
    offset: Number.isFinite(+offset) && +offset >= 0 ? +offset : 0,
  };
}

export const availableFunctions = {
  // =========================
  // A/R Aging Analysis (bucketed by due date)
  // =========================
  getARAgingAnalysis: async ({ customerId = null, customer = null } = {}) => {
    try {
      const cust = customer ?? customerId;
      let query = supabase
        .from('ar_aging_detail')
        .select('customer, due_date, open_balance, amount');

      if (cust) query = query.ilike('customer', `%${safeLike(cust)}%`);

      query = query
        .order('customer', { ascending: true })
        .order('due_date', { ascending: true });

      const { data: arData, error } = await query;
      if (error) throw error;

      if (!arData || arData.length === 0) {
        return {
          success: true,
          summary: 'No A/R data found',
          total_ar: 0,
          customer_count: 0,
          total_invoices: 0,
          message: 'No open invoices or aging data available',
        };
      }

      const currentDate = new Date();
      const agingAnalysis = arData.reduce((acc, record) => {
        const custName = record.customer || 'Unknown';
        const dueDate = record.due_date ? new Date(record.due_date) : null;
        const daysPastDue = dueDate ? Math.floor((+currentDate - +dueDate) / 86400000) : 0;
        const openBalance = record.open_balance ?? record.amount ?? 0;

        if (!acc[custName]) {
          acc[custName] = {
            customer_name: custName,
            current: 0,
            days_1_30: 0,
            days_31_60: 0,
            days_61_90: 0,
            days_over_90: 0,
            total_outstanding: 0,
            invoice_count: 0,
            oldest_invoice_days: 0,
          };
        }

        if (daysPastDue <= 0) acc[custName].current += openBalance;
        else if (daysPastDue <= 30) acc[custName].days_1_30 += openBalance;
        else if (daysPastDue <= 60) acc[custName].days_31_60 += openBalance;
        else if (daysPastDue <= 90) acc[custName].days_61_90 += openBalance;
        else acc[custName].days_over_90 += openBalance;

        acc[custName].total_outstanding += openBalance;
        acc[custName].invoice_count += 1;
        acc[custName].oldest_invoice_days = Math.max(acc[custName].oldest_invoice_days, daysPastDue);
        return acc;
      }, {});

      const customers = Object.values(agingAnalysis);
      const totalAR = customers.reduce((sum, c) => sum + c.total_outstanding, 0);

      return {
        success: true,
        summary: 'Current A/R aging analysis based on due dates',
        total_ar: totalAR,
        customer_count: customers.length,
        total_invoices: arData.length,
        customers,
        aging_summary: {
          current: customers.reduce((s, c) => s + c.current, 0),
          days_1_30: customers.reduce((s, c) => s + c.days_1_30, 0),
          days_31_60: customers.reduce((s, c) => s + c.days_31_60, 0),
          days_61_90: customers.reduce((s, c) => s + c.days_61_90, 0),
          days_over_90: customers.reduce((s, c) => s + c.days_over_90, 0),
        },
        risk_analysis: {
          high_risk: customers.filter(c => c.days_over_90 > 1000),
          medium_risk: customers.filter(c => c.days_61_90 > 500),
          current_good: customers.filter(c => c.current > c.days_1_30),
          worst_aging: [...customers].sort((a, b) => b.oldest_invoice_days - a.oldest_invoice_days).slice(0, 5),
        },
        insights: {
          largest_outstanding: customers.reduce(
            (max, c) => (c.total_outstanding > (max.total_outstanding || 0) ? c : max),
            {}
          ),
          collection_priority: customers
            .filter(c => c.days_over_90 > 0)
            .sort((a, b) => b.days_over_90 - a.days_over_90)
            .slice(0, 5),
          aging_percentage: {
            current_pct: totalAR > 0 ? (customers.reduce((s, c) => s + c.current, 0) / totalAR) * 100 : 0,
            past_due_pct: totalAR > 0 ? ((totalAR - customers.reduce((s, c) => s + c.current, 0)) / totalAR) * 100 : 0,
          },
        },
      };
    } catch (error) {
      console.error('❌ getARAgingAnalysis error:', error);
      return { success: false, error: 'Failed to analyze A/R aging', details: error.message };
    }
  },

  // =========================
  // A/R Payment History (journal_entry_lines subset)
  // =========================
  getARPaymentHistory: async ({ customerId = null, customer = null, timeframe = '6_months' } = {}) => {
    try {
      const cust = customer ?? customerId;
      let query = supabase
        .from('journal_entry_lines')
        .select('date, account, account_type, debit, credit, customer, name');

      query = query.or('account.ilike.%Accounts Receivable%,account.ilike.%A/R%,account.ilike.%AR%,account_type.ilike.%Accounts Receivable%');
      if (cust) query = query.ilike('customer', `%${safeLike(cust)}%`);

      const dateLimit = new Date();
      if (timeframe === '6_months') dateLimit.setMonth(dateLimit.getMonth() - 6);
      else if (timeframe === '3_months') dateLimit.setMonth(dateLimit.getMonth() - 3);
      else if (timeframe === '12_months') dateLimit.setFullYear(dateLimit.getFullYear() - 1);

      query = query
        .gte('date', dateLimit.toISOString().slice(0, 10))
        .order('date', { ascending: true })
        .limit(5000);

      const { data: journalData, error } = await query;
      if (error) throw error;

      if (!journalData || journalData.length === 0) {
        return {
          success: true,
          summary: `No A/R payment data found for ${timeframe}`,
          timeframe,
          message: 'No A/R transactions found in the specified period',
        };
      }

      const paymentAnalysis = journalData.reduce((acc, entry) => {
        const custName = entry.customer || entry.name || 'Unknown';
        const month = String(entry.date).substring(0, 7);

        if (!acc[custName]) {
          acc[custName] = {
            customer_name: custName,
            total_invoiced: 0,
            total_paid: 0,
            payment_months: {},
            transaction_count: 0,
          };
        }

        // Debit increases AR (invoice), Credit decreases AR (payment)
        if ((entry.credit || 0) > 0) {
          acc[custName].total_paid += entry.credit || 0;
          acc[custName].payment_months[month] = (acc[custName].payment_months[month] || 0) + (entry.credit || 0);
        } else if ((entry.debit || 0) > 0) {
          acc[custName].total_invoiced += entry.debit || 0;
        }

        acc[custName].transaction_count += 1;
        return acc;
      }, {});

      const customers = Object.values(paymentAnalysis);
      const overallInvoiced = customers.reduce((sum, c) => sum + c.total_invoiced, 0);
      const overallPaid = customers.reduce((sum, c) => sum + c.total_paid, 0);

      return {
        success: true,
        summary: `A/R payment history analysis for ${timeframe}`,
        timeframe,
        customers,
        overall_stats: {
          total_invoiced: overallInvoiced,
          total_paid: overallPaid,
          collection_rate: overallInvoiced > 0 ? overallPaid / overallInvoiced : 0,
        },
        best_payers: customers
          .filter(c => c.total_invoiced > 0)
          .map(c => ({ ...c, payment_rate: c.total_paid / c.total_invoiced }))
          .filter(c => c.payment_rate > 0.95)
          .sort((a, b) => b.total_paid - a.total_paid)
          .slice(0, 5),
        slow_payers: customers
          .filter(c => c.total_invoiced > 0)
          .map(c => ({ ...c, payment_rate: c.total_paid / c.total_invoiced }))
          .filter(c => c.payment_rate < 0.8)
          .sort((a, b) => a.payment_rate - b.payment_rate)
          .slice(0, 5),
      };
    } catch (error) {
      console.error('❌ getARPaymentHistory error:', error);
      return { success: false, error: 'Failed to analyze payment history', details: error.message };
    }
  },

  // =========================
  // Payroll Payments Summary
  // =========================
  getPaymentsSummary: async ({
    startDate = null,
    endDate = null,
    employee = null,
    department = null,
    minAmount = null,
    maxAmount = null,
    limit = 500,
    offset = 0,
  } = {}) => {
    try {
      let query = supabase
        .from('payments')
        .select('date, department, first_name, last_name, total_amount', { count: 'exact' });

      if (startDate) query = query.gte('date', toISO(startDate) || startDate);
      if (endDate) query = query.lte('date', toISO(endDate) || endDate);
      if (department) query = query.ilike('department', `%${safeLike(department)}%`);
      if (employee) {
        const e = safeLike(employee);
        query = query.or(`first_name.ilike.%${e}%,last_name.ilike.%${e}%`);
      }
      if (minAmount !== null) query = query.gte('total_amount', +minAmount);
      if (maxAmount !== null) query = query.lte('total_amount', +maxAmount);

      query = query
        .order('date', { ascending: true })
        .range(offset, offset + clampLimit(limit, 500) - 1);

      const { data, error, count } = await query;
      if (error) throw error;

      if (!data || data.length === 0) {
        return {
          success: true,
          summary: 'No payment data found',
          total_payroll: 0,
          department_breakdown: {},
          employee_breakdown: {},
          payments: [],
          pagination: { count: count ?? 0, limit, offset },
        };
      }

      const total = data.reduce((sum, p) => sum + (p.total_amount || 0), 0);
      const departmentBreakdown = data.reduce((acc, p) => {
        const dept = p.department || 'Unknown';
        acc[dept] = (acc[dept] || 0) + (p.total_amount || 0);
        return acc;
      }, {});
      const employeeBreakdown = data.reduce((acc, p) => {
        const name = [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown';
        acc[name] = (acc[name] || 0) + (p.total_amount || 0);
        return acc;
      }, {});

      return {
        success: true,
        summary: 'Payroll payment summary',
        total_payroll: total,
        department_breakdown: departmentBreakdown,
        employee_breakdown: employeeBreakdown,
        payments: data,
        pagination: { count: count ?? data.length, limit, offset },
      };
    } catch (error) {
      console.error('❌ getPaymentsSummary error:', error);
      return { success: false, error: 'Failed to fetch payments', details: error.message };
    }
  },

  // =========================
  // A/R Aging Detail (Invoices) — full filters used by AI
  // =========================
  getARAgingDetail: async (raw = {}) => {
    try {
      const { customer, startDate, endDate, dueOnly, status, minPastDueDays, limit, offset } = normalizeARArgs(raw);

      let query = supabase
        .from('ar_aging_detail')
        .select('customer, invoice_number, invoice_date, due_date, status, amount, open_balance', { count: 'exact' });

      if (customer) query = query.ilike('customer', `%${safeLike(customer)}%`);

      if (startDate) query = query.gte('due_date', startDate);
      if (endDate) query = query.lte('due_date', endDate);

      if (status === 'open') query = query.eq('status', 'open');
      else if (status === 'paid') query = query.eq('status', 'paid');
      else if (status === 'overdue') query = query.eq('status', 'open').lt('due_date', todayISO());

      if (dueOnly) query = query.eq('status', 'open');

      query = query
        .order('due_date', { ascending: true })
        .order('customer', { ascending: true })
        .range(offset, offset + limit - 1);

      const { data, error, count } = await query;
      if (error) throw error;

      let records = data || [];
      if (Number.isFinite(minPastDueDays) && minPastDueDays > 0) {
        const now = new Date();
        records = records.filter(r => {
          if (!r.due_date || r.status !== 'open') return false;
          const dpd = Math.floor((+now - +new Date(r.due_date)) / 86400000);
          return dpd >= minPastDueDays;
        });
      }

      const totalOutstanding = records.reduce((sum, r) => sum + (r.open_balance ?? r.amount ?? 0), 0);

      return {
        success: true,
        summary: 'A/R aging detail',
        total_outstanding: totalOutstanding,
        invoice_count: records.length,
        records,
        pagination: { count: count ?? records.length, limit, offset },
      };
    } catch (error) {
      console.error('❌ getARAgingDetail error:', error);
      return { success: false, error: 'Failed to fetch A/R aging detail', details: error.message };
    }
  },

  // Friendly aliases the AI router might choose
  getAROpenInvoices: async (args = {}) => availableFunctions.getARAgingDetail({ ...args, status: args.status ?? 'open' }),
  getARInvoices: async (args = {}) => availableFunctions.getARAgingDetail(args),

  // =========================
  // Financial Summary (count-gated & aggregate-first)
  // =========================
  getFinancialSummary: async (raw = {}) => {
    try {
      const {
        startDate = null,
        endDate = null,
        accountLike = null,
        entity = null,
        groupByMonth = true,
        metricsOnly = true,     // default to aggregates only
        detailLimit = 0,        // no detail rows by default
      } = raw;

      // 1) Count gate (HEAD)
      let countQuery = supabase
        .from('journal_entry_lines')
        .select('id', { count: 'exact', head: true });

      if (startDate) countQuery = countQuery.gte('date', startDate);
      if (endDate)   countQuery = countQuery.lte('date', endDate);
      if (accountLike) countQuery = countQuery.ilike('account', `%${safeLike(accountLike)}%`);
      if (entity) countQuery = countQuery.or(`customer.ilike.%${safeLike(entity)}%,entity.ilike.%${safeLike(entity)}%`);

      const { count, error: countErr } = await countQuery;
      if (countErr) throw countErr;

      const tooBig = (count ?? 0) > HARD_ROW_CAP;

      // 2) Aggregate path (only necessary columns)
      let aggQuery = supabase
        .from('journal_entry_lines')
        .select('date, account, debit, credit, customer, entity');

      if (startDate) aggQuery = aggQuery.gte('date', startDate);
      if (endDate)   aggQuery = aggQuery.lte('date', endDate);
      if (accountLike) aggQuery = aggQuery.ilike('account', `%${safeLike(accountLike)}%`);
      if (entity) aggQuery = aggQuery.or(`customer.ilike.%${safeLike(entity)}%,entity.ilike.%${safeLike(entity)}%`);

      const { data, error } = await aggQuery.limit(HARD_ROW_CAP);
      if (error) throw error;

      const totals = data.reduce(
        (acc, e) => {
          acc.debit  += e.debit  || 0;
          acc.credit += e.credit || 0;
          return acc;
        },
        { debit: 0, credit: 0 }
      );

      const accountMap = data.reduce((acc, e) => {
        const acct = e.account || 'Unknown';
        if (!acc[acct]) acc[acct] = { debit: 0, credit: 0 };
        acc[acct].debit  += e.debit  || 0;
        acc[acct].credit += e.credit || 0;
        return acc;
      }, {});

      const topAccounts = Object.entries(accountMap)
        .map(([account, v]) => ({
          account,
          debit: v.debit,
          credit: v.credit,
          net: (v.credit || 0) - (v.debit || 0),
        }))
        .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
        .slice(0, DEFAULT_TOP_ACCOUNTS);

      const monthly = groupByMonth
        ? data.reduce((acc, e) => {
            const month = String(e.date).substring(0, 7);
            if (!acc[month]) acc[month] = { debit: 0, credit: 0, net: 0 };
            acc[month].debit  += e.debit  || 0;
            acc[month].credit += e.credit || 0;
            acc[month].net     = acc[month].credit - acc[month].debit;
            return acc;
          }, {})
        : undefined;

      const base = {
        success: true,
        summary: 'Financial summary',
        total_debit: totals.debit,
        total_credit: totals.credit,
        net: totals.credit - totals.debit,
        top_accounts: topAccounts,
        ...(groupByMonth ? { monthly_net: monthly } : {}),
        meta: {
          row_count: count ?? data.length,
          capped: tooBig || metricsOnly || detailLimit === 0,
          window: { startDate, endDate },
        },
      };

      if (metricsOnly || detailLimit === 0 || tooBig) {
        return base;
      }

      // 3) Optional small detail slice
      let detailQuery = supabase
        .from('journal_entry_lines')
        .select('date, account, debit, credit, customer, entity')
        .order('date', { ascending: true })
        .limit(Math.min(detailLimit, 200));

      if (startDate) detailQuery = detailQuery.gte('date', startDate);
      if (endDate)   detailQuery = detailQuery.lte('date', endDate);
      if (accountLike) detailQuery = detailQuery.ilike('account', `%${safeLike(accountLike)}%`);
      if (entity) detailQuery = detailQuery.or(`customer.ilike.%${safeLike(entity)}%,entity.ilike.%${safeLike(entity)}%`);

      const { data: details, error: detailErr } = await detailQuery;
      if (detailErr) throw detailErr;

      return {
        ...base,
        sample_details: details,
      };
    } catch (error) {
      console.error('❌ getFinancialSummary error:', error);
      return { success: false, error: 'Failed to summarize financial data', details: error.message };
    }
  },

  // =========================
  // Customer Net Income (lightly hardened)
  // =========================
  getCustomerNetIncome: async ({ customerId = null, customer = null, timeframe = 'current_month' } = {}) => {
    try {
      const cust = customer ?? customerId;
      const now = new Date();
      let gte, lte;

      if (timeframe === 'current_month') {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        gte = start.toISOString().split('T')[0];
      } else if (timeframe === 'last_month') {
        const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const end = new Date(now.getFullYear(), now.getMonth(), 0);
        gte = start.toISOString().split('T')[0];
        lte = end.toISOString().split('T')[0];
      }

      let query = supabase.from('journal_entry_lines').select('*');
      if (cust) query = query.ilike('customer', `%${safeLike(cust)}%`);
      if (gte) query = query.gte('date', gte);
      if (lte) query = query.lte('date', lte);
      query = query.order('date', { ascending: true });

      const { data, error } = await query;
      if (error) throw error;

      if (!data || data.length === 0) {
        return {
          success: true,
          summary: `No financial data found for ${timeframe}`,
          timeframe,
          message: 'No transactions found in the specified period',
        };
      }

      const grouped = data.reduce((acc, entry) => {
        const key = entry.customer || entry.name || 'Unallocated';
        if (!acc[key]) {
          acc[key] = {
            customer_name: key,
            customer_id: entry.customer,
            property: entry.property,
            revenue: 0,
            expenses: 0,
            net_income: 0,
            transaction_count: 0,
          };
        }

        if (
          (entry.account && (entry.account.includes('Income') || entry.account.includes('Revenue') || entry.account.includes('Sales'))) ||
          (entry.account_type && entry.account_type.includes('Income'))
        ) {
          acc[key].revenue += entry.credit || 0;
        }
        if (
          (entry.account && (entry.account.includes('Expense') || entry.account.includes('Cost') || entry.account.includes('COGS'))) ||
          (entry.account_type && entry.account_type.includes('Expense'))
        ) {
          acc[key].expenses += entry.debit || 0;
        }
        acc[key].transaction_count += 1;
        return acc;
      }, {});

      Object.values(grouped).forEach(c => { c.net_income = c.revenue - c.expenses; });
      const customers = Object.values(grouped);

      return {
        success: true,
        summary: `Customer net income analysis for ${timeframe}`,
        timeframe,
        total_customers: customers.length,
        customers: customers.sort((a, b) => b.net_income - a.net_income),
        company_totals: {
          total_revenue: customers.reduce((s, c) => s + c.revenue, 0),
          total_expenses: customers.reduce((s, c) => s + c.expenses, 0),
          total_net_income: customers.reduce((s, c) => s + c.net_income, 0),
        },
        top_performers: customers.filter(c => c.net_income > 0).slice(0, 5),
        underperformers: customers.filter(c => c.net_income < 0).slice(0, 5),
      };
    } catch (error) {
      console.error('❌ getCustomerNetIncome error:', error);
      return { success: false, error: 'Failed to analyze customer net income', details: error.message };
    }
  },

  // =========================
  // Account Trends (+ alias)
  // =========================
  getAccountTrends: async (raw = {}) => {
    try {
      const { startDate, endDate, accountLike, entity, limit, offset } = normalizeFinArgs(raw);

      let query = supabase
        .from('journal_entry_lines')
        .select('date, account, debit, credit, customer, entity', { count: 'exact' });

      if (startDate) query = query.gte('date', startDate);
      if (endDate)   query = query.lte('date', endDate);
      if (accountLike) query = query.ilike('account', `%${accountLike}%`);
      if (entity) query = query.or(`customer.ilike.%${entity}%,entity.ilike.%${entity}%`);

      query = query.order('date', { ascending: true }).range(offset, offset + limit - 1);

      const { data, error } = await query;
      if (error) throw error;

      if (!data || data.length === 0) {
        return { success: true, summary: 'No financial data found', trends: [] };
      }

      const trendMap = data.reduce((acc, e) => {
        const month = String(e.date).substring(0, 7);
        if (!acc[month]) acc[month] = 0;
        acc[month] += (e.credit || 0) - (e.debit || 0);
        return acc;
      }, {});

      const trends = Object.keys(trendMap)
        .sort()
        .map(month => ({ month, net: trendMap[month] }));

      return { success: true, summary: 'Monthly net trend', trends };
    } catch (error) {
      console.error('❌ getAccountTrends error:', error);
      return { success: false, error: 'Failed to fetch account trends', details: error.message };
    }
  },

  getGLTrends: async (args = {}) => availableFunctions.getAccountTrends(args),

  // =========================
  // Year-over-Year Comparison (kept, small harden)
  // =========================
  getYearOverYearComparison: async ({ customerId = null, customer = null, metric = 'all' } = {}) => {
    try {
      const cust = customer ?? customerId;
      const currentYear = new Date().getFullYear();
      const lastYear = currentYear - 1;

      const currentYearStart = `${currentYear}-01-01`;
      const currentYearEnd = todayISO();
      const lastYearStart = `${lastYear}-01-01`;
      const lastYearEnd = `${lastYear}-${todayISO().substring(5)}`;

      let currentQuery = supabase
        .from('journal_entry_lines')
        .select('*')
        .gte('date', currentYearStart)
        .lte('date', currentYearEnd);
      if (cust) currentQuery = currentQuery.ilike('customer', `%${safeLike(cust)}%`);

      let lastYearQuery = supabase
        .from('journal_entry_lines')
        .select('*')
        .gte('date', lastYearStart)
        .lte('date', lastYearEnd);
      if (cust) lastYearQuery = lastYearQuery.ilike('customer', `%${safeLike(cust)}%`);

      const [currentData, lastYearData] = await Promise.all([currentQuery, lastYearQuery]);
      if (currentData.error || lastYearData.error) {
        throw new Error(currentData.error?.message || lastYearData.error?.message);
      }

      const processFinancials = (rows, year) => {
        const summary = {
          year,
          revenue: 0,
          expenses: 0,
          net_income: 0,
          transaction_count: rows.length,
          customers: new Set(),
          properties: new Set(),
          monthly_breakdown: {},
        };

        rows.forEach(entry => {
          const month = String(entry.date).substring(0, 7);
          if (!summary.monthly_breakdown[month]) {
            summary.monthly_breakdown[month] = { revenue: 0, expenses: 0, net_income: 0 };
          }
          if (entry.customer) summary.customers.add(entry.customer);
          if (entry.property) summary.properties.add(entry.property);

          if (
            (entry.account && (entry.account.includes('Income') || entry.account.includes('Revenue') || entry.account.includes('Sales'))) ||
            (entry.account_type && entry.account_type.includes('Income'))
          ) {
            summary.revenue += entry.credit || 0;
            summary.monthly_breakdown[month].revenue += entry.credit || 0;
          }
          if (
            (entry.account && (entry.account.includes('Expense') || entry.account.includes('Cost') || entry.account.includes('COGS'))) ||
            (entry.account_type && entry.account_type.includes('Expense'))
          ) {
            summary.expenses += entry.debit || 0;
            summary.monthly_breakdown[month].expenses += entry.debit || 0;
          }
        });

        summary.net_income = summary.revenue - summary.expenses;
        summary.customer_count = summary.customers.size;
        summary.property_count = summary.properties.size;

        Object.keys(summary.monthly_breakdown).forEach(m => {
          summary.monthly_breakdown[m].net_income =
            summary.monthly_breakdown[m].revenue - summary.monthly_breakdown[m].expenses;
        });
        return summary;
      };

      const cur = processFinancials(currentData.data || [], currentYear);
      const prev = processFinancials(lastYearData.data || [], lastYear);

      const calc = (a, b) => {
        const change = a - b;
        const pct = b !== 0 ? (change / b) * 100 : a > 0 ? 100 : 0;
        return {
          current: a, previous: b, change, percent_change: pct,
          trend: change > 0 ? 'up' : change < 0 ? 'down' : 'flat'
        };
      };

      return {
        success: true,
        summary: `Year-over-year comparison: ${currentYear} vs ${lastYear}`,
        comparison_period: {
          current_year: currentYear,
          last_year: lastYear,
          current_period: `${currentYearStart} to ${currentYearEnd}`,
          comparison_period: `${lastYearStart} to ${lastYearEnd}`,
        },
        financial_comparison: {
          revenue:  calc(cur.revenue,  prev.revenue),
          expenses: calc(cur.expenses, prev.expenses),
          net_income: calc(cur.net_income, prev.net_income),
          profit_margin: {
            current:  cur.revenue  > 0 ? (cur.net_income  / cur.revenue ) * 100 : 0,
            previous: prev.revenue > 0 ? (prev.net_income / prev.revenue) * 100 : 0,
          },
        },
        business_metrics: {
          customers:    calc(cur.customer_count,  prev.customer_count),
          properties:   calc(cur.property_count,  prev.property_count),
          transactions: calc(cur.transaction_count, prev.transaction_count),
          avg_revenue_per_customer: {
            current:  cur.customer_count  > 0 ? cur.revenue / cur.customer_count   : 0,
            previous: prev.customer_count > 0 ? prev.revenue / prev.customer_count : 0,
          },
        },
        insights: {
          strongest_growth: cur.revenue > prev.revenue ? 'revenue' : 'cost_control',
          biggest_concern:  cur.expenses > prev.expenses * 1.1 ? 'expense_growth' : null,
          overall_performance: cur.net_income > prev.net_income ? 'improved' : 'declined',
          key_metrics: {
            revenue_growth: (((cur.revenue - prev.revenue) / (prev.revenue || 1)) * 100).toFixed(1),
            expense_growth: (((cur.expenses - prev.expenses) / (prev.expenses || 1)) * 100).toFixed(1),
            profit_growth:  (((cur.net_income - prev.net_income) / (Math.abs(prev.net_income) || 1)) * 100).toFixed(1),
          },
        },
        monthly_trends: {
          current_year: cur.monthly_breakdown,
          last_year:    prev.monthly_breakdown,
        },
      };
    } catch (error) {
      console.error('❌ getYearOverYearComparison error:', error);
      return { success: false, error: 'Failed to perform year-over-year comparison', details: error.message };
    }
  },
};
