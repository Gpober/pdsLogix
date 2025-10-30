// app/api/connecteam/hours/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    // ✅ Get auth token from cookies or Authorization header
    const authHeader = request.headers.get('authorization')
    const cookieHeader = request.headers.get('cookie')
    
    // Extract token from Authorization header or cookies
    let accessToken: string | null = null
    
    if (authHeader?.startsWith('Bearer ')) {
      accessToken = authHeader.replace('Bearer ', '')
    } else if (cookieHeader) {
      // Try to extract access token from cookies
      const cookies = cookieHeader.split(';').map(c => c.trim())
      const authCookie = cookies.find(c => c.startsWith('sb-') && c.includes('auth-token'))
      if (authCookie) {
        try {
          const [, value] = authCookie.split('=')
          const decoded = JSON.parse(decodeURIComponent(value))
          accessToken = decoded.access_token || decoded[0]?.access_token
        } catch (e) {
          console.log('Could not parse auth cookie')
        }
      }
    }

    // Create Supabase client to verify auth
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('❌ Missing Supabase credentials')
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Verify the user is authenticated
    let user = null
    if (accessToken) {
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(accessToken)
      if (!authError && authUser) {
        user = authUser
      }
    }

    if (!user) {
      console.error('❌ No authenticated user found')
      return NextResponse.json(
        { error: 'Unauthorized - please log in' },
        { status: 401 }
      )
    }

    console.log('✅ Authenticated user:', user.email)

    // ✅ Parse the request body
    const body = await request.json()
    const { periodStart, periodEnd, employeeEmails, payrollGroup } = body

    if (!periodStart || !periodEnd || !employeeEmails || !payrollGroup) {
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

    if (!connecteamResponse.ok) {
      const errorText = await connecteamResponse.text()
      console.error('❌ Connecteam API error:', connecteamResponse.status, errorText)
      return NextResponse.json(
        { error: `Connecteam API returned ${connecteamResponse.status}: ${errorText}` },
        { status: 502 }
      )
    }

    const connecteamData = await connecteamResponse.json()
    console.log('✅ Connecteam raw response:', JSON.stringify(connecteamData, null, 2))

    // ✅ Process the data and calculate total hours per employee
    const hoursMap: Record<string, number> = {}
    
    // Initialize all requested employees with 0 hours
    employeeEmails.forEach((email: string) => {
      hoursMap[email.toLowerCase()] = 0
    })

    // Process Connecteam entries
    if (connecteamData && Array.isArray(connecteamData)) {
      connecteamData.forEach((entry: any) => {
        const userEmail = entry.user?.email?.toLowerCase() || entry.email?.toLowerCase()
        
        if (userEmail && employeeEmails.map((e: string) => e.toLowerCase()).includes(userEmail)) {
          // Calculate hours from the entry
          let hours = 0
          
          if (entry.duration) {
            // If duration is in minutes
            hours = entry.duration / 60
          } else if (entry.clockIn && entry.clockOut) {
            // Calculate from timestamps
            const clockIn = new Date(entry.clockIn).getTime()
            const clockOut = new Date(entry.clockOut).getTime()
            hours = (clockOut - clockIn) / (1000 * 60 * 60) // Convert ms to hours
          } else if (entry.totalTime) {
            // Some APIs return totalTime in seconds
            hours = entry.totalTime / 3600
          }

          if (hours > 0) {
            hoursMap[userEmail] = (hoursMap[userEmail] || 0) + hours
            console.log(`✅ Added ${hours.toFixed(2)} hours for ${userEmail}`)
          }
        }
      })
    } else if (connecteamData && connecteamData.data && Array.isArray(connecteamData.data)) {
      // Handle if response is wrapped in a data property
      connecteamData.data.forEach((entry: any) => {
        const userEmail = entry.user?.email?.toLowerCase() || entry.email?.toLowerCase()
        
        if (userEmail && employeeEmails.map((e: string) => e.toLowerCase()).includes(userEmail)) {
          let hours = 0
          
          if (entry.duration) {
            hours = entry.duration / 60
          } else if (entry.clockIn && entry.clockOut) {
            const clockIn = new Date(entry.clockIn).getTime()
            const clockOut = new Date(entry.clockOut).getTime()
            hours = (clockOut - clockIn) / (1000 * 60 * 60)
          } else if (entry.totalTime) {
            hours = entry.totalTime / 3600
          }

          if (hours > 0) {
            hoursMap[userEmail] = (hoursMap[userEmail] || 0) + hours
            console.log(`✅ Added ${hours.toFixed(2)} hours for ${userEmail}`)
          }
        }
      })
    }

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
    })

  } catch (error: any) {
    console.error('❌ API route error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
