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

// POST - Submit new payroll (creates submission + entries, status = pending)
export async function POST(request: NextRequest) {
  try {
    const supabase = getServerDataClient()
    
    const body = await request.json()
    console.log('📥 Received payroll submission:', body)

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

    // Calculate totals
    const total_amount = employees.reduce((sum: number, emp: any) => sum + (emp.amount || 0), 0)
    const total_hours = employees.reduce((sum: number, emp: any) => sum + (emp.hours || 0), 0)
    const total_units = employees.reduce((sum: number, emp: any) => sum + (emp.units || 0), 0)

    // Create submission
    const submissionData = {
      organization_id,
      location_id,
      pay_date,
      payroll_group,
      period_start: periodStart.toISOString().split('T')[0],
      period_end: periodEnd.toISOString().split('T')[0],
      total_amount,
      total_employees: employees.length,
      total_hours: total_hours > 0 ? total_hours : null,
      total_units: total_units > 0 ? total_units : null,
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

    // Create payroll entries
    const entries = employees.map((emp: any) => ({
      organization_id,
      submission_id: submission.id,
      employee_id: emp.employee_id,
      employee_name: emp.name,
      employee_type: emp.type,
      hours: emp.hours || null,
      units: emp.units || null,
      rate: emp.rate,
      amount: emp.amount,
      notes: emp.notes || null,
    }))

    console.log('📝 Creating entries:', entries.length, 'records')

    const { error: entriesError } = await supabase
      .from('payroll_entries')
      .insert(entries)

    if (entriesError) {
      console.error('❌ Entries creation error:', entriesError)
      // Rollback: delete submission
      await supabase.from('payroll_submissions').delete().eq('id', submission.id)
      return NextResponse.json(
        { 
          error: 'Failed to create payroll entries', 
          details: entriesError.message,
          code: entriesError.code 
        },
        { status: 500 }
      )
    }

    console.log('✅ All entries created successfully')

    return NextResponse.json({
      success: true,
      submission_id: submission.id,
      submission_number: submission.submission_number,
      message: 'Payroll submitted successfully - pending approval'
    })

  } catch (error) {
    console.error('❌ Unexpected error:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    )
  }
}

// PATCH - Approve or Reject payroll (when approved, writes to payments table)
export async function PATCH(request: NextRequest) {
  try {
    const supabase = getServerDataClient()
    const body = await request.json()
    
    const { submission_id, approved_by, action, notes } = body

    if (!submission_id || !approved_by || !action) {
      return NextResponse.json({ 
        error: 'Missing required fields: submission_id, approved_by, action' 
      }, { status: 400 })
    }

    console.log(`🔍 ${action === 'approved' ? 'Approving' : 'Rejecting'} submission:`, submission_id)

    // Get submission with location details
    const { data: submission, error: subError } = await supabase
      .from('payroll_submissions')
      .select(`
        *,
        locations (
          name,
          organization_id
        )
      `)
      .eq('id', submission_id)
      .single()

    if (subError || !submission) {
      console.error('❌ Submission not found:', subError)
      return NextResponse.json({ 
        error: 'Submission not found' 
      }, { status: 404 })
    }

    // Get payroll entries
    const { data: entries, error: entriesError } = await supabase
      .from('payroll_entries')
      .select('*')
      .eq('submission_id', submission_id)

    if (entriesError || !entries || entries.length === 0) {
      console.error('❌ Payroll entries not found:', entriesError)
      return NextResponse.json({ 
        error: 'Payroll entries not found' 
      }, { status: 404 })
    }

    if (action === 'approved') {
      // 1. Update submission status
      const { error: updateError } = await supabase
        .from('payroll_submissions')
        .update({ 
          status: 'approved',
          approved_at: new Date().toISOString(),
          approved_by 
        })
        .eq('id', submission_id)

      if (updateError) {
        console.error('❌ Failed to update submission:', updateError)
        return NextResponse.json({ 
          error: 'Failed to update submission',
          details: updateError.message 
        }, { status: 500 })
      }

      console.log('✅ Submission status updated to approved')

      // 2. Create approval record
      await supabase
        .from('payroll_approvals')
        .insert({
          submission_id,
          approved_by,
          action: 'approved',
          notes: notes || null,
          created_at: new Date().toISOString()
        })

      console.log('✅ Approval record created')

      // 3. Write to payments table (historical payroll)
      const locationName = (submission.locations as any)?.name || 'Unknown Location'
      
      const paymentRecords = entries.map((entry: any) => {
        const nameParts = entry.employee_name ? entry.employee_name.split(' ') : ['Unknown', 'Employee']
        return {
          organization_id: submission.organization_id,
          date: submission.pay_date,
          employee_id: entry.employee_id,
          first_name: nameParts[0] || '',
          last_name: nameParts.slice(1).join(' ') || '',
          department: locationName,
          total_amount: entry.amount,
          hours: entry.hours,
          units: entry.units,
          rate: entry.rate,
          payroll_group: submission.payroll_group,
          submission_id: submission_id,
          created_at: new Date().toISOString()
        }
      })

      console.log('💰 Writing to payments table:', paymentRecords.length, 'records')

      const { error: paymentsError } = await supabase
        .from('payments')
        .insert(paymentRecords)

      if (paymentsError) {
        console.error('❌ Payments insert error:', paymentsError)
        return NextResponse.json({ 
          error: 'Failed to write to payments table',
          details: paymentsError.message 
        }, { status: 500 })
      }

      console.log('✅ Payroll approved and written to payments table')

      return NextResponse.json({
        success: true,
        message: `Payroll approved! ${paymentRecords.length} employee payments added to historical records.`
      })

    } else if (action === 'rejected') {
      // Update submission status to rejected
      const { error: updateError } = await supabase
        .from('payroll_submissions')
        .update({ 
          status: 'rejected',
          approved_by 
        })
        .eq('id', submission_id)

      if (updateError) {
        console.error('❌ Failed to update submission:', updateError)
        return NextResponse.json({ 
          error: 'Failed to update submission',
          details: updateError.message 
        }, { status: 500 })
      }

      // Create approval record
      await supabase
        .from('payroll_approvals')
        .insert({
          submission_id,
          approved_by,
          action: 'rejected',
          notes: notes || null,
          created_at: new Date().toISOString()
        })

      console.log('❌ Payroll rejected')

      return NextResponse.json({
        success: true,
        message: 'Payroll rejected'
      })
    }

    return NextResponse.json({ 
      error: 'Invalid action. Must be "approved" or "rejected"' 
    }, { status: 400 })

  } catch (error) {
    console.error('❌ Approval error:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    )
  }
}
