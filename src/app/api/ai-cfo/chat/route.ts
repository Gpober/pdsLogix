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
// SIMPLIFIED SCHEMA - FASTER PARSING
// ============================================================================

const DATABASE_SCHEMA = `
TABLES:
1. journal_entry_lines: date, account_type, debit, credit, customer, vendor
   - Revenue: account_type IN ('Income', 'Other Income')
   - Expenses: account_type IN ('Expenses', 'Cost of Goods Sold')
   
2. ar_aging_detail: customer, open_balance, due_date
3. ap_aging: vendor, open_balance, due_date
4. payments: date, first_name, last_name, total_amount, department
5. payroll_submissions: pay_date, total_amount, status, location_id
6. locations: id, name

Current date: ${new Date().toISOString().split('T')[0]}
`

// ============================================================================
// CACHED CLIENTS
// ============================================================================

let cachedSupabase: SupabaseClient | null = null

function getSupabaseClient(): SupabaseClient {
  if (!cachedSupabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE
    if (!url || !key) throw new Error('Missing Supabase credentials')
    cachedSupabase = createClient(url, key)
  }
  return cachedSupabase
}

function getAnthropicApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('Missing Anthropic API key')
  return key
}

// ============================================================================
// MAIN HANDLER - OPTIMIZED FOR SPEED
// ============================================================================

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now()
  const TIMEOUT_MS = 25000 // 25 second timeout
  
  // Create timeout promise
  const timeoutPromise = new Promise<NextResponse>((_, reject) => {
    setTimeout(() => reject(new Error('Request timeout')), TIMEOUT_MS)
  })
  
  // Create main processing promise
  const processingPromise = (async () => {
    try {
      const supabase = getSupabaseClient()
      const anthropicKey = getAnthropicApiKey()

      const body = await request.json().catch(() => ({})) as RequestPayload
      const { message } = body

      if (!message?.trim()) {
        return NextResponse.json({ error: 'Message required' }, { status: 400 })
      }

      console.log('💬 Question:', message)

      // FAST PATTERN MATCHING - Skip Claude for common queries
      const quickResult = tryQuickMatch(message, supabase)
      if (quickResult) {
        const data = await Promise.race([quickResult, 
          new Promise((_, reject) => setTimeout(() => reject(new Error('Quick match timeout')), 8000))
        ])
        const response = await generateResponse(message, data, anthropicKey)
        console.log(`⚡ Quick match: ${Date.now() - startTime}ms`)
        return NextResponse.json({ response, context: { quick_match: true } })
      }

      // STEP 1: Ask Claude for query plan (SIMPLIFIED) - with timeout
      const analysisPrompt = `${DATABASE_SCHEMA}

Question: "${message}"

Return ONLY a JSON object:
{
  "queries": [
    {
      "table": "table_name",
      "type": "sum|count|list",
      "filters": "brief filter description",
      "groupBy": "column or null",
      "alias": "name"
    }
  ]
}

IMPORTANT TYPE RULES:
- Use "sum" when asking for totals, amounts, or how much (revenue, expenses, receivables, payables)
- Use "count" when asking how many
- Use "list" ONLY when asking to "show me" or "list" specific items without wanting a total

Examples:
"revenue this year" → {"queries":[{"table":"journal_entry_lines","type":"sum","filters":"income this year","groupBy":null,"alias":"revenue"}]}
"show overdue receivables" → {"queries":[{"table":"ar_aging_detail","type":"sum","filters":"overdue","groupBy":null,"alias":"overdue_total"}]}
"outstanding receivables by customer" → {"queries":[{"table":"ar_aging_detail","type":"sum","filters":"outstanding","groupBy":"customer","alias":"by_customer"}]}
"show me pending payroll" → {"queries":[{"table":"payroll_submissions","type":"list","filters":"pending","groupBy":null,"alias":"pending_list"}]}
"compare this month to last" → {"queries":[{"table":"journal_entry_lines","type":"sum","filters":"income this month","groupBy":null,"alias":"current"},{"table":"journal_entry_lines","type":"sum","filters":"income last month","groupBy":null,"alias":"previous"}]}

JSON only, no explanation:`

      const analysisTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Analysis timeout')), 8000)
      )

      const analysis = await Promise.race([
        fetch(ANTHROPIC_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 500,
            messages: [{ role: 'user', content: analysisPrompt }]
          })
        }),
        analysisTimeout
      ]) as Response

      if (!analysis.ok) {
        throw new Error(`Claude error: ${analysis.status}`)
      }

      const analysisData = await analysis.json()
      const analysisText = analysisData.content?.[0]?.text || '{}'
      console.log('🤖 Plan:', analysisText)

      let plan: any
      try {
        const jsonMatch = analysisText.match(/\{[\s\S]*\}/)
        plan = JSON.parse(jsonMatch ? jsonMatch[0] : analysisText)
      } catch {
        console.log('⚠️ Parse failed, using fallback')
        plan = { queries: [{ table: 'journal_entry_lines', type: 'list', filters: null, groupBy: null, alias: 'results' }] }
      }

      // STEP 2: Execute queries IN PARALLEL with timeout
      console.log(`📊 Executing ${plan.queries?.length || 0} queries...`)
      
      const queryTimeout = 10000 // 10 seconds per query
      const queryPromises = (plan.queries || []).map((q: any) => 
        Promise.race([
          executeQuery(q, supabase),
          new Promise((_, reject) => setTimeout(() => reject(new Error(`Query ${q.alias} timeout`)), queryTimeout))
        ]).catch(err => {
          console.error(`❌ Query ${q.alias} failed:`, err.message)
          return []
        })
      )

      const results = await Promise.all(queryPromises)
      const dataMap: Record<string, any> = {}
      
      plan.queries?.forEach((q: any, i: number) => {
        const result = results[i]
        dataMap[q.alias] = result
        
        // Pre-calculate totals for grouped data to avoid Claude math errors
        if (Array.isArray(result) && result.length > 0 && result[0].total !== undefined) {
          const calculatedTotal = result.reduce((sum, row) => sum + (parseFloat(row.total) || 0), 0)
          dataMap[`${q.alias}_total`] = calculatedTotal
          dataMap[`${q.alias}_count`] = result.length
          console.log(`💰 Pre-calculated total for ${q.alias}: $${calculatedTotal.toFixed(2)} from ${result.length} rows`)
        }
      })

      console.log(`✅ Queries done: ${Date.now() - startTime}ms`)

      // STEP 3: Generate response with timeout
      const responseTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Response generation timeout')), 8000)
      )
      
      const response = await Promise.race([
        generateResponse(message, dataMap, anthropicKey),
        responseTimeout
      ]) as string
      
      console.log(`🎯 Total time: ${Date.now() - startTime}ms`)

      return NextResponse.json({
        response,
        context: {
          queries: plan.queries?.length || 0,
          duration_ms: Date.now() - startTime
        }
      })

    } catch (error) {
      console.error('❌ Error:', error)
      return NextResponse.json({
        response: "I'm having trouble processing that request. Please try rephrasing or try again.",
        context: { error: error instanceof Error ? error.message : 'Unknown' }
      }, { status: 500 })
    }
  })()
  
  // Race between processing and timeout
  try {
    return await Promise.race([processingPromise, timeoutPromise])
  } catch (error) {
    console.error('⏱️ Timeout or error:', error)
    return NextResponse.json({
      response: "That query is taking too long. Please try a simpler question or try again.",
      context: { 
        error: error instanceof Error ? error.message : 'Timeout',
        duration_ms: Date.now() - startTime
      }
    }, { status: 504 })
  }
}

