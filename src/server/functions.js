// src/server/functions.js
import { supabase } from '../lib/supabaseClient'

export const availableFunctions = {
  // =========================
  // A/R Aging Analysis
  // =========================
  getARAgingAnalysis: async ({ customerId = null } = {}) => {
    try {
      let query = supabase.from('ar_aging_detail').select('*')
      if (customerId) query = query.eq('customer', customerId)

      const { data: arData, error } = await query
      if (error) throw error

      if (!arData || arData.length === 0) {
        return {
          success: true,
          summary: 'No A/R data found',
          total_ar: 0,
          customer_count: 0,
          total_invoices: 0,
          message: 'No open invoices or aging data available',
        }
      }

      const currentDate = new Date()
      const agingAnalysis = arData.reduce((acc, record) => {
        const customer = record.customer || 'Unknown'
        const dueDate = new Date(record.due_date)
        const daysPastDue = Math.floor((+currentDate - +dueDate) / (1000 * 60 * 60 * 24))
        const openBalance = record.open_balance || record.amount || 0

        if (!acc[customer]) {
          acc[customer] = {
            customer_name: customer,
            current: 0,
            days_1_30: 0,
            days_31_60: 0,
            days_61_90: 0,
            days_over_90: 0,
            total_outstanding: 0,
            invoice_count: 0,
            oldest_invoice_days: 0,
          }
        }

        if (daysPastDue <= 0) acc[customer].current += openBalance
        else if (daysPastDue <= 30) acc[customer].days_1_30 += openBalance
        else if (daysPastDue <= 60) acc[customer].days_31_60 += openBalance
        else if (daysPastDue <= 90) acc[customer].days_61_90 += openBalance
        else acc[customer].days_over_90 += openBalance

        acc[customer].total_outstanding += openBalance
        acc[customer].invoice_count += 1
        acc[customer].oldest_invoice_days = Math.max(acc[customer].oldest_invoice_days, daysPastDue)
        return acc
      }, {})

      const customers = Object.values(agingAnalysis)
      const totalAR = customers.reduce((sum, c) => sum + c.total_outstanding, 0)

      return {
        success: true,
        summary: 'Current A/R aging analysis based on due dates',
        total_ar: totalAR,
        customer_count: customers.length,
        total_invoices: arData.length,
        customers,
        aging_summary: {
          current: customers.reduce((s, c) => s + c.current, 0),
          days_1_30: customers.reduce((s, c) => s + c.days_1_30, 0),
          days_31_60: customers.reduce((s, c) => s + c.days_31_60, 0),
          days_61_90: customers.reduce((s, c) => s + c.days_61_90, 0),
          days_over_90: customers.reduce((s, c) => s + c.days_over_90, 0),
        },
        risk_analysis: {
          high_risk: customers.filter(c => c.days_over_90 > 1000),
          medium_risk: customers.filter(c => c.days_61_90 > 500),
          current_good: customers.filter(c => c.current > c.days_1_30),
          worst_aging: [...customers].sort((a, b) => b.oldest_invoice_days - a.oldest_invoice_days).slice(0, 5),
        },
        insights: {
          largest_outstanding: customers.reduce(
            (max, c) => (c.total_outstanding > (max.total_outstanding || 0) ? c : max),
            {}
          ),
          collection_priority: customers
            .filter(c => c.days_over_90 > 0)
            .sort((a, b) => b.days_over_90 - a.days_over_90)
            .slice(0, 5),
          aging_percentage: {
            current_pct:
              totalAR > 0 ? (customers.reduce((s, c) => s + c.current, 0) / totalAR) * 100 : 0,
            past_due_pct:
              totalAR > 0
                ? ((totalAR - customers.reduce((s, c) => s + c.current, 0)) / totalAR) * 100
                : 0,
          },
        },
      }
    } catch (error) {
      console.error('❌ getARAgingAnalysis error:', error)
      return { success: false, error: 'Failed to analyze A/R aging', details: error.message }
    }
  },

  // =========================
  // A/R Payment History
  // =========================
  getARPaymentHistory: async ({ customerId = null, timeframe = '6_months' } = {}) => {
    try {
      let query = supabase
        .from('journal_entry_lines')
        .select('*')
        .or('account.ilike.%Accounts Receivable%,account.ilike.%A/R%,account.ilike.%AR%')

      if (customerId) query = query.eq('customer', customerId)

      const dateLimit = new Date()
      if (timeframe === '6_months') dateLimit.setMonth(dateLimit.getMonth() - 6)
      else if (timeframe === '3_months') dateLimit.setMonth(dateLimit.getMonth() - 3)
      else if (timeframe === '12_months') dateLimit.setFullYear(dateLimit.getFullYear() - 1)

      query = query.gte('date', dateLimit.toISOString().split('T')[0])

      const { data: journalData, error } = await query
      if (error) throw error

      if (!journalData || journalData.length === 0) {
        return {
          success: true,
          summary: `No A/R payment data found for ${timeframe}`,
          timeframe,
          message: 'No A/R transactions found in the specified period',
        }
      }

      const paymentAnalysis = journalData.reduce((acc, entry) => {
        const customer = entry.customer || entry.name || 'Unknown'
        const month = String(entry.date).substring(0, 7)

        if (!acc[customer]) {
          acc[customer] = {
            customer_name: customer,
            customer_id: entry.customer,
            total_invoiced: 0,
            total_paid: 0,
            payment_months: {},
            transaction_count: 0,
          }
        }

        if (entry.credit > 0) {
          acc[customer].total_paid += entry.credit
          acc[customer].payment_months[month] =
            (acc[customer].payment_months[month] || 0) + entry.credit
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
        timeframe,
        customers,
        overall_stats: {
          total_invoiced: overallInvoiced,
          total_paid: overallPaid,
          collection_rate: overallInvoiced > 0 ? overallPaid / overallInvoiced : 0,
        },
        best_payers: customers
          .filter(c => c.total_invoiced > 0)
          .map(c => ({ ...c, payment_rate: c.total_paid / c.total_invoiced }))
          .filter(c => c.payment_rate > 0.95)
          .sort((a, b) => b.total_paid - a.total_paid)
          .slice(0, 5),
        slow_payers: customers
          .filter(c => c.total_invoiced > 0)
          .map(c => ({ ...c, payment_rate: c.total_paid / c.total_invoiced }))
          .filter(c => c.payment_rate < 0.8)
          .sort((a, b) => a.payment_rate - b.payment_rate)
          .slice(0, 5),
      }
    } catch (error) {
      console.error('❌ getARPaymentHistory error:', error)
      return { success: false, error: 'Failed to analyze payment history', details: error.message }
    }
  },

  // =========================
  // Customer Net Income
  // =========================
  getCustomerNetIncome: async ({ customerId = null, timeframe = 'current_month' } = {}) => {
    try {
      const now = new Date()
      let gte
      let lte

      if (timeframe === 'current_month') {
        const start = new Date(now.getFullYear(), now.getMonth(), 1)
        gte = start.toISOString().split('T')[0]
      } else if (timeframe === 'last_month') {
        const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        const end = new Date(now.getFullYear(), now.getMonth(), 0)
        gte = start.toISOString().split('T')[0]
        lte = end.toISOString().split('T')[0]
      }

      let query = supabase.from('journal_entry_lines').select('*')
      if (customerId) query = query.eq('customer', customerId)
      if (gte) query = query.gte('date', gte)
      if (lte) query = query.lte('date', lte)

      const { data, error } = await query
      if (error) throw error

      if (!data || data.length === 0) {
        return {
          success: true,
          summary: `No financial data found for ${timeframe}`,
          timeframe,
          message: 'No transactions found in the specified period',
        }
      }

      const grouped = data.reduce((acc, entry) => {
        const key = entry.customer || entry.name || 'Unallocated'
        if (!acc[key]) {
          acc[key] = {
            customer_name: key,
            customer_id: entry.customer,
            property: entry.property,
            revenue: 0,
            expenses: 0,
            net_income: 0,
            transaction_count: 0,
          }
        }

        if (
          (entry.account && (entry.account.includes('Income') || entry.account.includes('Revenue') || entry.account.includes('Sales'))) ||
          (entry.account_type && entry.account_type.includes('Income'))
        ) {
          acc[key].revenue += entry.credit || 0
        }
        if (
          (entry.account && (entry.account.includes('Expense') || entry.account.includes('Cost') || entry.account.includes('COGS'))) ||
          (entry.account_type && entry.account_type.includes('Expense'))
        ) {
          acc[key].expenses += entry.debit || 0
        }
        acc[key].transaction_count += 1
        return acc
      }, {})

      Object.values(grouped).forEach(c => { c.net_income = c.revenue - c.expenses })
      const customers = Object.values(grouped)

      return {
        success: true,
        summary: `Customer net income analysis for ${timeframe}`,
        timeframe,
        total_customers: customers.length,
        customers: customers.sort((a, b) => b.net_income - a.net_income),
        company_totals: {
          total_revenue: customers.reduce((s, c) => s + c.revenue, 0),
          total_expenses: customers.reduce((s, c) => s + c.expenses, 0),
          total_net_income: customers.reduce((s, c) => s + c.net_income, 0),
        },
        top_performers: customers.filter(c => c.net_income > 0).slice(0, 5),
        underperformers: customers.filter(c => c.net_income < 0).slice(0, 5),
      }
    } catch (error) {
      console.error('❌ getCustomerNetIncome error:', error)
      return { success: false, error: 'Failed to analyze customer net income', details: error.message }
    }
  },

  // =========================
  // Year-over-Year Comparison
  // =========================
  getYearOverYearComparison: async ({ customerId = null, metric = 'all' } = {}) => {
    try {
      const currentYear = new Date().getFullYear()
      const lastYear = currentYear - 1

      const currentYearStart = `${currentYear}-01-01`
      const currentYearEnd = new Date().toISOString().split('T')[0]
      const lastYearStart = `${lastYear}-01-01`
      const lastYearEnd = `${lastYear}-${new Date().toISOString().split('T')[0].substring(5)}`

      let currentQuery = supabase
        .from('journal_entry_lines')
        .select('*')
        .gte('date', currentYearStart)
        .lte('date', currentYearEnd)
      if (customerId) currentQuery = currentQuery.eq('customer', customerId)

      let lastYearQuery = supabase
        .from('journal_entry_lines')
        .select('*')
        .gte('date', lastYearStart)
        .lte('date', lastYearEnd)
      if (customerId) lastYearQuery = lastYearQuery.eq('customer', customerId)

      const [currentData, lastYearData] = await Promise.all([currentQuery, lastYearQuery])
      if (currentData.error || lastYearData.error) {
        throw new Error(currentData.error?.message || lastYearData.error?.message)
      }

      const processFinancials = (rows, year) => {
        const summary = {
          year,
          revenue: 0,
          expenses: 0,
          net_income: 0,
          transaction_count: rows.length,
          customers: new Set(),
          properties: new Set(),
          monthly_breakdown: {},
        }

        rows.forEach(entry => {
          const month = String(entry.date).substring(0, 7)
          if (!summary.monthly_breakdown[month]) {
            summary.monthly_breakdown[month] = { revenue: 0, expenses: 0, net_income: 0 }
          }
          if (entry.customer) summary.customers.add(entry.customer)
          if (entry.property) summary.properties.add(entry.property)

          if (
            (entry.account && (entry.account.includes('Income') || entry.account.includes('Revenue') || entry.account.includes('Sales'))) ||
            (entry.account_type && entry.account_type.includes('Income'))
          ) {
            summary.revenue += entry.credit || 0
            summary.monthly_breakdown[month].revenue += entry.credit || 0
          }
          if (
            (entry.account && (entry.account.includes('Expense') || entry.account.includes('Cost') || entry.account.includes('COGS'))) ||
            (entry.account_type && entry.account_type.includes('Expense'))
          ) {
            summary.expenses += entry.debit || 0
            summary.monthly_breakdown[month].expenses += entry.debit || 0
          }
        })

        summary.net_income = summary.revenue - summary.expenses
        summary.customer_count = summary.customers.size
        summary.property_count = summary.properties.size

        Object.keys(summary.monthly_breakdown).forEach(m => {
          summary.monthly_breakdown[m].net_income =
            summary.monthly_breakdown[m].revenue - summary.monthly_breakdown[m].expenses
        })
        return summary
      }

      const cur = processFinancials(currentData.data || [], currentYear)
      const prev = processFinancials(lastYearData.data || [], lastYear)

      const calc = (a, b) => {
        const change = a - b
        const pct = b !== 0 ? (change / b) * 100 : a > 0 ? 100 : 0
        return { current: a, previous: b, change, percent_change: pct, trend: change > 0 ? 'up' : change < 0 ? 'down' : 'flat' }
      }

      return {
        success: true,
        summary: `Year-over-year comparison: ${currentYear} vs ${lastYear}`,
        comparison_period: {
          current_year: currentYear,
          last_year: lastYear,
          current_period: `${currentYearStart} to ${currentYearEnd}`,
          comparison_period: `${lastYearStart} to ${lastYearEnd}`,
        },
        financial_comparison: {
          revenue: calc(cur.revenue, prev.revenue),
          expenses: calc(cur.expenses, prev.expenses),
          net_income: calc(cur.net_income, prev.net_income),
          profit_margin: {
            current: cur.revenue > 0 ? (cur.net_income / cur.revenue) * 100 : 0,
            previous: prev.revenue > 0 ? (prev.net_income / prev.revenue) * 100 : 0,
          },
        },
        business_metrics: {
          customers: calc(cur.customer_count, prev.customer_count),
          properties: calc(cur.property_count, prev.property_count),
          transactions: calc(cur.transaction_count, prev.transaction_count),
          avg_revenue_per_customer: {
            current: cur.customer_count > 0 ? cur.revenue / cur.customer_count : 0,
            previous: prev.customer_count > 0 ? prev.revenue / prev.customer_count : 0,
          },
        },
        insights: {
          strongest_growth: cur.revenue > prev.revenue ? 'revenue' : 'cost_control',
          biggest_concern: cur.expenses > prev.expenses * 1.1 ? 'expense_growth' : null,
          overall_performance: cur.net_income > prev.net_income ? 'improved' : 'declined',
          key_metrics: {
            revenue_growth: (((cur.revenue - prev.revenue) / (prev.revenue || 1)) * 100).toFixed(1),
            expense_growth: (((cur.expenses - prev.expenses) / (prev.expenses || 1)) * 100).toFixed(1),
            profit_growth: (((cur.net_income - prev.net_income) / (Math.abs(prev.net_income) || 1)) * 100).toFixed(1),
          },
        },
        monthly_trends: {
          current_year: cur.monthly_breakdown,
          last_year: prev.monthly_breakdown,
        },
      }
    } catch (error) {
      console.error('❌ getYearOverYearComparison error:', error)
      return { success: false, error: 'Failed to perform year-over-year comparison', details: error.message }
    }
  },
}
