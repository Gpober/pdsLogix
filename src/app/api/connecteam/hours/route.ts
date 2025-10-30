// app/api/connecteam/hours/route.ts
// Try punch-clock endpoint since the IDs are from punch-clock docs
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    console.log('🔵 Connecteam API route called')
    
    const body = await request.json()
    const { periodStart, periodEnd, employeeEmails, payrollGroup } = body

    console.log('📅 Period:', periodStart, 'to', periodEnd)
    console.log('👥 Payroll Group:', payrollGroup)

    const connecteamApiKey = process.env.CONNECTEAM_API_KEY
    const punchClockIdA = process.env.CONNECTEAM_TIME_CLOCK_ID_A
    const punchClockIdB = process.env.CONNECTEAM_TIME_CLOCK_ID_B

    if (!connecteamApiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
    }

    const punchClockId = payrollGroup === 'A' ? punchClockIdA : punchClockIdB
    
    if (!punchClockId) {
      return NextResponse.json({ error: 'Punch clock ID not configured' }, { status: 500 })
    }

    console.log(`🔑 Using punch clock ID ${punchClockId} for payroll group ${payrollGroup}`)

    // Try multiple endpoint variations for punch-clock
    const urls = [
      `https://api.connecteam.com/punch-clock/v1/punch-clocks/${punchClockId}/time-activities?startDate=${periodStart}&endDate=${periodEnd}`,
      `https://api.connecteam.com/punch-clock/v1/punchclocks/${punchClockId}/time-activities?startDate=${periodStart}&endDate=${periodEnd}`,
      `https://api.connecteam.com/punchclock/v1/${punchClockId}/time-activities?startDate=${periodStart}&endDate=${periodEnd}`,
      `https://api.connecteam.com/v1/punch-clock/${punchClockId}/entries?startDate=${periodStart}&endDate=${periodEnd}`,
    ]

    let successResponse = null

    for (const connecteamUrl of urls) {
      console.log(`\n🔗 Trying: ${connecteamUrl}`)

      const connecteamResponse = await fetch(connecteamUrl, {
        method: 'GET',
        headers: {
          'X-API-KEY': connecteamApiKey,
          'Accept': 'application/json',
        },
      })

      console.log('📡 Status:', connecteamResponse.status)

      const responseText = await connecteamResponse.text()
      console.log('📄 Response preview:', responseText.substring(0, 300))

      if (connecteamResponse.ok && !responseText.includes('<!DOCTYPE')) {
        try {
          const data = JSON.parse(responseText)
          console.log('✅ SUCCESS! Got valid JSON')
          successResponse = { data, url: connecteamUrl }
          break
        } catch (e) {
          console.log('❌ Not valid JSON')
        }
      } else {
        console.log(`❌ Failed with status ${connecteamResponse.status}`)
      }
    }

    if (!successResponse) {
      return NextResponse.json({
        error: 'Could not find working punch clock endpoint',
        details: 'The punch clock ID may be for a different endpoint. Check Connecteam Swagger docs.',
        triedUrls: urls
      }, { status: 502 })
    }

    console.log('✅ Using URL:', successResponse.url)
    const connecteamData = successResponse.data

    console.log('📊 Data structure:', JSON.stringify(connecteamData).substring(0, 500))

    // Process the data
    const hoursMap: Record<string, number> = {}
    
    employeeEmails.forEach((email: string) => {
      hoursMap[email.toLowerCase()] = 0
    })

    const entries = Array.isArray(connecteamData) 
      ? connecteamData 
      : connecteamData.data || 
        connecteamData.timeActivities || 
        connecteamData.activities || 
        connecteamData.entries || 
        []

    console.log(`📝 Processing ${entries.length} entries`)

    entries.forEach((entry: any) => {
      const userEmail = entry.user?.email?.toLowerCase() || 
                       entry.email?.toLowerCase() ||
                       entry.userEmail?.toLowerCase()
      
      if (userEmail && employeeEmails.map((e: string) => e.toLowerCase()).includes(userEmail)) {
        let hours = 0
        
        if (entry.duration) {
          hours = entry.duration / 60
          console.log(`  ⏱️  ${userEmail}: ${entry.duration} minutes = ${hours.toFixed(2)} hours`)
        } else if (entry.clockIn && entry.clockOut) {
          hours = (new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / (1000 * 60 * 60)
          console.log(`  🕐 ${userEmail}: ${hours.toFixed(2)} hours`)
        } else if (entry.totalTime) {
          hours = entry.totalTime / 3600
          console.log(`  ⌚ ${userEmail}: ${hours.toFixed(2)} hours`)
        } else if (entry.hours || entry.totalHours) {
          hours = parseFloat(entry.hours || entry.totalHours)
          console.log(`  ✅ ${userEmail}: ${hours.toFixed(2)} hours`)
        }

        if (hours > 0) {
          hoursMap[userEmail] = (hoursMap[userEmail] || 0) + hours
        }
      }
    })

    Object.keys(hoursMap).forEach(email => {
      hoursMap[email] = Math.round(hoursMap[email] * 100) / 100
    })

    console.log('✅ Final hours:', hoursMap)

    return NextResponse.json({
      success: true,
      hours: hoursMap,
      payrollGroup,
      period: { start: periodStart, end: periodEnd },
      workingUrl: successResponse.url,
      entriesProcessed: entries.length
    })

  } catch (error: any) {
    console.error('❌ Error:', error.message)
    console.error('❌ Stack:', error.stack)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
