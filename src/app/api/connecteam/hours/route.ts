// app/api/connecteam/hours/route.ts
import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export async function POST(request: Request) {
  try {
    // ✅ Authenticate using cookies
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error('❌ Auth error:', authError)
      return NextResponse.json(
        { error: 'Unauthorized - please log in' },
        { status: 401 }
      )
    }

    console.log('✅ Authenticated user:', user.email)

    // ✅ Parse the request body
    const body = await request.json()
    const { periodStart, periodEnd, employeeEmails, payrollGroup } = body

    if (!periodStart || !periodEnd || !employeeEmails || !payrollGroup) {
      return NextResponse.json(
        { error: 'Missing required fields: periodStart, periodEnd, employeeEmails, payrollGroup' },
        { status: 400 }
      )
    }

    console.log('📅 Period:', periodStart, 'to', periodEnd)
    console.log('👥 Payroll Group:', payrollGroup)
    console.log('📧 Employee emails:', employeeEmails)

    // ✅ Get Connecteam API credentials
    const connecteamApiKey = process.env.CONNECTEAM_API_KEY
    const timeClockIdA = process.env.CONNECTEAM_TIME_CLOCK_ID_A
    const timeClockIdB = process.env.CONNECTEAM_TIME_CLOCK_ID_B

    if (!connecteamApiKey) {
      console.error('❌ Missing CONNECTEAM_API_KEY')
      return NextResponse.json(
        { error: 'Connecteam API key not configured' },
        { status: 500 }
      )
    }

    // ✅ Select the correct time clock ID based on payroll group
    const timeClockId = payrollGroup === 'A' ? timeClockIdA : timeClockIdB

    if (!timeClockId) {
      console.error(`❌ Missing time clock ID for payroll group ${payrollGroup}`)
      return NextResponse.json(
        { error: `Time clock ID not configured for payroll group ${payrollGroup}` },
        { status: 500 }
      )
    }

    console.log(`🔑 Using time clock ID ${timeClockId} for payroll group ${payrollGroup}`)

    // ✅ Call Connecteam API
    // Connecteam API expects dates in YYYY-MM-DD format and uses the timeclock entries endpoint
    const connecteamUrl = `https://api.connecteam.com/api/v1/timeclock/${timeClockId}/entries?from=${periodStart}&to=${periodEnd}`
    
    console.log('🔗 Calling Connecteam API:', connecteamUrl)

    const connecteamResponse = await fetch(connecteamUrl, {
      method: 'GET',
      headers: {
        'X-API-KEY': connecteamApiKey,
        'Content-Type': 'application/json',
      },
    })

    if (!connecteamResponse.ok) {
      const errorText = await connecteamResponse.text()
      console.error('❌ Connecteam API error:', connecteamResponse.status, errorText)
      return NextResponse.json(
        { error: `Connecteam API returned ${connecteamResponse.status}: ${errorText}` },
        { status: 502 }
      )
    }

    const connecteamData = await connecteamResponse.json()
    console.log('✅ Connecteam raw response:', JSON.stringify(connecteamData, null, 2))

    // ✅ Process the data and calculate total hours per employee
    const hoursMap: Record<string, number> = {}
    
    // Initialize all requested employees with 0 hours
    employeeEmails.forEach((email: string) => {
      hoursMap[email.toLowerCase()] = 0
    })

    // Process Connecteam entries
    if (connecteamData && Array.isArray(connecteamData)) {
      connecteamData.forEach((entry: any) => {
        const userEmail = entry.user?.email?.toLowerCase() || entry.email?.toLowerCase()
        
        if (userEmail && employeeEmails.map((e: string) => e.toLowerCase()).includes(userEmail)) {
          // Calculate hours from the entry
          // Connecteam typically returns duration in minutes or milliseconds
          let hours = 0
          
          if (entry.duration) {
            // If duration is in minutes
            hours = entry.duration / 60
          } else if (entry.clockIn && entry.clockOut) {
            // Calculate from timestamps
            const clockIn = new Date(entry.clockIn).getTime()
            const clockOut = new Date(entry.clockOut).getTime()
            hours = (clockOut - clockIn) / (1000 * 60 * 60) // Convert ms to hours
          } else if (entry.totalTime) {
            // Some APIs return totalTime in seconds
            hours = entry.totalTime / 3600
          }

          if (hours > 0) {
            hoursMap[userEmail] = (hoursMap[userEmail] || 0) + hours
            console.log(`✅ Added ${hours.toFixed(2)} hours for ${userEmail}`)
          }
        }
      })
    } else if (connecteamData && connecteamData.data && Array.isArray(connecteamData.data)) {
      // Handle if response is wrapped in a data property
      connecteamData.data.forEach((entry: any) => {
        const userEmail = entry.user?.email?.toLowerCase() || entry.email?.toLowerCase()
        
        if (userEmail && employeeEmails.map((e: string) => e.toLowerCase()).includes(userEmail)) {
          let hours = 0
          
          if (entry.duration) {
            hours = entry.duration / 60
          } else if (entry.clockIn && entry.clockOut) {
            const clockIn = new Date(entry.clockIn).getTime()
            const clockOut = new Date(entry.clockOut).getTime()
            hours = (clockOut - clockIn) / (1000 * 60 * 60)
          } else if (entry.totalTime) {
            hours = entry.totalTime / 3600
          }

          if (hours > 0) {
            hoursMap[userEmail] = (hoursMap[userEmail] || 0) + hours
            console.log(`✅ Added ${hours.toFixed(2)} hours for ${userEmail}`)
          }
        }
      })
    }

    // Round hours to 2 decimal places
    Object.keys(hoursMap).forEach(email => {
      hoursMap[email] = Math.round(hoursMap[email] * 100) / 100
    })

    console.log('✅ Final hours map:', hoursMap)

    return NextResponse.json({
      success: true,
      hours: hoursMap,
      payrollGroup,
      period: { start: periodStart, end: periodEnd },
    })

  } catch (error: any) {
    console.error('❌ API route error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
