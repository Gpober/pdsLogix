'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { MessageSquare, X, Send, Sparkles, Menu, ChevronLeft } from 'lucide-react'

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
  const router = useRouter()
  const pathname = usePathname()
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
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

  // Hamburger Menu State
  const [reportType, setReportType] = useState<"pl" | "cf" | "ar" | "ap">("pl")
  const [reportPeriod, setReportPeriod] = useState<"Monthly" | "Custom" | "Year to Date" | "Trailing 12" | "Quarterly">("Monthly")
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1)
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [customStart, setCustomStart] = useState("")
  const [customEnd, setCustomEnd] = useState("")

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

  // Determine current page from pathname
  useEffect(() => {
    if (pathname?.includes('/pl')) setReportType('pl')
    else if (pathname?.includes('/cash-flow')) setReportType('cf')
    else if (pathname?.includes('/ar')) setReportType('ar')
    else if (pathname?.includes('/ap')) setReportType('ap')
  }, [pathname])

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

  const handleApplyFilters = () => {
    setMenuOpen(false)
    // Navigate based on report type
    if (reportType === 'pl') router.push('/mobile-dashboard/pl')
    else if (reportType === 'cf') router.push('/mobile-dashboard/cash-flow')
    else if (reportType === 'ar') router.push('/mobile-dashboard/ar')
    else if (reportType === 'ap') router.push('/mobile-dashboard/ap')
  }

  const isLandingPage = pathname === '/mobile-dashboard'

  return (
    <>
      {/* Header - Only show on non-landing pages */}
      {!isLandingPage && (
        <div style={{
          background: 'rgba(255, 255, 255, 0.98)',
          backdropFilter: 'blur(10px)',
          borderBottom: `3px solid ${BRAND_COLORS.primary}`,
          padding: '20px',
          position: 'sticky',
          top: 0,
          zIndex: 10,
          boxShadow: '0 2px 20px rgba(0,0,0,0.1)'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px'
          }}>
            <button
              onClick={() => router.push('/mobile-dashboard')}
              style={{
                background: BRAND_COLORS.primary,
                border: 'none',
                borderRadius: '12px',
                width: '44px',
                height: '44px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(86, 182, 233, 0.3)',
                transition: 'all 0.2s ease',
                flexShrink: 0
              }}
            >
              <ChevronLeft size={24} color="white" />
            </button>

            <div style={{ flex: 1 }}>
              <h1 style={{
                margin: 0,
                fontSize: '24px',
                fontWeight: 'bold',
                color: BRAND_COLORS.gray[900]
              }}>
                {reportType === 'pl' ? 'P&L Statement' :
                 reportType === 'cf' ? 'Cash Flow' :
                 reportType === 'ar' ? 'A/R Aging' :
                 reportType === 'ap' ? 'A/P Aging' : 'Reports'}
              </h1>
              <p style={{
                margin: 0,
                fontSize: '14px',
                color: BRAND_COLORS.gray[600]
              }}>
                By Customer
              </p>
            </div>

            <button
              onClick={() => setMenuOpen(true)}
              style={{
                background: BRAND_COLORS.gray[100],
                border: 'none',
                borderRadius: '12px',
                width: '44px',
                height: '44px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                flexShrink: 0
              }}
            >
              <Menu size={24} color={BRAND_COLORS.gray[700]} />
            </button>
          </div>
        </div>
      )}

      {/* Hamburger Menu Modal */}
      {menuOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          zIndex: 999,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'flex-end'
        }}
        onClick={() => setMenuOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white',
              width: '320px',
              maxWidth: '90%',
              height: '100vh',
              boxShadow: '-4px 0 20px rgba(0,0,0,0.1)',
              animation: 'slideInRight 0.3s ease-out',
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto'
            }}
          >
            <style jsx>{`
              @keyframes slideInRight {
                from { transform: translateX(100%); }
                to { transform: translateX(0); }
              }
            `}</style>

            <div style={{
              padding: '20px',
              borderBottom: `2px solid ${BRAND_COLORS.gray[200]}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h2 style={{
                margin: 0,
                fontSize: '20px',
                fontWeight: 'bold',
                color: BRAND_COLORS.gray[900]
              }}>
                Filter Options
              </h2>
              <button
                onClick={() => setMenuOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '8px'
                }}
              >
                <X size={24} color={BRAND_COLORS.gray[600]} />
              </button>
            </div>

            <div style={{ flex: 1, padding: '20px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: BRAND_COLORS.accent }}>
                  Report Type
                </label>
                <select
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: `2px solid ${BRAND_COLORS.gray[200]}`,
                    borderRadius: '8px',
                    fontSize: '16px'
                  }}
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value as "pl" | "cf" | "ar" | "ap")}
                >
                  <option value="pl">P&L Statement</option>
                  <option value="cf">Cash Flow Statement</option>
                  <option value="ar">A/R Aging Report</option>
                  <option value="ap">A/P Aging Report</option>
                </select>
              </div>

              {reportType !== "ar" && reportType !== "ap" && (
                <>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: BRAND_COLORS.accent }}>
                      Report Period
                    </label>
                    <select
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: `2px solid ${BRAND_COLORS.gray[200]}`,
                        borderRadius: '8px',
                        fontSize: '16px'
                      }}
                      value={reportPeriod}
                      onChange={(e) =>
                        setReportPeriod(e.target.value as "Monthly" | "Custom" | "Year to Date" | "Trailing 12" | "Quarterly")
                      }
                    >
                      <option value="Monthly">Monthly</option>
                      <option value="Custom">Custom Range</option>
                      <option value="Year to Date">Year to Date</option>
                      <option value="Trailing 12">Trailing 12 Months</option>
                      <option value="Quarterly">Quarterly</option>
                    </select>
                  </div>

                  {reportPeriod === "Custom" ? (
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: BRAND_COLORS.gray[700], marginBottom: '8px' }}>
                          Start Date
                        </label>
                        <input
                          type="date"
                          value={customStart}
                          onChange={(e) => setCustomStart(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '12px',
                            border: `2px solid ${BRAND_COLORS.gray[200]}`,
                            borderRadius: '8px',
                            fontSize: '16px'
                          }}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: BRAND_COLORS.gray[700], marginBottom: '8px' }}>
                          End Date
                        </label>
                        <input
                          type="date"
                          value={customEnd}
                          onChange={(e) => setCustomEnd(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '12px',
                            border: `2px solid ${BRAND_COLORS.gray[200]}`,
                            borderRadius: '8px',
                            fontSize: '16px'
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: BRAND_COLORS.gray[700], marginBottom: '8px' }}>
                          Month
                        </label>
                        <select
                          value={month}
                          onChange={(e) => setMonth(Number(e.target.value))}
                          style={{
                            width: '100%',
                            padding: '12px',
                            border: `2px solid ${BRAND_COLORS.gray[200]}`,
                            borderRadius: '8px',
                            fontSize: '16px'
                          }}
                        >
                          {Array.from({ length: 12 }, (_, i) => (
                            <option key={i + 1} value={i + 1}>
                              {new Date(0, i).toLocaleString("en", { month: "long" })}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: BRAND_COLORS.gray[700], marginBottom: '8px' }}>
                          Year
                        </label>
                        <select
                          value={year}
                          onChange={(e) => setYear(Number(e.target.value))}
                          style={{
                            width: '100%',
                            padding: '12px',
                            border: `2px solid ${BRAND_COLORS.gray[200]}`,
                            borderRadius: '8px',
                            fontSize: '16px'
                          }}
                        >
                          {Array.from({ length: 5 }, (_, i) => {
                            const y = new Date().getFullYear() - 2 + i
                            return (
                              <option key={y} value={y}>{y}</option>
                            )
                          })}
                        </select>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div style={{ padding: '20px', borderTop: `2px solid ${BRAND_COLORS.gray[200]}` }}>
              <button
                onClick={handleApplyFilters}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: `linear-gradient(135deg, ${BRAND_COLORS.primary} 0%, ${BRAND_COLORS.secondary} 100%)`,
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '16px',
                  fontWeight: '600',
                  color: 'white',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(86, 182, 233, 0.3)'
                }}
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {children}

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
            transition: 'all 0.3s ease'
          }}
        >
          <Sparkles size={28} color="white" />
        </button>
      )}

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
          <div style={{
            background: `linear-gradient(135deg, ${BRAND_COLORS.primary} 0%, ${BRAND_COLORS.secondary} 100%)`,
            padding: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: 'white' }}>
                  AI CFO
                </h3>
                <p style={{ margin: 0, fontSize: '12px', color: 'rgba(255, 255, 255, 0.9)' }}>
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
                <div style={{ display: 'flex', gap: '4px' }}>
                  {[0, 0.2, 0.4].map((delay, i) => (
                    <div key={i} style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: BRAND_COLORS.primary,
                      animation: `bounce 1.4s ease-in-out ${delay}s infinite`
                    }} />
                  ))}
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
                  >
                    {action}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{
            padding: '16px 20px',
            background: 'white',
            borderTop: `1px solid ${BRAND_COLORS.gray[200]}`,
            boxShadow: '0 -4px 12px rgba(0,0,0,0.05)'
          }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
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
                  outline: 'none'
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
                  cursor: inputMessage.trim() && !isLoading ? 'pointer' : 'not-allowed'
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
