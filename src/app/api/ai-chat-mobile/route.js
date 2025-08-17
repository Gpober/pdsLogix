import { NextResponse } from 'next/server'
import { createCFOCompletion } from '../../../lib/openai'

export async function POST(request) {
  try {
    const { message, userId, context: frontendContext } = await request.json()
    
    if (!message?.trim()) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      )
    }

    // Enhanced context detection
    const enhancedContext = {
      queryType: detectQueryType(message),
      platform: 'mobile',
      userId: userId,
      timestamp: new Date().toISOString(),
      businessData: frontendContext?.currentData || {},
      userType: frontendContext?.userType || 'business_owner',
      ...frontendContext
    }

    console.log('🎤 AI Chat Request:', { message, context: enhancedContext })

    // Generate AI response with enhanced context
    const response = await createCFOCompletion(message, enhancedContext)
    
    return NextResponse.json({ 
      response,
      context: {
        queryType: enhancedContext.queryType,
        platform: enhancedContext.platform
      }
    })

  } catch (error) {
    console.error('❌ AI Chat Error:', error)
    
    return NextResponse.json(
      { error: 'Failed to process AI request' },
      { status: 500 }
    )
  }
}

function detectQueryType(message) {
  const messageLower = message.toLowerCase()
  
  // Workforce/Labor queries (employees + contractors + customer allocation)
  if (messageLower.includes('labor') || 
      messageLower.includes('payroll') || 
      messageLower.includes('staff') || 
      messageLower.includes('employee') || 
      messageLower.includes('wages') || 
      messageLower.includes('salary') ||
      messageLower.includes('contractor') || 
      messageLower.includes('contractors') || 
      messageLower.includes('subcontractor') || 
      messageLower.includes('freelancer') || 
      messageLower.includes('vendor') || 
      messageLower.includes('1099') ||
      messageLower.includes('payroll by customer') ||
      messageLower.includes('labor by client') ||
      messageLower.includes('staff costs by customer') ||
      messageLower.includes('employee costs by project')) {
    return 'workforce_analysis'
  }
  
  // Customer/Client queries
  if (messageLower.includes('customer') || 
      messageLower.includes('customers') || 
      messageLower.includes('client') || 
      messageLower.includes('clients')) {
    return 'customer_analysis'
  }
  
  // Revenue/Financial queries (including net income)
  if (messageLower.includes('revenue') || 
      messageLower.includes('income') || 
      messageLower.includes('profit') || 
      messageLower.includes('money') ||
      messageLower.includes('earnings') ||
      messageLower.includes('net income') ||
      messageLower.includes('profitability') ||
      messageLower.includes('margin') ||
      messageLower.includes('gross profit') ||
      messageLower.includes('company total') ||
      messageLower.includes('total profit') ||
      messageLower.includes('overall profit') ||
      messageLower.includes('bottom line')) {
    return 'financial_analysis'
  }
  
  // Performance queries (including customer profitability)
  if (messageLower.includes('performance') || 
      messageLower.includes('analyze') || 
      messageLower.includes('best') || 
      messageLower.includes('worst') ||
      messageLower.includes('compare') ||
      messageLower.includes('profitable') ||
      messageLower.includes('top customer') ||
      messageLower.includes('bottom customer') ||
      messageLower.includes('customer ranking') ||
      messageLower.includes('total performance') ||
      messageLower.includes('overall performance')) {
    return 'performance_analysis'
  }
  
  // Project/Service queries
  if (messageLower.includes('project') || 
      messageLower.includes('service') || 
      messageLower.includes('contract') || 
      messageLower.includes('job')) {
    return 'project_analysis'
  }
  
  // Efficiency queries
  if (messageLower.includes('efficiency') || 
      messageLower.includes('productivity') || 
      messageLower.includes('utilization') || 
      messageLower.includes('billable')) {
    return 'efficiency_analysis'
  }
  
  // Expense queries
  if (messageLower.includes('expense') || 
      messageLower.includes('cost') || 
      messageLower.includes('spending')) {
    return 'expense_analysis'
  }
  
  // Trend/Forecast queries
  if (messageLower.includes('trend') || 
      messageLower.includes('forecast') || 
      messageLower.includes('future') || 
      messageLower.includes('predict')) {
    return 'trend_analysis'
  }
  
  return 'general'
}
