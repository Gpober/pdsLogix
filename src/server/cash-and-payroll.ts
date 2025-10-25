/**
 * CFO Cash & Payroll utilities
 *
 * This module exposes three functions used by the CFO dashboard:
 * - getIncomingCashThisWeek: forecast near‑term cash collections
 * - getExpectedCashFromInvoicing: projection based only on invoicing
 * - getPayrollByCustomer: summarize labor costs by customer
 *
 * Inputs are validated with zod and all outputs are typed JSON objects.  The
 * functions never throw raw errors – instead they resolve to
 * `{ ok:false, error:{code,message,details?} }` or `{ ok:true, data:... }`.
 *
 * Recovery curve & blend weights may be overridden with environment variables
 * `CFO_RECOVERY_CURVE` (JSON) and `CFO_BLEND_WEIGHTS` (JSON).  Defaults reflect a
 * conservative 7‑day outlook:
 *   current:0.70, 30:0.25, 60:0.10, 90:0.05
 * Blend weights: invoices/aging 70%, history 30%.
 *
 * All dates are treated as local (America/New_York) with no timezone component.
 *
 * Example usage:
 * ```ts
 * import { getIncomingCashThisWeek } from '@/server/cash-and-payroll';
 * const res = await getIncomingCashThisWeek({ weekStart:'2024-01-01', weekEnd:'2024-01-07' });
 * if(res.ok) console.log(res.data.expected_collections);
 * ```
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import dayjs from 'dayjs';

// ---------- Types ----------
export type Err = { code: string; message: string; details?: any };

export type IncomingCashArgs = {
  weekStart: string;
  weekEnd: string;
  asOfDate?: string;
  useInvoices?: boolean;
};

export type ExpectedInvoicesArgs = {
  weekStart: string;
  weekEnd: string;
  includeLate?: boolean;
  asOfDate?: string;
};

export type PayrollByCustomerArgs = {
  startDate: string;
  endDate: string;
  includeContractors?: boolean;
};

// ---------- Environment & Helpers ----------
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const TIMEOUT_MS = Number(process.env.SUPABASE_TIMEOUT_MS) || 30_000;

const DEFAULT_RECOVERY_CURVE: Record<'current' | '30' | '60' | '90', number> = {
  current: 0.7,
  '30': 0.25,
  '60': 0.1,
  '90': 0.05,
};

const DEFAULT_BLEND_WEIGHTS = { invoices_or_aging: 0.7, history: 0.3 };

const RECOVERY_CURVE: Record<'current' | '30' | '60' | '90', number> = (() => {
  try {
    const raw = process.env.CFO_RECOVERY_CURVE;
    return raw ? { ...DEFAULT_RECOVERY_CURVE, ...JSON.parse(raw) } : DEFAULT_RECOVERY_CURVE;
  } catch {
    return DEFAULT_RECOVERY_CURVE;
  }
})();

const BLEND_WEIGHTS = (() => {
  try {
    const raw = process.env.CFO_BLEND_WEIGHTS;
    return raw ? { ...DEFAULT_BLEND_WEIGHTS, ...JSON.parse(raw) } : DEFAULT_BLEND_WEIGHTS;
  } catch {
    return DEFAULT_BLEND_WEIGHTS;
  }
})();

function debug(...args: any[]) {
  if (process.env.DEBUG_AI) {
    // eslint-disable-next-line no-console
    console.log('[cfo]', ...args);
  }
}

let cachedClient: SupabaseClient | null = null;
function getClient(): SupabaseClient {
  if (!cachedClient) {
    cachedClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  }
  return cachedClient;
}

function withTimeout<T extends { data?: any; error?: any }>(p: PromiseLike<T>, ms = TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  // @ts-ignore
  if (p?.abort) p.abort = controller.abort.bind(controller); // for mocks
  return Promise.race([
    p as Promise<T>,
    new Promise<T>((_, reject) => {
      controller.signal.addEventListener('abort', () => reject(new Error('timeout')));
    }),
  ]).finally(() => clearTimeout(timer));
}

const dateSchema = z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/);

// ---------- Utility Functions ----------
function businessDaysBetween(start: string, end: string): number {
  let s = dayjs(start);
  const e = dayjs(end);
  let days = 0;
  while (s.isBefore(e) || s.isSame(e, 'day')) {
    const day = s.day();
    if (day !== 0 && day !== 6) days++;
    s = s.add(1, 'day');
  }
  return days;
}

function sum(vals: Array<number | null | undefined>): number {
  return vals.reduce((a, b) => a + (typeof b === 'number' && !isNaN(b) ? b : 0), 0);
}

function handleTableMissing(err: any): boolean {
  return err && (err.code === '42P01' || err.message?.includes('relation'));
}

// ---------- getIncomingCashThisWeek ----------
const incomingCashSchema = z.object({
  weekStart: dateSchema,
  weekEnd: dateSchema,
  asOfDate: dateSchema.optional(),
  useInvoices: z.boolean().optional(),
});

export type IncomingCashResult = {
  period: { start: string; end: string };
  expected_collections: number;
  components: {
    invoices_due: number | null;
    aging_forecast: number;
    historical_receipts_blend: number | null;
  };
  assumptions: {
    recovery_curve: Record<'current' | '30' | '60' | '90', number>;
    blend_weights: { invoices_or_aging: number; history: number };
    notes: string[];
  };
  top_payers_due?: Array<{ customer_id: string; customer_name: string; amount: number; due_date: string }>;
  risk_flags: string[];
};

export async function getIncomingCashThisWeek(
  args: IncomingCashArgs,
): Promise<{ ok: true; data: IncomingCashResult } | { ok: false; error: Err }> {
  const parsed = incomingCashSchema.safeParse(args);
  if (!parsed.success) {
    return { ok: false, error: { code: 'invalid_input', message: parsed.error.message } };
  }
  const { weekStart, weekEnd, asOfDate = dayjs().format('YYYY-MM-DD'), useInvoices = true } = parsed.data;
  const client = getClient();

  const notes: string[] = [];
  let invoicesDue: number | null = null;
  let topPayers: IncomingCashResult['top_payers_due'];

  if (useInvoices) {
    try {
      const { data, error } = await withTimeout<any>(
        client
          .from('invoices')
          .select('invoice_id, customer_id, customer_name, due_date, amount, status')
          .eq('status', 'open')
          .gte('due_date', weekStart)
          .lte('due_date', weekEnd),
      );
      if (error) throw error;
      invoicesDue = sum(data?.map((d: any) => Number(d.amount)) || []);
      if (data && data.length) {
        const byCustomer: Record<string, { id: string; name: string; amount: number; due_date: string }> = {};
        data.forEach((d: any) => {
          const key = d.customer_id || d.customer_name || 'unknown';
          const prev = byCustomer[key] || { id: d.customer_id || key, name: d.customer_name || key, amount: 0, due_date: d.due_date };
          prev.amount += Number(d.amount);
          byCustomer[key] = prev;
        });
        topPayers = Object.values(byCustomer)
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 5);
      }
    } catch (e: any) {
      if (handleTableMissing(e)) {
        notes.push('invoices table missing – using aging forecast');
      } else {
        return { ok: false, error: { code: 'db_error', message: e.message, details: e } };
      }
    }
  }

  // Aging forecast
  let agingForecast = 0;
  let agingTotals: Record<'current' | '30' | '60' | '90', number> = {
    current: 0,
    '30': 0,
    '60': 0,
    '90': 0,
  };
  try {
    const { data: snapshot, error } = await withTimeout<any>(
      client
        .from('ar_aging')
        .select('bucket,balance,as_of_date')
        .lte('as_of_date', asOfDate)
        .order('as_of_date', { ascending: false })
        .limit(1000),
    );
    if (error) throw error;
    if (!snapshot || snapshot.length === 0) {
      notes.push('no AR aging snapshot found');
    } else {
      // take latest as_of_date
      const latest = snapshot[0].as_of_date;
      snapshot
        .filter((r: any) => r.as_of_date === latest)
        .forEach((r: any) => {
          const b = r.bucket as 'current' | '30' | '60' | '90';
          if (b in agingTotals) agingTotals[b] += Number(r.balance);
        });
      agingForecast = (agingTotals.current * RECOVERY_CURVE.current +
        agingTotals['30'] * RECOVERY_CURVE['30'] +
        agingTotals['60'] * RECOVERY_CURVE['60'] +
        agingTotals['90'] * RECOVERY_CURVE['90']);
    }
  } catch (e: any) {
    return { ok: false, error: { code: 'db_error', message: e.message, details: e } };
  }

  // Historical receipts
  let historicalBlend: number | null = null;
  try {
    const start = dayjs(weekStart).subtract(56, 'day').format('YYYY-MM-DD');
    const { data, error } = await withTimeout<any>(
      client.from('payments').select('payment_date,amount').gte('payment_date', start),
    );
    if (error) throw error;
    const total = sum(data?.map((d: any) => Number(d.amount)) || []);
    const bizDays = businessDaysBetween(start, weekStart);
    const avgDaily = bizDays ? total / bizDays : 0;
    const weekBizDays = businessDaysBetween(weekStart, weekEnd);
    historicalBlend = avgDaily * weekBizDays;
  } catch (e: any) {
    if (handleTableMissing(e)) {
      notes.push('payments table missing – historical blend skipped');
    } else {
      return { ok: false, error: { code: 'db_error', message: e.message, details: e } };
    }
  }

  const base = invoicesDue != null ? invoicesDue : agingForecast;
  const expectedCollections =
    historicalBlend == null
      ? base
      : base * BLEND_WEIGHTS.invoices_or_aging + historicalBlend * BLEND_WEIGHTS.history;

  const riskFlags: string[] = [];
  const totalAr = sum(Object.values(agingTotals));
  if (totalAr > 0 && (agingTotals['60'] + agingTotals['90']) / totalAr > 0.35) {
    riskFlags.push('High 60+/90+ share');
  }
  if (topPayers && base > 0 && topPayers[0].amount / base > 0.35) {
    riskFlags.push('Payer concentration > 35%');
  }

  const result: IncomingCashResult = {
    period: { start: weekStart, end: weekEnd },
    expected_collections: Number(expectedCollections.toFixed(2)),
    components: {
      invoices_due: invoicesDue,
      aging_forecast: Number(agingForecast.toFixed(2)),
      historical_receipts_blend: historicalBlend != null ? Number(historicalBlend.toFixed(2)) : null,
    },
    assumptions: {
      recovery_curve: RECOVERY_CURVE,
      blend_weights: BLEND_WEIGHTS,
      notes,
    },
    top_payers_due: topPayers,
    risk_flags: riskFlags,
  };
  return { ok: true, data: result };
}

// ---------- getExpectedCashFromInvoicing ----------
const expectedInvoicesSchema = z.object({
  weekStart: dateSchema,
  weekEnd: dateSchema,
  includeLate: z.boolean().optional(),
  asOfDate: dateSchema.optional(),
});

export type ExpectedInvoicesResult = {
  period: { start: string; end: string };
  expected_from_invoices: number;
  detail: Array<{
    invoice_id: string;
    customer_id: string;
    customer_name: string;
    due_date: string;
    amount: number;
    expected_probability: number;
  }>;
  adjustments: { past_due_cure: number; already_paid: number };
  notes: string[];
};

export async function getExpectedCashFromInvoicing(
  args: ExpectedInvoicesArgs,
): Promise<{ ok: true; data: ExpectedInvoicesResult } | { ok: false; error: Err }> {
  const parsed = expectedInvoicesSchema.safeParse(args);
  if (!parsed.success) {
    return { ok: false, error: { code: 'invalid_input', message: parsed.error.message } };
  }
  const { weekStart, weekEnd, includeLate = true, asOfDate = dayjs().format('YYYY-MM-DD') } = parsed.data;
  const client = getClient();
  const notes: string[] = [];

  let invoices: any[] = [];
  try {
    const { data, error } = await withTimeout<any>(
      client
        .from('invoices')
        .select('invoice_id, customer_id, customer_name, due_date, amount, status')
        .eq('status', 'open')
        .gte('due_date', weekStart)
        .lte('due_date', weekEnd),
    );
    if (error) throw error;
    invoices = data || [];
  } catch (e: any) {
    if (handleTableMissing(e)) {
      // fall back to aging forecast path
      const inc = await getIncomingCashThisWeek({ weekStart, weekEnd, asOfDate, useInvoices: false });
      if (inc.ok) {
        return {
          ok: true,
          data: {
            period: inc.data.period,
            expected_from_invoices: inc.data.expected_collections,
            detail: [],
            adjustments: { past_due_cure: 0, already_paid: 0 },
            notes: ['invoices table missing – used aging forecast'],
          },
        };
      }
      return inc;
    }
    return { ok: false, error: { code: 'db_error', message: e.message, details: e } };
  }

  const detail = invoices.map((inv) => ({
    invoice_id: inv.invoice_id,
    customer_id: inv.customer_id,
    customer_name: inv.customer_name,
    due_date: inv.due_date,
    amount: Number(inv.amount),
    expected_probability: 1,
  }));
  const base = sum(detail.map((d) => d.amount));

  let alreadyPaid = 0;
  try {
    const ids = invoices.map((i) => i.invoice_id);
    if (ids.length) {
      const { data, error } = await withTimeout<any>(
        client.from('payments').select('invoice_id, amount').in('invoice_id', ids),
      );
      if (error) throw error;
      alreadyPaid = sum(data?.map((p: any) => Number(p.amount)) || []);
    }
  } catch (e: any) {
    if (handleTableMissing(e)) {
      notes.push('payments table missing – already_paid not deducted');
    } else {
      return { ok: false, error: { code: 'db_error', message: e.message, details: e } };
    }
  }

  let pastDueCure = 0;
  if (includeLate) {
    try {
      const { data, error } = await withTimeout<any>(
        client
          .from('ar_aging')
          .select('bucket,balance,as_of_date')
          .lte('as_of_date', asOfDate)
          .order('as_of_date', { ascending: false })
          .limit(1000),
      );
      if (error) throw error;
      if (data && data.length) {
        const latest = data[0].as_of_date;
        const byBucket: Record<string, number> = {};
        data
          .filter((r: any) => r.as_of_date === latest && r.bucket !== 'current')
          .forEach((r: any) => {
            const b = r.bucket;
            byBucket[b] = (byBucket[b] || 0) + Number(r.balance);
          });
        pastDueCure =
          (byBucket['30'] || 0) * RECOVERY_CURVE['30'] +
          (byBucket['60'] || 0) * RECOVERY_CURVE['60'] +
          (byBucket['90'] || 0) * RECOVERY_CURVE['90'];
      }
    } catch (e: any) {
      return { ok: false, error: { code: 'db_error', message: e.message, details: e } };
    }
  }

  const expected = base + pastDueCure - alreadyPaid;

  const result: ExpectedInvoicesResult = {
    period: { start: weekStart, end: weekEnd },
    expected_from_invoices: Number(expected.toFixed(2)),
    detail: detail.map((d) => ({ ...d, amount: Number(d.amount.toFixed(2)) })),
    adjustments: { past_due_cure: Number(pastDueCure.toFixed(2)), already_paid: Number(alreadyPaid.toFixed(2)) },
    notes,
  };
  return { ok: true, data: result };
}

// ---------- getPayrollByCustomer ----------
const payrollSchema = z.object({
  startDate: dateSchema,
  endDate: dateSchema,
  includeContractors: z.boolean().optional(),
});

export type PayrollByCustomerRow = {
  customer_id: string | null;
  customer_name: string | null;
  direct_labor: number;
  contractors: number;
  corporate_salaries_allocated: number;
  total_payroll: number;
};

export type PayrollByCustomerResult = {
  startDate: string;
  endDate: string;
  rows: PayrollByCustomerRow[];
  totals: { direct_labor: number; contractors: number; corporate_salaries_allocated: number; total: number };
  unallocated_opex?: { corporate_salaries: number };
  notes: string[];
};

export async function getPayrollByCustomer(
  args: PayrollByCustomerArgs,
): Promise<{ ok: true; data: PayrollByCustomerResult } | { ok: false; error: Err }> {
  const parsed = payrollSchema.safeParse(args);
  if (!parsed.success) {
    return { ok: false, error: { code: 'invalid_input', message: parsed.error.message } };
  }
  const { startDate, endDate, includeContractors = true } = parsed.data;
  const client = getClient();
  const notes: string[] = [];

  const rowsMap: Record<string, PayrollByCustomerRow> = {};

  // Direct labor
  try {
    const { data, error } = await withTimeout<any>(
      client
        .from('v_cogs_labor')
        .select('customer_id, customer_name, amount')
        .gte('txn_date', startDate)
        .lte('txn_date', endDate),
    );
    if (error) throw error;
    (data || []).forEach((r: any) => {
      const key = r.customer_id || r.customer_name || 'unassigned';
      const row = rowsMap[key] || {
        customer_id: r.customer_id || null,
        customer_name: r.customer_name || null,
        direct_labor: 0,
        contractors: 0,
        corporate_salaries_allocated: 0,
        total_payroll: 0,
      };
      row.direct_labor += Number(r.amount);
      rowsMap[key] = row;
    });
  } catch (e: any) {
    if (handleTableMissing(e)) {
      notes.push('v_cogs_labor view missing');
    } else {
      return { ok: false, error: { code: 'db_error', message: e.message, details: e } };
    }
  }

  if (includeContractors) {
    try {
      const { data, error } = await withTimeout<any>(
        client
          .from('v_cogs_contractors')
          .select('customer_id, customer_name, amount')
          .gte('txn_date', startDate)
          .lte('txn_date', endDate),
      );
      if (error) throw error;
      (data || []).forEach((r: any) => {
        const key = r.customer_id || r.customer_name || 'unassigned';
        const row = rowsMap[key] || {
          customer_id: r.customer_id || null,
          customer_name: r.customer_name || null,
          direct_labor: 0,
          contractors: 0,
          corporate_salaries_allocated: 0,
          total_payroll: 0,
        };
        row.contractors += Number(r.amount);
        rowsMap[key] = row;
      });
    } catch (e: any) {
      if (handleTableMissing(e)) {
        notes.push('v_cogs_contractors view missing');
      } else {
        return { ok: false, error: { code: 'db_error', message: e.message, details: e } };
      }
    }
  }

  // Corporate salaries
  let unallocated = 0;
  try {
    const { data, error } = await withTimeout<any>(
      client
        .from('journal_entry_lines')
        .select('customer_id, customer_name, amount')
        .eq('account_type', 'Expense')
        .ilike('account_name', '%salary%')
        .gte('txn_date', startDate)
        .lte('txn_date', endDate),
    );
    if (error) throw error;
    (data || []).forEach((r: any) => {
      const key = r.customer_id || r.customer_name;
      if (key) {
        const row = rowsMap[key] || {
          customer_id: r.customer_id,
          customer_name: r.customer_name,
          direct_labor: 0,
          contractors: 0,
          corporate_salaries_allocated: 0,
          total_payroll: 0,
        };
        row.corporate_salaries_allocated += Number(r.amount);
        rowsMap[key] = row;
      } else {
        unallocated += Number(r.amount);
      }
    });
  } catch (e: any) {
    if (handleTableMissing(e)) {
      notes.push('journal_entry_lines table missing for salaries');
    } else {
      return { ok: false, error: { code: 'db_error', message: e.message, details: e } };
    }
  }

  const rows = Object.values(rowsMap).map((r) => {
    r.total_payroll = r.direct_labor + r.contractors + r.corporate_salaries_allocated;
    return {
      customer_id: r.customer_id,
      customer_name: r.customer_name,
      direct_labor: Number(r.direct_labor.toFixed(2)),
      contractors: Number(r.contractors.toFixed(2)),
      corporate_salaries_allocated: Number(r.corporate_salaries_allocated.toFixed(2)),
      total_payroll: Number(r.total_payroll.toFixed(2)),
    };
  });

  const totals = {
    direct_labor: Number(sum(rows.map((r) => r.direct_labor)).toFixed(2)),
    contractors: Number(sum(rows.map((r) => r.contractors)).toFixed(2)),
    corporate_salaries_allocated: Number(sum(rows.map((r) => r.corporate_salaries_allocated)).toFixed(2)),
    total: 0,
  };
  totals.total = Number((totals.direct_labor + totals.contractors + totals.corporate_salaries_allocated).toFixed(2));

  const result: PayrollByCustomerResult = {
    startDate,
    endDate,
    rows,
    totals,
    notes,
  };
  if (unallocated) result.unallocated_opex = { corporate_salaries: Number(unallocated.toFixed(2)) };
  return { ok: true, data: result };
}

// End of module
