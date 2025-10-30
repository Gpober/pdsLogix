// app/api/webhooks/connecteam/submissions/route.ts
// Webhook endpoint to receive Connecteam form submissions
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(request: NextRequest) {
  try {
    console.log('📥 Connecteam webhook received')
    
    // Verify webhook signature (if Connecteam provides one)
    const signature = request.headers.get('x-connecteam-signature')
    // TODO: Verify signature if available
    
    const body = await request.json()
    console.log('📦 Webhook payload:', JSON.stringify(body, null, 2))
    
    const { event, data } = body
    
    if (!event || !data) {
      return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Handle different webhook events
    switch (event) {
      case 'form.submitted':
      case 'form.updated':
        await handleSubmissionUpsert(supabase, data)
        break
        
      case 'form.deleted':
        await handleSubmissionDelete(supabase, data)
        break
        
      default:
        console.log(`⚠️ Unhandled event type: ${event}`)
    }

    return NextResponse.json({ success: true, event })

  } catch (error: any) {
    console.error('❌ Webhook error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

async function handleSubmissionUpsert(supabase: any, data: any) {
  console.log('✏️ Upserting submission:', data.formSubmissionId)
  
  const {
    formSubmissionId,
    formId,
    submittingUserId,
    submissionTimestamp,
    entryNum,
    answers = []
  } = data

  // Get user email from Connecteam API
  const userEmail = await getUserEmail(submittingUserId)
  
  // Extract location name from answers if available
  const locationAnswer = answers.find((a: any) => 
    a.questionType === 'multipleChoice' && 
    a.selectedAnswers?.[0]?.text?.includes('Manheim')
  )
  const locationName = locationAnswer?.selectedAnswers?.[0]?.text || null

  // Upsert to Supabase
  const { error } = await supabase
    .from('connecteam_form_submissions')
    .upsert({
      form_submission_id: formSubmissionId,
      form_id: formId,
      submitting_user_id: submittingUserId,
      user_email: userEmail,
      location_name: locationName,
      submission_timestamp: submissionTimestamp,
      entry_num: entryNum,
      updated_at: new Date().toISOString(),
      deleted_at: null // Clear soft delete if it was previously deleted
    }, {
      onConflict: 'form_submission_id'
    })

  if (error) {
    console.error('❌ Supabase upsert error:', error)
    throw error
  }

  console.log('✅ Submission upserted:', formSubmissionId)
}

async function handleSubmissionDelete(supabase: any, data: any) {
  console.log('🗑️ Soft deleting submission:', data.formSubmissionId)
  
  const { formSubmissionId } = data

  // Soft delete by setting deleted_at timestamp
  const { error } = await supabase
    .from('connecteam_form_submissions')
    .update({ 
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('form_submission_id', formSubmissionId)

  if (error) {
    console.error('❌ Supabase delete error:', error)
    throw error
  }

  console.log('✅ Submission soft deleted:', formSubmissionId)
}

async function getUserEmail(userId: number): Promise<string | null> {
  try {
    const connecteamApiKey = process.env.CONNECTEAM_API_KEY!
    
    // Cache this in memory or Redis for better performance
    const usersResponse = await fetch(
      `https://api.connecteam.com/users/v1/users/${userId}`,
      {
        headers: {
          'X-API-KEY': connecteamApiKey,
          'Accept': 'application/json',
        },
      }
    )

    if (!usersResponse.ok) {
      console.error(`❌ Failed to get user ${userId}:`, usersResponse.status)
      return null
    }

    const userData = await usersResponse.json()
    return userData.data?.user?.email?.toLowerCase() || userData.user?.email?.toLowerCase() || null
    
  } catch (error: any) {
    console.error(`❌ Error fetching user ${userId}:`, error.message)
    return null
  }
}

// Allow GET for webhook verification (some services require this)
export async function GET(request: NextRequest) {
  const challenge = request.nextUrl.searchParams.get('challenge')
  
  if (challenge) {
    // Webhook verification
    return new NextResponse(challenge, { status: 200 })
  }
  
  return NextResponse.json({ 
    status: 'Connecteam webhook endpoint active',
    timestamp: new Date().toISOString()
  })
}
