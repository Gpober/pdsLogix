// src/server/functions.js
import { supabase } from '../lib/supabaseClient';

/* ============================================================================
   Utils
   ========================================================================== */

const HARD_ROW_CAP = 5000;          // maximum rows any single query will pull
const DEFAULT_TOP_ACCOUNTS = 10;
const DAY_MS = 86_400_000;

const clampLimit = (n, d = 100, max = 1000) =>
  Math.max(1, Math.min(Number.isFinite(+n) ? +n : d, max));

const safeLike = (s) => (s ?? '').replace(/[%_]/g, (ch) => '\\' + ch); // escape % and _
const toISO = (s) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
const todayISO = () => new Date().toISOString().slice(0, 10);

/** Normalize A/R args */
function normalizeARArgs(args = {}) {
  const {
    customer, customerId,
    startDate, endDate,
    dueOnly, status,           // 'open' | 'paid' | 'overdue' (derived from open_balance/due_date)
    minPastDueDays,
    limit, offset,
  } = args;

  return {
    customer: (customer ?? customerId) || null,
    startDate: toISO(startDate),
    endDate: toISO(endDate),
    dueOnly: typeof dueOnly === 'boolean' ? dueOnly : false,
    status: typeof status === 'string' ? status.toLowerCase() : null,
    minPastDueDays: Number.isFinite(+minPastDueDays) ? +minPastDueDays : null,
    limit: clampLimit(limit, 100),
    offset: Number.isFinite(+offset) && +offset >= 0 ? +offset : 0,
  };
}

