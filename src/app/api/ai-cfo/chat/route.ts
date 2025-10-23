// This file should be placed at BOTH locations:
// 1. src/app/api/ai-chat-mobile/route.ts
// 2. src/app/api/ai-cfo/chat/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

type QueryResult = Record<string, unknown>

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

interface RequestPayload {
  message?: string
  userId?: string
  context?: unknown
  conversationHistory?: any[]
}

// Database schema for Claude
const DATABASE_SCHEMA = `
Available PostgreSQL tables:

1. journal_entry_lines - Financial GL transactions
2. ar_aging_detail - Accounts Receivable (open_balance > 0)
3. ap_aging - Accounts Payable (open_balance > 0)
4. payments - Historical Payroll (approved only)
5. payroll_submissions - Payroll tracking (status: pending/approved/rejected)
6. payroll_entries - Employee payroll details
7. locations - Business locations

Current date: ${new Date().toISOString().split('T')[0]}
`

let cachedSupabase: SupabaseClient | null = null

function getSupabaseClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Supabase environment variables missing')
  }

  if (!cachedSupabase) {
    cachedSupabase = createClient(supabaseUrl, supabaseServiceRoleKey)
  }

  return cachedSupabase
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Parse body
    let body: RequestPayload = {}
    try {
      body = (await request.json()) as RequestPayload
    } catch {
      return NextResponse.json({
        response: "I couldn't understand your request. Please try again.",
        error: 'Invalid request body'
      }, { status: 400 })
    }

    const { message, userId, context } = body

    // Validate message
    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({
        response: 'Please ask me a question about your financial data.',
        error: 'Message is required'
      }, { status: 400 })
    }

    console.log('💬 User question:', message)

    // Check if Anthropic key exists
    const anthropicKey = process.env.ANTHROPIC_API_KEY
    if (!anthropicKey) {
      console.error('❌ ANTHROPIC_API_KEY is missing')
      return NextResponse.json({
        response: "I'm currently unavailable. The AI service is not configured. Please contact support.",
        error: 'ANTHROPIC_API_KEY missing'
      }, { status: 500 })
    }

    const supabase = getSupabaseClient()

    // Step 1: Get relevant data based on question keywords
    const questionLower = message.toLowerCase()
    let queryResults: QueryResult[] = []

    try {
      if (questionLower.includes('payroll') && (questionLower.includes('pending') || questionLower.includes('submission'))) {
        console.log('🔍 Fetching payroll submissions...')
        const { data } = await supabase
          .from('payroll_submissions')
          .select(`*, locations!inner(name)`)
          .eq('status', 'pending')
          .limit(20)
        
        queryResults = (data || []).map((r: any) => ({
          ...r,
          location_name: r.locations?.name || 'Unknown',
          locations: undefined
        }))
      } 
      else if (questionLower.includes('payroll')) {
        console.log('🔍 Fetching payroll history...')
        const { data } = await supabase
          .from('payments')
          .select('*')
          .order('date', { ascending: false })
          .limit(50)
        
        queryResults = data || []
      }
      else if (questionLower.includes('revenue') || questionLower.includes('income')) {
        console.log('🔍 Fetching revenue...')
        const { data } = await supabase
          .from('journal_entry_lines')
          .select('*')
          .or('account_type.ilike.%income%,account_type.ilike.%revenue%')
          .limit(100)
        
        queryResults = data || []
      }
      else if (questionLower.includes('receivable') || questionLower.includes('owe')) {
        console.log('🔍 Fetching AR...')
        const { data } = await supabase
          .from('ar_aging_detail')
          .select('*')
          .gt('open_balance', 0)
          .limit(50)
        
        queryResults = data || []
      }
      else {
        console.log('🔍 Fetching recent transactions...')
        const { data } = await supabase
          .from('journal_entry_lines')
          .select('*')
          .order('date', { ascending: false })
          .limit(50)
        
        queryResults = data || []
      }

      console.log('✅ Found', queryResults.length, 'records')
    } catch (dbError) {
      console.error('❌ Database error:', dbError)
      queryResults = []
    }

    // Step 2: Send to Claude with data
    const truncatedResults = queryResults.slice(0, 20)
    
    const responsePrompt = queryResults.length === 0
      ? `User asked: "${message}"\n\nNo data found. Explain that there's no data available for this query in a friendly way. Keep it under 50 words.`
      : `User asked: "${message}"\n\nDatabase results:\n${JSON.stringify(truncatedResults, null, 2)}\n\nYou are a friendly CFO assistant. Answer their question directly using the data. Format currency clearly. Keep response under 100 words.`

    console.log('🤖 Calling Claude...')

    const anthropicResponse = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        messages: [
          {
            role: 'user',
            content: responsePrompt
          }
        ]
      })
    })

    if (!anthropicResponse.ok) {
      const errorText = await anthropicResponse.text()
      console.error('❌ Claude API error:', errorText)
      throw new Error(`Claude API error: ${anthropicResponse.statusText}`)
    }

    const anthropicData = await anthropicResponse.json()
    const aiResponse = anthropicData.content?.[0]?.text || "I'm having trouble generating a response. Please try again."

    console.log('✅ Response generated')

    return NextResponse.json({
      response: aiResponse,
      context: {
        dataPoints: queryResults.length,
        platform: 'mobile'
      }
    })

  } catch (error) {
    console.error('❌ API Error:', error)
    
    // Always return a helpful message
    return NextResponse.json({
      response: "I'm having trouble connecting to the database right now. Please try again in a moment.",
      context: {
        error: error instanceof Error ? error.message : 'Unknown error',
        platform: 'mobile'
      }
    })
  }
}
