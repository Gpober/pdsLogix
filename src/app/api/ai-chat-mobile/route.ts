import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

type QueryResult = Record<string, unknown>

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

interface RequestPayload {
  message?: string
  userId?: string
  context?: unknown
}

// ============================================================================
// ENHANCED DATABASE SCHEMA WITH CALCULATION CAPABILITIES
// ============================================================================

const DATABASE_SCHEMA = `
You are an expert CFO with access to a PostgreSQL database. You can perform ANY financial analysis.

TABLES:
1. journal_entry_lines - All financial transactions
   Columns: date, account, account_type, debit, credit, customer, vendor, memo, description
   Account Types: "Income", "Other Income", "Expenses", "Cost of Goods Sold", "Bank", "Accounts receivable (A/R)", "Accounts payable (A/P)", "Fixed Assets", "Other Current Assets", "Other Current Liabilities", "Equity"
   
   Financial Calculations:
   - Revenue = SUM(credit - debit) WHERE account_type IN ('Income', 'Other Income')
   - Expenses = SUM(debit - credit) WHERE account_type IN ('Expenses', 'Cost of Goods Sold')
   - Gross Profit = Revenue - Cost of Goods Sold
   - Net Profit = Revenue - All Expenses
   - Profit Margin = (Net Profit / Revenue) * 100

2. ar_aging_detail - Accounts Receivable
   Columns: customer, number, date, due_date, open_balance, memo, days_overdue
   
3. ap_aging - Accounts Payable
   Columns: vendor, number, date, due_date, open_balance, memo
   
4. payments - Historical Payroll Payments
   Columns: date, first_name, last_name, department, total_amount, hours, units, rate, payroll_group
   
5. payroll_submissions - Pending/Approved Payroll
   Columns: id, submission_number, location_id, pay_date, payroll_group, total_amount, total_employees, status, submitted_at, approved_at
   
6. payroll_entries - Payroll Line Items
   Columns: submission_id, employee_id, employee_name, employee_type, hours, units, rate, amount
   
7. locations - Business Locations
   Columns: id, name, organization_id

ANALYSIS CAPABILITIES:
- Time comparisons (this month vs last month, YoY, QoQ)
- Trend analysis (growth rates, moving averages)
- Profitability metrics (margin, EBITDA, ROI)
- Cash flow analysis (burn rate, runway)
- Forecasting and projections
- What-if scenarios

Current date: ${new Date().toISOString().split('T')[0]}
Current year: ${new Date().getFullYear()}
Current month: ${new Date().toLocaleString('default', { month: 'long' })}
`

// ============================================================================
// SUPABASE CLIENT
// ============================================================================

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

