// app/api/connecteam/hours/route.ts
// Try different authentication methods
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    console.log('🔵 Connecteam API route called')
    
    const body = await request.json()
    const { periodStart, periodEnd, employeeEmails, payrollGroup } = body

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

    // Try the most promising URL from logs
    const connecteamUrl = `https://api.connecteam.com/time-clock/${timeClockId}/entries?from=${periodStart}&to=${periodEnd}`
    
    // Try different authentication header combinations
    const authHeaders = [
      { 'X-API-KEY': connecteamApiKey },
      { 'X-API-Key': connecteamApiKey },
      { 'x-api-key': connecteamApiKey },
      { 'Authorization': `Bearer ${connecteamApiKey}` },
      { 'Authorization': `ApiKey ${connecteamApiKey}` },
      { 'Authorization': connecteamApiKey },
      { 'api-key': connecteamApiKey },
      { 'apikey': connecteamApiKey },
    ]

    for (let i = 0; i < authHeaders.length; i++) {
      const authHeader = authHeaders[i]
      const headerName = Object.keys(authHeader)[0]
      
      console.log(`\n🔗 Attempt ${i + 1}: ${connecteamUrl}`)
      console.log(`🔑 Auth header: ${headerName}`)

      const connecteamResponse = await fetch(connecteamUrl, {
        method: 'GET',
        headers: {
          ...authHeader,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      })

      console.log('📡 Status:', connecteamResponse.status)
      const contentType = connecteamResponse.headers.get('content-type') || ''
      console.log('📡 Content-Type:', contentType)

      const responseText = await connecteamResponse.text()
      console.log('📄 Response preview:', responseText.substring(0, 200))

      const isJson = contentType.includes('application/json') || 
                     (responseText.trim().startsWith('{') || responseText.trim().startsWith('['))

      if (connecteamResponse.ok && isJson) {
        console.log('✅ SUCCESS! This auth header works!')
        
        let connecteamData
        try {
          connecteamData = JSON.parse(responseText)
        } catch (e) {
          console.log('❌ JSON parse failed')
          continue
        }

        console.log('📊 Data:', JSON.stringify(connecteamData).substring(0, 300))

        const hoursMap: Record<string, number> = {}
        employeeEmails.forEach((email: string) => {
          hoursMap[email.toLowerCase()] = 0
        })

        const entries = Array.isArray(connecteamData) 
          ? connecteamData 
          : connecteamData.data || connecteamData.entries || connecteamData.results || []

        console.log(`📝 Processing ${entries.length} entries`)

        entries.forEach((entry: any) => {
          const userEmail = entry.user?.email?.toLowerCase() || entry.email?.toLowerCase()
          
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
          workingAuthHeader: headerName,
          entriesProcessed: entries.length
        })
      } else {
        console.log(`❌ Failed: Status ${connecteamResponse.status}, isJson: ${isJson}`)
      }
    }

    // All attempts failed
    return NextResponse.json({
      error: 'Could not authenticate with Connecteam API',
      details: 'Tried 8 different authentication header formats but all returned HTML. The API key may be invalid, or Connecteam may require additional authentication. Please contact Connecteam support for API documentation.',
      url: connecteamUrl
    }, { status: 502 })

  } catch (error: any) {
    console.error('❌ Error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
