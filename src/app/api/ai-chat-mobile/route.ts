import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

type QueryResult = Record<string, unknown>

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'

interface RequestPayload {
  message?: string
  userId?: string
  context?: unknown
}

// Comprehensive database schema for Claude
const DATABASE_SCHEMA = `
You have access to a PostgreSQL database with these tables:

1. journal_entry_lines - Financial transactions (GL)
   - Columns: date, account, account_type, debit, credit, customer, vendor, memo
   - For revenue: WHERE account_type ILIKE '%income%' OR account_type ILIKE '%revenue%'
   - For expenses: WHERE account_type ILIKE '%expense%'
   - Revenue = SUM(credit - debit), Expenses = SUM(debit - credit)

2. ar_aging_detail - Accounts Receivable
   - Columns: customer, number, date, due_date, open_balance, memo
   - Outstanding invoices: WHERE open_balance > 0

3. ap_aging - Accounts Payable
   - Columns: vendor, number, date, due_date, open_balance, memo
   - Outstanding bills: WHERE open_balance > 0

4. payments - Historical Payroll (approved only)
   - Columns: date, first_name, last_name, department, total_amount, hours, units, rate, payroll_group
   - Employee name = first_name || ' ' || last_name

5. payroll_submissions - Payroll Submission Tracking
   - Columns: id, submission_number, location_id, pay_date, payroll_group (A/B), total_amount, total_employees, status, submitted_at, approved_at
   - Status values: 'pending', 'approved', 'rejected'
   - JOIN locations ON location_id for location name

6. payroll_entries - Employee Payroll Details
   - Columns: submission_id, employee_id, employee_name, employee_type, hours, units, rate, amount
   - employee_type: 'hourly' or 'production'

7. locations - Business Locations
   - Columns: id, name, organization_id

Current date: ${new Date().toISOString().split('T')[0]}
`

let cachedSupabase: SupabaseClient | null = null

function getSupabaseClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Supabase environment variables are not configured')
  }

  if (!cachedSupabase) {
    cachedSupabase = createClient(supabaseUrl, supabaseServiceRoleKey)
  }

  return cachedSupabase
}

function getAnthropicApiKey(): string {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured')
  }
  return apiKey
}

function getOpenAIApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured')
  }
  return apiKey
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = getSupabaseClient()
    const anthropicKey = getAnthropicApiKey()

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

    console.log('💬 User question:', message)

    // Step 1: Let Claude analyze the question and determine what data to fetch
    const analysisPrompt = `${DATABASE_SCHEMA}

User question: "${message}"

Analyze this question and respond with JSON containing:
{
  "table": "table_name",
  "filters": "WHERE clause conditions",
  "aggregation": "SUM/COUNT/AVG or null",
  "groupBy": "column to group by or null",
  "orderBy": "column to order by or null",
  "limit": number
}

Examples:
Q: "What's my revenue this month?"
A: {"table":"journal_entry_lines","filters":"account_type ILIKE '%income%' AND date >= DATE_TRUNC('month', CURRENT_DATE)","aggregation":"SUM(credit - debit)","groupBy":null,"orderBy":null,"limit":1}

Q: "Show pending payroll"
A: {"table":"payroll_submissions","filters":"status = 'pending'","aggregation":null,"groupBy":null,"orderBy":"submitted_at DESC","limit":20}

Q: "Who owes me money?"
A: {"table":"ar_aging_detail","filters":"open_balance > 0","aggregation":null,"groupBy":"customer","orderBy":"open_balance DESC","limit":10}

Respond ONLY with the JSON, no other text.`

    const analysisResponse = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: analysisPrompt
          }
        ]
      })
    })

    if (!analysisResponse.ok) {
      throw new Error(`Claude API error: ${analysisResponse.statusText}`)
    }

    const analysisData = await analysisResponse.json()
    const analysisText = analysisData.content?.[0]?.text || '{}'
    
    console.log('🤖 Claude analysis:', analysisText)

    // Parse the query plan
    let queryPlan: any
    try {
      // Extract JSON from response (in case Claude added explanation)
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/)
      queryPlan = JSON.parse(jsonMatch ? jsonMatch[0] : analysisText)
    } catch (parseError) {
      console.error('❌ Failed to parse Claude response, using fallback')
      queryPlan = { table: 'journal_entry_lines', filters: null, limit: 100 }
    }

    // Step 2: Execute the query based on Claude's plan
    let queryResults: QueryResult[] = []
    
    try {
      queryResults = await executeQueryPlan(queryPlan, supabase)
      console.log('✅ Query returned', queryResults.length, 'rows')
    } catch (queryError) {
      console.error('❌ Query execution failed:', queryError)
      // Fallback: try to get some relevant data
      queryResults = await getFallbackData(queryPlan.table || 'journal_entry_lines', supabase)
      console.log('🔄 Fallback returned', queryResults.length, 'rows')
    }

    // Step 3: If we have no data, get SOMETHING to show
    if (queryResults.length === 0) {
      console.log('⚠️ No results, trying broader query')
      queryResults = await getAnyRelevantData(message, supabase)
    }

    const truncatedResults = queryResults.slice(0, 20)

    // Step 4: Have Claude generate the response based on actual data
    const responsePrompt = queryResults.length === 0
      ? `User asked: "${message}"

No data was found in the database. Explain that there's no data for this query in a friendly way and suggest what data might be available. Keep it under 50 words.`
      : `User asked: "${message}"

Database results:
${JSON.stringify(truncatedResults, null, 2)}

You are a friendly CFO assistant. Answer their question directly using the data above. Format currency clearly. Keep response under 100 words. Be conversational and helpful.`

    const responseGen = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        messages: [
          {
            role: 'user',
            content: responsePrompt
          }
        ]
      })
    })

    if (!responseGen.ok) {
      throw new Error(`Claude API error: ${responseGen.statusText}`)
    }

    const responseData = await responseGen.json()
    const aiResponse = responseData.content?.[0]?.text || 'I apologize, but I had trouble generating a response. Please try again.'

    console.log('✅ Final response generated')

    return NextResponse.json({
      response: aiResponse,
      context: {
        dataPoints: queryResults.length,
        table: queryPlan.table,
        platform: 'mobile'
      }
    })

  } catch (error) {
    console.error('❌ API Error:', error)
    
    return NextResponse.json({
      response: "I'm having trouble connecting to the database right now. Please try again in a moment, or try asking a different question.",
      context: {
        error: error instanceof Error ? error.message : 'Unknown error',
        platform: 'mobile'
      }
    })
  }
}

// Paginated aggregation for handling 30K+ records
async function executePaginatedAggregation(
  table: string,
  filters: string | null,
  aggregation: string,
  supabase: SupabaseClient
): Promise<QueryResult[]> {
  
  console.log('🔄 Starting paginated aggregation for large dataset...')
  
  // Build base query with filters
  let baseQuery = supabase.from(table).select('*', { count: 'exact', head: false })
  
  // Apply filters
  if (filters) {
    const filterLower = filters.toLowerCase()
    
    if (filterLower.includes('income') || filterLower.includes('revenue')) {
      baseQuery = baseQuery.or('account_type.ilike.%income%,account_type.ilike.%revenue%')
    }
    
    if (filterLower.includes('expense')) {
      baseQuery = baseQuery.ilike('account_type', '%expense%')
    }
    
    if (filterLower.includes('open_balance > 0')) {
      baseQuery = baseQuery.gt('open_balance', 0)
    }
    
    // Date filters - handle both plain text and PostgreSQL DATE_TRUNC syntax
    if (filterLower.includes('this month') || filterLower.includes('current_date') || filterLower.includes("date_trunc('month'")) {
      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
      baseQuery = baseQuery.gte('date', startOfMonth)
    }
    
    if (filterLower.includes('this year') || filterLower.includes("date_trunc('year'")) {
      const startOfYear = new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]
      baseQuery = baseQuery.gte('date', startOfYear)
    }
  }

  // Paginate through ALL records
  const PAGE_SIZE = 1000 // Supabase recommended page size
  let allRecords: any[] = []
  let currentPage = 0
  let hasMore = true

  while (hasMore) {
    const { data, error } = await baseQuery
      .range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1)

    if (error) {
      console.error('❌ Pagination error:', error)
      break
    }

    if (data && data.length > 0) {
      allRecords = allRecords.concat(data)
      currentPage++
      hasMore = data.length === PAGE_SIZE
      
      console.log(`📊 Page ${currentPage}: ${data.length} records (total: ${allRecords.length})`)
      
      // Safety limit: stop at 100K records to prevent memory issues
      if (allRecords.length >= 100000) {
        console.log('⚠️ Reached 100K record safety limit')
        break
      }
    } else {
      hasMore = false
    }
  }

  console.log(`✅ Pagination complete: ${allRecords.length} total records`)

  // Aggregate all records
  if (aggregation.includes('SUM')) {
    if (aggregation.includes('credit - debit')) {
      const total = allRecords.reduce((sum, row) => {
        const credit = parseFloat(String(row.credit || 0))
        const debit = parseFloat(String(row.debit || 0))
        return sum + (credit - debit)
      }, 0)
      
      return [{ total, record_count: allRecords.length }]
    } else if (aggregation.includes('total_amount') || aggregation.includes('open_balance')) {
      const field = aggregation.includes('total_amount') ? 'total_amount' : 'open_balance'
      const total = allRecords.reduce((sum, row) => {
        return sum + parseFloat(String(row[field] || 0))
      }, 0)
      
      return [{ total, record_count: allRecords.length }]
    }
  } else if (aggregation.includes('COUNT')) {
    return [{ count: allRecords.length }]
  }

  return [{ error: 'Aggregation type not supported' }]
}