// ============================================================================
// MAIN API HANDLER
// ============================================================================

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

    // STEP 1: Analyze the query and determine what data is needed
    const analysisPrompt = `${DATABASE_SCHEMA}

User Question: "${message}"

Analyze this question and create a DATA RETRIEVAL PLAN. Return ONLY valid JSON with this structure:

{
  "query_type": "simple|comparison|calculation|trend|forecast",
  "requires_multiple_queries": boolean,
  "data_needed": [
    {
      "table": "table_name",
      "filters": "SQL WHERE conditions",
      "aggregation": "SUM/COUNT/AVG expression or null",
      "groupBy": "column or null",
      "orderBy": "column ASC/DESC or null",
      "limit": number,
      "alias": "descriptive_name"
    }
  ],
  "calculation": "description of any post-query calculation needed"
}

EXAMPLES:

Q: "What is my revenue this year?"
A: {"query_type":"simple","requires_multiple_queries":false,"data_needed":[{"table":"journal_entry_lines","filters":"(account_type = 'Income' OR account_type = 'Other Income') AND date >= '${new Date().getFullYear()}-01-01'","aggregation":"SUM(credit - debit)","groupBy":null,"orderBy":null,"limit":1,"alias":"ytd_revenue"}],"calculation":null}

Q: "Compare this month's revenue to last month"
A: {"query_type":"comparison","requires_multiple_queries":true,"data_needed":[{"table":"journal_entry_lines","filters":"(account_type = 'Income' OR account_type = 'Other Income') AND date >= DATE_TRUNC('month', CURRENT_DATE)","aggregation":"SUM(credit - debit)","groupBy":null,"orderBy":null,"limit":1,"alias":"current_month"},{"table":"journal_entry_lines","filters":"(account_type = 'Income' OR account_type = 'Other Income') AND date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month') AND date < DATE_TRUNC('month', CURRENT_DATE)","aggregation":"SUM(credit - debit)","groupBy":null,"orderBy":null,"limit":1,"alias":"last_month"}],"calculation":"growth_rate = ((current - last) / last) * 100"}

Q: "What is my profit margin?"
A: {"query_type":"calculation","requires_multiple_queries":true,"data_needed":[{"table":"journal_entry_lines","filters":"(account_type = 'Income' OR account_type = 'Other Income') AND date >= '${new Date().getFullYear()}-01-01'","aggregation":"SUM(credit - debit)","groupBy":null,"orderBy":null,"limit":1,"alias":"revenue"},{"table":"journal_entry_lines","filters":"(account_type = 'Expenses' OR account_type = 'Cost of Goods Sold') AND date >= '${new Date().getFullYear()}-01-01'","aggregation":"SUM(debit - credit)","groupBy":null,"orderBy":null,"limit":1,"alias":"expenses"}],"calculation":"profit_margin = ((revenue - expenses) / revenue) * 100"}

Q: "Show me revenue by month for this year"
A: {"query_type":"trend","requires_multiple_queries":false,"data_needed":[{"table":"journal_entry_lines","filters":"(account_type = 'Income' OR account_type = 'Other Income') AND date >= '${new Date().getFullYear()}-01-01'","aggregation":"SUM(credit - debit)","groupBy":"TO_CHAR(date, 'YYYY-MM')","orderBy":"TO_CHAR(date, 'YYYY-MM') ASC","limit":12,"alias":"monthly_revenue"}],"calculation":null}

Q: "Who are my top 5 customers by revenue?"
A: {"query_type":"simple","requires_multiple_queries":false,"data_needed":[{"table":"journal_entry_lines","filters":"(account_type = 'Income' OR account_type = 'Other Income') AND customer IS NOT NULL","aggregation":"SUM(credit - debit)","groupBy":"customer","orderBy":"SUM(credit - debit) DESC","limit":5,"alias":"top_customers"}],"calculation":null}

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
        max_tokens: 2000,
        messages: [{ role: 'user', content: analysisPrompt }]
      })
    })

    if (!analysisResponse.ok) {
      throw new Error(`Claude API error: ${analysisResponse.statusText}`)
    }

    const analysisData = await analysisResponse.json()
    const analysisText = analysisData.content?.[0]?.text || '{}'
    
    console.log('🤖 Claude analysis:', analysisText)

    let queryPlan: any
    try {
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/)
      queryPlan = JSON.parse(jsonMatch ? jsonMatch[0] : analysisText)
    } catch (parseError) {
      console.error('❌ Failed to parse analysis:', parseError)
      queryPlan = {
        query_type: 'simple',
        requires_multiple_queries: false,
        data_needed: [{
          table: 'journal_entry_lines',
          filters: null,
          aggregation: null,
          groupBy: null,
          orderBy: 'date DESC',
          limit: 100,
          alias: 'results'
        }],
        calculation: null
      }
    }

    // STEP 2: Execute all required queries
    console.log('📊 Executing query plan:', JSON.stringify(queryPlan, null, 2))
    
    const dataResults: Record<string, any> = {}
    
    for (const query of queryPlan.data_needed) {
      try {
        const results = await executeOptimizedQuery(query, supabase)
        dataResults[query.alias] = results
        console.log(`✅ ${query.alias}: ${Array.isArray(results) ? results.length : 1} result(s)`)
      } catch (error) {
        console.error(`❌ Query failed for ${query.alias}:`, error)
        dataResults[query.alias] = []
      }
    }

    // STEP 3: Perform calculations if needed
    let calculationResults: any = null
    
    if (queryPlan.calculation) {
      calculationResults = performCalculations(dataResults, queryPlan.calculation)
      console.log('🧮 Calculation results:', calculationResults)
    }

    // STEP 4: Generate intelligent response
    const responseData = {
      query_type: queryPlan.query_type,
      data: dataResults,
      calculations: calculationResults,
      record_counts: Object.entries(dataResults).reduce((acc, [key, val]) => {
        acc[key] = Array.isArray(val) ? val.length : 1
        return acc
      }, {} as Record<string, number>)
    }

    const responsePrompt = `User asked: "${message}"

Retrieved Data:
${JSON.stringify(responseData, null, 2)}

You are an expert CFO assistant. Provide a comprehensive, insightful answer that:
1. Directly answers the user's question with specific numbers
2. Provides context and analysis (trends, comparisons, insights)
3. Formats all currency with $ and proper commas (e.g., $3,584,272)
4. Uses percentages for margins, growth rates, etc.
5. Highlights important findings or concerns
6. Keeps response under 150 words unless complex analysis is needed
7. Is conversational and helpful, not robotic

