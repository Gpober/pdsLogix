// app/api/connecteam/hours/route.ts
// Try all possible time-clock endpoint variations
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

    console.log(`🔑 Using time clock ID ${timeClockId}`)

    // Try multiple endpoint patterns
    const baseUrls = [
      // Pattern 1: /time-clock/clocks/{id}/entries
      `https://api.connecteam.com/time-clock/clocks/${timeClockId}/entries`,
      // Pattern 2: /time-clock/{id}/entries  
      `https://api.connecteam.com/time-clock/${timeClockId}/entries`,
      // Pattern 3: /timeclock/{id}/entries
      `https://api.connecteam.com/timeclock/${timeClockId}/entries`,
      // Pattern 4: /api/time-clock/{id}/entries
      `https://api.connecteam.com/api/time-clock/${timeClockId}/entries`,
      // Pattern 5: /v1/time-clock/{id}/entries
      `https://api.connecteam.com/v1/time-clock/${timeClockId}/entries`,
    ]

    const queryParams = [
      `from=${periodStart}&to=${periodEnd}`,
      `startDate=${periodStart}&endDate=${periodEnd}`,
      `start=${periodStart}&end=${periodEnd}`,
    ]

    let successResponse = null

    for (const baseUrl of baseUrls) {
      for (const params of queryParams) {
        const connecteamUrl = `${baseUrl}?${params}`
        
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
        const contentType = connecteamResponse.headers.get('content-type') || ''
        const isJson = contentType.includes('application/json') || 
                       (responseText.trim().startsWith('{') || responseText.trim().startsWith('['))

        if (connecteamResponse.ok && isJson) {
          console.log('✅ SUCCESS! This URL works!')
          
          let connecteamData
          try {
            connecteamData = JSON.parse(responseText)
            console.log('📊 Data:', JSON.stringify(connecteamData).substring(0, 300))
            
            successResponse = {
              data: connecteamData,
              url: connecteamUrl
            }
            break
          } catch (e) {
            console.log('❌ JSON parse failed')
          }
        } else {
          console.log(`❌ Failed: ${connecteamResponse.status}, isJson: ${isJson}`)
        }
      }
      
      if (successResponse) break
    }

    if (!successResponse) {
      console.error('❌ All endpoint attempts failed')
      return NextResponse.json({
        error: 'Could not find working Connecteam API endpoint',
        details: 'Tried multiple URL patterns but none returned valid JSON. Please check Connecteam API documentation or contact their support.',
      }, { status: 502 })
    }

    console.log('✅ Using working URL:', successResponse.url)
    const connecteamData = successResponse.data

    // Process the data
    const hoursMap: Record<string, number> = {}
    employeeEmails.forEach((email: string) => {
      hoursMap[email.toLowerCase()] = 0
    })

    const entries = Array.isArray(connecteamData) 
      ? connecteamData 
      : connecteamData.data || connecteamData.entries || connecteamData.results || []

    console.log(`📝 Processing ${entries.length} entries`)

    entries.forEach((entry: any) => {
      const userEmail = entry.user?.email?.toLowerCase() || 
                       entry.email?.toLowerCase() ||
                       entry.userEmail?.toLowerCase()
      
      if (userEmail && employeeEmails.map((e: string) => e.toLowerCase()).includes(userEmail)) {
        let hours = 0
        
        if (entry.duration) {
          hours = entry.duration / 60
        } else if (entry.clockIn && entry.clockOut) {
          hours = (new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / (1000 * 60 * 60)
        } else if (entry.totalTime) {
          hours = entry.totalTime / 3600
        } else if (entry.hours) {
          hours = parseFloat(entry.hours)
        }

        if (hours > 0) {
          hoursMap[userEmail] = (hoursMap[userEmail] || 0) + hours
          console.log(`  ✅ ${userEmail}: +${hours.toFixed(2)} hours`)
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
