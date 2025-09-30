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

4. payments - Payroll data
   Columns: date, first_name, last_name, department, total_amount
   - Combine first_name + last_name for employee name

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

Examples:
Q: "What's our revenue this month?"
A: SELECT SUM(credit - debit) as revenue FROM journal_entry_lines WHERE account_type ILIKE '%income%' AND date >= DATE_TRUNC('month', CURRENT_DATE) AND date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'

Q: "Which customer owes us the most?"
A: SELECT customer, SUM(open_balance) as total FROM ar_aging_detail WHERE open_balance > 0 GROUP BY customer ORDER BY total DESC LIMIT 10

Q: "Top 5 customers by revenue"
A: SELECT customer, SUM(credit - debit) as revenue FROM journal_entry_lines WHERE account_type ILIKE '%income%' AND customer IS NOT NULL GROUP BY customer ORDER BY revenue DESC LIMIT 5

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
      },
    })

  } catch (error) {
    const err = error instanceof Error ? error : new Error('Unknown API error')
    console.error('❌ API Error:', err.message, err)

    return NextResponse.json({
      response: "I'm having trouble processing that question. Could you try asking something like 'What's our revenue this month?' or 'Which customer has the highest profit?'",
      error: err.message,
      context: { queryType: 'error', platform: 'mobile' }
    }, { status: 200 }) // Return 200 so UI shows the message
  }
}

// Smart query executor
async function executeSmartQuery(sql: string, originalQuestion: string, supabase: SupabaseClient): Promise<QueryResult[]> {
  const sqlLower = sql.toLowerCase()

  try {
    if (sqlLower.includes('journal_entry_lines')) {
      return await executeJournalQuery(originalQuestion, supabase)
    } else if (sqlLower.includes('ar_aging_detail')) {
      return await executeARQuery(originalQuestion, supabase)
    } else if (sqlLower.includes('ap_aging')) {
      return await executeAPQuery(originalQuestion, supabase)
    } else if (sqlLower.includes('payments')) {
      return await executePayrollQuery(originalQuestion, supabase)
    }

    // Default: try journal entries
    return await executeJournalQuery(originalQuestion, supabase)

  } catch (error) {
    const err = error instanceof Error ? error : new Error('Unknown query execution error')
    console.error('Query execution error:', err)
    throw err
  }
}

// Execute journal entries query
async function executeJournalQuery(question: string, supabase: SupabaseClient): Promise<QueryResult[]> {
  const questionLower = question.toLowerCase()
  let query = supabase.from('journal_entry_lines').select('*')

  // Apply common filters based on question
  if (questionLower.includes('revenue') || questionLower.includes('income')) {
    query = query.or('account_type.ilike.%income%,account_type.ilike.%revenue%')
  }

  if (questionLower.includes('expense')) {
    query = query.ilike('account_type', '%expense%')
  }

  if (questionLower.includes('cogs') || questionLower.includes('cost of goods')) {
    query = query.or('account_type.ilike.%cogs%,account_type.ilike.%cost of goods%')
  }

  // Date filters
  if (questionLower.includes('this month') || questionLower.includes('current month')) {
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
    query = query.gte('date', startOfMonth)
  }

  if (questionLower.includes('this year') || questionLower.includes('ytd')) {
    const startOfYear = new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]
    query = query.gte('date', startOfYear)
  }

  query = query.limit(1000)

  const { data, error } = await query

  if (error) throw new Error(error.message)

  const records = (data ?? []) as JournalEntryRow[]

  // Post-process for aggregations
  if (questionLower.includes('customer') && (questionLower.includes('revenue') || questionLower.includes('profit'))) {
    return aggregateByCustomer(records)
  }

  if (questionLower.includes('total') || questionLower.includes('sum')) {
    return aggregateTotals(records, questionLower)
  }

  return records
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

// Execute payroll query
async function executePayrollQuery(question: string, supabase: SupabaseClient): Promise<QueryResult[]> {
  const questionLower = question.toLowerCase()
  let query = supabase.from('payments').select('*')

  // Date filters
  if (questionLower.includes('this month')) {
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
    query = query.gte('date', startOfMonth)
  }

  query = query.limit(500)

  const { data, error } = await query
  if (error) throw new Error(error.message)

  const records = (data ?? []) as JournalEntryRow[]

  // Group by department or employee
  if (questionLower.includes('department')) {
    return aggregatePayrollByDepartment(records)
  }

  if (questionLower.includes('employee')) {
    return aggregatePayrollByEmployee(records)
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

    case 'payroll': {
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
