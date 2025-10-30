// app/api/connecteam/hours/route.ts
// Using timeclock (one word, no hyphen or dash)
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

    // Try multiple timeclock endpoint variations
    const urls = [
      `https://api.connecteam.com/timeclock/v1/timeclocks/${timeClockId}/time-activities?startDate=${periodStart}&endDate=${periodEnd}`,
      `https://api.connecteam.com/timeclock/v1/${timeClockId}/time-activities?startDate=${periodStart}&endDate=${periodEnd}`,
      `https://api.connecteam.com/v1/timeclock/${timeClockId}/time-activities?startDate=${periodStart}&endDate=${periodEnd}`,
      `https://api.connecteam.com/timeclock/${timeClockId}/time-activities?startDate=${periodStart}&endDate=${periodEnd}`,
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
      const contentType = connecteamResponse.headers.get('content-type') || ''
      console.log('📡 Content-Type:', contentType)

      const responseText = await connecteamResponse.text()
      console.log('📄 Response preview:', responseText.substring(0, 300))

      // Check if it's JSON (not HTML)
      const isJson = contentType.includes('application/json') || 
                     (responseText.trim().startsWith('{') || responseText.trim().startsWith('['))

      if (connecteamResponse.ok && isJson) {
        console.log('✅ SUCCESS! Got valid JSON')
        
        try {
          const data = JSON.parse(responseText)
          successResponse = { data, url: connecteamUrl }
          break
        } catch (e) {
          console.log('❌ JSON parse failed')
        }
      } else if (connecteamResponse.status === 400 || connecteamResponse.status === 404) {
        // Log specific error messages
        try {
          const errorData = JSON.parse(responseText)
          console.log(`❌ Error ${connecteamResponse.status}:`, errorData)
        } catch (e) {
          console.log(`❌ Failed with status ${connecteamResponse.status}`)
        }
      } else {
        console.log(`❌ Failed: Status ${connecteamResponse.status}, isJson: ${isJson}`)
      }
    }

    if (!successResponse) {
      return NextResponse.json({
        error: 'Could not find working timeclock endpoint',
        details: 'All timeclock endpoint variations failed. The time clock ID may be incorrect. Check Connecteam account for the correct ID.',
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
