import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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

export async function POST(request) {
  try {
    let body = {}
    try {
      body = await request.json()
    } catch {
      body = {}
    }

    const { message, userId, context: frontendContext } = body || {}

    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    const safeUserId = (typeof userId === 'string' && userId.length) ? userId : 'anon'
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

    const sqlResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
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

    const sqlData = await sqlResponse.json()
    let sqlQuery = sqlData.choices[0].message.content.trim()
    
    // Clean SQL
    sqlQuery = sqlQuery
      .replace(/```sql\n?/g, '')
      .replace(/```\n?/g, '')
      .replace(/^SELECT/i, 'SELECT')
      .trim()

    console.log('📊 Generated SQL:', sqlQuery)

    // Step 2: Execute query
    let queryResults = []
    try {
      queryResults = await executeSmartQuery(sqlQuery, message)
    } catch (error) {
      console.error('❌ Query execution failed:', error)
      // Fallback to simple data fetch
      queryResults = await getFallbackData(queryType)
    }

    console.log('✅ Query returned', queryResults.length, 'rows')

    // Step 3: Generate natural language response
    const responsePrompt = `You are a friendly AI CFO assistant for a construction/property management company called "I AM CFO".

User asked: "${message}"

Data returned from database:
${JSON.stringify(queryResults.slice(0, 20), null, 2)}

Generate a concise, conversational response (2-4 sentences max):
1. Directly answer their question with specific numbers
2. Format currency as $X,XXX or $X.XK / $X.XM for large amounts
3. Provide ONE brief insight or recommendation if relevant
4. Be professional but friendly - like a helpful CFO colleague

Keep it SHORT and actionable. No fluff or preambles.`

    const responseGen = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
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

    const responseData = await responseGen.json()
    const aiResponse = responseData.choices[0].message.content.trim()

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
    console.error('❌ API Error:', error?.message || error)
    
    return NextResponse.json({
      response: "I'm having trouble processing that question. Could you try asking something like 'What's our revenue this month?' or 'Which customer has the highest profit?'",
      error: error?.message,
      context: { queryType: 'error', platform: 'mobile' }
    }, { status: 200 }) // Return 200 so UI shows the message
  }
}

// Smart query executor
async function executeSmartQuery(sql: string, originalQuestion: string) {
  const sqlLower = sql.toLowerCase()
  
  try {
    // Determine which table and build Supabase query
    if (sqlLower.includes('journal_entry_lines')) {
      return await executeJournalQuery(sql, originalQuestion)
    } else if (sqlLower.includes('ar_aging_detail')) {
      return await executeARQuery(sql, originalQuestion)
    } else if (sqlLower.includes('ap_aging')) {
      return await executeAPQuery(sql, originalQuestion)
    } else if (sqlLower.includes('payments')) {
      return await executePayrollQuery(sql, originalQuestion)
    }
    
    // Default: try journal entries
    return await executeJournalQuery(sql, originalQuestion)
    
  } catch (error) {
    console.error('Query execution error:', error)
    throw error
  }
}

// Execute journal entries query
async function executeJournalQuery(sql: string, question: string) {
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
  
  if (error) throw error
  
  // Post-process for aggregations
  if (questionLower.includes('customer') && (questionLower.includes('revenue') || questionLower.includes('profit'))) {
    return aggregateByCustomer(data || [])
  }
  
  if (questionLower.includes('total') || questionLower.includes('sum')) {
    return aggregateTotals(data || [], questionLower)
  }
  
  return data || []
}

// Execute AR query
async function executeARQuery(sql: string, question: string) {
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
  if (error) throw error
  
  // Group by customer if needed
  if (questionLower.includes('customer') || questionLower.includes('which')) {
    return aggregateARByCustomer(data || [])
  }
  
  return data || []
}

// Execute AP query
async function executeAPQuery(sql: string, question: string) {
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
  if (error) throw error
  
  // Group by vendor if needed
  if (questionLower.includes('vendor') || questionLower.includes('which')) {
    return aggregateAPByVendor(data || [])
  }
  
  return data || []
}