If the data shows concerning trends (declining revenue, high expenses, overdue payments), mention them professionally.`

    const responseGen = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [{ role: 'user', content: responsePrompt }]
      })
    })

    if (!responseGen.ok) {
      throw new Error(`Claude API error: ${responseGen.statusText}`)
    }

    const responseGenData = await responseGen.json()
    const aiResponse = responseGenData.content?.[0]?.text || 
      'I apologize, but I had trouble generating a response. Please try again.'

    console.log('✅ Final response generated')

    return NextResponse.json({
      response: aiResponse,
      context: {
        query_type: queryPlan.query_type,
        data_points: Object.values(responseData.record_counts).reduce((a, b) => a + b, 0),
        calculations_performed: calculationResults ? Object.keys(calculationResults).length : 0,
        platform: 'mobile'
      }
    })

  } catch (error) {
    console.error('❌ API Error:', error)
    
    return NextResponse.json({
      response: "I'm having trouble processing your request right now. Please try rephrasing your question or try again in a moment.",
      context: {
        error: error instanceof Error ? error.message : 'Unknown error',
        platform: 'mobile'
      }
    }, { status: 500 })
  }
}

// ============================================================================
// OPTIMIZED QUERY EXECUTION ENGINE
// ============================================================================

async function executeOptimizedQuery(
  query: any,
  supabase: SupabaseClient
): Promise<QueryResult[]> {
  
  const { table, filters, aggregation, groupBy, orderBy, limit, alias } = query
  
  console.log(`🔍 Executing ${alias}:`, { table, aggregation, groupBy })

  // For aggregation queries, use native PostgreSQL
  if (aggregation) {
    return await executeAggregationQuery(table, filters, aggregation, groupBy, orderBy, limit, supabase)
  }

  // For list queries, use standard query builder
  return await executeListQuery(table, filters, groupBy, orderBy, limit, supabase)
}

// ============================================================================
// AGGREGATION QUERY ENGINE (Uses PostgreSQL directly)
// ============================================================================

async function executeAggregationQuery(
  table: string,
  filters: string | null,
  aggregation: string,
  groupBy: string | null,
  orderBy: string | null,
  limit: number | null,
  supabase: SupabaseClient
): Promise<QueryResult[]> {
  
  console.log('💎 Building native PostgreSQL aggregation...')
  
  // Build SQL query
  let selectClause = aggregation
  if (groupBy) {
    selectClause = `${groupBy}, ${aggregation} as total`
  } else {
    selectClause = `${aggregation} as total`
  }
  
  let sqlQuery = `SELECT ${selectClause} FROM ${table}`
  
  if (filters) {
    sqlQuery += ` WHERE ${filters}`
  }
  
  if (groupBy) {
    sqlQuery += ` GROUP BY ${groupBy}`
    if (orderBy) {
      sqlQuery += ` ORDER BY ${orderBy}`
    } else {
      sqlQuery += ` ORDER BY total DESC`
    }
  }
  
  if (limit) {
    sqlQuery += ` LIMIT ${limit}`
  }
  
  console.log('📝 SQL:', sqlQuery)
  
  try {
    // Try using RPC function for raw SQL
    const { data, error } = await supabase.rpc('execute_sql', { query: sqlQuery })
    
    if (!error && data) {
      console.log(`✅ RPC execution successful: ${Array.isArray(data) ? data.length : 1} rows`)
      return data
    }
    
    throw new Error(error?.message || 'RPC execution failed')
  } catch (rpcError) {
    console.log('⚠️ RPC not available, using fallback aggregation')
    return await executeAggregationFallback(table, filters, aggregation, groupBy, orderBy, limit, supabase)
  }
}

// ============================================================================
// FALLBACK AGGREGATION (Client-side when RPC unavailable)
// ============================================================================

async function executeAggregationFallback(
  table: string,
  filters: string | null,
  aggregation: string,
  groupBy: string | null,
  orderBy: string | null,
  limit: number | null,
  supabase: SupabaseClient
): Promise<QueryResult[]> {
  
  console.log('🔄 Using client-side aggregation fallback...')
  
  // Select all necessary columns
  let query = supabase.from(table).select('*')
  
  // Apply filters using Supabase query builder
  if (filters) {
    query = applyFilters(query, filters)
  }
  
  // Fetch ALL matching records for accurate aggregation
  const { data, error } = await query
  
  if (error) {
    console.error('❌ Query error:', error)
    throw error
  }
  
  if (!data || data.length === 0) {
    return [{ total: 0, count: 0 }]
  }
  
  console.log(`📊 Fetched ${data.length} records for aggregation`)
  
  // Perform aggregation
  return performClientSideAggregation(data, aggregation, groupBy, orderBy, limit)
}

// ============================================================================
// CLIENT-SIDE AGGREGATION
// ============================================================================

function performClientSideAggregation(
  data: any[],
  aggregation: string,
  groupBy: string | null,
  orderBy: string | null,
  limit: number | null
): QueryResult[] {
  
  if (groupBy) {
    // Grouped aggregation
    const grouped = new Map<string, any[]>()
    
    data.forEach(row => {
      const key = String(row[groupBy] || 'Unknown')
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(row)
    })
    
    let results = Array.from(grouped.entries()).map(([key, rows]) => {
      return {
        [groupBy]: key,
        total: calculateAggregation(rows, aggregation),
        count: rows.length
      }
    })
    
    // Sort results
    results.sort((a: any, b: any) => (b.total || 0) - (a.total || 0))
    
    // Apply limit
    if (limit) {
      results = results.slice(0, limit)
    }
    
    console.log(`✅ Client aggregation: ${results.length} groups`)
    return results
    
  } else {
    // Simple aggregation
    const total = calculateAggregation(data, aggregation)
    console.log(`✅ Client aggregation: ${data.length} records, total = ${total}`)
    return [{ total, count: data.length }]
  }
}

// ============================================================================
// AGGREGATION CALCULATION
// ============================================================================

function calculateAggregation(rows: any[], aggregation: string): number {
  if (aggregation.includes('SUM(credit - debit)')) {
    return rows.reduce((sum, row) => {
      const credit = parseFloat(String(row.credit || 0))
      const debit = parseFloat(String(row.debit || 0))
      return sum + (credit - debit)
    }, 0)
  }
  
  if (aggregation.includes('SUM(debit - credit)')) {
    return rows.reduce((sum, row) => {
      const debit = parseFloat(String(row.debit || 0))
      const credit = parseFloat(String(row.credit || 0))
      return sum + (debit - credit)
    }, 0)
  }
  
  if (aggregation.includes('SUM(')) {
    const fieldMatch = aggregation.match(/SUM\(([^)]+)\)/)
    const field = fieldMatch ? fieldMatch[1] : 'total_amount'
    return rows.reduce((sum, row) => sum + parseFloat(String(row[field] || 0)), 0)
  }
  
  if (aggregation.includes('COUNT')) {
    return rows.length
  }
  
  if (aggregation.includes('AVG(')) {
    const fieldMatch = aggregation.match(/AVG\(([^)]+)\)/)
    const field = fieldMatch ? fieldMatch[1] : 'total_amount'
    const sum = rows.reduce((s, row) => s + parseFloat(String(row[field] || 0)), 0)
    return sum / rows.length
  }
  
  return 0
}

// ============================================================================
// LIST QUERY ENGINE (For non-aggregation queries)
// ============================================================================

async function executeListQuery(
  table: string,
  filters: string | null,
  groupBy: string | null,
  orderBy: string | null,
  limit: number | null,
  supabase: SupabaseClient
): Promise<QueryResult[]> {
  
  console.log('📋 Executing list query...')
  
  // Handle payroll_submissions with location join
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
    
    if (filters) {
      query = applyFilters(query, filters)
    }
    
    if (orderBy) {
      const [col, dir] = orderBy.split(' ')
      query = query.order(col, { ascending: dir?.toUpperCase() !== 'DESC' })
    }
    
    query = query.limit(limit || 50)
    
    const { data, error } = await query
    if (error) throw error
    
    return (data || []).map(record => ({
      ...record,
      location_name: (record.locations as any)?.name || 'Unknown',
      locations: undefined
    }))
  }
  
  // Standard table query
  let query = supabase.from(table).select('*')
  
  if (filters) {
    query = applyFilters(query, filters)
  }
  
  if (orderBy) {
    const [col, dir] = orderBy.split(' ')
    query = query.order(col, { ascending: dir?.toUpperCase() !== 'DESC' })
  }
  
  query = query.limit(limit || 100)
  
  const { data, error } = await query
  if (error) throw error
  
  return data || []
}

// ============================================================================
// FILTER APPLICATION
// ============================================================================

function applyFilters(query: any, filters: string): any {
  const filterLower = filters.toLowerCase()
  
  // Account type filters
  if (filterLower.includes('income') || filterLower.includes('revenue')) {
    query = query.or("account_type.eq.Income,account_type.eq.Other Income")
  }
  
  if (filterLower.includes('expenses') || filterLower.includes('expense')) {
    query = query.or("account_type.eq.Expenses,account_type.eq.Cost of Goods Sold")
  }
  
  // Open balance
  if (filterLower.includes('open_balance > 0')) {
    query = query.gt('open_balance', 0)
  }
  
  // Status filters
  if (filterLower.includes("status = 'pending'")) {
    query = query.eq('status', 'pending')
  }
  if (filterLower.includes("status = 'approved'")) {
    query = query.eq('status', 'approved')
  }
  
  // Date filters - Handle various formats
  const currentDate = new Date()
  
  // This year
  if (filterLower.includes(`date >= '${currentDate.getFullYear()}-01-01'`)) {
    query = query.gte('date', `${currentDate.getFullYear()}-01-01`)
  }
  
  // This month
  if (filterLower.includes("date_trunc('month', current_date)") || 
      filterLower.includes('this month')) {
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
      .toISOString().split('T')[0]
    query = query.gte('date', startOfMonth)
  }
  
  // Last month
  if (filterLower.includes("interval '1 month'") && filterLower.includes("date <")) {
    const startOfLastMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1)
      .toISOString().split('T')[0]
    const endOfLastMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
      .toISOString().split('T')[0]
    query = query.gte('date', startOfLastMonth).lt('date', endOfLastMonth)
  }
  
  // Due date (overdue)
  if (filterLower.includes('due_date < current_date')) {
    query = query.lt('due_date', currentDate.toISOString().split('T')[0])
  }
  
  // Customer/Vendor NOT NULL
  if (filterLower.includes('customer is not null')) {
    query = query.not('customer', 'is', null)
  }
  if (filterLower.includes('vendor is not null')) {
    query = query.not('vendor', 'is', null)
  }
  
  return query
}

// ============================================================================
// POST-QUERY CALCULATIONS
// ============================================================================

function performCalculations(dataResults: Record<string, any>, calculation: string): any {
  console.log('🧮 Performing calculation:', calculation)
  
  const results: Record<string, any> = {}
  
  try {
    // Extract values from data results
    const values: Record<string, number> = {}
    
    for (const [key, data] of Object.entries(dataResults)) {
      if (Array.isArray(data) && data.length > 0) {
        values[key] = data[0].total || data[0].count || 0
      }
    }
    
    console.log('📊 Values for calculation:', values)
    
    // Growth rate calculations
    if (calculation.includes('growth_rate')) {
      const current = values['current_month'] || values['current_year'] || values['current']
      const previous = values['last_month'] || values['last_year'] || values['previous']
      
      if (previous && previous !== 0) {
        results.growth_rate = ((current - previous) / Math.abs(previous)) * 100
        results.growth_amount = current - previous
        results.current_value = current
        results.previous_value = previous
      }
    }
    
    // Profit margin calculations
    if (calculation.includes('profit_margin')) {
      const revenue = values['revenue'] || 0
      const expenses = values['expenses'] || 0
      const profit = revenue - expenses
      
      if (revenue !== 0) {
        results.profit_margin = (profit / revenue) * 100
        results.net_profit = profit
        results.revenue = revenue
        results.expenses = expenses
      }
    }
    
    // Gross margin calculations
    if (calculation.includes('gross_margin')) {
      const revenue = values['revenue'] || 0
      const cogs = values['cogs'] || values['cost_of_goods_sold'] || 0
      const gross_profit = revenue - cogs
      
      if (revenue !== 0) {
        results.gross_margin = (gross_profit / revenue) * 100
        results.gross_profit = gross_profit
        results.revenue = revenue
        results.cogs = cogs
      }
    }
    
    // Burn rate / runway
    if (calculation.includes('burn_rate') || calculation.includes('runway')) {
      const monthly_expenses = values['monthly_expenses'] || 0
      const cash_balance = values['cash_balance'] || 0
      
      if (monthly_expenses > 0) {
        results.burn_rate = monthly_expenses
        results.runway_months = cash_balance / monthly_expenses
        results.cash_balance = cash_balance
      }
    }
    
    // Average calculations
    if (calculation.includes('average')) {
      const total = values['total'] || 0
      const count = values['count'] || 1
      results.average = total / count
    }
    
    console.log('✅ Calculation results:', results)
    return results
    
  } catch (error) {
    console.error('❌ Calculation error:', error)
    return null
  }
}
