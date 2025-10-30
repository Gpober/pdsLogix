// app/api/connecteam/production/route.ts
// UPDATED VERSION: Fast production counts from Supabase (populated by webhook)
// This replaces the old Connecteam API polling version
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE!

// Map location names to Connecteam form IDs
const LOCATION_TO_FORM_ID: Record<string, number> = {
  'Manheim Dallas': 4875728,
  'Enterprise Alabama': 3837714,
  'Enterprise Atlanta': 1856326,
  // Add other locations as needed
}

export async function POST(request: NextRequest) {
  try {
    console.log('🔵 Production API (Supabase) called')
    
    const body = await request.json()
    const { periodStart, periodEnd, employeeEmails, locationName } = body

    console.log('📅 Period:', periodStart, 'to', periodEnd)
    console.log('📍 Location:', locationName)
    console.log('📧 Employee emails:', employeeEmails)

    // Get the form ID for this location
    const formId = LOCATION_TO_FORM_ID[locationName]
    
    if (!formId) {
      console.error('❌ Unknown location:', locationName)
      return NextResponse.json({ 
        error: `Unknown location: ${locationName}. Available locations: ${Object.keys(LOCATION_TO_FORM_ID).join(', ')}` 
      }, { status: 400 })
    }

    console.log(`📋 Using form_id: ${formId}`)

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log(`📊 Querying submissions for form ${formId} from ${periodStart} to ${periodEnd}...`)

    // Query Supabase by date (much cleaner than timestamp conversion!)
    const { data: submissions, error } = await supabase
      .from('connecteam_form_submissions')
      .select('*')
      .eq('form_id', formId)
      .gte('submission_date', periodStart)
      .lte('submission_date', periodEnd)
      .is('deleted_at', null)

    if (error) {
      console.error('❌ Supabase query error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log(`✅ Found ${submissions.length} submissions in date range`)

    // Count submissions per employee
    const unitsMap: Record<string, number> = {}
    
    // Initialize all employees with 0
    employeeEmails.forEach((email: string) => {
      unitsMap[email] = 0
    })

    // Track submissions we can't match
    let nullEmailCount = 0
    let unmatchedEmailCount = 0
    const unmatchedEmails = new Set<string>()

    // Count by email (case-insensitive)
    submissions.forEach((submission: any) => {
      const userEmail = submission.user_email?.toLowerCase()
      
      if (!userEmail) {
        nullEmailCount++
        return
      }
      
      // Find matching employee email (case-insensitive)
      const matchingEmail = employeeEmails.find(
        (e: string) => e.toLowerCase() === userEmail
      )
      
      if (matchingEmail) {
        unitsMap[matchingEmail] = (unitsMap[matchingEmail] || 0) + 1
      } else {
        unmatchedEmailCount++
        unmatchedEmails.add(userEmail)
      }
    })

    // Log detailed results
    console.log('\n📊 Production counts:')
    Object.entries(unitsMap).forEach(([email, count]) => {
      console.log(`  ${email}: ${count} units`)
    })
    
    console.log(`\n⚠️ Submissions with null email: ${nullEmailCount}`)
    console.log(`⚠️ Submissions with unmatched email: ${unmatchedEmailCount}`)
    if (unmatchedEmails.size > 0) {
      console.log(`📧 Unmatched emails: ${Array.from(unmatchedEmails).join(', ')}`)
    }

    return NextResponse.json({
      success: true,
      units: unitsMap,
      locationName,
      formId,
      period: { start: periodStart, end: periodEnd },
      totalSubmissions: submissions.length,
      nullEmailCount,
      unmatchedEmailCount
    })

  } catch (error: any) {
    console.error('❌ Error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
