import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

export async function POST(request: NextRequest) {
  console.log('🎯 AI Chat API called')
  
  try {
    // Get environment variables
    const anthropicKey = process.env.ANTHROPIC_API_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    // Validate environment
    if (!anthropicKey) {
      console.error('❌ Missing ANTHROPIC_API_KEY')
      return NextResponse.json({
        response: "AI service not configured. Please contact support.",
        error: 'Missing ANTHROPIC_API_KEY'
      }, { status: 500 })
    }

    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ Missing Supabase credentials')
      return NextResponse.json({
        response: "Database not configured. Please contact support.",
        error: 'Missing Supabase credentials'
      }, { status: 500 })
    }

    // Parse request body
    const body = await request.json()
    const message = body.message || body.query || ''

    if (!message || !message.trim()) {
      return NextResponse.json({
        response: 'Please ask me a question.',
        error: 'No message provided'
      }, { status: 400 })
    }

    console.log('💬 Question:', message)

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Determine what data to fetch based on keywords
    const q = message.toLowerCase()
    let data: any[] = []
    let tableName = ''

    try {
      if (q.includes('payroll') && (q.includes('pending') || q.includes('submit') || q.includes('approval'))) {
        console.log('📊 Fetching payroll submissions...')
        tableName = 'payroll_submissions'
        const result = await supabase
          .from('payroll_submissions')
          .select('*, locations!inner(name)')
          .order('submitted_at', { ascending: false })
          .limit(20)
        
        data = (result.data || []).map(r => ({
          submission_number: r.submission_number,
          location: r.locations?.name,
          pay_date: r.pay_date,
          payroll_group: r.payroll_group,
          total_amount: r.total_amount,
          total_employees: r.total_employees,
          status: r.status,
          submitted_at: r.submitted_at
        }))
      }
      else if (q.includes('payroll')) {
        console.log('📊 Fetching payroll history...')
        tableName = 'payments'
        const result = await supabase
          .from('payments')
          .select('*')
          .order('date', { ascending: false })
          .limit(50)
        
        data = result.data || []
      }
      else if (q.includes('revenue') || q.includes('income') || q.includes('sales')) {
        console.log('📊 Fetching revenue...')
        tableName = 'journal_entry_lines'
        const result = await supabase
          .from('journal_entry_lines')
          .select('*')
          .or('account_type.ilike.%income%,account_type.ilike.%revenue%')
          .order('date', { ascending: false })
          .limit(100)
        
        data = result.data || []
      }
      else if (q.includes('receivable') || q.includes('invoice') || q.includes('owe')) {
        console.log('📊 Fetching AR...')
        tableName = 'ar_aging_detail'
        const result = await supabase
          .from('ar_aging_detail')
          .select('*')
          .gt('open_balance', 0)
          .order('open_balance', { ascending: false })
          .limit(50)
        
        data = result.data || []
      }
      else if (q.includes('payable') || q.includes('vendor') || q.includes('bill')) {
        console.log('📊 Fetching AP...')
        tableName = 'ap_aging'
        const result = await supabase
          .from('ap_aging')
          .select('*')
          .gt('open_balance', 0)
          .order('open_balance', { ascending: false })
          .limit(50)
        
        data = result.data || []
      }
      else {
        console.log('📊 Fetching recent transactions...')
        tableName = 'journal_entry_lines'
        const result = await supabase
          .from('journal_entry_lines')
          .select('*')
          .order('date', { ascending: false })
          .limit(50)
        
        data = result.data || []
      }

      console.log(`✅ Found ${data.length} records from ${tableName}`)
    } catch (dbError) {
      console.error('❌ Database error:', dbError)
      data = []
    }

    // Prepare prompt for Claude
    const dataForClaude = data.slice(0, 15) // Limit to 15 records for Claude
    const prompt = data.length > 0
      ? `User question: "${message}"\n\nData from database (${tableName}):\n${JSON.stringify(dataForClaude, null, 2)}\n\nAnswer the user's question based on this data. Be concise (under 100 words). Format currency clearly.`
      : `User question: "${message}"\n\nNo data found in database for this query. Explain politely that there's no data available. Keep it under 50 words.`

    // Call Claude
    console.log('🤖 Calling Claude API...')
    const claudeResponse = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    })

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text()
      console.error('❌ Claude API error:', claudeResponse.status, errorText)
      throw new Error(`Claude API error: ${claudeResponse.statusText}`)
    }

    const claudeData = await claudeResponse.json()
    const answer = claudeData.content?.[0]?.text || "I couldn't generate a response. Please try again."

    console.log('✅ Response generated successfully')

    return NextResponse.json({
      response: answer,
      context: {
        dataPoints: data.length,
        table: tableName,
        platform: 'mobile'
      }
    })

  } catch (error) {
    console.error('❌ API Error:', error)
    
    return NextResponse.json({
      response: "I'm having trouble right now. Please try again in a moment.",
      context: {
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }, { status: 500 })
  }
}
