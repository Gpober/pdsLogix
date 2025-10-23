import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

type QueryResult = Record<string, unknown>

interface JournalEntryRow extends QueryResult {
  account_type?: string | null
  credit?: number | null
  debit?: number | null
  customer?: string | null
  vendor?: string | null
  department?: string | null
  first_name?: string | null
  last_name?: string | null
  total_amount?: number | null
  open_balance?: number | null
  due_date?: string | null
}

interface PayrollSubmissionRow extends QueryResult {
  id?: string
  submission_number?: number
  location_name?: string
  pay_date?: string
  payroll_group?: string
  total_amount?: number
  total_employees?: number
  status?: string
  submitted_at?: string
}

interface OpenAIChoice {
  message?: {
    content?: string
  }
}

interface OpenAIResponse {
  choices?: OpenAIChoice[]
}

interface RequestPayload {
  message?: string
  userId?: string
  context?: unknown
}

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'

// Compact database schema for AI
const DATABASE_SCHEMA = `
Available Supabase tables:

1. journal_entry_lines - All financial GL transactions
   Columns: date, account, account_type, debit, credit, customer, memo, vendor, entry_number, report_category, normal_balance, entry_bank_account, is_cash_account
   - Revenue: account_type contains 'Income' or 'Revenue', amount = credit - debit
   - COGS: account_type contains 'Cost of Goods Sold' or 'COGS', amount = debit - credit
   - Expenses: account_type contains 'Expense', amount = debit - credit
   - Net Income = Revenue - COGS - Expenses
   - Cash Flow: filter by entry_bank_account IS NOT NULL and is_cash_account = false

2. ar_aging_detail - Accounts Receivable
   Columns: customer, number (invoice #), date, due_date, open_balance, memo
   - Filter: open_balance > 0 for outstanding invoices
   - Aging: calculate days between due_date and current date

3. ap_aging - Accounts Payable
   Columns: vendor, number (bill #), date, due_date, open_balance, memo
   - Filter: open_balance > 0 for outstanding bills

4. payments - Historical Payroll Data (approved payrolls only)
   Columns: date, first_name, last_name, department, total_amount, hours, units, rate, payroll_group, submission_id
   - Combine first_name + last_name for employee name
   - This contains APPROVED payroll that has been processed
   - For historical payroll analysis

5. payroll_submissions - Payroll Submission Records
   Columns: id, submission_number, location_id, pay_date, payroll_group, period_start, period_end, total_amount, total_employees, total_hours, total_units, status, submitted_at, approved_at, submitted_by, approved_by
   - Status: 'pending', 'approved', 'rejected'
   - Join with locations table for location_name
   - Use for tracking submission status and approval workflow

6. payroll_entries - Individual Employee Payroll Entries
   Columns: submission_id, employee_id, employee_name, employee_type, hours, units, rate, amount, notes
   - Join with payroll_submissions for full context
   - employee_type: 'hourly' or 'production'
   - Contains detailed breakdown of each submission

7. payroll_approvals - Payroll Approval History
   Columns: submission_id, approved_by, action, notes, created_at
   - action: 'approved' or 'rejected'
   - Audit trail for all approval actions

Today's date: ${new Date().toISOString().split('T')[0]}
`

let cachedSupabase: SupabaseClient | null = null

function getSupabaseClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Supabase environment variables are not configured')
  }

  if (!cachedSupabase) {
    cachedSupabase = createClient(supabaseUrl, supabaseServiceRoleKey)
  }

  return cachedSupabase
}

function getOpenAIApiKey(): string {
  const openaiApiKey = process.env.OPENAI_API_KEY
  if (!openaiApiKey) {
    throw new Error('OPENAI_API_KEY is not configured')
  }
  return openaiApiKey
}