// Execute query based on Claude's plan
async function executeQueryPlan(plan: any, supabase: SupabaseClient): Promise<QueryResult[]> {
  const { table, filters, aggregation, groupBy, orderBy, limit } = plan
  
  console.log('📊 Executing query plan:', plan)

  // USE PAGINATED AGGREGATION for large tables with SUM aggregations
  // This handles 30K+ records accurately
  const largeTables = ['journal_entry_lines', 'ar_aging_detail', 'ap_aging', 'payments']
  
  console.log('🔍 Checking pagination conditions:', {
    table,
    isLargeTable: largeTables.includes(table),
    hasAggregation: !!aggregation,
    aggregationType: aggregation,
    includesSUM: aggregation?.includes('SUM')
  })
  
  if (largeTables.includes(table) && aggregation && aggregation.includes('SUM')) {
    console.log(`🚀 Using paginated aggregation for ${table} to ensure accurate totals...`)
    return await executePaginatedAggregation(table, filters, aggregation, supabase)
  }

  // Handle joins for payroll_submissions
  if (table === 'payroll_submissions') {
    let query = supabase
      .from('payroll_submissions')
      .select(`
        id,
        submission_number,
        pay_date,
        payroll_group,
        total_amount,
        total_employees,
        total_hours,
        total_units,
        status,
        submitted_at,
        approved_at,
        locations!inner(name)
      `)

    // Apply filters
    if (filters) {
      if (filters.includes("status = 'pending'")) query = query.eq('status', 'pending')
      else if (filters.includes("status = 'approved'")) query = query.eq('status', 'approved')
      else if (filters.includes("status = 'rejected'")) query = query.eq('status', 'rejected')
      
      if (filters.includes('this month') || filters.includes('CURRENT_DATE')) {
        const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
        query = query.gte('pay_date', startOfMonth)
      }
    }

    if (orderBy) {
      const desc = orderBy.toLowerCase().includes('desc')
      const col = orderBy.replace(/DESC|ASC/gi, '').trim()
      query = query.order(col, { ascending: !desc })
    }

    query = query.limit(limit || 50)

    const { data, error } = await query
    if (error) throw new Error(error.message)

    // Flatten location data
    return (data || []).map(record => ({
      ...record,
      location_name: (record.locations as any)?.name || 'Unknown',
      locations: undefined
    }))
  }

  // Handle standard tables
  let query = supabase.from(table).select('*')

  // Apply filters manually for common patterns
  if (filters) {
    const filterLower = filters.toLowerCase()
    
    // Revenue filters
    if (filterLower.includes('income') || filterLower.includes('revenue')) {
      query = query.or('account_type.ilike.%income%,account_type.ilike.%revenue%')
    }
    
    // Expense filters
    if (filterLower.includes('expense')) {
      query = query.ilike('account_type', '%expense%')
    }
    
    // Open balance filters
    if (filterLower.includes('open_balance > 0')) {
      query = query.gt('open_balance', 0)
    }
    
    // Date filters
    if (filterLower.includes('this month') || filterLower.includes('current_date')) {
      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
      query = query.gte('date', startOfMonth)
    }
    
    if (filterLower.includes('this year')) {
      const startOfYear = new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]
      query = query.gte('date', startOfYear)
    }
  }

  // Apply ordering (for non-aggregations only, since aggregations use pagination)
  if (orderBy && !aggregation) {
    const desc = orderBy.toLowerCase().includes('desc')
    const col = orderBy.replace(/DESC|ASC/gi, '').trim()
    query = query.order(col, { ascending: !desc })
  }

  // Apply normal limit for non-aggregations
  query = query.limit(limit || 100)
  
  const { data, error } = await query
  if (error) throw new Error(error.message)

  let results = (data || []) as QueryResult[]

  // Handle grouping
  if (groupBy && !aggregation) {
    const grouped = new Map<string, any[]>()
    results.forEach(row => {
      const key = (row[groupBy] as string) || 'Unknown'
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(row)
    })

    results = Array.from(grouped.entries()).map(([key, rows]) => ({
      [groupBy]: key,
      count: rows.length,
      total: rows.reduce((sum, row: any) => sum + (row.total_amount || row.open_balance || 0), 0)
    }))
    
    // Sort by total descending
    results.sort((a: any, b: any) => (b.total || 0) - (a.total || 0))
  }

  return results
}

