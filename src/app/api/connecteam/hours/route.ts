// app/api/connecteam/hours/route.ts
// DEBUG VERSION - Will show us what Connecteam actually returns
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    console.log('🔵 Connecteam API route called')
    
    // ✅ Parse the request body
    const body = await request.json()
    const { periodStart, periodEnd, employeeEmails, payrollGroup } = body

    console.log('📅 Period:', periodStart, 'to', periodEnd)
    console.log('👥 Payroll Group:', payrollGroup)
    console.log('📧 Employee emails:', employeeEmails)

    // ✅ Get Connecteam API credentials
    const connecteamApiKey = process.env.CONNECTEAM_API_KEY
    const timeClockIdA = process.env.CONNECTEAM_TIME_CLOCK_ID_A
    const timeClockIdB = process.env.CONNECTEAM_TIME_CLOCK_ID_B

    console.log('🔑 Connecteam API Key:', connecteamApiKey ? `${connecteamApiKey.substring(0, 10)}...` : 'MISSING')
    console.log('🔑 Time Clock ID A:', timeClockIdA || 'MISSING')
    console.log('🔑 Time Clock ID B:', timeClockIdB || 'MISSING')

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
    console.log('📡 Connecteam response headers:', Object.fromEntries(connecteamResponse.headers.entries()))

    // ✅ Get response as text first to see what we're getting
    const responseText = await connecteamResponse.text()
    console.log('📄 Connecteam raw response (first 1000 chars):', responseText.substring(0, 1000))

    if (!connecteamResponse.ok) {
      console.error('❌ Connecteam API error:', connecteamResponse.status)
      return NextResponse.json(
        { 
          error: `Connecteam API returned ${connecteamResponse.status}`,
          details: responseText.substring(0, 500),
          url: connecteamUrl
        },
        { status: 502 }
      )
    }

    // Try to parse as JSON
    let connecteamData
    try {
      connecteamData = JSON.parse(responseText)
      console.log('✅ Successfully parsed JSON')
    } catch (parseError) {
      console.error('❌ Failed to parse response as JSON')
      return NextResponse.json(
        { 
          error: 'Connecteam returned non-JSON response',
          responsePreview: responseText.substring(0, 500)
        },
        { status: 502 }
      )
    }

    console.log('📊 Connecteam data structure:', JSON.stringify(connecteamData, null, 2).substring(0, 1000))

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

    console.log(`📝 Found ${entries.length} entries from Connecteam`)

    entries.forEach((entry: any) => {
      const userEmail = entry.user?.email?.toLowerCase() || entry.email?.toLowerCase()
      
      if (userEmail && employeeEmails.map((e: string) => e.toLowerCase()).includes(userEmail)) {
        // Calculate hours from the entry
        let hours = 0
        
        if (entry.duration) {
          hours = entry.duration / 60
          console.log(`  ⏱️  ${userEmail}: ${entry.duration} minutes = ${hours.toFixed(2)} hours`)
        } else if (entry.clockIn && entry.clockOut) {
          const clockIn = new Date(entry.clockIn).getTime()
          const clockOut = new Date(entry.clockOut).getTime()
          hours = (clockOut - clockIn) / (1000 * 60 * 60)
          console.log(`  🕐 ${userEmail}: ${hours.toFixed(2)} hours`)
        } else if (entry.totalTime) {
          hours = entry.totalTime / 3600
          console.log(`  ⌚ ${userEmail}: ${hours.toFixed(2)} hours`)
        } else if (entry.hours) {
          hours = parseFloat(entry.hours)
          console.log(`  ✅ ${userEmail}: ${hours.toFixed(2)} hours`)
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
    console.error('❌ Error message:', error.message)
    console.error('❌ Error stack:', error.stack)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
