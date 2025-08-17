import { NextResponse } from 'next/server'
import { createCFOCompletion } from '../../../lib/openai' // make sure this uses gpt-4o or gpt-4o-mini

export async function POST(request: Request) {
  try {
    // Safely parse JSON
    const body = await request.json().catch(() => ({} as any))
    const { message, userId, context: frontendContext } = body ?? {}

    // Basic validation
    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // Do NOT hard-require userId — use a safe fallback
    const safeUserId = typeof userId === 'string' && userId.length ? userId : 'anon'

    // Build enhanced context
    const enhancedContext = {
      queryType: detectQueryType(message),
      platform: 'mobile',
      userId: safeUserId,
      timestamp: new Date().toISOString(),
      businessData: frontendContext?.currentData || {},
      userType: frontendContext?.userType || 'business_owner',
      ...frontendContext,
    }

    // Call the AI
    const response = await createCFOCompletion(message, enhancedContext)

    return NextResponse.json({
      response,
      context: {
        queryType: enhancedContext.queryType,
        platform: enhancedContext.platform,
      },
    })
  } catch (error: any) {
    console.error('❌ API Route Error:', {
      message: error?.message,
      stack: error?.stack,
      where: 'ai-chat-mobile',
    })
    return NextResponse.json(
      { error: error?.message || 'Failed to process AI request' },
      { status: 500 }
    )
  }
}

/** Simple query-type detector */
function detectQueryType(message: string): string {
  const s = message.toLowerCase()

  // A/R specific
  if (
    s.includes('accounts receivable') ||
    s.includes('a/r') || s.includes('ar') ||
    s.includes('receivable') || s.includes('aging') ||
    s.includes('outstanding') || s.includes('collection') ||
    s.includes('payment') || s.includes('invoice') ||
    s.includes('overdue') || s.includes('slow pay') || s.includes('unpaid')
  ) return 'ar_analysis'

  // Workforce/Labor
  if (
    s.includes('labor') || s.includes('payroll') || s.includes('staff') ||
    s.includes('employee') || s.includes('wages') || s.includes('salary') ||
    s.includes('contractor') || s.includes('contractors') ||
    s.includes('subcontractor') || s.includes('freelancer') ||
    s.includes('vendor') || s.includes('1099') ||
    s.includes('payroll by customer') || s.includes('labor by client') ||
    s.includes('staff costs by customer') || s.includes('employee costs by project')
  ) return 'workforce_analysis'

  // Customer/Client
  if (s.includes('customer') || s.includes('customers') || s.includes('client') || s.includes('clients'))
    return 'customer_analysis'

  // Revenue/Financial (incl. net income)
  if (
    s.includes('revenue') || s.includes('income') || s.includes('profit') ||
    s.includes('money') || s.includes('earnings') || s.includes('net income') ||
    s.includes('profitability') || s.includes('margin') || s.includes('gross profit') ||
    s.includes('company total') || s.includes('total profit') ||
    s.includes('overall profit') || s.includes('bottom line')
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

  // Expense
  if (s.includes('expense') || s.includes('cost') || s.includes('spending'))
    return 'expense_analysis'

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
