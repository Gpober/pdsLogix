// app/api/connecteam/hours/route.ts
// Using the correct endpoint: /time-clock/v1/time-clocks/{id}/time-activities
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    console.log('🔵 Connecteam API route called')
    
    const body = await request.json()
    const { periodStart, periodEnd, employeeEmails, payrollGroup } = body

    console.log('📅 Period:', periodStart, 'to', periodEnd)
    console.log('👥 Payroll Group:', payrollGroup)

    const connecteamApiKey = process.env.CONNECTEAM_API_KEY
    const timeClockIdA = process.env.CONNECTEAM_TIME_CLOCK_ID_A
    const timeClockIdB = process.env.CONNECTEAM_TIME_CLOCK_ID_B

    if (!connecteamApiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
    }

    const timeClockId = payrollGroup === 'A' ? timeClockIdA : timeClockIdB
    
    if (!timeClockId) {
      return NextResponse.json({ error: 'Time clock ID not configured' }, { status: 500 })
    }

    console.log(`🔑 Using time clock ID ${timeClockId} for payroll group ${payrollGroup}`)

    // ✅ CORRECT ENDPOINT with correct parameters
    const connecteamUrl = `https://api.connecteam.com/time-clock/v1/time-clocks/${timeClockId}/time-activities?startDate=${periodStart}&endDate=${periodEnd}`
    
    console.log('🔗 Calling Connecteam API:', connecteamUrl)

    const connecteamResponse = await fetch(connecteamUrl, {
      method: 'GET',
      headers: {
        'X-API-KEY': connecteamApiKey,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    })

    console.log('📡 Status:', connecteamResponse.status)
    console.log('📡 Content-Type:', connecteamResponse.headers.get('content-type'))

    const responseText = await connecteamResponse.text()
    console.log('📄 Response preview:', responseText.substring(0, 500))

    if (!connecteamResponse.ok) {
      console.error('❌ Connecteam API error:', connecteamResponse.status)
      return NextResponse.json({
        error: `Connecteam returned ${connecteamResponse.status}`,
        details: responseText.substring(0, 300)
      }, { status: 502 })
    }

    // Check if it's HTML (wrong endpoint)
    if (responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
      console.error('❌ Got HTML instead of JSON')
      return NextResponse.json({
        error: 'Connecteam returned HTML - API endpoint or authentication may still be incorrect',
        responsePreview: responseText.substring(0, 200)
      }, { status: 502 })
    }

    let connecteamData
    try {
      connecteamData = JSON.parse(responseText)
    } catch (e) {
      console.error('❌ Failed to parse JSON')
      return NextResponse.json({
        error: 'Invalid JSON from Connecteam',
        responsePreview: responseText.substring(0, 300)
      }, { status: 502 })
    }

    console.log('✅ Got valid JSON!')
    console.log('📊 Data structure:', JSON.stringify(connecteamData).substring(0, 500))

    // Process the data
    const hoursMap: Record<string, number> = {}
    
    employeeEmails.forEach((email: string) => {
      hoursMap[email.toLowerCase()] = 0
    })

    // Handle different response structures
    const entries = Array.isArray(connecteamData) 
      ? connecteamData 
      : connecteamData.data || 
        connecteamData.timeActivities || 
        connecteamData.activities || 
        connecteamData.entries || 
        []

    console.log(`📝 Processing ${entries.length} time activities`)

    entries.forEach((entry: any) => {
      // Try different possible email field names
      const userEmail = entry.user?.email?.toLowerCase() || 
                       entry.email?.toLowerCase() ||
                       entry.userEmail?.toLowerCase() ||
                       entry.employeeEmail?.toLowerCase()
      
      if (userEmail && employeeEmails.map((e: string) => e.toLowerCase()).includes(userEmail)) {
        let hours = 0
        
        // Try different time field names
        if (entry.duration) {
          // Duration in minutes
          hours = entry.duration / 60
          console.log(`  ⏱️  ${userEmail}: ${entry.duration} minutes = ${hours.toFixed(2)} hours`)
        } else if (entry.clockIn && entry.clockOut) {
          // Calculate from clock in/out timestamps
          const clockIn = new Date(entry.clockIn).getTime()
          const clockOut = new Date(entry.clockOut).getTime()
          hours = (clockOut - clockIn) / (1000 * 60 * 60)
          console.log(`  🕐 ${userEmail}: ${hours.toFixed(2)} hours (${entry.clockIn} to ${entry.clockOut})`)
        } else if (entry.totalTime) {
          // Total time in seconds
          hours = entry.totalTime / 3600
          console.log(`  ⌚ ${userEmail}: ${entry.totalTime} seconds = ${hours.toFixed(2)} hours`)
        } else if (entry.hours) {
          // Direct hours value
          hours = parseFloat(entry.hours)
          console.log(`  ✅ ${userEmail}: ${hours.toFixed(2)} hours (direct)`)
        } else if (entry.totalHours) {
          hours = parseFloat(entry.totalHours)
          console.log(`  ✅ ${userEmail}: ${hours.toFixed(2)} hours (totalHours)`)
        }

        if (hours > 0) {
          hoursMap[userEmail] = (hoursMap[userEmail] || 0) + hours
        }
      }
    })

    // Round to 2 decimal places
    Object.keys(hoursMap).forEach(email => {
      hoursMap[email] = Math.round(hoursMap[email] * 100) / 100
    })

    console.log('✅ Final hours map:', hoursMap)

    return NextResponse.json({
      success: true,
      hours: hoursMap,
      payrollGroup,
      period: { start: periodStart, end: periodEnd },
      entriesProcessed: entries.length
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
