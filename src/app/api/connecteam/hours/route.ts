// app/api/connecteam/hours/route.ts
// SIMPLIFIED: No auth validation (relies on client-side session check)
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    console.log('🔵 Connecteam API route called')
    
    // ✅ Parse the request body
    const body = await request.json()
    const { periodStart, periodEnd, employeeEmails, payrollGroup } = body

    if (!periodStart || !periodEnd || !employeeEmails || !payrollGroup) {
      console.error('❌ Missing required fields')
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
    const connecteamUrl = `https://api.connecteam.com/api/v1/timeclock/${timeClockId}/entries?from=${periodStart}&to=${periodEnd}`
    
    console.log('🔗 Calling Connecteam API:', connecteamUrl)

    const connecteamResponse = await fetch(connecteamUrl, {
      method: 'GET',
      headers: {
        'X-API-KEY': connecteamApiKey,
        'Content-Type': 'application/json',
      },
    })

    console.log('📡 Connecteam response status:', connecteamResponse.status)

    if (!connecteamResponse.ok) {
      const errorText = await connecteamResponse.text()
      console.error('❌ Connecteam API error:', connecteamResponse.status, errorText)
      return NextResponse.json(
        { error: `Connecteam API returned ${connecteamResponse.status}: ${errorText}` },
        { status: 502 }
      )
    }

    const connecteamData = await connecteamResponse.json()
    console.log('✅ Connecteam response received, processing...')
    console.log('📊 Raw data structure:', JSON.stringify(connecteamData, null, 2).substring(0, 1000))

    // ✅ Process the data and calculate total hours per employee
    const hoursMap: Record<string, number> = {}
    
    // Initialize all requested employees with 0 hours
    employeeEmails.forEach((email: string) => {
      hoursMap[email.toLowerCase()] = 0
    })

    let entriesProcessed = 0

    // Process Connecteam entries - handle different possible response formats
    const entries = Array.isArray(connecteamData) 
      ? connecteamData 
      : connecteamData.data && Array.isArray(connecteamData.data)
      ? connecteamData.data
      : connecteamData.entries && Array.isArray(connecteamData.entries)
      ? connecteamData.entries
      : []

    console.log(`📝 Processing ${entries.length} entries from Connecteam`)

    entries.forEach((entry: any) => {
      const userEmail = entry.user?.email?.toLowerCase() || entry.email?.toLowerCase()
      
      if (userEmail && employeeEmails.map((e: string) => e.toLowerCase()).includes(userEmail)) {
        // Calculate hours from the entry
        let hours = 0
        
        if (entry.duration) {
          // If duration is in minutes
          hours = entry.duration / 60
          console.log(`  ⏱️  ${userEmail}: ${entry.duration} minutes = ${hours.toFixed(2)} hours`)
        } else if (entry.clockIn && entry.clockOut) {
          // Calculate from timestamps
          const clockIn = new Date(entry.clockIn).getTime()
          const clockOut = new Date(entry.clockOut).getTime()
          hours = (clockOut - clockIn) / (1000 * 60 * 60) // Convert ms to hours
          console.log(`  🕐 ${userEmail}: ${new Date(entry.clockIn).toLocaleString()} to ${new Date(entry.clockOut).toLocaleString()} = ${hours.toFixed(2)} hours`)
        } else if (entry.totalTime) {
          // Some APIs return totalTime in seconds
          hours = entry.totalTime / 3600
          console.log(`  ⌚ ${userEmail}: ${entry.totalTime} seconds = ${hours.toFixed(2)} hours`)
        } else if (entry.hours) {
          // Direct hours value
          hours = parseFloat(entry.hours)
          console.log(`  ✅ ${userEmail}: ${hours.toFixed(2)} hours (direct)`)
        }

        if (hours > 0) {
          hoursMap[userEmail] = (hoursMap[userEmail] || 0) + hours
          entriesProcessed++
        }
      }
    })

    console.log(`✅ Processed ${entriesProcessed} valid entries`)

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
      entriesProcessed,
    })

  } catch (error: any) {
    console.error('❌ API route error:', error)
    console.error('❌ Error stack:', error.stack)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
