import OpenAI from 'openai'
import { availableFunctions } from '../app/api/ai-chat-mobile/route'

if (!process.env.OPENAI_API_KEY) {
  throw new Error('Missing OPENAI_API_KEY environment variable')
}

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export const createCFOCompletion = async (message, context) => {
  try {
    // Determine if we need function calling based on query type
    const needsFunctionCalling = [
      'ar_analysis',
      'customer_analysis', 
      'financial_analysis',
      'performance_analysis'
    ].includes(context.queryType)

    let messages = [
      {
        role: "system",
        content: `You are an AI CFO assistant for I AM CFO platform. 
        You analyze financial data and provide actionable insights for business owners.
        
        Current context:
        - Platform: ${context.platform}
        - Query Type: ${context.queryType}
        - User Type: ${context.userType}
        - Business: Multi-unit property management and service businesses
        
        Your personality:
        - Direct and insightful ("Man Behind the Curtain")
        - Focus on actionable recommendations
        - Use real data when available via functions
        - Professional but approachable tone
        - Always end with "More than just a balance sheet" when relevant
        
        When you have access to real data via functions, prioritize that over general advice.
        Always cite specific numbers and provide concrete recommendations.`
      },
      {
        role: "user",
        content: message
      }
    ]

    let completionOptions = {
      model: "gpt-4",
      messages: messages,
      temperature: 0.3,
      max_tokens: 500
    }

    // Add function calling if needed
    if (needsFunctionCalling) {
      completionOptions.tools = [
        {
          type: "function",
          function: {
            name: "getARAgingAnalysis",
            description: "Get accounts receivable aging analysis showing current, 30, 60, 90+ day buckets by customer",
            parameters: {
              type: "object",
              properties: {
                userId: {
                  type: "string",
                  description: "The user ID to get A/R data for"
                },
                customerId: {
                  type: "string",
                  description: "Optional specific customer ID to analyze"
                }
              },
              required: ["userId"]
            }
          }
        },
        {
          type: "function",
          function: {
            name: "getARPaymentHistory",
            description: "Get accounts receivable payment history and collection patterns by customer",
            parameters: {
              type: "object",
              properties: {
                userId: {
                  type: "string",
                  description: "The user ID to get payment data for"
                },
                customerId: {
                  type: "string",
                  description: "Optional specific customer ID to analyze"
                },
                timeframe: {
                  type: "string",
                  enum: ["3_months", "6_months", "12_months"],
                  description: "Time period for payment history analysis"
                }
              },
              required: ["userId"]
            }
          }
        },
        {
          type: "function",
          function: {
            name: "getCustomerNetIncome",
            description: "Get customer profitability analysis showing revenue, expenses, and net income by customer",
            parameters: {
              type: "object",
              properties: {
                userId: {
                  type: "string",
                  description: "The user ID to get financial data for"
                },
                customerId: {
                  type: "string",
                  description: "Optional specific customer ID to analyze"
                },
                timeframe: {
                  type: "string",
                  enum: ["current_month", "last_month", "current_quarter", "last_quarter"],
                  description: "Time period for financial analysis"
                }
              },
              required: ["userId"]
            }
          }
        }
      ]
      
      completionOptions.tool_choice = "auto"
    }

    console.log('🤖 OpenAI Request:', { 
      query: message, 
      functions: needsFunctionCalling,
      queryType: context.queryType 
    })

    // First API call to OpenAI
    const completion = await openai.chat.completions.create(completionOptions)
    
    let finalResponse = completion.choices[0].message

    // Handle function calls
    if (finalResponse.tool_calls) {
      console.log('🔧 Function calls needed:', finalResponse.tool_calls.length)
      
      // Add the assistant's message to conversation
      messages.push(finalResponse)
      
      // Execute each function call
      for (const toolCall of finalResponse.tool_calls) {
        const functionName = toolCall.function.name
        const functionArgs = JSON.parse(toolCall.function.arguments)
        
        // Add userId from context if not provided
        if (!functionArgs.userId && context.userId) {
          functionArgs.userId = context.userId
        }
        
        console.log(`📊 Calling function: ${functionName}`, functionArgs)
        
        // Execute the function
        let functionResult
        try {
          if (availableFunctions[functionName]) {
            functionResult = await availableFunctions[functionName](functionArgs)
          } else {
            functionResult = { error: `Function ${functionName} not found` }
          }
        } catch (error) {
          functionResult = { error: error.message }
        }
        
        console.log(`📈 Function result:`, functionResult)
        
        // Add function result to conversation
        messages.push({
          tool_call_id: toolCall.id,
          role: "tool",
          name: functionName,
          content: JSON.stringify(functionResult)
        })
      }
      
      // Second API call with function results
      const finalCompletion = await openai.chat.completions.create({
        model: "gpt-4",
        messages: messages,
        temperature: 0.3,
        max_tokens: 800
      })
      
      finalResponse = finalCompletion.choices[0].message
    }

    console.log('✅ AI Response generated:', finalResponse.content?.substring(0, 100) + '...')
    
    return finalResponse.content

  } catch (error) {
    console.error('❌ OpenAI Error:', error)
    
    // Fallback response
    if (error.message?.includes('insufficient_quota')) {
      return "I'm temporarily unable to analyze your data due to API limits. Please try again in a moment."
    } else if (error.message?.includes('context_length_exceeded')) {
      return "Your query involves too much data. Please try asking about a specific customer or shorter time period."
    } else {
      return "I encountered an issue analyzing your financial data. Please try rephrasing your question or contact support if this persists."
    }
  }
}
