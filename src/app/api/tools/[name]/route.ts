import type { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabaseAdmin'
import {
  availableFunctions,
  type PaymentsArgs,
  type ARAgingArgs,
  type FinancialArgs,
} from '@/server/functions'

type ToolResult = { success: boolean; rows?: Record<string, unknown>[]; error?: string }

async function fallbackGetPaymentsSummary(args: PaymentsArgs = {}): Promise<ToolResult> {
  const {
    startDate,
    endDate,
    employee,
    department,
    minAmount,
    maxAmount,
    limit = 1000,
  } = args

  let query = supabase
    .from('payments')
    .select('*')
    .order('date', { ascending: false })
    .limit(limit)

  if (startDate) query = query.gte('date', startDate)
  if (endDate) query = query.lte('date', endDate)
  if (employee)
    query = query.or(
      `first_name.ilike.%${employee}%,last_name.ilike.%${employee}%`
    )
  if (department) query = query.eq('department', department)
  if (minAmount !== undefined) query = query.gte('total_amount', minAmount)
  if (maxAmount !== undefined) query = query.lte('total_amount', maxAmount)

    const { data, error } = await query
    if (error) throw error
    return { success: true, rows: data as Record<string, unknown>[] }
  }

async function fallbackGetARAgingDetail(args: ARAgingArgs = {}): Promise<ToolResult> {
  const { customerId, startDate, endDate, limit = 500 } = args

  let query = supabase
    .from('ar_aging_detail')
    .select('*')
    .order('invoice_date', { ascending: false })
    .limit(limit)

  if (customerId) query = query.eq('customer_id', customerId)
  if (startDate) query = query.gte('invoice_date', startDate)
  if (endDate) query = query.lte('invoice_date', endDate)

    const { data, error } = await query
    if (error) throw error
    return { success: true, rows: data as Record<string, unknown>[] }
  }

async function fallbackGetFinancialData(args: FinancialArgs = {}): Promise<ToolResult> {
  const { customerId, startDate, endDate, limit = 200 } = args

  let query = supabase
    .from('journal_entry_lines')
    .select('*')
    .order('date', { ascending: false })
    .limit(limit)

  if (customerId) query = query.eq('customer_id', customerId)
  if (startDate) query = query.gte('date', startDate)
  if (endDate) query = query.lte('date', endDate)

    const { data, error } = await query
    if (error) throw error
    return { success: true, rows: data as Record<string, unknown>[] }
  }

const fallbackMap: Record<string, (a: Record<string, unknown>) => Promise<ToolResult>> = {
  getPaymentsSummary: (a) => fallbackGetPaymentsSummary(a as PaymentsArgs),
  getARAgingDetail: (a) => fallbackGetARAgingDetail(a as ARAgingArgs),
  getFinancialData: (a) => fallbackGetFinancialData(a as FinancialArgs),
}

export async function POST(req: NextRequest, { params }: { params: { name: string } }) {
  const { name } = params
  let args: Record<string, unknown> = {}
  try {
    args = await req.json()
  } catch {}

  const available = availableFunctions as Record<string, (a: Record<string, unknown>) => Promise<ToolResult>>
  const handler = available[name] || fallbackMap[name]
  if (!handler) {
    return Response.json({ success: false, error: 'Unknown tool' }, { status: 404 })
  }
  try {
    const result = await handler(args)
    return Response.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Tool error'
    return Response.json({ success: false, error: message }, { status: 500 })
  }
}
