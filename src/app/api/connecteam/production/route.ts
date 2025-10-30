// src/app/api/connecteam/production/route.ts
// Syncs production counts from Connecteam forms
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    console.log('🔵 Connecteam Production API route called')
    
    const body = await request.json()
    const { periodStart, periodEnd, employeeEmails, locationName } = body

    console.log('📅 Period:', periodStart, 'to', periodEnd)
    console.log('📍 Location:', locationName)
    console.log('📧 Production employees:', employeeEmails)

    const connecteamApiKey = process.env.CONNECTEAM_API_KEY

    if (!connecteamApiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
    }

    // STEP 1: Get all forms to find the one matching this location
    console.log('\n📋 STEP 1: Finding form for location...')
    const formsUrl = 'https://api.connecteam.com/forms/v1/forms'
    
    const formsResponse = await fetch(formsUrl, {
      method: 'GET',
      headers: {
        'X-API-KEY': connecteamApiKey,
        'Accept': 'application/json',
      },
    })

    if (!formsResponse.ok) {
      return NextResponse.json({
        error: 'Failed to get forms from Connecteam',
        status: formsResponse.status
      }, { status: 502 })
    }

    const formsData = JSON.parse(await formsResponse.text())
    const forms = formsData.data?.forms || []
    
    console.log(`📝 Found ${forms.length} total forms`)
    
    // Find form that matches location name
    const locationForm = forms.find((form: any) => 
      form.name?.toLowerCase() === locationName.toLowerCase()
    )
    
    if (!locationForm) {
      console.log(`❌ No form found matching location: "${locationName}"`)
      console.log('Available forms:', forms.map((f: any) => f.name))
      return NextResponse.json({
        error: `No form found for location "${locationName}"`,
        availableForms: forms.map((f: any) => f.name)
      }, { status: 404 })
    }

    const formId = locationForm.formId || locationForm.id
    console.log(`✅ Found form: "${locationForm.name}" (ID: ${formId})`)

    // STEP 2: Get all users to map userId → email
    console.log('\n📋 STEP 2: Getting user list...')
    
    const userIdToEmail: Record<number, string> = {}
    const emailToUserId: Record<string, number> = {}
    
    let page = 1
    let hasMore = true
    let totalUsers = 0
    
    while (hasMore && page <= 10) {
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
      
      hasMore = users.length === 100
      page++
    }

    console.log(`✅ Found ${totalUsers} users`)
    
    // Find userIds for production employees
    console.log('\n📧 Looking for production employee userIds:')
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

    // STEP 3: Get form submissions for the pay period
    console.log(`\n📝 STEP 3: Getting form submissions for period...`)
    
    // Convert dates to timestamps (forms API might use different format)
    const startDate = new Date(periodStart).toISOString()
    const endDate = new Date(periodEnd).toISOString()
    
    const submissionsUrl = `https://api.connecteam.com/forms/v1/forms/${formId}/form-submissions?startDate=${startDate}&endDate=${endDate}`
    console.log('🔗 Calling:', submissionsUrl)
    
    const submissionsResponse = await fetch(submissionsUrl, {
      method: 'GET',
      headers: {
        'X-API-KEY': connecteamApiKey,
        'Accept': 'application/json',
      },
    })

    if (!submissionsResponse.ok) {
      const errorText = await submissionsResponse.text()
      console.log('❌ Submissions API error:', errorText)
      return NextResponse.json({
        error: `Failed to get form submissions: ${submissionsResponse.status}`,
        details: errorText
      }, { status: 502 })
    }

    const submissionsData = JSON.parse(await submissionsResponse.text())
    const submissions = submissionsData.data?.submissions || submissionsData.submissions || []
    
    console.log(`📊 Found ${submissions.length} total submissions`)

    // STEP 4: Count submissions per employee
    console.log('\n🧮 STEP 4: Counting submissions per employee...')
    
    const unitsMap: Record<string, number> = {}
    
    // Initialize all employees with 0
    employeeEmails.forEach((email: string) => {
      unitsMap[email.toLowerCase()] = 0
    })

    // Count submissions by userId
    submissions.forEach((submission: any) => {
      const userId = submission.userId || submission.submittedBy?.userId
      const userEmail = userIdToEmail[userId]
      
      if (userEmail && employeeEmails.map((e: string) => e.toLowerCase()).includes(userEmail)) {
        unitsMap[userEmail] = (unitsMap[userEmail] || 0) + 1
      }
    })

    // Log results
    Object.entries(unitsMap).forEach(([email, count]) => {
      console.log(`  📊 ${email}: ${count} units`)
    })

    console.log('\n✅ Production sync complete!')

    return NextResponse.json({
      success: true,
      units: unitsMap,
      locationName,
      formName: locationForm.name,
      period: { start: periodStart, end: periodEnd },
      employeesProcessed: relevantUserIds.length,
      totalSubmissions: submissions.length
    })

  } catch (error: any) {
    console.error('❌ Error:', error.message)
    console.error('❌ Stack:', error.stack)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
