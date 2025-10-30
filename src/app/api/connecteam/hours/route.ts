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

    // STEP 1: Get ALL users (with pagination) to map userId → email
    console.log('\n📋 STEP 1: Getting user list...')
    
    const userIdToEmail: Record<number, string> = {}
    const emailToUserId: Record<string, number> = {}
    
    let page = 1
    let hasMore = true
    let totalUsers = 0
    
    while (hasMore && page <= 10) { // Safety limit of 10 pages
      const usersUrl = `https://api.connecteam.com/users/v1/users?page=${page}&limit=100`
      console.log(`📄 Fetching page ${page}...`)
      
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
      
      if (users.length === 0) {
        hasMore = false
        break
      }
      
      users.forEach((user: any) => {
        if (user.userId && user.email) {
          userIdToEmail[user.userId] = user.email.toLowerCase()
          emailToUserId[user.email.toLowerCase()] = user.userId
          totalUsers++
        }
      })
      
      // Check if there are more pages
      hasMore = users.length === 100 // If we got 100, there might be more
      page++
    }

    console.log(`✅ Found ${totalUsers} users across ${page - 1} page(s)`)
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
      const manualBreaks = userActivity.manualBreaks || []
      
      if (!userEmail) {
        console.log(`  ⚠️  Unknown user ${userId} (${shifts.length} shifts) - no email mapping`)
        return
      }

      if (!employeeEmails.map((e: string) => e.toLowerCase()).includes(userEmail)) {
        console.log(`  ⏭️  Skipping ${userEmail} (${shifts.length} shifts) - not in employee list`)
        return
      }

      console.log(`\n  👤 Processing ${userEmail} (userId ${userId}): ${shifts.length} shifts, ${manualBreaks.length} breaks`)
      
      let totalHours = 0
      let totalBreakHours = 0
      
      // Calculate shift hours
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
      
      // Calculate break hours
      manualBreaks.forEach((breakItem: any, index: number) => {
        const startTimestamp = breakItem.start?.timestamp || breakItem.startTime
        const endTimestamp = breakItem.end?.timestamp || breakItem.endTime
        
        if (startTimestamp && endTimestamp) {
          const breakHours = (endTimestamp - startTimestamp) / 3600
          totalBreakHours += breakHours
          console.log(`    Break ${index + 1}: ${breakHours.toFixed(2)} hours`)
        }
      })

      const paidHours = totalHours - totalBreakHours
      hoursMap[userEmail] = Math.round(paidHours * 100) / 100
      
      console.log(`  📊 Total: ${totalHours.toFixed(2)}h - Breaks: ${totalBreakHours.toFixed(2)}h = Paid: ${hoursMap[userEmail]}h`)
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
