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
  
  // Trend/Forecast queries (ENHANCED for year-over-year)
  if (messageLower.includes('trend') || 
      messageLower.includes('forecast') || 
      messageLower.includes('future') || 
      messageLower.includes('predict') ||
      messageLower.includes('compared to last year') ||
      messageLower.includes('vs last year') ||
      messageLower.includes('year over year') ||
      messageLower.includes('year-over-year') ||
      messageLower.includes('this year vs') ||
      messageLower.includes('compared to') ||
      messageLower.includes('previous year') ||
      messageLower.includes('how am i doing') ||
      messageLower.includes('growth') ||
      messageLower.includes('improvement') ||
      messageLower.includes('better than') ||
      messageLower.includes('worse than')) {
    return 'trend_analysis'
  }
  
  return 'general'
}

// =============================================================================
// SUPABASE FUNCTION CALLING FUNCTIONS - CORRECTED FOR SINGLE USER PER DATABASE
// These functions will be called by OpenAI to get real data from your tables
// =============================================================================

export const availableFunctions = {
  
  // A/R Aging Analysis Function - CORRECTED
  getARAgingAnalysis: async ({ customerId = null }) => {  // ← REMOVED userId parameter
    try {
      let query = supabase
        .from('ar_aging_detail')
        .select('*')
        // ← REMOVED .eq('user_id', userId) line - not needed for single user per DB
      
      if (customerId) {
        query = query.eq('customer', customerId)
      }
      
      const { data: arData, error } = await query
      if (error) throw error
      
      // Handle empty data case
      if (!arData || arData.length === 0) {
        return {
          success: true,
          summary: "No A/R data found",
          total_ar: 0,
          customer_count: 0,
          total_invoices: 0,
          message: "No open invoices or aging data available"
        }
      }
      
      // Calculate aging buckets based on due_date vs current date
      const currentDate = new Date()
      
      const agingAnalysis = arData.reduce((acc, record) => {
        const customer = record.customer || 'Unknown'
        const dueDate = new Date(record.due_date)
        const daysPastDue = Math.floor((currentDate - dueDate) / (1000 * 60 * 60 * 24))
        const openBalance = record.open_balance || record.amount || 0
        
        if (!acc[customer]) {
          acc[customer] = {
            customer_name: customer,
            current: 0,           // Not yet due
            days_1_30: 0,        // 1-30 days past due
            days_31_60: 0,       // 31-60 days past due
            days_61_90: 0,       // 61-90 days past due
            days_over_90: 0,     // Over 90 days past due
            total_outstanding: 0,
            invoice_count: 0,
            oldest_invoice_days: 0
          }
        }
        
        // Categorize by aging bucket
        if (daysPastDue <= 0) {
          acc[customer].current += openBalance
        } else if (daysPastDue <= 30) {
          acc[customer].days_1_30 += openBalance
        } else if (daysPastDue <= 60) {
          acc[customer].days_31_60 += openBalance
        } else if (daysPastDue <= 90) {
          acc[customer].days_61_90 += openBalance
        } else {
          acc[customer].days_over_90 += openBalance
        }
        
        acc[customer].total_outstanding += openBalance
        acc[customer].invoice_count += 1
        acc[customer].oldest_invoice_days = Math.max(acc[customer].oldest_invoice_days, daysPastDue)
        
        return acc
      }, {})
      
      const customers = Object.values(agingAnalysis)
      const totalAR = customers.reduce((sum, customer) => sum + customer.total_outstanding, 0)
      
      // Return summary for OpenAI
      return {
        success: true,
        summary: "Current A/R aging analysis based on due dates",
        total_ar: totalAR,
        customer_count: customers.length,
        total_invoices: arData.length,
        customers: customers,
        aging_summary: {
          current: customers.reduce((sum, c) => sum + c.current, 0),
          days_1_30: customers.reduce((sum, c) => sum + c.days_1_30, 0),
          days_31_60: customers.reduce((sum, c) => sum + c.days_31_60, 0),
          days_61_90: customers.reduce((sum, c) => sum + c.days_61_90, 0),
          days_over_90: customers.reduce((sum, c) => sum + c.days_over_90, 0)
        },
        risk_analysis: {
          high_risk: customers.filter(c => c.days_over_90 > 1000),
          medium_risk: customers.filter(c => c.days_61_90 > 500),
          current_good: customers.filter(c => c.current > c.days_1_30),
          worst_aging: customers.sort((a, b) => b.oldest_invoice_days - a.oldest_invoice_days).slice(0, 5)
        },
        insights: {
          largest_outstanding: customers.reduce((max, customer) => 
            customer.total_outstanding > max.total_outstanding ? customer : max, customers[0] || {}),
          collection_priority: customers
            .filter(c => c.days_over_90 > 0)
            .sort((a, b) => b.days_over_90 - a.days_over_90)
            .slice(0, 5),
          aging_percentage: {
            current_pct: totalAR > 0 ? (customers.reduce((sum, c) => sum + c.current, 0) / totalAR * 100) : 0,
            past_due_pct: totalAR > 0 ? ((totalAR - customers.reduce((sum, c) => sum + c.current, 0)) / totalAR * 100) : 0
          }
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

  // A/R Payment History Analysis Function - CORRECTED
  getARPaymentHistory: async ({ customerId = null, timeframe = '6_months' }) => {  // ← REMOVED userId parameter
    try {
      // Query journal entries for A/R related transactions
      let query = supabase
        .from('journal_entry_lines')
        .select('*')
        // ← REMOVED .eq('user_id', userId) line - not needed for single user per DB
        .or('account.ilike.%Accounts Receivable%,account.ilike.%A/R%,account.ilike.%AR%')
      
      if (customerId) {
        query = query.eq('customer', customerId)
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
      
      // Handle empty data case
      if (!journalData || journalData.length === 0) {
        return {
          success: true,
          summary: `No A/R payment data found for ${timeframe}`,
          timeframe: timeframe,
          message: "No A/R transactions found in the specified period"
        }
      }
      
      // Process payment patterns using correct field names
      const paymentAnalysis = journalData.reduce((acc, entry) => {
        const customer = entry.customer || entry.name || 'Unknown'
        const month = entry.date.substring(0, 7) // YYYY-MM
        
        if (!acc[customer]) {
          acc[customer] = {
            customer_name: customer,
            customer_id: entry.customer,
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

  // Customer Net Income Function - CORRECTED
  getCustomerNetIncome: async ({ customerId = null, timeframe = 'current_month' }) => {  // ← REMOVED userId parameter
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
        // ← REMOVED .eq('user_id', userId) line - not needed for single user per DB
      
      if (customerId) {
        query = query.eq('customer', customerId)
      }
      
      if (dateFilter.gte) {
        query = query.gte('date', dateFilter.gte)
      }
      if (dateFilter.lte) {
        query = query.lte('date', dateFilter.lte)
      }

      const { data, error } = await query
      if (error) throw error

      // Handle empty data case
      if (!data || data.length === 0) {
        return {
          success: true,
          summary: `No financial data found for ${timeframe}`,
          timeframe: timeframe,
          message: "No transactions found in the specified period"
        }
      }

      // Group by customer and calculate net income using correct field names
      const customerFinancials = data.reduce((acc, entry) => {
        const customerKey = entry.customer || entry.name || 'Unallocated'
        
        if (!acc[customerKey]) {
          acc[customerKey] = {
            customer_name: customerKey,
            customer_id: entry.customer,
            property: entry.property,
            revenue: 0,
            expenses: 0,
            net_income: 0,
            transaction_count: 0
          }
        }

        // Revenue accounts (credit increases revenue) - using correct field name
        if (entry.account?.includes('Income') || 
            entry.account?.includes('Revenue') ||
            entry.account?.includes('Sales') ||
            entry.account_type?.includes('Income')) {
          acc[customerKey].revenue += entry.credit || 0
        }

        // Expense accounts (debit increases expenses) - using correct field name
        if (entry.account?.includes('Expense') || 
            entry.account?.includes('Cost') ||
            entry.account?.includes('COGS') ||
            entry.account_type?.includes('Expense')) {
          acc[customerKey].expenses += entry.debit || 0
        }

        acc[customerKey].transaction_count += 1
        return acc
      }, {})

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
  },

  // Year-over-Year Comparison Function - CORRECTED
  getYearOverYearComparison: async ({ customerId = null, metric = 'all' }) => {  // ← REMOVED userId parameter
    try {
      const currentYear = new Date().getFullYear()
      const lastYear = currentYear - 1
      
      // Get current year data (full year to date)
      const currentYearStart = `${currentYear}-01-01`
      const currentYearEnd = new Date().toISOString().split('T')[0] // Today
      
      // Get same period last year
      const lastYearStart = `${lastYear}-01-01`
      const lastYearEnd = `${lastYear}-${new Date().toISOString().split('T')[0].substring(5)}` // Same date last year
      
      // Query current year data
      let currentQuery = supabase
        .from('journal_entry_lines')
        .select('*')
        // ← REMOVED .eq('user_id', userId) line - not needed for single user per DB
        .gte('date', currentYearStart)
        .lte('date', currentYearEnd)
      
      if (customerId) {
        currentQuery = currentQuery.eq('customer', customerId)
      }
      
      // Query last year data
      let lastYearQuery = supabase
        .from('journal_entry_lines')
        .select('*')
        // ← REMOVED .eq('user_id', userId) line - not needed for single user per DB
        .gte('date', lastYearStart)
        .lte('date', lastYearEnd)
      
      if (customerId) {
        lastYearQuery = lastYearQuery.eq('customer', customerId)
      }
      
      const [currentData, lastYearData] = await Promise.all([
        currentQuery,
        lastYearQuery
      ])
      
      if (currentData.error || lastYearData.error) {
        throw new Error(currentData.error?.message || lastYearData.error?.message)
      }
      
      // Handle empty data case
      if ((!currentData.data || currentData.data.length === 0) && 
          (!lastYearData.data || lastYearData.data.length === 0)) {
        return {
          success: true,
          summary: `No financial data found for year-over-year comparison`,
          message: "No transactions found for either year"
        }
      }

      // Process current year financials
      const processFinancials = (data, year) => {
        const summary = {
          year: year,
          revenue: 0,
          expenses: 0,
          net_income: 0,
          transaction_count: data.length,
          customers: new Set(),
          properties: new Set(),
          monthly_breakdown: {}
        }
        
        data.forEach(entry => {
          const month = entry.date.substring(0, 7) // YYYY-MM
          
          if (!summary.monthly_breakdown[month]) {
            summary.monthly_breakdown[month] = { revenue: 0, expenses: 0, net_income: 0 }
          }
          
          // Track unique customers and properties
          if (entry.customer) summary.customers.add(entry.customer)
          if (entry.property) summary.properties.add(entry.property)
          
          // Revenue calculation
          if (entry.account?.includes('Income') || 
              entry.account?.includes('Revenue') ||
              entry.account?.includes('Sales') ||
              entry.account_type?.includes('Income')) {
            summary.revenue += entry.credit || 0
            summary.monthly_breakdown[month].revenue += entry.credit || 0
          }
          
          // Expense calculation
          if (entry.account?.includes('Expense') || 
              entry.account?.includes('Cost') ||
              entry.account?.includes('COGS') ||
              entry.account_type?.includes('Expense')) {
            summary.expenses += entry.debit || 0
            summary.monthly_breakdown[month].expenses += entry.debit || 0
          }
        })
        
        summary.net_income = summary.revenue - summary.expenses
        summary.customer_count = summary.customers.size
        summary.property_count = summary.properties.size
        
        // Calculate net income for each month
        Object.keys(summary.monthly_breakdown).forEach(month => {
          summary.monthly_breakdown[month].net_income = 
            summary.monthly_breakdown[month].revenue - summary.monthly_breakdown[month].expenses
        })
        
        return summary
      }
      
      const currentYearSummary = processFinancials(currentData.data || [], currentYear)
      const lastYearSummary = processFinancials(lastYearData.data || [], lastYear)
      
      // Calculate changes and percentages
      const calculateChange = (current, previous) => {
        const change = current - previous
        const percentChange = previous !== 0 ? ((change / previous) * 100) : (current > 0 ? 100 : 0)
        return {
          current,
          previous,
          change,
          percent_change: percentChange,
          trend: change > 0 ? 'up' : change < 0 ? 'down' : 'flat'
        }
      }
      
      return {
        success: true,
        summary: `Year-over-year comparison: ${currentYear} vs ${lastYear}`,
        comparison_period: {
          current_year: currentYear,
          last_year: lastYear,
          current_period: `${currentYearStart} to ${currentYearEnd}`,
          comparison_period: `${lastYearStart} to ${lastYearEnd}`
        },
        financial_comparison: {
          revenue: calculateChange(currentYearSummary.revenue, lastYearSummary.revenue),
          expenses: calculateChange(currentYearSummary.expenses, lastYearSummary.expenses),
          net_income: calculateChange(currentYearSummary.net_income, lastYearSummary.net_income),
          profit_margin: {
            current: currentYearSummary.revenue > 0 ? (currentYearSummary.net_income / currentYearSummary.revenue * 100) : 0,
            previous: lastYearSummary.revenue > 0 ? (lastYearSummary.net_income / lastYearSummary.revenue * 100) : 0
          }
        },
        business_metrics: {
          customers: calculateChange(currentYearSummary.customer_count, lastYearSummary.customer_count),
          properties: calculateChange(currentYearSummary.property_count, lastYearSummary.property_count),
          transactions: calculateChange(currentYearSummary.transaction_count, lastYearSummary.transaction_count),
          avg_revenue_per_customer: {
            current: currentYearSummary.customer_count > 0 ? (currentYearSummary.revenue / currentYearSummary.customer_count) : 0,
            previous: lastYearSummary.customer_count > 0 ? (lastYearSummary.revenue / lastYearSummary.customer_count) : 0
          }
        },
        insights: {
          strongest_growth: currentYearSummary.revenue > lastYearSummary.revenue ? 'revenue' : 'cost_control',
          biggest_concern: currentYearSummary.expenses > lastYearSummary.expenses * 1.1 ? 'expense_growth' : null,
          overall_performance: currentYearSummary.net_income > lastYearSummary.net_income ? 'improved' : 'declined',
          key_metrics: {
            revenue_growth: ((currentYearSummary.revenue - lastYearSummary.revenue) / (lastYearSummary.revenue || 1) * 100).toFixed(1),
            expense_growth: ((currentYearSummary.expenses - lastYearSummary.expenses) / (lastYearSummary.expenses || 1) * 100).toFixed(1),
            profit_growth: ((currentYearSummary.net_income - lastYearSummary.net_income) / (Math.abs(lastYearSummary.net_income) || 1) * 100).toFixed(1)
          }
        },
        monthly_trends: {
          current_year: currentYearSummary.monthly_breakdown,
          last_year: lastYearSummary.monthly_breakdown
        }
      }
    } catch (error) {
      return { 
        success: false, 
        error: "Failed to perform year-over-year comparison", 
        details: error.message 
      }
    }
  }
}
