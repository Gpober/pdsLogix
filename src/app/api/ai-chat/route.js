import { NextResponse } from 'next/server'
import { createCFOCompletion } from '../../../lib/openai'

export async function POST(request) {
  try {
    const { message, context } = await request.json()

    if (!message?.trim()) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      )
    }

    const aiResponse = await createCFOCompletion(message, context)
    return NextResponse.json({ response: aiResponse })
  } catch (error) {
    console.error('AI Chat Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process AI request' },
      { status: 500 }
    )
  }
}
