import OpenAI from 'openai'

// Create the client with the API key if available. The key is validated
// at runtime when requests are made so that builds don't fail when the
// environment variable is missing.
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export const createCFOCompletion = async (message, context) => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY environment variable')
  }

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: "system",
          content: `You are an AI CFO assistant for I AM CFO platform.
          You analyze financial data from journal entries and A/R aging reports.
          Provide concise, actionable insights for mobile users.
          Focus on property management financial analysis.
          Keep responses under 250 words for mobile readability.`
        },
        {
          role: "user",
          content: `User Question: ${message}\n\nFinancial Context: ${JSON.stringify(context)}`
        }
      ],
      max_tokens: 350,
      temperature: 0.7,
    })

    return completion.choices[0].message.content
  } catch (error) {
    console.error('OpenAI API Error:', error)
    throw new Error('Failed to generate AI response')
  }
}