// ============================================================================
// QUICK PATTERN MATCHING - SKIP CLAUDE FOR COMMON QUERIES
// ============================================================================

function tryQuickMatch(message: string, supabase: SupabaseClient): Promise<any> | null {
  const msg = message.toLowerCase()
  const year = new Date().getFullYear()
  
  // Revenue this year
  if (msg.includes('revenue') && (msg.includes('year') || msg.includes('ytd'))) {
    return executeDirectQuery(
      'journal_entry_lines',
      `(account_type = 'Income' OR account_type = 'Other Income') AND date >= '${year}-01-01'`,
      'SUM(credit - debit)',
      null,
      supabase
    ).then(total => ({ revenue: [{ total }] }))
  }
  
  // Expenses this year
  if (msg.includes('expense') && msg.includes('year')) {
    return executeDirectQuery(
      'journal_entry_lines',
      `(account_type = 'Expenses' OR account_type = 'Cost of Goods Sold') AND date >= '${year}-01-01'`,
      'SUM(debit - credit)',
      null,
      supabase
    ).then(total => ({ expenses: [{ total }] }))
  }
  
  // Pending payroll
  if (msg.includes('pending') && msg.includes('payroll')) {
    return supabase
      .from('payroll_submissions')
      .select('*, locations!inner(name)')
      .eq('status', 'pending')
      .order('submitted_at', { ascending: false })
      .limit(20)
      .then(({ data }) => ({ pending: data || [] }))
  }
  
  return null
}

