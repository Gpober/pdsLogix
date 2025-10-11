'use client'
import { useState, useRef, useEffect } from 'react'
import { X, Send, Sparkles } from 'lucide-react'

// I AM CFO Brand Colors
const BRAND_COLORS = {
  primary: '#56B6E9',
  secondary: '#3A9BD1',
  tertiary: '#7CC4ED',
  accent: '#2E86C1',
  success: '#27AE60',
  warning: '#F39C12',
  danger: '#E74C3C',
  gray: {
    50: '#F8FAFC',
    100: '#F1F5F9',
    200: '#E2E8F0',
    300: '#CBD5E1',
    400: '#94A3B8',
    500: '#64748B',
    600: '#475569',
    700: '#334155',
    800: '#1E293B',
    900: '#0F172A'
  }
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export default function MobileDashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "👋 Hi! I'm your AI CFO assistant. I can help you analyze your financial data, answer questions about your reports, and provide insights. What would you like to know?",
      timestamp: new Date()
    }
  ])
  const [inputMessage, setInputMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    if (isChatOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isChatOpen])

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return

    const userMessage: Message = {
      role: 'user',
      content: inputMessage,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInputMessage('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/ai-cfo/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: inputMessage,
          conversationHistory: messages
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to get AI response')
      }

      const data = await response.json()

      const assistantMessage: Message = {
        role: 'assistant',
        content: data.response || "I'm having trouble processing that request. Please try again.",
        timestamp: new Date()
      }

      setMessages(prev => [...prev, assistantMessage])

    } catch (error) {
      console.error('AI Chat Error:', error)
      
      const errorMessage: Message = {
        role: 'assistant',
        content: "I apologize, but I'm having trouble connecting right now. Please try again in a moment.",
        timestamp: new Date()
      }

      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const quickActions = [
    "Summarize my financial performance",
    "What's my cash position?",
    "Show overdue receivables",
    "Analyze payroll costs"
  ]

  const handleQuickAction = (action: string) => {
    setInputMessage(action)
    setTimeout(() => handleSendMessage(), 100)
  }

  return (
    <>
      {children}

      {/* AI CFO Floating Button */}
      {!isChatOpen && (
        <button
          onClick={() => setIsChatOpen(true)}
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: `linear-gradient(135deg, ${BRAND_COLORS.primary} 0%, ${BRAND_COLORS.secondary} 100%)`,
            border: 'none',
            boxShadow: '0 8px 24px rgba(86, 182, 233, 0.4)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999,
            transition: 'all 0.3s ease',
            animation: 'pulse 2s ease-in-out infinite'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.1)'
            e.currentTarget.style.boxShadow = '0 12px 32px rgba(86, 182, 233, 0.6)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)'
            e.currentTarget.style.boxShadow = '0 8px 24px rgba(86, 182, 233, 0.4)'
          }}
        >
          <Sparkles size={28} color="white" />
          <style jsx>{`
            @keyframes pulse {
              0%, 100% { box-shadow: 0 8px 24px rgba(86, 182, 233, 0.4); }
              50% { box-shadow: 0 8px 32px rgba(86, 182, 233, 0.6); }
            }
          `}</style>
        </button>
      )}

      {/* AI CFO Chat Modal */}
      {isChatOpen && (
        <div style={{
          position: 'fixed',
          bottom: 0,
          right: 0,
          width: '100%',
          height: '100vh',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          background: 'white'
        }}>
          {/* Chat Header */}
          <div style={{
            background: `linear-gradient(135deg, ${BRAND_COLORS.primary} 0%, ${BRAND_COLORS.secondary} 100%)`,
            padding: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Sparkles size={20} color="white" />
              </div>
              <div>
                <h3 style={{
                  margin: 0,
                  fontSize: '18px',
                  fontWeight: 'bold',
                  color: 'white'
                }}>
                  AI CFO
                </h3>
                <p style={{
                  margin: 0,
                  fontSize: '12px',
                  color: 'rgba(255, 255, 255, 0.9)'
                }}>
                  Your Financial Assistant
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsChatOpen(false)}
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                border: 'none',
                borderRadius: '8px',
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              <X size={20} color="white" />
            </button>
          </div>

          {/* Chat Messages */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px',
            background: BRAND_COLORS.gray[50]
          }}>
            {messages.map((message, index) => (
              <div
                key={index}
                style={{
                  marginBottom: '16px',
                  display: 'flex',
                  justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start'
                }}
              >
                <div style={{
                  maxWidth: '80%',
                  padding: '12px 16px',
                  borderRadius: '16px',
                  background: message.role === 'user' 
                    ? `linear-gradient(135deg, ${BRAND_COLORS.primary} 0%, ${BRAND_COLORS.secondary} 100%)`
                    : 'white',
                  color: message.role === 'user' ? 'white' : BRAND_COLORS.gray[900],
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                  fontSize: '15px',
                  lineHeight: '1.5'
                }}>
                  {message.content}
                  <div style={{
                    fontSize: '11px',
                    marginTop: '4px',
                    opacity: 0.7,
                    textAlign: 'right'
                  }}>
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}

            {isLoading && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 16px',
                background: 'white',
                borderRadius: '16px',
                width: 'fit-content',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
              }}>
                <div style={{
                  display: 'flex',
                  gap: '4px'
                }}>
                  <div style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: BRAND_COLORS.primary,
                    animation: 'bounce 1.4s ease-in-out infinite'
                  }} />
                  <div style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: BRAND_COLORS.primary,
                    animation: 'bounce 1.4s ease-in-out 0.2s infinite'
                  }} />
                  <div style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: BRAND_COLORS.primary,
                    animation: 'bounce 1.4s ease-in-out 0.4s infinite'
                  }} />
                </div>
                <style jsx>{`
                  @keyframes bounce {
                    0%, 60%, 100% { transform: translateY(0); }
                    30% { transform: translateY(-10px); }
                  }
                `}</style>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Actions */}
          {messages.length === 1 && (
            <div style={{
              padding: '16px 20px',
              background: 'white',
              borderTop: `1px solid ${BRAND_COLORS.gray[200]}`
            }}>
              <p style={{
                margin: '0 0 12px 0',
                fontSize: '13px',
                color: BRAND_COLORS.gray[600],
                fontWeight: '500'
              }}>
                Quick actions:
              </p>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                {quickActions.map((action, index) => (
                  <button
                    key={index}
                    onClick={() => handleQuickAction(action)}
                    style={{
                      padding: '10px 14px',
                      background: BRAND_COLORS.gray[100],
                      border: 'none',
                      borderRadius: '12px',
                      fontSize: '13px',
                      color: BRAND_COLORS.gray[700],
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = BRAND_COLORS.gray[200]
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = BRAND_COLORS.gray[100]
                    }}
                  >
                    {action}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Chat Input */}
          <div style={{
            padding: '16px 20px',
            background: 'white',
            borderTop: `1px solid ${BRAND_COLORS.gray[200]}`,
            boxShadow: '0 -4px 12px rgba(0,0,0,0.05)'
          }}>
            <div style={{
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-end'
            }}>
              <input
                ref={inputRef}
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask me anything about your finances..."
                disabled={isLoading}
                style={{
                  flex: 1,
                  padding: '14px 16px',
                  border: `2px solid ${BRAND_COLORS.gray[200]}`,
                  borderRadius: '12px',
                  fontSize: '15px',
                  outline: 'none',
                  transition: 'all 0.2s ease'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = BRAND_COLORS.primary
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = BRAND_COLORS.gray[200]
                }}
              />
              <button
                onClick={handleSendMessage}
                disabled={!inputMessage.trim() || isLoading}
                style={{
                  background: inputMessage.trim() && !isLoading
                    ? `linear-gradient(135deg, ${BRAND_COLORS.primary} 0%, ${BRAND_COLORS.secondary} 100%)`
                    : BRAND_COLORS.gray[300],
                  border: 'none',
                  borderRadius: '12px',
                  width: '48px',
                  height: '48px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: inputMessage.trim() && !isLoading ? 'pointer' : 'not-allowed',
                  transition: 'all 0.2s ease'
                }}
              >
                <Send size={20} color="white" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
