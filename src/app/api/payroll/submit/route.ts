// app/api/payroll/submit/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/client'
import { supabase as dataSupabase } from '@/lib/supabaseClient'

// Helper function to calculate week ending date (Saturday)
function getWeekEndingDate(payDate: string): string {
  const date = new Date(payDate + 'T00:00:00')
  const dayOfWeek = date.getDay() // 0 = Sunday, 6 = Saturday
  const daysUntilSaturday = (6 - dayOfWeek + 7) % 7
  const saturday = new Date(date)
  saturday.setDate(date.getDate() + daysUntilSaturday)
  
  // Format as YYYY-MM-DD
  const year = saturday.getFullYear()
  const month = String(saturday.getMonth() + 1).padStart(2, '0')
  const day = String(saturday.getDate()).padStart(2, '0')
  
  return `${year}-${month}-${day}`
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { location_id, pay_date, payroll_group, submitted_by, employees } = body

    console.log('🔥 Payroll submission received:', {
      location_id,
      pay_date,
      payroll_group,
      employee_count: employees.length
    })

    // Validate required fields
    if (!location_id || !pay_date || !payroll_group || !submitted_by || !employees || employees.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Calculate week ending date (Saturday)
    const week_ending_date = getWeekEndingDate(pay_date)
    console.log('📅 Week ending date calculated:', week_ending_date)

    // Get organization_id from the location
    const { data: locationData, error: locationError } = await dataSupabase
      .from('locations')
      .select('organization_id, name')
      .eq('id', location_id)
      .single()

    if (locationError || !locationData) {
      console.error('❌ Location not found:', locationError)
      return NextResponse.json(
        { error: 'Location not found' },
        { status: 404 }
      )
    }

    const organization_id = locationData.organization_id

    // Calculate totals
    const total_amount = employees.reduce((sum: number, emp: any) => sum + emp.amount, 0)
    const total_hours = employees.reduce((sum: number, emp: any) => sum + (emp.hours || 0), 0)
    const total_units = employees.reduce((sum: number, emp: any) => sum + (emp.units || 0), 0)
    const total_employees = employees.length

    console.log('💰 Calculated totals:', {
      total_amount,
      total_hours,
      total_units,
      total_employees
    })

    // 1. Insert into payroll_submissions table
    const { data: submission, error: submissionError } = await dataSupabase
      .from('payroll_submissions')
      .insert({
        organization_id,
        location_id,
        pay_date,
        payroll_group,
        total_employees,
        total_hours,
        total_units,
        total_amount,
        status: 'pending',
        submitted_by,
        submitted_at: new Date().toISOString()
      })
      .select('id, submission_number')
      .single()

    if (submissionError) {
      console.error('❌ Submission insert error:', submissionError)
      return NextResponse.json(
        { error: 'Failed to create submission', details: submissionError.message },
        { status: 500 }
      )
    }

    console.log('✅ Submission created:', { id: submission.id, number: submission.submission_number })

    // 2. Insert into payroll_entries table with ALL required fields
    const payrollEntries = employees.map((emp: any) => ({
      organization_id,
      location_id,              // NEW: Required field
      submission_id: submission.id,
      employee_id: emp.employee_id,
      week_ending_date,         // NEW: Required field (Saturday)
      payroll_group,            // NEW: Required field
      hours: emp.hours,
      units: emp.units,
      amount: emp.amount,
      notes: emp.notes,
      status: 'submitted'       // NEW: Required field (not draft)
    }))

    const { error: entriesError } = await dataSupabase
      .from('payroll_entries')
      .insert(payrollEntries)

    if (entriesError) {
      console.error('❌ Entries insert error:', entriesError)
      
      // Rollback submission
      await dataSupabase
        .from('payroll_submissions')
        .delete()
        .eq('id', submission.id)

      return NextResponse.json(
        { error: 'Failed to create payroll entries', details: entriesError.message },
        { status: 500 }
      )
    }

    console.log('✅ Payroll entries created:', payrollEntries.length)

    // Return success
    return NextResponse.json({
      success: true,
      submission_id: submission.id,
      submission_number: submission.submission_number,
      week_ending_date,
      message: 'Payroll submitted successfully'
    })

  } catch (error: any) {
    console.error('❌ API error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