// Execute payroll query
async function executePayrollQuery(sql: string, question: string) {
  const questionLower = question.toLowerCase()
  let query = supabase.from('payments').select('*')
  
  // Date filters
  if (questionLower.includes('this month')) {
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
    query = query.gte('date', startOfMonth)
  }
  
  query = query.limit(500)
  
  const { data, error } = await query
  if (error) throw error
  
  // Group by department or employee
  if (questionLower.includes('department')) {
    return aggregatePayrollByDepartment(data || [])
  }
  
  if (questionLower.includes('employee')) {
    return aggregatePayrollByEmployee(data || [])
  }
  
  return data || []
}

// Aggregation helpers
function aggregateByCustomer(data: any[]) {
  const customerMap = new Map()
  
  data.forEach(row => {
    const customer = row.customer || 'Unknown'
    const revenue = (row.credit || 0) - (row.debit || 0)
    
    if (!customerMap.has(customer)) {
      customerMap.set(customer, { customer, revenue: 0, count: 0 })
    }
    
    const current = customerMap.get(customer)
    current.revenue += revenue
    current.count += 1
  })
  
  return Array.from(customerMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)
}

function aggregateTotals(data: any[], question: string) {
  let total = 0
  
  data.forEach(row => {
    if (question.includes('revenue') || question.includes('income')) {
      total += (row.credit || 0) - (row.debit || 0)
    } else if (question.includes('expense') || question.includes('cogs')) {
      total += (row.debit || 0) - (row.credit || 0)
    } else {
      total += (row.credit || 0) - (row.debit || 0)
    }
  })
  
  return [{ total, record_count: data.length }]
}

function aggregateARByCustomer(data: any[]) {
  const customerMap = new Map()
  
  data.forEach(row => {
    const customer = row.customer || 'Unknown'
    const balance = row.open_balance || 0
    
    if (!customerMap.has(customer)) {
      customerMap.set(customer, { customer, total_outstanding: 0, invoice_count: 0 })
    }
    
    const current = customerMap.get(customer)
    current.total_outstanding += balance
    current.invoice_count += 1
  })
  
  return Array.from(customerMap.values())
    .sort((a, b) => b.total_outstanding - a.total_outstanding)
    .slice(0, 10)
}

function aggregateAPByVendor(data: any[]) {
  const vendorMap = new Map()
  
  data.forEach(row => {
    const vendor = row.vendor || 'Unknown'
    const balance = row.open_balance || 0
    
    if (!vendorMap.has(vendor)) {
      vendorMap.set(vendor, { vendor, total_outstanding: 0, bill_count: 0 })
    }
    
    const current = vendorMap.get(vendor)
    current.total_outstanding += balance
    current.bill_count += 1
  })
  
  return Array.from(vendorMap.values())
    .sort((a, b) => b.total_outstanding - a.total_outstanding)
    .slice(0, 10)
}

function aggregatePayrollByDepartment(data: any[]) {
  const deptMap = new Map()
  
  data.forEach(row => {
    const dept = row.department || 'Unknown'
    const amount = row.total_amount || 0
    
    if (!deptMap.has(dept)) {
      deptMap.set(dept, { department: dept, total: 0, employee_count: 0 })
    }
    
    const current = deptMap.get(dept)
    current.total += amount
    current.employee_count += 1
  })
  
  return Array.from(deptMap.values())
    .sort((a, b) => b.total - a.total)
}

function aggregatePayrollByEmployee(data: any[]) {
  const empMap = new Map()
  
  data.forEach(row => {
    const name = `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Unknown'
    const amount = row.total_amount || 0
    
    if (!empMap.has(name)) {
      empMap.set(name, { employee: name, total: 0, payment_count: 0 })
    }
    
    const current = empMap.get(name)
    current.total += amount
    current.payment_count += 1
  })
  
  return Array.from(empMap.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)
}

// Fallback data fetcher
async function getFallbackData(queryType: string) {
  switch (queryType) {
    case 'ar_analysis':
      const { data: arData } = await supabase
        .from('ar_aging_detail')
        .select('*')
        .gt('open_balance', 0)
        .limit(50)
      return arData || []
      
    case 'payroll':
      const { data: payrollData } = await supabase
        .from('payments')
        .select('*')
        .limit(100)
      return payrollData || []
      
    default:
      const { data: journalData } = await supabase
        .from('journal_entry_lines')
        .select('*')
        .limit(100)
      return journalData || []
  }
}

function detectQueryType(message: string) {
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
