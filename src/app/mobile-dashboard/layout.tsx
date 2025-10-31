'use client'
import { useState, useRef, useEffect } from 'react'
import { X, Send, Sparkles, Mic, MicOff, Volume2, VolumeX, DollarSign } from 'lucide-react'

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

interface LayoutProps {
  children: React.ReactNode
  userRole?: string
}

export default function MobileDashboardLayout({
  children,
  userRole
}: LayoutProps) {
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "👋 Hi! I'm your AI CFO assistant. I can help you analyze your financial data, answer questions about your reports, and provide insights. You can type or use voice! What would you like to know?",
      timestamp: new Date()
    }
  ])
  const [inputMessage, setInputMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [autoSpeak, setAutoSpeak] = useState(true)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([])
  const [selectedVoice, setSelectedVoice] = useState<string>('')
  const [showVoiceMenu, setShowVoiceMenu] = useState(false)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<any>(null)
  const synthRef = useRef<SpeechSynthesis | null>(null)

  // Load available voices
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis
      
      const loadVoices = () => {
        const voices = synthRef.current?.getVoices() || []
        console.log('📢 Available voices:', voices.length)
        setAvailableVoices(voices)
        
        // Auto-select best voice only if none selected
        if (!selectedVoice && voices.length > 0) {
          const preferredVoice = voices.find(v => 
            v.name.includes('Samantha') || 
            v.name.includes('Karen') ||
            v.name.includes('Google US English')
          ) || voices[0]
          console.log('🎯 Auto-selecting voice:', preferredVoice.name)
          setSelectedVoice(preferredVoice.name)
        }
      }
      
      // Load voices immediately
      loadVoices()
      
      // Also listen for voiceschanged event (some browsers need this)
      if (synthRef.current) {
        synthRef.current.addEventListener('voiceschanged', loadVoices)
      }
      
      // Set a timeout fallback in case voices aren't ready
      setTimeout(loadVoices, 100)
      
      return () => {
        if (synthRef.current) {
          synthRef.current.removeEventListener('voiceschanged', loadVoices)
        }
      }
    }
  }, [])

  // Initialize Speech Recognition
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition()
        recognitionRef.current.continuous = false
        recognitionRef.current.interimResults = true
        recognitionRef.current.lang = 'en-US'

        recognitionRef.current.onresult = (event: any) => {
          const transcript = Array.from(event.results)
            .map((result: any) => result[0].transcript)
            .join('')
          
          setInputMessage(transcript)
          
          if (event.results[0].isFinal) {
            setTimeout(() => {
              if (transcript.trim()) {
                handleSendMessage(transcript)
              }
            }, 500)
          }
        }

        recognitionRef.current.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error)
          setIsListening(false)
          if (event.error === 'no-speech') {
            setVoiceError('No speech detected. Try again or type your question.')
          } else if (event.error === 'not-allowed') {
            setVoiceError('Microphone access denied. You can still type.')
          } else {
            setVoiceError('Voice error. You can still type your question.')
          }
          setTimeout(() => setVoiceError(null), 4000)
        }

        recognitionRef.current.onend = () => {
          setIsListening(false)
        }
      }
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
      if (synthRef.current) {
        synthRef.current.cancel()
      }
    }
  }, [])

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

  const toggleListening = () => {
    if (!recognitionRef.current) {
      setVoiceError('Voice not available in this browser. You can still type!')
      setTimeout(() => setVoiceError(null), 3000)
      return
    }

    if (isListening) {
      recognitionRef.current.stop()
      setIsListening(false)
    } else {
      setVoiceError(null)
      setInputMessage('')
      try {
        recognitionRef.current.start()
        setIsListening(true)
      } catch (err) {
        console.error('Failed to start recognition:', err)
        setVoiceError('Could not start voice. Try typing instead.')
        setTimeout(() => setVoiceError(null), 3000)
      }
    }
  }

  const speakResponse = (text: string) => {
    if (!autoSpeak) {
      console.log('🔇 Voice muted - not speaking')
      return
    }
    
    if (!synthRef.current) {
      console.warn('⚠️ Speech synthesis not available')
      return
    }

    synthRef.current.cancel()

    const cleanText = text
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/👋/g, '')
      .replace(/\[.*?\]\(.*?\)/g, '')
      .replace(/#+\s/g, '')
      .replace(/•/g, '')
      .replace(/\$/g, 'dollars ')
      .trim()

    const utterance = new SpeechSynthesisUtterance(cleanText)
    utterance.rate = 1.0
    utterance.pitch = 1.0
    utterance.volume = 1.0

    // Use selected voice - get fresh voices list to ensure it's up to date
    const voices = synthRef.current.getVoices()
    let voice = voices.find(v => v.name === selectedVoice)
    
    // Fallback: if selected voice not found, use a default
    if (!voice && voices.length > 0) {
      voice = voices.find(v => 
        v.name.includes('Samantha') || 
        v.name.includes('Google US English') ||
        v.name.includes('Karen')
      ) || voices[0]
      console.warn('⚠️ Selected voice not found, using fallback:', voice.name)
    }
    
    if (voice) {
      utterance.voice = voice
      console.log('🔊 Using voice:', voice.name)
    } else {
      console.warn('⚠️ No voices available at all!')
    }

    utterance.onstart = () => setIsSpeaking(true)
    utterance.onend = () => setIsSpeaking(false)
    utterance.onerror = () => setIsSpeaking(false)

    synthRef.current.speak(utterance)
  }

  const stopSpeaking = () => {
    if (synthRef.current) {
      synthRef.current.cancel()
      setIsSpeaking(false)
    }
  }

  const handleSendMessage = async (text?: string) => {
    const messageText = text || inputMessage
    if (!messageText.trim() || isLoading) return

    stopSpeaking()
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop()
    }

    const userMessage: Message = {
      role: 'user',
      content: messageText,
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
          message: messageText,
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
      speakResponse(assistantMessage.content)

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
    "What's my revenue this year?",
    "Show outstanding receivables",
    "What are my biggest expenses?",
    "Summarize my cash position"
  ]

  const handleQuickAction = (action: string) => {
    setInputMessage(action)
    setTimeout(() => handleSendMessage(), 100)
  }

  // Get voice display name with flag emoji
  const getVoiceDisplay = (voice: SpeechSynthesisVoice) => {
    const name = voice.name
    const lang = voice.lang
    
    // Add flag emojis based on language
    if (lang.includes('en-US')) return `🇺🇸 ${name}`
    if (lang.includes('en-GB')) return `🇬🇧 ${name}`
    if (lang.includes('en-AU')) return `🇦🇺 ${name}`
    if (lang.includes('en-IE')) return `🇮🇪 ${name}`
    if (lang.includes('en-ZA')) return `🇿🇦 ${name}`
    if (lang.includes('fr')) return `🇫🇷 ${name}`
    if (lang.includes('es')) return `🇪🇸 ${name}`
    if (lang.includes('de')) return `🇩🇪 ${name}`
    
    return name
  }

  return (
    <>
      {children}

      {/* Super Admin Payroll Submission Button - Bottom Left */}
      {userRole === 'super_admin' && (
        <a
          href="/payroll/submit-all"
          style={{
            position: 'fixed',
            bottom: '24px',
            left: '24px',
            padding: '16px 24px',
            borderRadius: '12px',
            background: `linear-gradient(135deg, ${BRAND_COLORS.success} 0%, #1E8449 100%)`,
            border: 'none',
            boxShadow: '0 8px 24px rgba(39, 174, 96, 0.4)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            zIndex: 999,
            transition: 'all 0.3s ease',
            textDecoration: 'none',
            color: 'white',
            fontWeight: '600',
            fontSize: '14px'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)'
            e.currentTarget.style.boxShadow = '0 12px 32px rgba(39, 174, 96, 0.6)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = '0 8px 24px rgba(39, 174, 96, 0.4)'
          }}
        >
          <DollarSign size={20} />
          <span>Submit Payroll</span>
        </a>
      )}

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
                  {isListening ? '🎤 Listening...' : isSpeaking ? '🔊 Speaking...' : 'Type or speak your question'}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setShowVoiceMenu(!showVoiceMenu)}
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  color: 'white',
                  fontSize: '12px'
                }}
                title="Change voice"
              >
                🎭 Voice
              </button>
              <button
                onClick={() => {
                  const newState = !autoSpeak
                  setAutoSpeak(newState)
                  console.log('🔊 Voice toggle:', newState ? 'ENABLED' : 'MUTED')
                  // If turning off, stop any current speech
                  if (!newState) {
                    console.log('🛑 Stopping current speech')
                    stopSpeaking()
                  }
                }}
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
                title={autoSpeak ? 'Click to mute AI voice responses' : 'Click to enable AI voice responses'}
              >
                {autoSpeak ? <Volume2 size={18} color="white" /> : <VolumeX size={18} color="white" />}
              </button>
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
          </div>

          {/* Voice Selection Menu */}
          {showVoiceMenu && (
            <div style={{
              padding: '16px 20px',
              background: BRAND_COLORS.gray[50],
              borderBottom: `1px solid ${BRAND_COLORS.gray[200]}`,
              maxHeight: '200px',
              overflowY: 'auto'
            }}>
              <p style={{
                margin: '0 0 12px 0',
                fontSize: '13px',
                fontWeight: '600',
                color: BRAND_COLORS.gray[700]
              }}>
                Select Voice:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {availableVoices.map((voice) => (
                  <button
                    key={voice.name}
                    onClick={() => {
                      console.log('🎭 Voice selected:', voice.name)
                      setSelectedVoice(voice.name)
                      setShowVoiceMenu(false)
                      
                      // Test the voice
                      if (synthRef.current) {
                        synthRef.current.cancel()
                        const test = new SpeechSynthesisUtterance("Hello, I'm your AI CFO assistant.")
                        test.voice = voice
                        test.rate = 1.0
                        console.log('🎤 Testing voice:', voice.name)
                        synthRef.current.speak(test)
                      }
                    }}
                    style={{
                      padding: '10px 14px',
                      background: selectedVoice === voice.name ? BRAND_COLORS.primary : 'white',
                      border: `1px solid ${selectedVoice === voice.name ? BRAND_COLORS.primary : BRAND_COLORS.gray[300]}`,
                      borderRadius: '8px',
                      fontSize: '13px',
                      color: selectedVoice === voice.name ? 'white' : BRAND_COLORS.gray[700],
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {getVoiceDisplay(voice)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Voice Error Banner */}
          {voiceError && (
            <div style={{
              padding: '12px 20px',
              background: '#FEF3C7',
              borderBottom: '1px solid #FCD34D',
              fontSize: '13px',
              color: '#92400E'
            }}>
              {voiceError}
            </div>
          )}

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
                placeholder={isListening ? "Listening..." : "Type or speak your question..."}
                disabled={isLoading || isListening}
                style={{
                  flex: 1,
                  padding: '14px 16px',
                  border: `2px solid ${BRAND_COLORS.gray[200]}`,
                  borderRadius: '12px',
                  fontSize: '15px',
                  outline: 'none',
                  transition: 'all 0.2s ease',
                  background: isListening ? BRAND_COLORS.gray[50] : 'white'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = BRAND_COLORS.primary
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = BRAND_COLORS.gray[200]
                }}
              />
              <button
                onClick={toggleListening}
                disabled={isLoading}
                style={{
                  background: isListening 
                    ? 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)'
                    : 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)',
                  border: 'none',
                  borderRadius: '12px',
                  width: '48px',
                  height: '48px',
                  minWidth: '48px',
                  minHeight: '48px',
                  maxWidth: '48px',
                  maxHeight: '48px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  transition: 'background 0.2s ease',
                  flexShrink: 0,
                  position: 'relative',
                  boxShadow: isListening ? '0 0 0 4px rgba(239, 68, 68, 0.3)' : '0 2px 4px rgba(0,0,0,0.1)'
                }}
                title={isListening ? 'Stop listening' : 'Start voice input'}
              >
                {isListening ? <MicOff size={20} color="white" /> : <Mic size={20} color="white" />}
              </button>
              <button
                onClick={() => handleSendMessage()}
                disabled={!inputMessage.trim() || isLoading}
                style={{
                  background: inputMessage.trim() && !isLoading
                    ? `linear-gradient(135deg, ${BRAND_COLORS.primary} 0%, ${BRAND_COLORS.secondary} 100%)`
                    : BRAND_COLORS.gray[300],
                  border: 'none',
                  borderRadius: '12px',
                  width: '48px',
                  height: '48px',
                  minWidth: '48px',
                  minHeight: '48px',
                  maxWidth: '48px',
                  maxHeight: '48px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: inputMessage.trim() && !isLoading ? 'pointer' : 'not-allowed',
                  transition: 'background 0.2s ease',
                  flexShrink: 0
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