// Fallback queries for each table
async function getFallbackData(table: string, supabase: SupabaseClient): Promise<QueryResult[]> {
  try {
    switch (table) {
      case 'payroll_submissions': {
        const { data } = await supabase
          .from('payroll_submissions')
          .select(`*, locations!inner(name)`)
          .order('submitted_at', { ascending: false })
          .limit(20)
        
        return (data || []).map(record => ({
          ...record,
          location_name: (record.locations as any)?.name || 'Unknown',
          locations: undefined
        }))
      }
      
      case 'payments': {
        const { data } = await supabase
          .from('payments')
          .select('*')
          .order('date', { ascending: false })
          .limit(50)
        return data || []
      }
      
      case 'ar_aging_detail': {
        const { data } = await supabase
          .from('ar_aging_detail')
          .select('*')
          .gt('open_balance', 0)
          .limit(50)
        return data || []
      }
      
      case 'ap_aging': {
        const { data } = await supabase
          .from('ap_aging')
          .select('*')
          .gt('open_balance', 0)
          .limit(50)
        return data || []
      }
      
      default: {
        const { data } = await supabase
          .from('journal_entry_lines')
          .select('*')
          .order('date', { ascending: false })
          .limit(100)
        return data || []
      }
    }
  } catch (error) {
    console.error('Fallback query failed:', error)
    return []
  }
}

// Try to get ANY relevant data when all else fails
async function getAnyRelevantData(question: string, supabase: SupabaseClient): Promise<QueryResult[]> {
  const questionLower = question.toLowerCase()
  
  try {
    // Try payroll first
    if (questionLower.includes('payroll') || questionLower.includes('employee')) {
      const { data } = await supabase
        .from('payroll_submissions')
        .select(`*, locations!inner(name)`)
        .limit(10)
      
      if (data && data.length > 0) {
        return data.map(record => ({
          ...record,
          location_name: (record.locations as any)?.name || 'Unknown',
          locations: undefined
        }))
      }
    }
    
    // Try revenue
    if (questionLower.includes('revenue') || questionLower.includes('income') || questionLower.includes('sales')) {
      const { data } = await supabase
        .from('journal_entry_lines')
        .select('*')
        .or('account_type.ilike.%income%,account_type.ilike.%revenue%')
        .limit(50)
      
      if (data && data.length > 0) return data
    }
    
    // Default: recent transactions
    const { data } = await supabase
      .from('journal_entry_lines')
      .select('*')
      .order('date', { ascending: false })
      .limit(20)
    
    return data || []
  } catch (error) {
    console.error('Emergency fallback failed:', error)
    return []
  }
}
