import { describe, it, expect, beforeEach, vi } from 'vitest';

// dynamic response map used by mocked supabase client
const responses: Record<string, any> = {};

vi.mock('@supabase/supabase-js', () => {
  return {
    createClient: () => ({
      from: (table: string) => {
        const resp = responses[table] || { data: [], error: null };
        const promise = Promise.resolve(resp);
        const builder: any = {
          select: () => builder,
          eq: () => builder,
          gte: () => builder,
          lte: () => builder,
          ilike: () => builder,
          in: () => builder,
          order: () => builder,
          limit: () => builder,
          abort: () => {},
          then: promise.then.bind(promise),
          catch: promise.catch.bind(promise),
          finally: promise.finally.bind(promise),
        };
        return builder;
      },
    }),
  };
});

import { getIncomingCashThisWeek, getExpectedCashFromInvoicing, getPayrollByCustomer } from '../src/server/cash-and-payroll';

describe('cash and payroll', () => {
  beforeEach(() => {
    for (const k of Object.keys(responses)) delete responses[k];
  });

  it('incoming cash using aging forecast only', async () => {
    responses['invoices'] = { data: null, error: { code: '42P01' } };
    responses['payments'] = { data: null, error: { code: '42P01' } };
    responses['ar_aging'] = {
      data: [
        { bucket: 'current', balance: 1000, as_of_date: '2024-01-05' },
        { bucket: '30', balance: 2000, as_of_date: '2024-01-05' },
      ],
      error: null,
    };

    const res = await getIncomingCashThisWeek({ weekStart: '2024-01-01', weekEnd: '2024-01-07', asOfDate: '2024-01-05' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.expected_collections).toBeCloseTo(1200); // 1000*.7 + 2000*.25
      expect(res.data.components.invoices_due).toBeNull();
      expect(res.data.components.historical_receipts_blend).toBeNull();
    }
  });

  it('incoming cash with invoices and payments', async () => {
    responses['invoices'] = {
      data: [
        { invoice_id: '1', customer_id: 'A', customer_name: 'A', due_date: '2024-01-03', amount: 1000, status: 'open' },
        { invoice_id: '2', customer_id: 'B', customer_name: 'B', due_date: '2024-01-04', amount: 500, status: 'open' },
      ],
      error: null,
    };
    responses['payments'] = {
      data: Array.from({ length: 41 }, (_, i) => ({ payment_date: `2023-11-${(i % 30) + 1}`, amount: 100 })),
      error: null,
    };
    responses['ar_aging'] = {
      data: [
        { bucket: 'current', balance: 1000, as_of_date: '2024-01-05' },
        { bucket: '30', balance: 2000, as_of_date: '2024-01-05' },
      ],
      error: null,
    };
    const res = await getIncomingCashThisWeek({ weekStart: '2024-01-01', weekEnd: '2024-01-07', asOfDate: '2024-01-05' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.components.invoices_due).toBeCloseTo(1500);
      expect(res.data.components.historical_receipts_blend).toBeGreaterThan(0);
      expect(res.data.expected_collections).toBeCloseTo(1200);
    }
  });

  it('expected cash from invoicing includeLate toggle', async () => {
    responses['invoices'] = {
      data: [
        { invoice_id: '1', customer_id: 'A', customer_name: 'A', due_date: '2024-01-03', amount: 1000, status: 'open' },
      ],
      error: null,
    };
    responses['payments'] = {
      data: [{ invoice_id: '1', amount: 200 }],
      error: null,
    };
    responses['ar_aging'] = {
      data: [
        { bucket: '30', balance: 400, as_of_date: '2024-01-05' },
        { bucket: '60', balance: 100, as_of_date: '2024-01-05' },
      ],
      error: null,
    };

    const yes = await getExpectedCashFromInvoicing({ weekStart: '2024-01-01', weekEnd: '2024-01-07', includeLate: true, asOfDate: '2024-01-05' });
    const no = await getExpectedCashFromInvoicing({ weekStart: '2024-01-01', weekEnd: '2024-01-07', includeLate: false, asOfDate: '2024-01-05' });
    if (yes.ok && no.ok) {
      expect(yes.data.expected_from_invoices).toBeCloseTo(910); // 1000 +110 -200
      expect(no.data.expected_from_invoices).toBeCloseTo(800); // 1000 -200
    } else {
      throw new Error('unexpected error');
    }
  });

  it('payroll by customer with contractors and unallocated salaries', async () => {
    responses['v_cogs_labor'] = {
      data: [
        { customer_id: 'C1', customer_name: 'Cust1', amount: 100 },
        { customer_id: 'C2', customer_name: 'Cust2', amount: 200 },
      ],
      error: null,
    };
    responses['v_cogs_contractors'] = {
      data: [{ customer_id: 'C1', customer_name: 'Cust1', amount: 50 }],
      error: null,
    };
    responses['journal_entry_lines'] = {
      data: [
        { customer_id: 'C1', customer_name: 'Cust1', amount: 30 },
        { customer_id: null, customer_name: null, amount: 20 },
      ],
      error: null,
    };

    const res = await getPayrollByCustomer({ startDate: '2024-01-01', endDate: '2024-01-31' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const rows = res.data.rows;
      const c1 = rows.find((r) => r.customer_id === 'C1')!;
      const c2 = rows.find((r) => r.customer_id === 'C2')!;
      expect(c1.total_payroll).toBeCloseTo(180);
      expect(c2.total_payroll).toBeCloseTo(200);
      expect(res.data.unallocated_opex?.corporate_salaries).toBeCloseTo(20);
    }
  });
});
