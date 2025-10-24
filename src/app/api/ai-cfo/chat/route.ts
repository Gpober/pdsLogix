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
1. journal_entry_lines: date, account_type, debit, credit, customer, vendor, location
   Revenue: account_type IN ('Income','Other Income') | Expenses: account_type IN ('Expenses','Cost of Goods Sold')
2. ar_aging_detail: customer, open_balance, due_date
3. ap_aging: vendor, open_balance, due_date
4. payments: date, first_name, last_name, total_amount, department, location
5. payroll_submissions: pay_date, total_amount, status, location_id
6. locations: id, name

GROUPING: Any date column→month, any entity column→that entity. Can combine: ["customer","month"]
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

Q: "${message}"

JSON plan:
{"queries":[{"table":"name","type":"sum|count|list","filters":"desc","groupBy":"col|month|['col1','col2']|null","alias":"name"}]}

Types: sum=totals, count=qty, list=items
GroupBy: single, "month", ["multi","level"], or null

Examples:
"revenue this year"→{"queries":[{"table":"journal_entry_lines","type":"sum","filters":"income this year","groupBy":null,"alias":"revenue"}]}
"revenue by month"→{"queries":[{"table":"journal_entry_lines","type":"sum","filters":"income this year","groupBy":"month","alias":"monthly_revenue"}]}
"revenue by customer by month"→{"queries":[{"table":"journal_entry_lines","type":"sum","filters":"income this year","groupBy":["customer","month"],"alias":"customer_monthly"}]}
"expenses by department"→{"queries":[{"table":"payments","type":"sum","filters":"this year","groupBy":"department","alias":"dept_expenses"}]}

