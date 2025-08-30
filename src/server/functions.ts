import { supabase } from '@/lib/supabaseAdmin'

type PaymentsArgs = {
  startDate?: string
  endDate?: string
  employee?: string
  department?: string
  minAmount?: number
  maxAmount?: number
  limit?: number
}

type ARAgingArgs = {
  customerId?: string
  startDate?: string
  endDate?: string
  limit?: number
}

type FinancialArgs = {
  customerId?: string
  startDate?: string
  endDate?: string
  limit?: number
}

// Replace these with your own business logic if desired
async function getPaymentsSummary(args: PaymentsArgs = {}) {
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
  return { success: true, rows: data }
}

async function getARAgingDetail(args: ARAgingArgs = {}) {
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
  return { success: true, rows: data }
}

async function getFinancialData(args: FinancialArgs = {}) {
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
  return { success: true, rows: data }
}

export const availableFunctions = {
  getPaymentsSummary,
  getARAgingDetail,
  getFinancialData,
}

export type AvailableFunction = keyof typeof availableFunctions
export type { PaymentsArgs, ARAgingArgs, FinancialArgs }
