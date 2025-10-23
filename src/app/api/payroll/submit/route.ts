// app/api/payroll/submit/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Server-side only - use service role for Client Supabase (business data)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables for API route')
}

// Create a singleton server-side client
let serverDataClient: ReturnType<typeof createClient> | null = null

function getServerDataClient() {
  if (!serverDataClient) {
    serverDataClient = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      }
    })
  }
  return serverDataClient
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getServerDataClient()
    
    const body = await request.json()
    console.log('🔥 Received payroll submission:', body)

    const { location_id, pay_date, payroll_group, submitted_by, employees } = body

    // Validation
    if (!location_id || !pay_date || !payroll_group || !submitted_by || !employees?.length) {
      console.error('❌ Validation failed - missing fields')
      return NextResponse.json({ 
        error: 'Missing required fields',
        received: { location_id, pay_date, payroll_group, submitted_by, employee_count: employees?.length }
      }, { status: 400 })
    }

    // Get organization_id from location
    console.log('🔍 Fetching location:', location_id)
    const { data: locationData, error: locationError } = await supabase
      .from('locations')
      .select('organization_id, name')
      .eq('id', location_id)
      .single()

    if (locationError) {
      console.error('❌ Location fetch error:', locationError)
      return NextResponse.json({ 
        error: 'Location not found', 
        details: locationError.message 
      }, { status: 404 })
    }

    if (!locationData?.organization_id) {
      console.error('❌ No organization_id in location')
      return NextResponse.json({ 
        error: 'Location missing organization_id' 
      }, { status: 400 })
    }

    const organization_id = locationData.organization_id
    console.log('✅ Organization ID:', organization_id)
    console.log('✅ Location Name:', locationData.name)

    // Calculate period dates
    const payDateObj = new Date(pay_date)
    const periodEnd = new Date(payDateObj)
    periodEnd.setDate(payDateObj.getDate() - 9)
    const periodStart = new Date(periodEnd)
    periodStart.setDate(periodEnd.getDate() - 13)

    const total_amount = employees.reduce((sum: number, emp: any) => sum + (emp.amount || 0), 0)

    // Create submission
    const submissionData = {
      organization_id,
      location_id,
      pay_date,
      payroll_group,
      period_start: periodStart.toISOString().split('T')[0],
      period_end: periodEnd.toISOString().split('T')[0],
      total_amount,
      employee_count: employees.length,
      submitted_by,
      status: 'pending',
      submitted_at: new Date().toISOString(),
    }

    console.log('📝 Creating submission:', submissionData)

    const { data: submission, error: submissionError } = await supabase
      .from('payroll_submissions')
      .insert([submissionData])
      .select()
      .single()

    if (submissionError) {
      console.error('❌ Submission creation error:', submissionError)
      return NextResponse.json(
        { 
          error: 'Failed to create submission', 
          details: submissionError.message,
          code: submissionError.code 
        },
        { status: 500 }
      )
    }

    console.log('✅ Submission created:', submission.id)

    // Create payroll entries - matching your actual schema
    const entries = employees.map((emp: any) => ({
      organization_id,
      submission_id: submission.id,
      employee_id: emp.employee_id,
      hours: emp.hours || null,
      units: emp.units || null,
      amount: emp.amount,
      notes: emp.notes || null,
      status: 'pending',
    }))

    console.log('📝 Creating entries:', entries.length)
    console.log('📋 Sample entry:', entries[0])

    const { data: createdEntries, error: entriesError } = await supabase
      .from('payroll_entries')
      .insert(entries)
      .select()

    if (entriesError) {
      console.error('❌ Entries creation error:', entriesError)
      console.error('❌ Error details:', {
        message: entriesError.message,
        code: entriesError.code,
        details: entriesError.details,
        hint: entriesError.hint
      })
      
      // Rollback: delete submission
      await supabase.from('payroll_submissions').delete().eq('id', submission.id)
      
      return NextResponse.json(
        { 
          error: 'Failed to create payroll entries', 
          details: entriesError.message,
          code: entriesError.code,
          hint: entriesError.hint
        },
        { status: 500 }
      )
    }

    console.log('✅ Entries created successfully:', createdEntries?.length)

    return NextResponse.json({
      success: true,
      submission_id: submission.id,
      submission_number: submission.id.substring(0, 8),
      entries_created: createdEntries?.length || 0,
    })

  } catch (error: any) {
    console.error('❌ API error:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        details: error.message,
        stack: error.stack 
      },
      { status: 500 }
    )
  }
}
