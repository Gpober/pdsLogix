import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    hasOpenAIKey: !!process.env.OPENAI_API_KEY,
    keyPreview: process.env.OPENAI_API_KEY ? 
      process.env.OPENAI_API_KEY.substring(0, 7) + '...' : 
      'Not found',
    nodeEnv: process.env.NODE_ENV
  })
}
