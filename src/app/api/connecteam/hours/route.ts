// app/api/connecteam/hours/route.ts
// FINAL VERSION - Using correct endpoint with correct IDs
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    console.log('🔵 Connecteam API route called')
    
    const body = await request.json()
    const { periodStart, periodEnd, employeeEmails, payrollGroup } = body

    console.log('📅 Period:', periodStart, 'to', periodEnd)
    console.log('👥 Payroll Group:', payrollGroup)
    console.log('📧 Employees:', employeeEmails)

    const connecteamApiKey = process.env.CONNECTEAM_API_KEY
    const timeClockIdA = process.env.CONNECTEAM_TIME_CLOCK_ID_A // Should be 2805712
    const timeClockIdB = process.env.CONNECTEAM_TIME_CLOCK_ID_B // Should be 2805369

    if (!connecteamApiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
    }

    const timeClockId = payrollGroup === 'A' ? timeClockIdA : timeClockIdB
    
    if (!timeClockId) {
      return NextResponse.json({ error: 'Time clock ID not configured' }, { status: 500 })
    }

    console.log(`🔑 Using time clock ID ${timeClockId} for payroll group ${payrollGroup}`)

    // ✅ CORRECT ENDPOINT
    const connecteamUrl = `https://api.connecteam.com/time-clock/v1/time-clocks/${timeClockId}/time-activities?startDate=${periodStart}&endDate=${periodEnd}`
    
    console.log('🔗 Calling Connecteam API:', connecteamUrl)

    const connecteamResponse = await fetch(connecteamUrl, {
      method: 'GET',
      headers: {
        'X-API-KEY': connecteamApiKey,
        'Accept': 'application/json',
      },
    })

    console.log('📡 Status:', connecteamResponse.status)

    const responseText = await connecteamResponse.text()
    console.log('📄 Response preview:', responseText.substring(0, 500))

    if (!connecteamResponse.ok) {
      return NextResponse.json({
        error: `Connecteam returned ${connecteamResponse.status}`,
        details: responseText
      }, { status: 502 })
    }

    const connecteamData = JSON.parse(responseText)
    console.log('✅ Got valid JSON!')
    console.log('📊 Full Connecteam response:', JSON.stringify(connecteamData, null, 2))

    const hoursMap: Record<string, number> = {}
    employeeEmails.forEach((email: string) => {
      hoursMap[email.toLowerCase()] = 0
    })

    const timeActivities = connecteamData.data?.timeActivities || []
    console.log(`📝 Found ${timeActivities.length} time activities`)
    
    if (timeActivities.length > 0) {
      console.log('📋 Sample activity:', JSON.stringify(timeActivities[0], null, 2))
    }

    timeActivities.forEach((activity: any, index: number) => {
      const userEmail = activity.user?.email?.toLowerCase()
      console.log(`  Activity ${index + 1}: email=${userEmail}, duration=${activity.duration}, startTime=${activity.startTime}, endTime=${activity.endTime}`)
      
      if (userEmail && employeeEmails.map((e: string) => e.toLowerCase()).includes(userEmail)) {
        console.log(`    ✅ Email matches! Processing...`)
        let hours = 0
        
        if (activity.duration) {
          hours = activity.duration / 60
          console.log(`    ⏱️  Duration: ${activity.duration} minutes = ${hours.toFixed(2)} hours`)
        } else if (activity.startTime && activity.endTime) {
          hours = (new Date(activity.endTime).getTime() - new Date(activity.startTime).getTime()) / (1000 * 60 * 60)
          console.log(`    🕐 Calculated: ${hours.toFixed(2)} hours`)
        }

        if (hours > 0) {
          hoursMap[userEmail] = (hoursMap[userEmail] || 0) + hours
          console.log(`    ➕ Total for ${userEmail}: ${hoursMap[userEmail].toFixed(2)} hours`)
        }
      } else {
        console.log(`    ❌ Email doesn't match or is missing`)
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
      entriesProcessed: timeActivities.length
    })

  } catch (error: any) {
    console.error('❌ Error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