/** Normalize Financial args */
function normalizeFinArgs(args = {}) {
  const { startDate, endDate, accountLike, entity, groupByMonth, limit, offset } = args;
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
  /* ==========================================================================
     A/R Aging Analysis (bucketed by due date)
     ======================================================================== */
  getARAgingAnalysis: async ({ customerId = null, customer = null } = {}) => {
    try {
      const cust = customer ?? customerId;

      let query = supabase
        .from('ar_aging_detail')
        .select('customer, due_date, open_balance');

      if (cust) query = query.ilike('customer', `%${safeLike(cust)}%`);

      query = query.order('customer', { ascending: true })
                   .order('due_date', { ascending: true });

      const { data: arData, error } = await query;
      if (error) throw error;

      if (!arData?.length) {
        return {
          success: true,
          summary: 'No A/R data found',
          total_ar: 0,
          customer_count: 0,
          total_invoices: 0,
          customers: [],
        };
      }

      const now = Date.now();
      const buckets = arData.reduce((acc, row) => {
        const custName = row.customer || 'Unknown';
        const ob = row.open_balance ?? 0;
        const dpd = row.due_date ? Math.floor((now - new Date(row.due_date).getTime()) / DAY_MS) : 0;

        if (!acc[custName]) {
          acc[custName] = {
            customer_name: custName,
            current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_over_90: 0,
            total_outstanding: 0, invoice_count: 0, oldest_invoice_days: 0,
          };
        }

        if (dpd <= 0) acc[custName].current += ob;
        else if (dpd <= 30) acc[custName].days_1_30 += ob;
        else if (dpd <= 60) acc[custName].days_31_60 += ob;
        else if (dpd <= 90) acc[custName].days_61_90 += ob;
        else acc[custName].days_over_90 += ob;

        acc[custName].total_outstanding += ob;
        acc[custName].invoice_count += 1;
        acc[custName].oldest_invoice_days = Math.max(acc[custName].oldest_invoice_days, dpd || 0);
        return acc;
      }, {});

      const customers = Object.values(buckets);
      const totalAR = customers.reduce((s, c) => s + c.total_outstanding, 0);

      return {
        success: true,
        summary: 'Current A/R aging analysis (by due date)',
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
      };
    } catch (error) {
      console.error('❌ getARAgingAnalysis error:', error);
      return { success: false, error: 'Failed to analyze A/R aging', details: error.message };
    }
  },

  /* ==========================================================================
     A/R Payment History (journal_entry_lines subset)
     ======================================================================== */
  getARPaymentHistory: async ({ customerId = null, customer = null, timeframe = '6_months' } = {}) => {
    try {
      const cust = customer ?? customerId;

      let query = supabase
        .from('journal_entry_lines')
        .select('date, account, account_type, debit, credit, customer, name');

      // tolerant AR account matching
      query = query.or(
        [
          'account.ilike.%Accounts Receivable%',
          'account.ilike.%A/R%',
          'account.ilike.%AR%',
          'account_type.ilike.%Accounts Receivable%',
        ].join(',')
      );

      if (cust) query = query.ilike('customer', `%${safeLike(cust)}%`);

      const dateLimit = new Date();
      if (timeframe === '6_months') dateLimit.setMonth(dateLimit.getMonth() - 6);
      else if (timeframe === '3_months') dateLimit.setMonth(dateLimit.getMonth() - 3);
      else if (timeframe === '12_months') dateLimit.setFullYear(dateLimit.getFullYear() - 1);

      query = query
        .gte('date', dateLimit.toISOString().slice(0, 10))
        .order('date', { ascending: true })
        .limit(HARD_ROW_CAP);

      const { data, error } = await query;
      if (error) throw error;

      if (!data?.length) {
        return { success: true, summary: `No A/R transactions for ${timeframe}`, timeframe, customers: [] };
      }

      // Debit to AR = invoice; Credit to AR = payment
      const grouped = data.reduce((acc, e) => {
        const key = e.customer || e.name || 'Unknown';
        const month = String(e.date).slice(0, 7);
        if (!acc[key]) acc[key] = { customer_name: key, total_invoiced: 0, total_paid: 0, payment_months: {}, transaction_count: 0 };

        if ((e.credit || 0) > 0) {
          acc[key].total_paid += e.credit || 0;
          acc[key].payment_months[month] = (acc[key].payment_months[month] || 0) + (e.credit || 0);
        } else if ((e.debit || 0) > 0) {
          acc[key].total_invoiced += e.debit || 0;
        }
        acc[key].transaction_count += 1;
        return acc;
      }, {});

      const customers = Object.values(grouped);
      const overallInvoiced = customers.reduce((sum, c) => sum + c.total_invoiced, 0);
      const overallPaid = customers.reduce((sum, c) => sum + c.total_paid, 0);

      return {
        success: true,
        summary: `A/R payment history for ${timeframe}`,
        timeframe,
        customers,
        overall_stats: {
          total_invoiced: overallInvoiced,
          total_paid: overallPaid,
          collection_rate: overallInvoiced > 0 ? overallPaid / overallInvoiced : 0,
        },
      };
    } catch (error) {
      console.error('❌ getARPaymentHistory error:', error);
      return { success: false, error: 'Failed to analyze payment history', details: error.message };
    }
  },

  /* ==========================================================================
     A/P Aging Analysis
     ======================================================================== */
  getAPAgingSummary: async ({ vendor = null, startDate = null, endDate = null } = {}) => {
    try {
      let query = supabase
        .from('ap_aging')
        .select('vendor, due_date, open_balance');

      if (vendor) query = query.ilike('vendor', `%${safeLike(vendor)}%`);
      if (startDate) query = query.gte('due_date', toISO(startDate) || startDate);
      if (endDate) query = query.lte('due_date', toISO(endDate) || endDate);

      query = query.order('vendor', { ascending: true })
                   .order('due_date', { ascending: true });

      const { data: apData, error } = await query;
      if (error) throw error;

      if (!apData?.length) {
        return {
          success: true,
          summary: 'No A/P data found',
          total_ap: 0,
          vendor_count: 0,
          total_bills: 0,
          vendors: [],
        };
      }

      const now = Date.now();
      const buckets = apData.reduce((acc, row) => {
        const vend = row.vendor || 'Unknown';
        const ob = row.open_balance ?? 0;
        const dpd = row.due_date ? Math.floor((now - new Date(row.due_date).getTime()) / DAY_MS) : 0;

        if (!acc[vend]) {
          acc[vend] = {
            vendor_name: vend,
            current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_over_90: 0,
            total_outstanding: 0, bill_count: 0, oldest_bill_days: 0,
          };
        }

        if (dpd <= 0) acc[vend].current += ob;
        else if (dpd <= 30) acc[vend].days_1_30 += ob;
        else if (dpd <= 60) acc[vend].days_31_60 += ob;
        else if (dpd <= 90) acc[vend].days_61_90 += ob;
        else acc[vend].days_over_90 += ob;

        acc[vend].total_outstanding += ob;
        acc[vend].bill_count += 1;
        acc[vend].oldest_bill_days = Math.max(acc[vend].oldest_bill_days, dpd || 0);
        return acc;
      }, {});

      const vendors = Object.values(buckets);
      const totalAP = vendors.reduce((s, c) => s + c.total_outstanding, 0);

      return {
        success: true,
        summary: 'Current A/P aging analysis',
        total_ap: totalAP,
        vendor_count: vendors.length,
        total_bills: apData.length,
        vendors,
        aging_summary: {
          current: vendors.reduce((s, c) => s + c.current, 0),
          days_1_30: vendors.reduce((s, c) => s + c.days_1_30, 0),
          days_31_60: vendors.reduce((s, c) => s + c.days_31_60, 0),
          days_61_90: vendors.reduce((s, c) => s + c.days_61_90, 0),
          days_over_90: vendors.reduce((s, c) => s + c.days_over_90, 0),
        },
      };
    } catch (error) {
      console.error('❌ getAPAgingSummary error:', error);
      return { success: false, error: 'Failed to analyze A/P aging', details: error.message };
    }
  },

  /* ==========================================================================
     A/P Generic table query
     ======================================================================== */
  queryAPAgingTable: async ({ select = '*', filters = {}, orderBy = null, ascending = true, limit = 100, offset = 0 } = {}) => {
    try {
      let query = supabase.from('ap_aging').select(select, { count: 'exact' });

      for (const [col, val] of Object.entries(filters || {})) {
        if (val === null || typeof val === 'undefined') continue;
        if (Array.isArray(val)) query = query.in(col, val);
        else if (typeof val === 'string') query = query.ilike(col, `%${safeLike(val)}%`);
        else query = query.eq(col, val);
      }

      if (orderBy) query = query.order(orderBy, { ascending });
      query = query.range(offset, offset + clampLimit(limit, 500) - 1);

      const { data, error, count } = await query;
      if (error) throw error;

      return { success: true, records: data || [], pagination: { count: count ?? data?.length ?? 0, limit, offset } };
    } catch (error) {
      console.error('❌ queryAPAgingTable error:', error);
      return { success: false, error: 'Failed to query ap_aging', details: error.message };
    }
  },

  /* ==========================================================================
     Payroll Payments Summary
     ======================================================================== */
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

      query = query.order('date', { ascending: true })
                   .range(offset, offset + clampLimit(limit, 500) - 1);

      const { data, error, count } = await query;
      if (error) throw error;

      if (!data?.length) {
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

      const department_breakdown = data.reduce((acc, p) => {
        const dept = p.department || 'Unknown';
        acc[dept] = (acc[dept] || 0) + (p.total_amount || 0);
        return acc;
      }, {});

      const employee_breakdown = data.reduce((acc, p) => {
        const name = [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown';
        acc[name] = (acc[name] || 0) + (p.total_amount || 0);
        return acc;
      }, {});

      const department_employee_breakdown = data.reduce((acc, p) => {
        const dept = p.department || 'Unknown';
        const name = [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown';
        acc[dept] = acc[dept] || {};
        acc[dept][name] = (acc[dept][name] || 0) + (p.total_amount || 0);
        return acc;
      }, {});

      return {
        success: true,
        summary: 'Payroll payment summary',
        total_payroll: total,
        department_breakdown,
        employee_breakdown,
        department_employee_breakdown,
        payments: data,
        pagination: { count: count ?? data.length, limit, offset },
      };
    } catch (error) {
      console.error('❌ getPaymentsSummary error:', error);
      return { success: false, error: 'Failed to fetch payments', details: error.message };
    }
  },

  /* ==========================================================================
     Payroll by Month
     ======================================================================== */
  getPayrollByMonth: async ({
    startDate = null,
    endDate = null,
    employee = null,
    department = null,
    minAmount = null,
    maxAmount = null,
  } = {}) => {
    try {
      let query = supabase
        .from('payments')
        .select('date, department, first_name, last_name, total_amount');

      if (startDate) query = query.gte('date', toISO(startDate) || startDate);
      if (endDate) query = query.lte('date', toISO(endDate) || endDate);
      if (department) query = query.ilike('department', `%${safeLike(department)}%`);
      if (employee) {
        const e = safeLike(employee);
        query = query.or(`first_name.ilike.%${e}%,last_name.ilike.%${e}%`);
      }
      if (minAmount !== null) query = query.gte('total_amount', +minAmount);
      if (maxAmount !== null) query = query.lte('total_amount', +maxAmount);

      query = query.order('date', { ascending: true }).limit(HARD_ROW_CAP);

      const { data, error } = await query;
      if (error) throw error;

      if (!data?.length) {
        return {
          success: true,
          summary: 'No payroll data found',
          total_payroll: 0,
          monthly_payroll: {},
          monthly_department_breakdown: {},
        };
      }

      const { monthly, monthlyDept } = data.reduce(
        (acc, p) => {
          const month = String(p.date).slice(0, 7);
          const dept = p.department || 'Unknown';
          acc.monthly[month] = (acc.monthly[month] || 0) + (p.total_amount || 0);
          acc.monthlyDept[month] = acc.monthlyDept[month] || {};
          acc.monthlyDept[month][dept] = (acc.monthlyDept[month][dept] || 0) + (p.total_amount || 0);
          return acc;
        },
        { monthly: {}, monthlyDept: {} }
      );

      const total = Object.values(monthly).reduce((s, v) => s + v, 0);

      return {
        success: true,
        summary: 'Monthly payroll totals',
        total_payroll: total,
        monthly_payroll: monthly,
        monthly_department_breakdown: monthlyDept,
      };
    } catch (error) {
      console.error('❌ getPayrollByMonth error:', error);
      return { success: false, error: 'Failed to fetch monthly payroll', details: error.message };
    }
  },

  /* ==========================================================================
     Generic table queries
     ======================================================================== */
  queryPayroll: async ({ select = '*', filters = {}, orderBy = null, ascending = true, limit = 100, offset = 0 } = {}) => {
    try {
      let query = supabase.from('payments').select(select, { count: 'exact' });

      for (const [col, val] of Object.entries(filters || {})) {
        if (val === null || typeof val === 'undefined') continue;
        if (Array.isArray(val)) query = query.in(col, val);
        else if (typeof val === 'string') query = query.ilike(col, `%${safeLike(val)}%`);
        else query = query.eq(col, val);
      }

      if (orderBy) query = query.order(orderBy, { ascending });
      query = query.range(offset, offset + clampLimit(limit, 500) - 1);

      const { data, error, count } = await query;
      if (error) throw error;

      return { success: true, records: data || [], pagination: { count: count ?? data?.length ?? 0, limit, offset } };
    } catch (error) {
      console.error('❌ queryPayroll error:', error);
      return { success: false, error: 'Failed to query payments', details: error.message };
    }
  },

  queryARAgingDetailTable: async ({ select = '*', filters = {}, orderBy = null, ascending = true, limit = 100, offset = 0 } = {}) => {
    try {
      let query = supabase.from('ar_aging_detail').select(select, { count: 'exact' });

      for (const [col, val] of Object.entries(filters || {})) {
        if (val === null || typeof val === 'undefined') continue;
        if (Array.isArray(val)) query = query.in(col, val);
        else if (typeof val === 'string') query = query.ilike(col, `%${safeLike(val)}%`);
        else query = query.eq(col, val);
      }

      if (orderBy) query = query.order(orderBy, { ascending });
      query = query.range(offset, offset + clampLimit(limit, 500) - 1);

      const { data, error, count } = await query;
      if (error) throw error;

      return { success: true, records: data || [], pagination: { count: count ?? data?.length ?? 0, limit, offset } };
    } catch (error) {
      console.error('❌ queryARAgingDetailTable error:', error);
      return { success: false, error: 'Failed to query ar_aging_detail', details: error.message };
    }
  },

  queryJournalEntryLines: async ({ select = '*', filters = {}, orderBy = null, ascending = true, limit = 100, offset = 0 } = {}) => {
    try {
      let query = supabase.from('journal_entry_lines').select(select, { count: 'exact' });

      for (const [col, val] of Object.entries(filters || {})) {
        if (val === null || typeof val === 'undefined') continue;
        if (Array.isArray(val)) query = query.in(col, val);
        else if (typeof val === 'string') query = query.ilike(col, `%${safeLike(val)}%`);
        else query = query.eq(col, val);
      }

      if (orderBy) query = query.order(orderBy, { ascending });
      query = query.range(offset, offset + clampLimit(limit, 500) - 1);

      const { data, error, count } = await query;
      if (error) throw error;

      return { success: true, records: data || [], pagination: { count: count ?? data?.length ?? 0, limit, offset } };
    } catch (error) {
      console.error('❌ queryJournalEntryLines error:', error);
      return { success: false, error: 'Failed to query journal_entry_lines', details: error.message };
    }
  },

  /* ==========================================================================
     A/R Aging Detail (Invoices) — matches your schema (no 'status' column)
     ======================================================================== */
  getARAgingDetail: async (raw = {}) => {
    try {
      const { customer, startDate, endDate, dueOnly, status, minPastDueDays, limit, offset } = normalizeARArgs(raw);

      let query = supabase
        .from('ar_aging_detail')
        .select('customer, number, date, due_date, amount, open_balance, location', { count: 'exact' });

      if (customer) query = query.ilike('customer', `%${safeLike(customer)}%`);

      // date window: prefer due_date; fallback to date when due_date is null
      if (startDate) {
        const s = toISO(startDate) || startDate;
        query = query.or(`due_date.gte.${s},and(due_date.is.null,date.gte.${s})`);
      }
      if (endDate) {
        const e = toISO(endDate) || endDate;
        query = query.or(`due_date.lte.${e},and(due_date.is.null,date.lte.${e})`);
      }

      // Map virtual status → your columns
      if (status === 'open') {
        query = query.gt('open_balance', 0);
      } else if (status === 'paid') {
        query = query.eq('open_balance', 0);
      } else if (status === 'overdue') {
        query = query.gt('open_balance', 0).lt('due_date', todayISO());
      }

      if (dueOnly) query = query.gt('open_balance', 0);

      query = query
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('date', { ascending: true })
        .order('customer', { ascending: true })
        .range(offset, offset + limit - 1);

      const { data, error, count } = await query;
      if (error) throw error;

      let records = data || [];

      if (Number.isFinite(minPastDueDays) && minPastDueDays > 0) {
        const now = Date.now();
        records = records.filter((r) => {
          if (!r.due_date) return false;
          const dpd = Math.floor((now - new Date(r.due_date).getTime()) / DAY_MS);
          return (r.open_balance || 0) > 0 && dpd >= minPastDueDays;
        });
      }

      const totalOutstanding = records.reduce((sum, r) => sum + (r.open_balance ?? 0), 0);

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

  // Convenience aliases for the AI router
  getAROpenInvoices: async (args = {}) =>
    availableFunctions.getARAgingDetail({ ...args, status: args.status ?? 'open' }),
  getARInvoices: async (args = {}) => availableFunctions.getARAgingDetail(args),

  /* ==========================================================================
     Financial Summary (count-gated & aggregate-first)
     ======================================================================== */
  getFinancialSummary: async (raw = {}) => {
    try {
      const {
        startDate = null,
        endDate = null,
        accountLike = null,
        entity = null,
        groupByMonth = true,
        metricsOnly = true,   // return aggregates by default
        limit = 0,            // no detail slice unless asked
        offset = 0,
      } = raw;

      // 1) Count gate (HEAD)
      let countQuery = supabase.from('journal_entry_lines').select('*', { count: 'exact', head: true });
      if (startDate) countQuery = countQuery.gte('date', startDate);
      if (endDate) countQuery = countQuery.lte('date', endDate);
      if (accountLike) countQuery = countQuery.ilike('account', `%${safeLike(accountLike)}%`);
      if (entity) countQuery = countQuery.or(`customer.ilike.%${safeLike(entity)}%,entity.ilike.%${safeLike(entity)}%`);

      const { count, error: countErr } = await countQuery;
      if (countErr) throw countErr;
      const tooBig = (count ?? 0) > HARD_ROW_CAP;

      // 2) Aggregate path
      let aggQuery = supabase
        .from('journal_entry_lines')
        .select('date, account, account_type, debit, credit, customer, entity');

      if (startDate) aggQuery = aggQuery.gte('date', startDate);
      if (endDate) aggQuery = aggQuery.lte('date', endDate);
      if (accountLike) aggQuery = aggQuery.ilike('account', `%${safeLike(accountLike)}%`);
      if (entity) aggQuery = aggQuery.or(`customer.ilike.%${safeLike(entity)}%,entity.ilike.%${safeLike(entity)}%`);

      const { data, error } = await aggQuery.limit(HARD_ROW_CAP);
      if (error) throw error;

      const totals = data.reduce(
        (acc, e) => {
          acc.debit += e.debit || 0;
          acc.credit += e.credit || 0;
          return acc;
        },
        { debit: 0, credit: 0 }
      );

      const accountMap = data.reduce((acc, e) => {
        const acct = e.account || 'Unknown';
        if (!acc[acct]) acc[acct] = { debit: 0, credit: 0 };
        acc[acct].debit += e.debit || 0;
        acc[acct].credit += e.credit || 0;
        return acc;
      }, {});

      const top_accounts = Object.entries(accountMap)
        .map(([account, v]) => ({
          account,
          debit: v.debit,
          credit: v.credit,
          net: (v.credit || 0) - (v.debit || 0),
        }))
        .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
        .slice(0, DEFAULT_TOP_ACCOUNTS);

      const monthly_net = groupByMonth
        ? data.reduce((acc, e) => {
            const m = String(e.date).slice(0, 7);
            if (!acc[m]) acc[m] = { debit: 0, credit: 0, net: 0 };
            acc[m].debit += e.debit || 0;
            acc[m].credit += e.credit || 0;
            acc[m].net = acc[m].credit - acc[m].debit;
            return acc;
          }, {})
        : undefined;

      const base = {
        success: true,
        summary: 'Financial summary',
        total_debit: totals.debit,
        total_credit: totals.credit,
        net: totals.credit - totals.debit,
        top_accounts,
        ...(groupByMonth ? { monthly_net } : {}),
        meta: {
          row_count: count ?? data.length,
          capped: tooBig || metricsOnly || limit === 0,
          window: { startDate, endDate },
        },
      };

      if (metricsOnly || limit === 0 || tooBig) return base;

      // 3) Optional small detail slice
      let detailQuery = supabase
        .from('journal_entry_lines')
        .select('date, account, debit, credit, customer, entity')
        .order('date', { ascending: true })
        .range(offset, offset + clampLimit(limit, 50, 200) - 1);

      if (startDate) detailQuery = detailQuery.gte('date', startDate);
      if (endDate) detailQuery = detailQuery.lte('date', endDate);
      if (accountLike) detailQuery = detailQuery.ilike('account', `%${safeLike(accountLike)}%`);
      if (entity) detailQuery = detailQuery.or(`customer.ilike.%${safeLike(entity)}%,entity.ilike.%${safeLike(entity)}%`);

      const { data: sample_details, error: dErr } = await detailQuery;
      if (dErr) throw dErr;

      return { ...base, sample_details };
    } catch (error) {
      console.error('❌ getFinancialSummary error:', error);
      return { success: false, error: 'Failed to summarize financial data', details: error.message };
    }
  },

  /* ==========================================================================
     Customer Net Income
     ======================================================================== */
  getCustomerNetIncome: async ({ customerId = null, customer = null, timeframe = 'current_month' } = {}) => {
    try {
      const cust = customer ?? customerId;
      const now = new Date();
      let gte, lte;

      if (timeframe === 'current_month') {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        gte = start.toISOString().slice(0, 10);
      } else if (timeframe === 'last_month') {
        const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const end = new Date(now.getFullYear(), now.getMonth(), 0);
        gte = start.toISOString().slice(0, 10);
        lte = end.toISOString().slice(0, 10);
      }

      let query = supabase
        .from('journal_entry_lines')
        .select('date, account, account_type, debit, credit, customer, name, property');

      if (cust) query = query.ilike('customer', `%${safeLike(cust)}%`);
      if (gte) query = query.gte('date', gte);
      if (lte) query = query.lte('date', lte);
      query = query.order('date', { ascending: true });

      const { data, error } = await query;
      if (error) throw error;

      if (!data?.length) {
        return { success: true, summary: `No financial data found for ${timeframe}`, timeframe, customers: [] };
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

        const isIncome =
          (entry.account && (entry.account.includes('Income') || entry.account.includes('Revenue') || entry.account.includes('Sales'))) ||
          (entry.account_type && entry.account_type.includes('Income'));
        const isExpense =
          (entry.account && (entry.account.includes('Expense') || entry.account.includes('Cost') || entry.account.includes('COGS'))) ||
          (entry.account_type && entry.account_type.includes('Expense'));

        if (isIncome) acc[key].revenue += entry.credit || 0;
        if (isExpense) acc[key].expenses += entry.debit || 0;
        acc[key].transaction_count += 1;
        return acc;
      }, {});

      Object.values(grouped).forEach((c) => (c.net_income = c.revenue - c.expenses));
      const customers = Object.values(grouped).sort((a, b) => b.net_income - a.net_income);

      return {
        success: true,
        summary: `Customer net income analysis for ${timeframe}`,
        timeframe,
        total_customers: customers.length,
        customers,
        company_totals: {
          total_revenue: customers.reduce((s, c) => s + c.revenue, 0),
          total_expenses: customers.reduce((s, c) => s + c.expenses, 0),
          total_net_income: customers.reduce((s, c) => s + c.net_income, 0),
        },
        top_performers: customers.filter((c) => c.net_income > 0).slice(0, 5),
        underperformers: customers.filter((c) => c.net_income < 0).slice(0, 5),
      };
    } catch (error) {
      console.error('❌ getCustomerNetIncome error:', error);
      return { success: false, error: 'Failed to analyze customer net income', details: error.message };
    }
  },

  /* ==========================================================================
     Account Trends (+ alias)
     ======================================================================== */
  getAccountTrends: async (raw = {}) => {
    try {
      const { startDate, endDate, accountLike, entity, limit = 500, offset = 0 } = normalizeFinArgs(raw);

      let query = supabase
        .from('journal_entry_lines')
        .select('date, account, debit, credit, customer, entity', { count: 'exact' });

      if (startDate) query = query.gte('date', startDate);
      if (endDate) query = query.lte('date', endDate);
      if (accountLike) query = query.ilike('account', `%${accountLike}%`);
      if (entity) query = query.or(`customer.ilike.%${entity}%,entity.ilike.%${entity}%`);

      query = query.order('date', { ascending: true })
                   .range(offset, offset + clampLimit(limit, 500) - 1);

      const { data, error } = await query;
      if (error) throw error;

      if (!data?.length) return { success: true, summary: 'No financial data found', trends: [] };

      const trendMap = data.reduce((acc, e) => {
        const month = String(e.date).slice(0, 7);
        if (!acc[month]) acc[month] = 0;
        acc[month] += (e.credit || 0) - (e.debit || 0);
        return acc;
      }, {});
      const trends = Object.keys(trendMap).sort().map((m) => ({ month: m, net: trendMap[m] }));

      return { success: true, summary: 'Monthly net trend', trends };
    } catch (error) {
      console.error('❌ getAccountTrends error:', error);
      return { success: false, error: 'Failed to fetch account trends', details: error.message };
    }
  },

  getGLTrends: async (args = {}) => availableFunctions.getAccountTrends(args),

  /* ==========================================================================
     Year-over-Year Comparison
     ======================================================================== */
  getYearOverYearComparison: async ({ customerId = null, customer = null } = {}) => {
    try {
      const cust = customer ?? customerId;
      const currentYear = new Date().getFullYear();
      const lastYear = currentYear - 1;

      const currentYearStart = `${currentYear}-01-01`;
      const currentYearEnd = todayISO();
      const lastYearStart = `${lastYear}-01-01`;
      const lastYearEnd = `${lastYear}-${todayISO().slice(5)}`;

      let currentQuery = supabase
        .from('journal_entry_lines')
        .select('date, account, account_type, debit, credit, customer, property')
        .gte('date', currentYearStart)
        .lte('date', currentYearEnd);
      if (cust) currentQuery = currentQuery.ilike('customer', `%${safeLike(cust)}%`);

      let lastYearQuery = supabase
        .from('journal_entry_lines')
        .select('date, account, account_type, debit, credit, customer, property')
        .gte('date', lastYearStart)
        .lte('date', lastYearEnd);
      if (cust) lastYearQuery = lastYearQuery.ilike('customer', `%${safeLike(cust)}%`);

      const [curRes, prevRes] = await Promise.all([currentQuery, lastYearQuery]);
      if (curRes.error || prevRes.error) throw new Error(curRes.error?.message || prevRes.error?.message);

      const process = (rows, year) => {
        const out = {
          year,
          revenue: 0,
          expenses: 0,
          net_income: 0,
          transaction_count: rows.length,
          customers: new Set(),
          properties: new Set(),
          monthly_breakdown: {},
        };

        rows.forEach((e) => {
          const m = String(e.date).slice(0, 7);
          if (!out.monthly_breakdown[m]) out.monthly_breakdown[m] = { revenue: 0, expenses: 0, net_income: 0 };
          if (e.customer) out.customers.add(e.customer);
          if (e.property) out.properties.add(e.property);

          const isIncome =
            (e.account && (e.account.includes('Income') || e.account.includes('Revenue') || e.account.includes('Sales'))) ||
            (e.account_type && e.account_type.includes('Income'));
          const isExpense =
            (e.account && (e.account.includes('Expense') || e.account.includes('Cost') || e.account.includes('COGS'))) ||
            (e.account_type && e.account_type.includes('Expense'));

          if (isIncome) {
            out.revenue += e.credit || 0;
            out.monthly_breakdown[m].revenue += e.credit || 0;
          }
          if (isExpense) {
            out.expenses += e.debit || 0;
            out.monthly_breakdown[m].expenses += e.debit || 0;
          }
        });

        out.net_income = out.revenue - out.expenses;
        out.customer_count = out.customers.size;
        out.property_count = out.properties.size;

        Object.keys(out.monthly_breakdown).forEach((m) => {
          out.monthly_breakdown[m].net_income =
            out.monthly_breakdown[m].revenue - out.monthly_breakdown[m].expenses;
        });

        return out;
      };

      const cur = process(curRes.data || [], currentYear);
      const prev = process(prevRes.data || [], lastYear);

      const cmp = (a, b) => {
        const change = a - b;
        const pct = b !== 0 ? (change / b) * 100 : a > 0 ? 100 : 0;
        return { current: a, previous: b, change, percent_change: pct, trend: change > 0 ? 'up' : change < 0 ? 'down' : 'flat' };
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
          revenue: cmp(cur.revenue, prev.revenue),
          expenses: cmp(cur.expenses, prev.expenses),
          net_income: cmp(cur.net_income, prev.net_income),
          profit_margin: {
            current: cur.revenue > 0 ? (cur.net_income / cur.revenue) * 100 : 0,
            previous: prev.revenue > 0 ? (prev.net_income / prev.revenue) * 100 : 0,
          },
        },
        business_metrics: {
          customers: cmp(cur.customer_count, prev.customer_count),
          properties: cmp(cur.property_count, prev.property_count),
          transactions: cmp(cur.transaction_count, prev.transaction_count),
          avg_revenue_per_customer: {
            current: cur.customer_count > 0 ? cur.revenue / cur.customer_count : 0,
            previous: prev.customer_count > 0 ? prev.revenue / prev.customer_count : 0,
          },
        },
        monthly_trends: { current_year: cur.monthly_breakdown, last_year: prev.monthly_breakdown },
      };
    } catch (error) {
      console.error('❌ getYearOverYearComparison error:', error);
      return { success: false, error: 'Failed to perform year-over-year comparison', details: error.message };
    }
  },
};
