// app/api/connecteam/production/route.ts
// UPDATED VERSION: Fast production counts from Supabase (populated by webhook)
// This replaces the old Connecteam API polling version
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(request: NextRequest) {
  try {
    console.log('🔵 Production API (Supabase) called')
    
    const body = await request.json()
    const { periodStart, periodEnd, employeeEmails, locationName } = body

    console.log('📅 Period:', periodStart, 'to', periodEnd)
    console.log('📍 Location:', locationName)
    console.log('📧 Employee emails:', employeeEmails)

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Convert ISO dates to Unix timestamps (seconds)
    const startTimestamp = Math.floor(new Date(periodStart).getTime() / 1000)
    const endTimestamp = Math.floor(new Date(periodEnd).getTime() / 1000)

    console.log(`📊 Querying submissions from ${startTimestamp} to ${endTimestamp}`)

    // Query Supabase for submissions in this period
    const { data: submissions, error } = await supabase
      .from('connecteam_form_submissions')
      .select('*')
      .eq('location_name', locationName)
      .gte('submission_timestamp', startTimestamp)
      .lte('submission_timestamp', endTimestamp)
      .is('deleted_at', null) // Exclude soft-deleted submissions

    if (error) {
      console.error('❌ Supabase query error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log(`✅ Found ${submissions.length} total submissions`)

    // Count submissions per employee
    const unitsMap: Record<string, number> = {}
    
    // Initialize all employees with 0
    employeeEmails.forEach((email: string) => {
      unitsMap[email] = 0
    })

    // Count by email (case-insensitive)
    submissions.forEach((submission: any) => {
      const userEmail = submission.user_email?.toLowerCase()
      
      if (userEmail) {
        // Find matching employee email (case-insensitive)
        const matchingEmail = employeeEmails.find(
          (e: string) => e.toLowerCase() === userEmail
        )
        
        if (matchingEmail) {
          unitsMap[matchingEmail] = (unitsMap[matchingEmail] || 0) + 1
        }
      }
    })

    // Log results
    console.log('\n📊 Production counts:')
    Object.entries(unitsMap).forEach(([email, count]) => {
      console.log(`  ${email}: ${count} units`)
    })

    return NextResponse.json({
      success: true,
      units: unitsMap,
      locationName,
      period: { start: periodStart, end: periodEnd },
      totalSubmissions: submissions.length
    })

  } catch (error: any) {
    console.error('❌ Error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
