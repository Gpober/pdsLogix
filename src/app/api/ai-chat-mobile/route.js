import { NextResponse } from 'next/server'
import { createCFOCompletion } from '../../../lib/openai'

export async function POST(request) {
  try {
    const { message, userId } = await request.json()

    if (!message?.trim()) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      )
    }

    // Simple context for now (we'll make this smart later)
    const context = {
      queryType: 'general',
      platform: 'mobile',
      userId: userId,
      timestamp: new Date().toISOString()
    }

    // Generate AI response
    const response = await createCFOCompletion(message, context)

    return NextResponse.json({ response })

  } catch (error) {
    console.error('AI Chat Error:', error)
    
    return NextResponse.json(
      { error: 'Failed to process AI request' },
      { status: 500 }
    )
  }
}
