// Simple helper around the OpenAI Chat Completions API using fetch.

export const createCFOCompletion = async (message, context) => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY environment variable')
  }
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
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