// ============================================================================
// DIRECT QUERY EXECUTION - FAST PATH
// ============================================================================

async function executeDirectQuery(
  table: string,
  filters: string,
  aggregation: string,
  groupBy: string | null,
  supabase: SupabaseClient
): Promise<number> {
  
  // Fetch all matching records
  let query = supabase.from(table).select('*')
  
  // Apply filters (simplified)
  if (filters.includes('Income') || filters.includes('income')) {
    query = query.or("account_type.eq.Income,account_type.eq.Other Income")
  }
  if (filters.includes('Expense')) {
    query = query.or("account_type.eq.Expenses,account_type.eq.Cost of Goods Sold")
  }
  if (filters.includes(`date >= '${new Date().getFullYear()}`)) {
    query = query.gte('date', `${new Date().getFullYear()}-01-01`)
  }
  
  const { data, error } = await query
  
  if (error || !data) {
    console.error('Query error:', error)
    return 0
  }
  
  // Calculate aggregation
  if (aggregation.includes('SUM(credit - debit)')) {
    return data.reduce((sum, row) => {
      return sum + (parseFloat(row.credit || 0) - parseFloat(row.debit || 0))
    }, 0)
  }
  
  if (aggregation.includes('SUM(debit - credit)')) {
    return data.reduce((sum, row) => {
      return sum + (parseFloat(row.debit || 0) - parseFloat(row.credit || 0))
    }, 0)
  }
  
  return data.length
}

// ============================================================================
// QUERY EXECUTOR
// ============================================================================