JSON only:`

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
      console.log('📋 Raw plan text:', JSON.stringify(analysisText, null, 2))

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
    console.error('Request timeout or error:', error)
    return NextResponse.json({
      response: "The request took too long to process. Please try a simpler question or try again.",
      context: { error: 'timeout' }
    }, { status: 408 })
  }
}

// ============================================================================
// PATTERN MATCHING - INSTANT RESPONSES
// ============================================================================

function tryQuickMatch(question: string, supabase: SupabaseClient): Promise<any> | null {
  const q = question.toLowerCase()
  
  // DON'T quick match if the question asks for a breakdown (by month, by customer, etc.)
  if (q.match(/\bby\s+(month|customer|vendor|location|department|week)/)) {
    console.log('🚫 Quick match skipped: breakdown requested')
    return null
  }
  
  // Revenue patterns
  if (q.match(/revenue|income|sales/) && q.match(/year|ytd|annual/)) {
    return quickAggregate('journal_entry_lines', 
      `account_type IN ('Income', 'Other Income') AND date >= '${new Date().getFullYear()}-01-01'`,
      'SUM(credit - debit)', 
      supabase)
  }
  
  // Expense patterns
  if (q.match(/expense|cost|spend/) && q.match(/year|ytd|annual/)) {
    return quickAggregate('journal_entry_lines',
      `account_type IN ('Expenses', 'Cost of Goods Sold') AND date >= '${new Date().getFullYear()}-01-01'`,
      'SUM(debit - credit)',
      supabase)
  }
  
  // Outstanding receivables (what customers owe you)
  if (q.match(/receivable|customers? owe|outstanding.*customer|ar(?!\w)/) && !q.match(/by|each/)) {
    return quickAggregate('ar_aging_detail', 'open_balance > 0', 'SUM(open_balance)', supabase)
  }
  
  // Outstanding payables (what you owe vendors)
  if (q.match(/payable|i owe|we owe|outstanding.*vendor|ap(?!\w)|owe.*vendor/) && !q.match(/by|each/)) {
    return quickAggregate('ap_aging', 'open_balance > 0', 'SUM(open_balance)', supabase)
  }
  
  return null
}

async function quickAggregate(
  table: string,
  filters: string,
  aggregation: string,
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
  // ✅ FIX: Apply open_balance filter for AR/AP
  if (filters.includes('open_balance > 0')) {
    query = query.gt('open_balance', 0)
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
  
  // ✅ FIX: Handle SUM(open_balance) for AR/AP
  if (aggregation.includes('SUM(open_balance)')) {
    return data.reduce((sum, row) => {
      return sum + parseFloat(row.open_balance || 0)
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
  console.log(`   groupBy:`, groupBy)
  console.log(`   filters:`, filters)
  
  const year = new Date().getFullYear()
  const month = new Date().getMonth()
  
  // SIMPLE APPROACH: For month grouping on journal_entry_lines, fetch all and group in JS
  if (groupBy === 'month' && (table === 'journal_entry_lines' || table === 'payments' || table === 'payroll_submissions')) {
    
    // Handle journal_entry_lines (revenue/expenses)
    if (table === 'journal_entry_lines') {
      const isIncome = filters?.includes('income') || filters?.includes('revenue')
      const isExpense = filters?.includes('expense')
      
      // Fetch the raw data
      let query = supabase.from(table).select('date, credit, debit, account_type')
      
      // Apply filters
      if (isIncome) {
        query = query.or("account_type.eq.Income,account_type.eq.Other Income")
      } else if (isExpense) {
        query = query.or("account_type.eq.Expenses,account_type.eq.Cost of Goods Sold")
      }
      
      // ALWAYS filter to current year when grouping by month (unless explicitly asking for different year)
      if (filters?.includes('last year')) {
        query = query.gte('date', `${year - 1}-01-01`).lt('date', `${year}-01-01`)
      } else if (filters?.includes('this month')) {
        query = query.gte('date', new Date(year, month, 1).toISOString().split('T')[0])
      } else {
        // Default: current year for month grouping
        query = query.gte('date', `${year}-01-01`)
      }
      
      const { data, error } = await query
      
      if (error) {
        console.error('❌ Query Error:', error)
        return [{ total: 0, count: 0 }]
      }
      
      if (!data || data.length === 0) {
        console.log('⚠️ No data returned')
        return [{ total: 0, count: 0 }]
      }
      
      console.log(`📊 Fetched ${data.length} rows, grouping by month...`)
      
      // Group by month
      const monthlyTotals = new Map<string, number>()
      
      data.forEach((row, idx) => {
        if (idx < 3) console.log(`   Row ${idx + 1}:`, row)
        
        const date = new Date(row.date)
        const monthKey = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
        
        let value = 0
        if (isIncome) {
          value = (parseFloat(row.credit) || 0) - (parseFloat(row.debit) || 0)
        } else if (isExpense) {
          value = (parseFloat(row.debit) || 0) - (parseFloat(row.credit) || 0)
        }
        
        if (idx < 3) console.log(`   Month: ${monthKey}, Value: ${value}`)
        
        monthlyTotals.set(monthKey, (monthlyTotals.get(monthKey) || 0) + value)
      })
      
      // Convert to array and sort
      const results = Array.from(monthlyTotals.entries())
        .map(([month, total]) => ({ month, total }))
        .sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime())
      
      console.log(`✅ Grouped into ${results.length} months`)
      console.log(`📦 Results:`, results)
      
      return results
    }
    
    // Handle payments table (payroll by month)
    if (table === 'payments') {
      let query = supabase.from(table).select('date, total_amount, department, location')
      
      // ALWAYS filter to current year when grouping by month
      if (filters?.includes('last year')) {
        query = query.gte('date', `${year - 1}-01-01`).lt('date', `${year}-01-01`)
      } else if (filters?.includes('this month')) {
        query = query.gte('date', new Date(year, month, 1).toISOString().split('T')[0])
      } else {
        // Default: current year for month grouping
        query = query.gte('date', `${year}-01-01`)
      }
      
      const { data, error } = await query
      
      if (error || !data || data.length === 0) {
        console.error('❌ Query Error:', error)
        return [{ total: 0, count: 0 }]
      }
      
      console.log(`📊 Fetched ${data.length} payment rows, grouping by month...`)
      
      // Group by month
      const monthlyTotals = new Map<string, number>()
      
      data.forEach((row, idx) => {
        if (idx < 3) console.log(`   Payment Row ${idx + 1}:`, row)
        
        const date = new Date(row.date)
        const monthKey = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
        const value = parseFloat(row.total_amount) || 0
        
        if (idx < 3) console.log(`   Month: ${monthKey}, Amount: ${value}`)
        
        monthlyTotals.set(monthKey, (monthlyTotals.get(monthKey) || 0) + value)
      })
      
      const results = Array.from(monthlyTotals.entries())
        .map(([month, total]) => ({ month, total }))
        .sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime())
      
      console.log(`✅ Grouped into ${results.length} months`)
      console.log(`📦 Payroll Results:`, results)
      
      return results
    }
    
    // Handle payroll_submissions table
    if (table === 'payroll_submissions') {
      let query = supabase.from(table).select('pay_date, total_amount, status, location_id')
      
      // ALWAYS filter to current year when grouping by month
      if (filters?.includes('last year')) {
        query = query.gte('pay_date', `${year - 1}-01-01`).lt('pay_date', `${year}-01-01`)
      } else if (filters?.includes('pending')) {
        query = query.gte('pay_date', `${year}-01-01`).eq('status', 'pending')
      } else if (filters?.includes('approved')) {
        query = query.gte('pay_date', `${year}-01-01`).eq('status', 'approved')
      } else {
        // Default: current year for month grouping
        query = query.gte('pay_date', `${year}-01-01`)
      }
      
      const { data, error } = await query
      
      if (error || !data || data.length === 0) {
        console.error('❌ Query Error:', error)
        return [{ total: 0, count: 0 }]
      }
      
      console.log(`📊 Fetched ${data.length} payroll submission rows, grouping by month...`)
      
      // Group by month
      const monthlyTotals = new Map<string, number>()
      
      data.forEach((row, idx) => {
        if (idx < 3) console.log(`   Payroll Row ${idx + 1}:`, row)
        
        const date = new Date(row.pay_date)
        const monthKey = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
        const value = parseFloat(row.total_amount) || 0
        
        if (idx < 3) console.log(`   Month: ${monthKey}, Amount: ${value}`)
        
        monthlyTotals.set(monthKey, (monthlyTotals.get(monthKey) || 0) + value)
      })
      
      const results = Array.from(monthlyTotals.entries())
        .map(([month, total]) => ({ month, total }))
        .sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime())
      
      console.log(`✅ Grouped into ${results.length} months`)
      console.log(`📦 Payroll Submission Results:`, results)
      
      return results
    }
  }
  
  // FALLBACK: Original method for non-month grouping
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
  
  // For list queries, limit to 50 items
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
    console.log(`   📊 Sum query on ${data.length} rows`)
    let total = 0
    
    if (filters?.includes('income') || filters?.includes('revenue')) {
      total = data.reduce((sum, row) => {
        return sum + (parseFloat(row.credit || 0) - parseFloat(row.debit || 0))
      }, 0)
      console.log(`   💰 Income total: $${total}`)
    } else if (filters?.includes('expense')) {
      total = data.reduce((sum, row) => {
        return sum + (parseFloat(row.debit || 0) - parseFloat(row.credit || 0))
      }, 0)
      console.log(`   💸 Expense total: $${total}`)
    } else {
      total = data.reduce((sum, row) => sum + parseFloat(row.total_amount || row.open_balance || 0), 0)
      console.log(`   💵 Total: $${total}`)
    }
    
    // Group by if specified
    if (groupBy) {
      console.log(`   📊 Grouping by: ${JSON.stringify(groupBy)}`)
      const grouped = new Map<string, number>()
      const isMultiLevel = Array.isArray(groupBy)
      const groupKeys = isMultiLevel ? groupBy : [groupBy]
      
      let rowNum = 0
      data.forEach(row => {
        rowNum++
        let key: string
        
        if (isMultiLevel) {
          // Multi-level grouping: combine keys with " | " separator
          const keys = groupKeys.map(gk => {
            if (gk === 'month' && row.date) {
              const date = new Date(row.date)
              return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
            }
            return row[gk] || 'Unknown'
          })
          key = keys.join(' | ')
        } else {
          // Single level grouping
          if (groupBy === 'month' && row.date) {
            const date = new Date(row.date)
            key = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
          } else {
            key = row[groupBy] || 'Unknown'
          }
        }
        
        let val = 0
        
        // DEBUG: Check what fields exist in the first few rows
        if (rowNum <= 3) console.log(`   🔍 Row ${rowNum} fields:`, Object.keys(row))
        
        // Determine value based on what fields exist
        if (row.open_balance !== undefined) {
          // AR/AP tables
          val = parseFloat(row.open_balance || 0)
        } else if (row.total_amount !== undefined) {
          // Payroll tables
          val = parseFloat(row.total_amount || 0)
        } else if (row.credit !== undefined && row.debit !== undefined) {
          // Journal entry lines
          if (rowNum <= 3) console.log(`   🔢 Row ${rowNum}: key=${key}, credit=${row.credit}, debit=${row.debit}, filters="${filters}"`)
          if (filters?.includes('income') || filters?.includes('revenue')) {
            val = parseFloat(row.credit || 0) - parseFloat(row.debit || 0)
            if (rowNum <= 3) console.log(`   💵 Calculated income: ${val}`)
          } else if (filters?.includes('expense')) {
            val = parseFloat(row.debit || 0) - parseFloat(row.credit || 0)
            if (rowNum <= 3) console.log(`   💸 Calculated expense: ${val}`)
          }
        }
        
        grouped.set(key, (grouped.get(key) || 0) + val)
      })
      
      // ✅ FIXED: Return ALL groups, no artificial limit
      // Sort by date if grouping by month
      const results = Array.from(grouped.entries())
        .map(([k, v]) => {
          if (isMultiLevel) {
            const keys = k.split(' | ')
            const result: any = { total: v }
            groupKeys.forEach((gk, i) => {
              result[gk] = keys[i]
            })
            return result
          } else {
            return { [groupBy]: k, total: v }
          }
        })
      
      // Sort by month chronologically if grouping includes month
      if (groupBy === 'month' || (isMultiLevel && groupKeys.includes('month'))) {
        results.sort((a, b) => {
          const dateA = new Date(a.month || a[groupKeys[groupKeys.indexOf('month')]])
          const dateB = new Date(b.month || b[groupKeys[groupKeys.indexOf('month')]])
          return dateA.getTime() - dateB.getTime()
        })
      } else {
        // Otherwise sort by total descending
        results.sort((a, b) => b.total - a.total)
      }
      
      console.log(`   ✅ Returning ${results.length} grouped results`)
      console.log(`   📦 First few:`, results.slice(0, 3))
      return results
    }
    
    console.log(`   ✅ Returning single total: $${total}`)
    return [{ total, count: data.length }]
  }
  
  // For count queries
  if (type === 'count') {
    return [{ count: data.length }]
  }
  
  // For list queries, return raw data (limited to 50)
  return data.slice(0, 50)
}

// ============================================================================
// RESPONSE GENERATOR - FAST
// ============================================================================

async function generateResponse(
  question: string,
  data: Record<string, any>,
  apiKey: string
): Promise<string> {
  
  // Extract pre-calculated total if it exists and format it prominently
  let totalMessage = ''
  for (const key in data) {
    if (key.endsWith('_total')) {
      const total = data[key]
      const formattedTotal = `$${total.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`
      totalMessage = `\n\n===== IMPORTANT: TOTAL AMOUNT =====\nThe verified total is ${formattedTotal}\nYou MUST use this exact value in your response.\nDo NOT calculate your own total.\n====================================`
    }
  }
  
  const prompt = `Question: "${question}"

Data: ${JSON.stringify(data, null, 2)}${totalMessage}

Provide a concise, professional answer (<150 words). Format currency with $ and commas.

IMPORTANT INSTRUCTIONS:
- If you see monthly data (Jan, Feb, Mar...), calculate month-over-month changes and show growth %
- Show trends: "Revenue grew 12% from Jan to Feb" or "Expenses decreased 8% from Mar to Apr"
- When you see the "TOTAL AMOUNT" section above, use that exact dollar value - do not recalculate
- Be direct and actionable

Example for monthly data:
Jan: $45,000
Feb: $52,000 (+15.6% vs Jan)
Mar: $48,000 (-7.7% vs Feb)

Highlight any significant trends or outliers.`

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
