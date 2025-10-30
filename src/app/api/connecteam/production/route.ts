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
    
    // Paginate through ALL forms
    let allForms: any[] = []
    let offset = 0
    let hasMore = true

    while (hasMore) {
      const formsUrl = `https://api.connecteam.com/forms/v1/forms?offset=${offset}`
      console.log(`  📄 Fetching forms at offset ${offset}...`)
      
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
      const forms = formsData.data?.forms || formsData.forms || []
      
      if (offset === 0) {
        console.log('📋 Raw forms response:', JSON.stringify(formsData, null, 2))
      }
      
      allForms = [...allForms, ...forms]
      console.log(`  ✅ Loaded ${forms.length} forms (total: ${allForms.length})`)

      // Check if there are more forms
      const nextOffset = formsData.paging?.offset
      if (nextOffset && forms.length > 0) {
        offset = nextOffset
      } else {
        hasMore = false
      }
    }
    
    console.log(`📋 Found ${allForms.length} total forms in Connecteam`)
    
    if (allForms.length > 0) {
      console.log('📋 First form structure:', JSON.stringify(allForms[0], null, 2))
    }
    
    const forms = allForms

    // Find form that matches the location name
    const locationForm = forms.find((form: any) => 
      form.formName && form.formName.toLowerCase().includes(locationName.toLowerCase())
    )

    if (!locationForm) {
      console.log('❌ No form found matching location:', locationName)
      console.log('Available forms:', forms.map((f: any) => f.formName))
      return NextResponse.json({
        error: `No form found for location "${locationName}"`,
        availableForms: forms.map((f: any) => f.formName)
      }, { status: 404 })
    }

    console.log(`✅ Found form: "${locationForm.formName}" (ID: ${locationForm.formId})`)

    // STEP 2: Get all users to map emails to userIds
    console.log('\n👥 STEP 2: Getting users from Connecteam...')
    let allUsers: any[] = []
    let currentPage = 1
    let hasMore = true

    while (hasMore) {
      const usersUrl = `https://api.connecteam.com/users/v1/users?page=${currentPage}&limit=100`
      console.log(`  📄 Fetching page ${currentPage}...`)
      
      const usersResponse = await fetch(usersUrl, {
        method: 'GET',
        headers: {
          'X-API-KEY': connecteamApiKey,
          'Accept': 'application/json',
        },
      })

      if (!usersResponse.ok) {
        throw new Error(`Failed to get users: ${usersResponse.status}`)
      }

      const usersData = JSON.parse(await usersResponse.text())
      const users = usersData.data?.users || usersData.users || []
      allUsers = [...allUsers, ...users]

      console.log(`  ✅ Page ${currentPage}: ${users.length} users`)

      // Check if there are more pages
      const totalUsers = usersData.data?.totalResults || usersData.totalResults || 0
      hasMore = allUsers.length < totalUsers
      currentPage++
    }

    console.log(`👥 Total users loaded: ${allUsers.length}`)

    // Map email to userId for relevant employees
    const userIdToEmail: Record<string, string> = {}
    const relevantUserIds: string[] = []

    allUsers.forEach((user: any) => {
      const email = user.email?.toLowerCase()
      if (email && employeeEmails.map((e: string) => e.toLowerCase()).includes(email)) {
        userIdToEmail[user.id] = email
        relevantUserIds.push(user.id)
      }
    })

    console.log(`✅ Mapped ${relevantUserIds.length} relevant employees`)
    console.log('Relevant users:', Object.entries(userIdToEmail))

    if (relevantUserIds.length === 0) {
      return NextResponse.json({
        error: 'No matching users found in Connecteam',
        employeeEmails
      }, { status: 404 })
    }

    // STEP 3: Get form submissions for the period
    console.log('\n📊 STEP 3: Getting form submissions...')
    
    const submissionsUrl = `https://api.connecteam.com/forms/v1/forms/${locationForm.formId}/form-submissions?fromDate=${periodStart}&toDate=${periodEnd}`
    
    console.log(`📅 Fetching submissions from ${periodStart} to ${periodEnd}`)

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
      formName: locationForm.formName,
      formId: locationForm.formId,
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
