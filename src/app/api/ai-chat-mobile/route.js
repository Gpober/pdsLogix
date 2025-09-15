import { NextResponse } from 'next/server'
import { createCFOCompletion } from '../../../lib/openai' // ensure this uses gpt-4o or gpt-4o-mini

export async function POST(request) {
  try {
    // Safely parse JSON body (avoid TS-style `as any`)
    let body = {}
    try {
      body = await request.json()
    } catch {
      body = {}
    }

    const { message, userId, context: frontendContext } = body || {}

    // Validate message
    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // Do NOT hard-require userId — fall back to anon
    const safeUserId = (typeof userId === 'string' && userId.length) ? userId : 'anon'

    // Build enhanced context
    const enhancedContext = {
      queryType: detectQueryType(message),
      platform: 'mobile',
      userId: safeUserId,
      timestamp: new Date().toISOString(),
      businessData: (frontendContext && frontendContext.currentData) || {},
      userType: (frontendContext && frontendContext.userType) || 'business_owner',
      ...(frontendContext || {}),
    }

    // Call your OpenAI helper
    const response = await createCFOCompletion(message, enhancedContext)

    return NextResponse.json({
      response,
      context: {
        queryType: enhancedContext.queryType,
        platform: enhancedContext.platform,
      },
    })
  } catch (error) {
    console.error('❌ API Route Error:', error?.message || error)
    return NextResponse.json(
      { error: error?.message || 'Failed to process AI request' },
      { status: 500 }
    )
  }
}

// -----------------------------
// Simple query-type classifier
// -----------------------------
function detectQueryType(message) {
  const s = String(message || '').toLowerCase()

  // A/R specific
  if (
    s.includes('accounts receivable') ||
    s.includes('a/r') || s.includes('ar') ||
    s.includes('receivable') || s.includes('aging') ||
    s.includes('outstanding') || s.includes('collection') ||
    s.includes('invoice') ||
    s.includes('overdue') || s.includes('slow pay') || s.includes('unpaid')
  ) return 'ar_analysis'

  // A/P specific
  if (
    s.includes('accounts payable') ||
    s.includes('a/p') || s.includes('ap') ||
    s.includes('payable') || s.includes('payables') ||
    s.includes('bill') || s.includes('bills') ||
    s.includes('vendor') || s.includes('vendors') ||
    s.includes('owe') || s.includes('owing') || s.includes('owed')
  ) return 'ap_analysis'

  // Payroll / Workforce
  if (
    s.includes('labor') || s.includes('payroll') || s.includes('staff') ||
    s.includes('employee') || s.includes('wages') || s.includes('salary') ||
    s.includes('contractor') || s.includes('contractors') ||
    s.includes('subcontractor') || s.includes('freelancer') ||
    s.includes('1099') ||
    s.includes('payroll by customer') || s.includes('labor by client') ||
    s.includes('staff costs by customer') || s.includes('employee costs by project')
  ) return 'payroll'

  // Customer/Client
  if (s.includes('customer') || s.includes('customers') || s.includes('client') || s.includes('clients'))
    return 'customer_analysis'

  // Revenue/Financial (incl. expenses, COGS, net income)
  if (
    s.includes('revenue') || s.includes('income') || s.includes('profit') ||
    s.includes('money') || s.includes('earnings') || s.includes('net income') ||
    s.includes('profitability') || s.includes('margin') || s.includes('gross profit') ||
    s.includes('company total') || s.includes('total profit') ||
    s.includes('overall profit') || s.includes('bottom line') ||
    s.includes('financial data') || s.includes('all financial') || s.includes('financial health') ||
    s.includes('journal entry') || s.includes('journal entries') ||
    s.includes('expense') || s.includes('expenses') || s.includes('cost') ||
    s.includes('spending') || s.includes('cogs') || s.includes('cost of goods sold') ||
    s.includes('p&l') || s.includes('p/l') || s.includes('p and l') ||
    s.includes('pnl') || s.includes('profit and loss') || s.includes('income statement')
  ) return 'financial_analysis'

  // Performance
  if (
    s.includes('performance') || s.includes('analyze') || s.includes('best') || s.includes('worst') ||
    s.includes('compare') || s.includes('profitable') || s.includes('top customer') ||
    s.includes('bottom customer') || s.includes('customer ranking') ||
    s.includes('total performance') || s.includes('overall performance')
  ) return 'performance_analysis'

  // Project/Service
  if (s.includes('project') || s.includes('service') || s.includes('contract') || s.includes('job'))
    return 'project_analysis'

  // Efficiency
  if (s.includes('efficiency') || s.includes('productivity') || s.includes('utilization') || s.includes('billable'))
    return 'efficiency_analysis'

  // Trend / Forecast / YoY
  if (
    s.includes('trend') || s.includes('forecast') || s.includes('future') || s.includes('predict') ||
    s.includes('compared to last year') || s.includes('vs last year') ||
    s.includes('year over year') || s.includes('year-over-year') ||
    s.includes('this year vs') || s.includes('compared to') || s.includes('previous year') ||
    s.includes('how am i doing') || s.includes('growth') || s.includes('improvement') ||
    s.includes('better than') || s.includes('worse than')
  ) return 'trend_analysis'

  return 'general'
}