async function executeQuery(query: any, supabase: SupabaseClient): Promise<QueryResult[]> {
  const { table, type, filters, groupBy, alias } = query
  
  console.log(`🔍 ${alias}: ${table} (${type})`)
  
  const year = new Date().getFullYear()
  const month = new Date().getMonth()
  
  // Build Supabase query
  let sq = supabase.from(table).select('*')
  
  // Apply filters based on description
  if (filters) {
    const f = filters.toLowerCase()
    
    // Account type
    if (f.includes('income') || f.includes('revenue')) {
      sq = sq.or("account_type.eq.Income,account_type.eq.Other Income")
    }
    if (f.includes('expense')) {
      sq = sq.or("account_type.eq.Expenses,account_type.eq.Cost of Goods Sold")
    }
    
    // Date ranges
    if (f.includes('this year')) {
      sq = sq.gte('date', `${year}-01-01`)
    }
    if (f.includes('this month')) {
      sq = sq.gte('date', new Date(year, month, 1).toISOString().split('T')[0])
    }
    if (f.includes('last month')) {
      const start = new Date(year, month - 1, 1).toISOString().split('T')[0]
      const end = new Date(year, month, 1).toISOString().split('T')[0]
      sq = sq.gte('date', start).lt('date', end)
    }
    
    // Status
    if (f.includes('pending')) sq = sq.eq('status', 'pending')
    if (f.includes('approved')) sq = sq.eq('status', 'approved')
    
    // Receivables/Payables filters
    if (f.includes('overdue')) {
      // Overdue = past due date AND has open balance
      sq = sq.gt('open_balance', 0)
      sq = sq.lt('due_date', new Date().toISOString().split('T')[0])
    } else if (f.includes('owe') || f.includes('outstanding') || f.includes('receivable')) {
      // Outstanding = any open balance (not yet due + overdue)
      sq = sq.gt('open_balance', 0)
    }
  }
  
  // Limit for list queries
  if (type === 'list') {
    sq = sq.limit(50)
  }
  
  const { data, error } = await sq
  
  if (error) {
    console.error(`Query error:`, error)
    return []
  }
  
  if (!data || data.length === 0) {
    return [{ total: 0, count: 0 }]
  }
  
  // For sum queries, aggregate
  if (type === 'sum') {
    let total = 0
    
    if (filters?.includes('income') || filters?.includes('revenue')) {
      total = data.reduce((sum, row) => {
        return sum + (parseFloat(row.credit || 0) - parseFloat(row.debit || 0))
      }, 0)
    } else if (filters?.includes('expense')) {
      total = data.reduce((sum, row) => {
        return sum + (parseFloat(row.debit || 0) - parseFloat(row.credit || 0))
      }, 0)
    } else {
      total = data.reduce((sum, row) => sum + parseFloat(row.total_amount || row.open_balance || 0), 0)
    }
    
    // Group by if specified
    if (groupBy) {
      const grouped = new Map<string, number>()
      data.forEach(row => {
        const key = row[groupBy] || 'Unknown'
        let val = 0
        
        // Determine value based on what fields exist
        if (row.open_balance !== undefined) {
          // AR/AP tables
          val = parseFloat(row.open_balance || 0)
        } else if (row.total_amount !== undefined) {
          // Payroll tables
          val = parseFloat(row.total_amount || 0)
        } else if (row.credit !== undefined && row.debit !== undefined) {
          // Journal entry lines
          if (filters?.includes('income') || filters?.includes('revenue')) {
            val = parseFloat(row.credit || 0) - parseFloat(row.debit || 0)
          } else if (filters?.includes('expense')) {
            val = parseFloat(row.debit || 0) - parseFloat(row.credit || 0)
          }
        }
        
        grouped.set(key, (grouped.get(key) || 0) + val)
      })
      
      return Array.from(grouped.entries())
        .map(([k, v]) => ({ [groupBy]: k, total: v }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 20)
    }
    
    return [{ total, count: data.length }]
  }
  
  // For count queries
  if (type === 'count') {
    return [{ count: data.length }]
  }
  
  // For list queries, return raw data
  return data.slice(0, 20)
}

// ============================================================================
// RESPONSE GENERATOR - FAST
// ============================================================================

async function generateResponse(
  question: string,
  data: Record<string, any>,
  apiKey: string
): Promise<string> {
  
  // Extract pre-calculated total if it exists
  let totalNote = ''
  for (const key in data) {
    if (key.endsWith('_total')) {
      const alias = key.replace('_total', '')
      const total = data[key]
      totalNote = `\n\nPRE-CALCULATED TOTAL for ${alias}: $${total.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} - USE THIS EXACT VALUE, DO NOT RECALCULATE`
    }
  }
  
  const prompt = `Question: "${question}"

Data: ${JSON.stringify(data, null, 2)}${totalNote}

Provide a concise, professional answer (<100 words). Format currency with $ and commas. If comparing values, show growth %. Be direct and helpful.

CRITICAL: Use the PRE-CALCULATED TOTAL value provided above. Do not add up the individual rows yourself.`

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }]
    })
  })

  if (!response.ok) {
    throw new Error(`Response generation failed: ${response.status}`)
  }

  const result = await response.json()
  return result.content?.[0]?.text || 'Unable to generate response.'
}