function sanitizeSqlOutput(rawSql: string): string {
  return rawSql
    .replace(/```sql\n?/gi, '')
    .replace(/```\n?/g, '')
    .replace(/^SELECT/i, 'SELECT')
    .trim()
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = getSupabaseClient()
    const openaiApiKey = getOpenAIApiKey()

    let body: RequestPayload = {}
    try {
      body = (await request.json()) as RequestPayload
    } catch {
      body = {}
    }

    const { message } = body

    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    const queryType = detectQueryType(message)

    console.log('🎯 Query Type:', queryType, '| Message:', message)

    // Step 1: Generate SQL query
    const sqlPrompt = `${DATABASE_SCHEMA}

Question: "${message}"

Generate a PostgreSQL query to answer this question.

Requirements:
- Return ONLY the SQL query, no explanations or markdown
- Use proper aggregations (SUM, COUNT, AVG)
- Include GROUP BY when aggregating
- Order results by most relevant field
- Limit to 100 rows unless specifically asked for more
- Use COALESCE for NULL handling
- For date ranges: use >= and <= with proper date format
- For payroll submissions: JOIN with locations table to get location_name

Examples:
Q: "What's our revenue this month?"
A: SELECT SUM(credit - debit) as revenue FROM journal_entry_lines WHERE account_type ILIKE '%income%' AND date >= DATE_TRUNC('month', CURRENT_DATE) AND date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'

Q: "Which customer owes us the most?"
A: SELECT customer, SUM(open_balance) as total FROM ar_aging_detail WHERE open_balance > 0 GROUP BY customer ORDER BY total DESC LIMIT 10

Q: "Top 5 customers by revenue"
A: SELECT customer, SUM(credit - debit) as revenue FROM journal_entry_lines WHERE account_type ILIKE '%income%' AND customer IS NOT NULL GROUP BY customer ORDER BY revenue DESC LIMIT 5

Q: "Show me pending payroll submissions"
A: SELECT ps.submission_number, l.name as location_name, ps.pay_date, ps.payroll_group, ps.total_amount, ps.total_employees, ps.status FROM payroll_submissions ps LEFT JOIN locations l ON ps.location_id = l.id WHERE ps.status = 'pending' ORDER BY ps.submitted_at DESC LIMIT 20

Q: "What's the total payroll for this month?"
A: SELECT SUM(total_amount) as total FROM payroll_submissions WHERE pay_date >= DATE_TRUNC('month', CURRENT_DATE) AND pay_date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' AND status = 'approved'

SQL:`

    const sqlResponse = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL_LATEST || 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a SQL expert. Generate clean PostgreSQL queries. Return ONLY the SQL with no markdown formatting or explanations.'
          },
          { role: 'user', content: sqlPrompt }
        ],
        temperature: 0.1,
        max_tokens: 400,
      }),
    })

    if (!sqlResponse.ok) {
      throw new Error('Failed to generate SQL')
    }

    const sqlData = (await sqlResponse.json()) as OpenAIResponse
    const sqlContent = sqlData.choices?.[0]?.message?.content?.trim()

    if (!sqlContent) {
      throw new Error('SQL response from OpenAI was empty')
    }

    const sqlQuery = sanitizeSqlOutput(sqlContent)

    console.log('📊 Generated SQL:', sqlQuery)

    // Step 2: Execute query
    let queryResults: QueryResult[] = []
    try {
      queryResults = await executeSmartQuery(sqlQuery, message, supabase)
    } catch (queryError) {
      const err = queryError instanceof Error ? queryError : new Error('Unknown query execution error')
      console.error('❌ Query execution failed:', err)
      // Fallback to simple data fetch
      queryResults = await getFallbackData(queryType, supabase)
    }

    console.log('✅ Query returned', queryResults.length, 'rows')

    const truncatedResults = queryResults.slice(0, 20)

    // Step 3: Generate natural language response
    const responsePrompt = `You are a friendly AI CFO assistant for a construction/property management company called "I AM CFO".

User asked: "${message}"

Data returned from database:
${JSON.stringify(truncatedResults, null, 2)}

Generate a concise, conversational response (2-4 sentences max):
1. Directly answer their question with specific numbers
2. Format currency as $X,XXX or $X.XK / $X.XM for large amounts
3. Provide ONE brief insight or recommendation if relevant
4. Be professional but friendly - like a helpful CFO colleague

Keep it SHORT and actionable. No fluff or preambles.`

    const responseGen = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL_LATEST || 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful AI CFO. Give concise, actionable insights. Format numbers clearly. Keep responses under 100 words.'
          },
          { role: 'user', content: responsePrompt }
        ],
        temperature: 0.7,
        max_tokens: 250,
      }),
    })

    if (!responseGen.ok) {
      throw new Error('Failed to generate response')
    }

    const responseData = (await responseGen.json()) as OpenAIResponse
    const aiResponse = responseData.choices?.[0]?.message?.content?.trim()

    if (!aiResponse) {
      throw new Error('OpenAI response was empty')
    }

    return NextResponse.json({
      response: aiResponse,
      context: {
        queryType,
        platform: 'mobile',
        dataPoints: queryResults.length,
        sql: sqlQuery // Include for debugging
      }
    })

  } catch (error) {
    console.error('❌ API Error:', error)
    return NextResponse.json(
      {
        error: 'Failed to process request',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// Smart query executor with multiple strategies
async function executeSmartQuery(
  sqlQuery: string,
  question: string,
  supabase: SupabaseClient
): Promise<QueryResult[]> {
  const questionLower = question.toLowerCase()

  // Route to specialized handlers
  if (questionLower.includes('payroll submission') || questionLower.includes('pending payroll') || 
      questionLower.includes('submitted payroll')) {
    return await executePayrollSubmissionQuery(question, supabase)
  }

  if (questionLower.includes('payroll') || questionLower.includes('employee pay')) {
    return await executePayrollQuery(question, supabase)
  }

  if (questionLower.includes('accounts receivable') || questionLower.includes('a/r') || questionLower.includes('invoice')) {
    return await executeARQuery(question, supabase)
  }

  if (questionLower.includes('accounts payable') || questionLower.includes('a/p') || questionLower.includes('vendor')) {
    return await executeAPQuery(question, supabase)
  }

  // Try direct SQL execution for complex queries
  try {
    const { data, error } = await supabase.rpc('execute_sql', { query: sqlQuery })
    if (!error && data) {
      return data as QueryResult[]
    }
  } catch {
    // Fall through to manual parsing
  }

  // Manual query parsing for P&L type questions
  if (questionLower.includes('revenue') || questionLower.includes('income')) {
    return await executeRevenueQuery(question, supabase)
  }

  if (questionLower.includes('expense')) {
    return await executeExpenseQuery(question, supabase)
  }

  if (questionLower.includes('customer')) {
    return await executeCustomerQuery(question, supabase)
  }

  // Default fallback
  return await getFallbackData('general', supabase)
}

// Execute revenue query
async function executeRevenueQuery(question: string, supabase: SupabaseClient): Promise<QueryResult[]> {
  let query = supabase
    .from('journal_entry_lines')
    .select('*')
    .or('account_type.ilike.%income%,account_type.ilike.%revenue%')

  const questionLower = question.toLowerCase()

  // Date filters
  if (questionLower.includes('this month')) {
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
    query = query.gte('date', startOfMonth)
  }

  if (questionLower.includes('this year')) {
    const startOfYear = new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]
    query = query.gte('date', startOfYear)
  }

  query = query.limit(500)

  const { data, error } = await query
  if (error) throw new Error(error.message)

  const records = (data ?? []) as JournalEntryRow[]

  // Group by customer if needed
  if (questionLower.includes('customer') || questionLower.includes('which')) {
    return aggregateByCustomer(records)
  }

  // Return total if asking for a sum
  if (questionLower.includes('total') || questionLower.includes('how much')) {
    return aggregateTotals(records, question)
  }

  return records
}

// Execute expense query
async function executeExpenseQuery(question: string, supabase: SupabaseClient): Promise<QueryResult[]> {
  let query = supabase
    .from('journal_entry_lines')
    .select('*')
    .ilike('account_type', '%expense%')

  const questionLower = question.toLowerCase()

  if (questionLower.includes('this month')) {
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
    query = query.gte('date', startOfMonth)
  }

  query = query.limit(500)

  const { data, error } = await query
  if (error) throw new Error(error.message)

  const records = (data ?? []) as JournalEntryRow[]

  if (questionLower.includes('total') || questionLower.includes('how much')) {
    return aggregateTotals(records, question)
  }

  return records
}

// Execute customer query
async function executeCustomerQuery(question: string, supabase: SupabaseClient): Promise<QueryResult[]> {
  const { data, error } = await supabase
    .from('journal_entry_lines')
    .select('*')
    .or('account_type.ilike.%income%,account_type.ilike.%revenue%')
    .not('customer', 'is', null)
    .limit(1000)

  if (error) throw new Error(error.message)

  const records = (data ?? []) as JournalEntryRow[]
  return aggregateByCustomer(records)
}

// Execute AR query
async function executeARQuery(question: string, supabase: SupabaseClient): Promise<QueryResult[]> {
  let query = supabase
    .from('ar_aging_detail')
    .select('*')
    .gt('open_balance', 0)

  const questionLower = question.toLowerCase()

  if (questionLower.includes('overdue')) {
    query = query.lt('due_date', new Date().toISOString().split('T')[0])
  }

  query = query.limit(100)

  const { data, error } = await query
  if (error) throw new Error(error.message)

  const records = (data ?? []) as JournalEntryRow[]

  // Group by customer if needed
  if (questionLower.includes('customer') || questionLower.includes('which')) {
    return aggregateARByCustomer(records)
  }

  return records
}

// Execute AP query
async function executeAPQuery(question: string, supabase: SupabaseClient): Promise<QueryResult[]> {
  let query = supabase
    .from('ap_aging')
    .select('*')
    .gt('open_balance', 0)

  const questionLower = question.toLowerCase()

  if (questionLower.includes('overdue')) {
    query = query.lt('due_date', new Date().toISOString().split('T')[0])
  }

  query = query.limit(100)

  const { data, error } = await query
  if (error) throw new Error(error.message)

  const records = (data ?? []) as JournalEntryRow[]

  // Group by vendor if needed
  if (questionLower.includes('vendor') || questionLower.includes('which')) {
    return aggregateAPByVendor(records)
  }

  return records
}

// NEW: Execute payroll submission query
async function executePayrollSubmissionQuery(question: string, supabase: SupabaseClient): Promise<QueryResult[]> {
  const questionLower = question.toLowerCase()
  
  // Build query with location join
  let query = supabase
    .from('payroll_submissions')
    .select(`
      id,
      submission_number,
      location_id,
      pay_date,
      payroll_group,
      period_start,
      period_end,
      total_amount,
      total_employees,
      total_hours,
      total_units,
      status,
      submitted_at,
      approved_at,
      locations!inner(name)
    `)

  // Status filters
  if (questionLower.includes('pending')) {
    query = query.eq('status', 'pending')
  } else if (questionLower.includes('approved')) {
    query = query.eq('status', 'approved')
  } else if (questionLower.includes('rejected')) {
    query = query.eq('status', 'rejected')
  }

  // Date filters
  if (questionLower.includes('this month')) {
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
    query = query.gte('pay_date', startOfMonth)
  }

  if (questionLower.includes('this week')) {
    const startOfWeek = new Date()
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
    query = query.gte('pay_date', startOfWeek.toISOString().split('T')[0])
  }

  // Payroll group filter
  if (questionLower.includes('group a')) {
    query = query.eq('payroll_group', 'A')
  } else if (questionLower.includes('group b')) {
    query = query.eq('payroll_group', 'B')
  }

  query = query.order('submitted_at', { ascending: false }).limit(50)

  const { data, error } = await query
  if (error) throw new Error(error.message)

  // Flatten the location data
  const records = (data ?? []).map(record => ({
    ...record,
    location_name: (record.locations as any)?.name || 'Unknown Location',
    locations: undefined
  }))

  return records as QueryResult[]
}

// Execute payroll query (handles both historical payments and new submissions)
async function executePayrollQuery(question: string, supabase: SupabaseClient): Promise<QueryResult[]> {
  const questionLower = question.toLowerCase()

  // If asking about submissions, route to submission handler
  if (questionLower.includes('submission') || questionLower.includes('pending') || 
      questionLower.includes('approved payroll') || questionLower.includes('rejected')) {
    return await executePayrollSubmissionQuery(question, supabase)
  }

  // Otherwise query historical payments table
  let query = supabase.from('payments').select('*')

  // Date filters
  if (questionLower.includes('this month')) {
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
    query = query.gte('date', startOfMonth)
  }

  if (questionLower.includes('this year')) {
    const startOfYear = new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]
    query = query.gte('date', startOfYear)
  }

  query = query.limit(500)

  const { data, error } = await query
  if (error) throw new Error(error.message)

  const records = (data ?? []) as JournalEntryRow[]

  // Group by department or employee
  if (questionLower.includes('department') || questionLower.includes('location')) {
    return aggregatePayrollByDepartment(records)
  }

  if (questionLower.includes('employee') || questionLower.includes('who')) {
    return aggregatePayrollByEmployee(records)
  }

  // Return totals if asking for sum
  if (questionLower.includes('total') || questionLower.includes('how much')) {
    const total = records.reduce((sum, row) => sum + (row.total_amount ?? 0), 0)
    return [{ total, record_count: records.length }]
  }

  return records
}

// Aggregation helpers
function aggregateByCustomer(data: JournalEntryRow[]): QueryResult[] {
  const customerMap = new Map<string, { customer: string; revenue: number; count: number }>()

  data.forEach(row => {
    const customer = (row.customer as string | null) || 'Unknown'
    const revenue = (row.credit ?? 0) - (row.debit ?? 0)

    if (!customerMap.has(customer)) {
      customerMap.set(customer, { customer, revenue: 0, count: 0 })
    }

    const current = customerMap.get(customer)!
    current.revenue += revenue
    current.count += 1
  })

  return Array.from(customerMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)
}

function aggregateTotals(data: JournalEntryRow[], question: string): QueryResult[] {
  let total = 0

  data.forEach(row => {
    if (question.includes('revenue') || question.includes('income')) {
      total += (row.credit ?? 0) - (row.debit ?? 0)
    } else if (question.includes('expense') || question.includes('cogs')) {
      total += (row.debit ?? 0) - (row.credit ?? 0)
    } else {
      total += (row.credit ?? 0) - (row.debit ?? 0)
    }
  })

  return [{ total, record_count: data.length }]
}

function aggregateARByCustomer(data: JournalEntryRow[]): QueryResult[] {
  const customerMap = new Map<string, { customer: string; total_outstanding: number; invoice_count: number }>()

  data.forEach(row => {
    const customer = (row.customer as string | null) || 'Unknown'
    const balance = row.open_balance ?? 0

    if (!customerMap.has(customer)) {
      customerMap.set(customer, { customer, total_outstanding: 0, invoice_count: 0 })
    }

    const current = customerMap.get(customer)!
    current.total_outstanding += balance
    current.invoice_count += 1
  })

  return Array.from(customerMap.values())
    .sort((a, b) => b.total_outstanding - a.total_outstanding)
    .slice(0, 10)
}

function aggregateAPByVendor(data: JournalEntryRow[]): QueryResult[] {
  const vendorMap = new Map<string, { vendor: string; total_outstanding: number; bill_count: number }>()

  data.forEach(row => {
    const vendor = (row.vendor as string | null) || 'Unknown'
    const balance = row.open_balance ?? 0

    if (!vendorMap.has(vendor)) {
      vendorMap.set(vendor, { vendor, total_outstanding: 0, bill_count: 0 })
    }

    const current = vendorMap.get(vendor)!
    current.total_outstanding += balance
    current.bill_count += 1
  })

  return Array.from(vendorMap.values())
    .sort((a, b) => b.total_outstanding - a.total_outstanding)
    .slice(0, 10)
}

function aggregatePayrollByDepartment(data: JournalEntryRow[]): QueryResult[] {
  const deptMap = new Map<string, { department: string; total: number; employee_count: number }>()

  data.forEach(row => {
    const dept = (row.department as string | null) || 'Unknown'
    const amount = row.total_amount ?? 0

    if (!deptMap.has(dept)) {
      deptMap.set(dept, { department: dept, total: 0, employee_count: 0 })
    }

    const current = deptMap.get(dept)!
    current.total += amount
    current.employee_count += 1
  })

  return Array.from(deptMap.values())
    .sort((a, b) => b.total - a.total)
}

function aggregatePayrollByEmployee(data: JournalEntryRow[]): QueryResult[] {
  const empMap = new Map<string, { employee: string; total: number; payment_count: number }>()

  data.forEach(row => {
    const firstName = (row.first_name as string | null) || ''
    const lastName = (row.last_name as string | null) || ''
    const name = `${firstName} ${lastName}`.trim() || 'Unknown'
    const amount = row.total_amount ?? 0

    if (!empMap.has(name)) {
      empMap.set(name, { employee: name, total: 0, payment_count: 0 })
    }

    const current = empMap.get(name)!
    current.total += amount
    current.payment_count += 1
  })

  return Array.from(empMap.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)
}

// Fallback data fetcher
async function getFallbackData(queryType: string, supabase: SupabaseClient): Promise<QueryResult[]> {
  switch (queryType) {
    case 'ar_analysis': {
      const { data, error } = await supabase
        .from('ar_aging_detail')
        .select('*')
        .gt('open_balance', 0)
        .limit(50)

      if (error) throw new Error(error.message)
      return (data ?? []) as QueryResult[]
    }

    case 'payroll':
    case 'payroll_submission': {
      // Try new payroll system first
      const { data: submissions, error: submissionError } = await supabase
        .from('payroll_submissions')
        .select(`
          *,
          locations!inner(name)
        `)
        .limit(50)

      if (!submissionError && submissions && submissions.length > 0) {
        return submissions.map(record => ({
          ...record,
          location_name: (record.locations as any)?.name || 'Unknown',
          locations: undefined
        })) as QueryResult[]
      }

      // Fall back to legacy payments
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .limit(100)

      if (error) throw new Error(error.message)
      return (data ?? []) as QueryResult[]
    }

    default: {
      const { data, error } = await supabase
        .from('journal_entry_lines')
        .select('*')
        .limit(100)

      if (error) throw new Error(error.message)
      return (data ?? []) as QueryResult[]
    }
  }
}

function detectQueryType(message: string): string {
  const s = String(message || '').toLowerCase()

  if (s.includes('payroll submission') || s.includes('pending payroll') || 
      s.includes('submitted payroll') || s.includes('approved payroll'))
    return 'payroll_submission'

  if (s.includes('accounts receivable') || s.includes('a/r') || s.includes('overdue') || s.includes('invoice'))
    return 'ar_analysis'

  if (s.includes('payroll') || s.includes('employee') || s.includes('labor'))
    return 'payroll'

  if (s.includes('vendor') || s.includes('accounts payable') || s.includes('a/p') || s.includes('bill'))
    return 'ap_analysis'

  if (s.includes('customer') || s.includes('client'))
    return 'customer_analysis'

  if (s.includes('revenue') || s.includes('income') || s.includes('profit'))
    return 'financial_analysis'

  return 'general'
}
