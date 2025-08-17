import { NextResponse } from 'next/server'
import { createCFOCompletion } from '../../../lib/openai'
import { supabase } from '../../../lib/supabaseClient'

export async function POST(request) {
  try {
    const { message, userId, context: frontendContext } = await request.json()
    
    if (!message?.trim()) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      )
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
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

    // Generate AI response with enhanced context and function calling
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
      { error: error.message || 'Failed to process AI request' },
      { status: 500 }
    )
  }
}

function detectQueryType(message) {
  const messageLower = message.toLowerCase()
  
  // A/R specific queries (NEW)
  if (messageLower.includes('accounts receivable') || 
      messageLower.includes('a/r') || 
      messageLower.includes('ar') || 
      messageLower.includes('receivable') || 
      messageLower.includes('aging') || 
      messageLower.includes('outstanding') || 
      messageLower.includes('collection') || 
      messageLower.includes('payment') || 
      messageLower.includes('invoice') || 
      messageLower.includes('overdue') || 
      messageLower.includes('slow pay') || 
      messageLower.includes('unpaid')) {
    return 'ar_analysis'
  }
  
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

// =============================================================================
// SUPABASE FUNCTION CALLING FUNCTIONS (NEW)
// These functions will be called by OpenAI to get real data from your tables
// =============================================================================

export const availableFunctions = {
  
  // A/R Aging Analysis Function
  getARAgingAnalysis: async ({ userId, customerId = null }) => {
    try {
      let query = supabase
        .from('ar_aging_detail')
        .select('*')
        .eq('user_id', userId)
      
      if (customerId) {
        query = query.eq('customer_id', customerId)
      }
      
      const { data: arData, error } = await query
      if (error) throw error
      
      // Process aging buckets
      const agingAnalysis = arData.reduce((acc, record) => {
        const customer = record.customer_name || 'Unknown'
        
        if (!acc[customer]) {
          acc[customer] = {
            customer_name: customer,
            customer_id: record.customer_id,
            current: 0,
            days_1_30: 0,
            days_31_60: 0,
            days_61_90: 0,
            days_over_90: 0,
            total_outstanding: 0
          }
        }
        
        // Sum by aging bucket (adjust field names to match your table)
        acc[customer].current += record.current || 0
        acc[customer].days_1_30 += record.days_1_30 || 0
        acc[customer].days_31_60 += record.days_31_60 || 0
        acc[customer].days_61_90 += record.days_61_90 || 0
        acc[customer].days_over_90 += record.days_over_90 || 0
        acc[customer].total_outstanding += record.total || 0
        
        return acc
      }, {})
      
      const customers = Object.values(agingAnalysis)
      const totalAR = customers.reduce((sum, customer) => sum + customer.total_outstanding, 0)
      
      // Return summary for OpenAI
      return {
        success: true,
        summary: "Current A/R aging analysis",
        total_ar: totalAR,
        customer_count: customers.length,
        customers: customers,
        risk_analysis: {
          high_risk: customers.filter(c => c.days_over_90 > 1000),
          medium_risk: customers.filter(c => c.days_61_90 > 500),
          current_good: customers.filter(c => c.current > c.days_1_30)
        },
        insights: {
          largest_outstanding: customers.reduce((max, customer) => 
            customer.total_outstanding > max.total_outstanding ? customer : max, customers[0] || {}),
          collection_priority: customers
            .filter(c => c.days_over_90 > 0)
            .sort((a, b) => b.days_over_90 - a.days_over_90)
            .slice(0, 5)
        }
      }
    } catch (error) {
      return { 
        success: false, 
        error: "Failed to analyze A/R aging", 
        details: error.message 
      }
    }
  },

  // A/R Payment History Analysis Function
  getARPaymentHistory: async ({ userId, customerId = null, timeframe = '6_months' }) => {
    try {
      // Query journal entries for A/R related transactions
      let query = supabase
        .from('journal_entry_lines')
        .select('*')
        .eq('user_id', userId)
        .or('account_name.ilike.%Accounts Receivable%,account_name.ilike.%A/R%,account_name.ilike.%AR%')
      
      if (customerId) {
        query = query.eq('customer_id', customerId)
      }
      
      // Date range based on timeframe
      const dateLimit = new Date()
      if (timeframe === '6_months') {
        dateLimit.setMonth(dateLimit.getMonth() - 6)
      } else if (timeframe === '3_months') {
        dateLimit.setMonth(dateLimit.getMonth() - 3)
      } else if (timeframe === '12_months') {
        dateLimit.setFullYear(dateLimit.getFullYear() - 1)
      }
      query = query.gte('date', dateLimit.toISOString().split('T')[0])
      
      const { data: journalData, error } = await query
      if (error) throw error
      
      // Process payment patterns
      const paymentAnalysis = journalData.reduce((acc, entry) => {
        const customer = entry.customer_name || 'Unknown'
        const month = entry.date.substring(0, 7) // YYYY-MM
        
        if (!acc[customer]) {
          acc[customer] = {
            customer_name: customer,
            customer_id: entry.customer_id,
            total_invoiced: 0,
            total_paid: 0,
            payment_months: {},
            transaction_count: 0
          }
        }
        
        // Credit = payment received, Debit = invoice/charge
        if (entry.credit > 0) {
          acc[customer].total_paid += entry.credit
          acc[customer].payment_months[month] = (acc[customer].payment_months[month] || 0) + entry.credit
        } else if (entry.debit > 0) {
          acc[customer].total_invoiced += entry.debit
        }
        
        acc[customer].transaction_count += 1
        return acc
      }, {})
      
      const customers = Object.values(paymentAnalysis)
      const overallInvoiced = customers.reduce((sum, c) => sum + c.total_invoiced, 0)
      const overallPaid = customers.reduce((sum, c) => sum + c.total_paid, 0)
      
      return {
        success: true,
        summary: `A/R payment history analysis for ${timeframe}`,
        timeframe: timeframe,
        customers: customers,
        overall_stats: {
          total_invoiced: overallInvoiced,
          total_paid: overallPaid,
          collection_rate: overallInvoiced > 0 ? (overallPaid / overallInvoiced) : 0
        },
        best_payers: customers
          .filter(c => c.total_invoiced > 0)
          .map(c => ({
            ...c,
            payment_rate: c.total_paid / c.total_invoiced
          }))
          .filter(c => c.payment_rate > 0.95)
          .sort((a, b) => b.total_paid - a.total_paid)
          .slice(0, 5),
        slow_payers: customers
          .filter(c => c.total_invoiced > 0)
          .map(c => ({
            ...c,
            payment_rate: c.total_paid / c.total_invoiced
          }))
          .filter(c => c.payment_rate < 0.8)
          .sort((a, b) => a.payment_rate - b.payment_rate)
          .slice(0, 5)
      }
    } catch (error) {
      return { 
        success: false, 
        error: "Failed to analyze payment history", 
        details: error.message 
      }
    }
  },

  // Customer Net Income Function (Enhanced for A/R context)
  getCustomerNetIncome: async ({ userId, customerId = null, timeframe = 'current_month' }) => {
    try {
      // Date filtering logic
      let dateFilter = {}
      const now = new Date()
      
      if (timeframe === 'current_month') {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        dateFilter = { gte: startOfMonth.toISOString().split('T')[0] }
      } else if (timeframe === 'last_month') {
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)
        dateFilter = { 
          gte: startOfLastMonth.toISOString().split('T')[0],
          lte: endOfLastMonth.toISOString().split('T')[0]
        }
      }
      
      let query = supabase
        .from('journal_entry_lines')
        .select('*')
        .eq('user_id', userId)
      
      if (customerId) {
        query = query.eq('customer_id', customerId)
      }
      
      if (dateFilter.gte) {
        query = query.gte('date', dateFilter.gte)
      }
      if (dateFilter.lte) {
        query = query.lte('date', dateFilter.lte)
      }

      const { data, error } = await query
      if (error) throw error

      // Group by customer and calculate net income from journal entries
      const customerFinancials = data?.reduce((acc, entry) => {
        const customerKey = entry.customer_name || entry.customer_id || 'Unallocated'
        
        if (!acc[customerKey]) {
          acc[customerKey] = {
            customer_name: customerKey,
            customer_id: entry.customer_id,
            revenue: 0,
            expenses: 0,
            net_income: 0,
            transaction_count: 0
          }
        }

        // Revenue accounts (credit increases revenue)
        if (entry.account_name?.includes('Income') || 
            entry.account_name?.includes('Revenue') ||
            entry.account_name?.includes('Sales')) {
          acc[customerKey].revenue += entry.credit || 0
        }

        // Expense accounts (debit increases expenses) 
        if (entry.account_name?.includes('Expense') || 
            entry.account_name?.includes('Cost') ||
            entry.account_name?.includes('COGS')) {
          acc[customerKey].expenses += entry.debit || 0
        }

        acc[customerKey].transaction_count += 1
        return acc
      }, {}) || {}

      // Calculate net income for each customer
      Object.values(customerFinancials).forEach(customer => {
        customer.net_income = customer.revenue - customer.expenses
      })

      const customers = Object.values(customerFinancials)
      
      return {
        success: true,
        summary: `Customer net income analysis for ${timeframe}`,
        timeframe: timeframe,
        total_customers: customers.length,
        customers: customers.sort((a, b) => b.net_income - a.net_income),
        company_totals: {
          total_revenue: customers.reduce((sum, c) => sum + c.revenue, 0),
          total_expenses: customers.reduce((sum, c) => sum + c.expenses, 0),
          total_net_income: customers.reduce((sum, c) => sum + c.net_income, 0)
        },
        top_performers: customers
          .filter(c => c.net_income > 0)
          .sort((a, b) => b.net_income - a.net_income)
          .slice(0, 5),
        underperformers: customers
          .filter(c => c.net_income < 0)
          .sort((a, b) => a.net_income - b.net_income)
          .slice(0, 5)
      }
    } catch (error) {
      return { 
        success: false, 
        error: "Failed to analyze customer net income", 
        details: error.message 
      }
    }
  }
}
