// app/api/connecteam/hours/route.ts
// WORKING VERSION - Gets users first, then matches time activities by userId
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    console.log('🔵 Connecteam API route called')
    
    const body = await request.json()
    const { periodStart, periodEnd, employeeEmails, payrollGroup } = body

    console.log('📅 Period:', periodStart, 'to', periodEnd)
    console.log('👥 Payroll Group:', payrollGroup)
    console.log('📧 Employee emails:', employeeEmails)

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

    // STEP 1: Get all users to map userId → email
    console.log('\n📋 STEP 1: Getting user list...')
    const usersUrl = 'https://api.connecteam.com/users/v1/users'
    const usersResponse = await fetch(usersUrl, {
      method: 'GET',
      headers: {
        'X-API-KEY': connecteamApiKey,
        'Accept': 'application/json',
      },
    })

    if (!usersResponse.ok) {
      return NextResponse.json({
        error: 'Failed to get users from Connecteam',
        status: usersResponse.status
      }, { status: 502 })
    }

    const usersData = JSON.parse(await usersResponse.text())
    const users = usersData.data?.users || []
    
    // Create userId → email mapping (case-insensitive)
    const userIdToEmail: Record<number, string> = {}
    const emailToUserId: Record<string, number> = {}
    
    users.forEach((user: any) => {
      if (user.id && user.email) {
        userIdToEmail[user.id] = user.email.toLowerCase()
        emailToUserId[user.email.toLowerCase()] = user.id
      }
    })

    console.log(`✅ Found ${users.length} users`)
    console.log(`📧 Looking for userIds for:`, employeeEmails)
    
    const relevantUserIds: number[] = []
    employeeEmails.forEach((email: string) => {
      const userId = emailToUserId[email.toLowerCase()]
      if (userId) {
        relevantUserIds.push(userId)
        console.log(`  ✅ ${email} → userId ${userId}`)
      } else {
        console.log(`  ❌ ${email} → NOT FOUND in Connecteam`)
      }
    })

    // STEP 2: Get time activities
    console.log(`\n⏰ STEP 2: Getting time activities...`)
    const timeActivitiesUrl = `https://api.connecteam.com/time-clock/v1/time-clocks/${timeClockId}/time-activities?startDate=${periodStart}&endDate=${periodEnd}`
    
    console.log('🔗 Calling:', timeActivitiesUrl)

    const timeActivitiesResponse = await fetch(timeActivitiesUrl, {
      method: 'GET',
      headers: {
        'X-API-KEY': connecteamApiKey,
        'Accept': 'application/json',
      },
    })

    if (!timeActivitiesResponse.ok) {
      return NextResponse.json({
        error: `Connecteam returned ${timeActivitiesResponse.status}`,
        details: await timeActivitiesResponse.text()
      }, { status: 502 })
    }

    const timeActivitiesData = JSON.parse(await timeActivitiesResponse.text())
    const timeActivitiesByUsers = timeActivitiesData.data?.timeActivitiesByUsers || []
    
    console.log(`📊 Found time activities for ${timeActivitiesByUsers.length} users`)

    // STEP 3: Calculate hours for each employee
    console.log('\n🧮 STEP 3: Calculating hours...')
    const hoursMap: Record<string, number> = {}
    
    employeeEmails.forEach((email: string) => {
      hoursMap[email.toLowerCase()] = 0
    })

    timeActivitiesByUsers.forEach((userActivity: any) => {
      const userId = userActivity.userId
      const userEmail = userIdToEmail[userId]
      const shifts = userActivity.shifts || []
      
      if (!userEmail) {
        console.log(`  ⚠️  Unknown user ${userId} (${shifts.length} shifts) - no email mapping`)
        return
      }

      if (!employeeEmails.map((e: string) => e.toLowerCase()).includes(userEmail)) {
        console.log(`  ⏭️  Skipping ${userEmail} (${shifts.length} shifts) - not in employee list`)
        return
      }

      console.log(`\n  👤 Processing ${userEmail} (userId ${userId}): ${shifts.length} shifts`)
      
      let totalHours = 0
      shifts.forEach((shift: any, index: number) => {
        const startTimestamp = shift.start?.timestamp
        const endTimestamp = shift.end?.timestamp
        
        if (startTimestamp && endTimestamp) {
          const hours = (endTimestamp - startTimestamp) / 3600 // Convert seconds to hours
          totalHours += hours
          console.log(`    Shift ${index + 1}: ${hours.toFixed(2)} hours`)
        } else {
          console.log(`    Shift ${index + 1}: Missing timestamps`)
        }
      })

      hoursMap[userEmail] = Math.round(totalHours * 100) / 100
      console.log(`  ✅ Total for ${userEmail}: ${hoursMap[userEmail]} hours`)
    })

    console.log('\n✅ Final hours:', hoursMap)

    return NextResponse.json({
      success: true,
      hours: hoursMap,
      payrollGroup,
      period: { start: periodStart, end: periodEnd },
      usersProcessed: relevantUserIds.length
    })

  } catch (error: any) {
    console.error('❌ Error:', error.message)
    console.error('❌ Stack:', error.stack)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
