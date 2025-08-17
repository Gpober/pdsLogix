// Simple helper around the OpenAI Chat Completions API using fetch.

export const createCFOCompletion = async (message, context) => {
  const apiKey = process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('Missing OpenAI API key')
  }
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are an AI CFO assistant for I AM CFO platform.
          You analyze financial data from journal entries and A/R aging reports.
          Provide concise, actionable insights for mobile users.
          Focus on property management financial analysis.
          Keep responses under 250 words for mobile readability.`,
          },
          {
            role: 'user',
            content: `User Question: ${message}\n\nFinancial Context: ${JSON.stringify(context)}`,
          },
        ],
        max_tokens: 350,
        temperature: 0.7,
      }),
    })

    if (!response.ok) {
      throw new Error(`OpenAI API responded with ${response.status}`)
    }

    const data = await response.json()
    return data.choices?.[0]?.message?.content
  } catch (error) {
    console.error('OpenAI API Error:', error)
    throw new Error('Failed to generate AI response')
  }
}
