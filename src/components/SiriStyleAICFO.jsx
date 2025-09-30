'use client'

import { useState, useRef, useEffect } from 'react'
import { Mic, MicOff, Bot, X } from 'lucide-react'
import Image from 'next/image'

const SiriStyleAICFO = () => {
  const [isListening, setIsListening] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [response, setResponse] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [recognition, setRecognition] = useState(null)
  const [holdTimer, setHoldTimer] = useState(null)
  const [isHolding, setIsHolding] = useState(false)
  
  const buttonRef = useRef(null)
  const holdStartTime = useRef(null)

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition
      const recognitionInstance = new SpeechRecognition()
      
      recognitionInstance.continuous = true
      recognitionInstance.interimResults = true
      recognitionInstance.lang = 'en-US'
      
      recognitionInstance.onresult = (event) => {
        let finalTranscript = ''
        let interimTranscript = ''
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript
          if (event.results[i].isFinal) {
            finalTranscript += transcript
          } else {
            interimTranscript += transcript
          }
        }
        
        setTranscript(finalTranscript || interimTranscript)
      }
      
      recognitionInstance.onerror = (event) => {
        console.error('Speech recognition error:', event.error)
        stopListening()
      }
      
      recognitionInstance.onend = () => {
        if (transcript && !isProcessing) {
          processVoiceQuery(transcript)
        }
        setIsListening(false)
      }
      
      setRecognition(recognitionInstance)
    }
  }, [])

  // Handle hold start (like Siri side button)
  const handleHoldStart = (e) => {
    e.preventDefault()
    holdStartTime.current = Date.now()
    setIsHolding(true)
    
    // Haptic feedback if available
    if (navigator.vibrate) {
      navigator.vibrate(50)
    }
    
    // Start listening after brief hold (250ms)
    const timer = setTimeout(() => {
      if (isHolding) {
        startListening()
      }
    }, 250)
    
    setHoldTimer(timer)
  }

  // Handle hold end
  const handleHoldEnd = (e) => {
    e.preventDefault()
    setIsHolding(false)
    
    if (holdTimer) {
      clearTimeout(holdTimer)
      setHoldTimer(null)
    }
    
    const holdDuration = Date.now() - (holdStartTime.current || 0)
    
    // If held for less than 250ms, treat as regular tap
    if (holdDuration < 250) {
      handleQuickTap()
    } else {
      // Stop listening and process
      stopListening()
    }
  }

  // Handle quick tap (toggle modal)
  const handleQuickTap = () => {
    if (!showModal) {
      setShowModal(true)
    } else {
      setShowModal(false)
      setTranscript('')
      setResponse('')
    }
  }

  // Start voice recognition
  const startListening = () => {
    if (recognition && !isListening) {
      setIsListening(true)
      setShowModal(true)
      setTranscript('')
      setResponse('')
      recognition.start()
    }
  }

  // Stop voice recognition
  const stopListening = () => {
    if (recognition && isListening) {
      recognition.stop()
      setIsListening(false)
    }
  }

  // Process voice query
  const processVoiceQuery = async (query) => {
    if (!query.trim()) return
    
    setIsProcessing(true)
    
    try {
      const response = await fetch('/api/ai-chat-mobile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: query,
          userId: 'current-user-id' // Replace with actual user ID
        })
      })

      if (!response.ok) {
        throw new Error('AI request failed')
      }

      const data = await response.json()
      setResponse(data.response)
      
      // Optional: Text-to-speech response
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(data.response)
        utterance.rate = 0.9
        utterance.pitch = 1
        speechSynthesis.speak(utterance)
      }

    } catch (error) {
      console.error('AI query error:', error)
      setResponse("I'm having trouble processing that request. Please try again.")
    } finally {
      setIsProcessing(false)
    }
  }

  // Close modal
  const closeModal = () => {
    setShowModal(false)
    setTranscript('')
    setResponse('')
    stopListening()
  }

  return (
    <>
      {/* Floating AI Button (Siri-style) */}
      <button
        ref={buttonRef}
        className={`fixed bottom-6 right-6 w-16 h-16 rounded-full shadow-2xl flex items-center justify-center z-50 transition-colors duration-200 ${
          isHolding
            ? 'bg-red-500 shadow-red-500/50 ring-4 ring-red-300/60'
            : isListening
              ? 'bg-blue-600 animate-pulse'
              : 'bg-gradient-to-r from-blue-500 to-blue-600'
        }`}
        onMouseDown={handleHoldStart}
        onMouseUp={handleHoldEnd}
        onTouchStart={handleHoldStart}
        onTouchEnd={handleHoldEnd}
        onMouseLeave={handleHoldEnd} // Handle mouse leave
        style={{
          background: isHolding 
            ? 'linear-gradient(45deg, #ef4444, #dc2626)' 
            : isListening 
              ? 'linear-gradient(45deg, #3b82f6, #1d4ed8)'
              : 'linear-gradient(45deg, #56B6E9, #3A9BD1)'
        }}
      >
        {isListening ? (
          <div className="flex items-center space-x-1">
            <div className="w-1 h-4 bg-white rounded-full animate-bounce"></div>
            <div className="w-1 h-6 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
            <div className="w-1 h-4 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
          </div>
        ) : (
          <Bot className="w-8 h-8 text-white" />
        )}
      </button>

      {/* Siri-style Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm mx-auto shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full flex items-center justify-center">
                  <Bot className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">AI CFO</h3>
                  <p className="text-sm text-gray-500">
                    {isListening ? 'Listening...' : isProcessing ? 'Thinking...' : 'Tap and hold to speak'}
                  </p>
                </div>
              </div>
              <button
                onClick={closeModal}
                className="p-2 rounded-full hover:bg-gray-100"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              {/* Voice Waveform Visual */}
              {isListening && (
                <div className="flex items-center justify-center mb-6">
                  <div className="flex items-center space-x-1">
                    {[...Array(5)].map((_, i) => (
                      <div
                        key={i}
                        className="w-1 bg-blue-500 rounded-full animate-pulse"
                        style={{
                          height: `${20 + Math.random() * 30}px`,
                          animationDelay: `${i * 0.1}s`,
                          animationDuration: '0.5s'
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Transcript */}
              {transcript && (
                <div className="mb-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">You said:</p>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-gray-800">{transcript}</p>
                  </div>
                </div>
              )}

              {/* AI Response */}
              {response && (
                <div className="mb-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">AI CFO says:</p>
                  <div className="bg-blue-50 rounded-lg p-3 border-l-4 border-blue-500">
                    <p className="text-gray-800">{response}</p>
                  </div>
                </div>
              )}

              {/* Processing */}
              {isProcessing && (
                <div className="flex items-center justify-center mb-4">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                </div>
              )}

              {/* Instructions */}
              {!transcript && !response && !isListening && !isProcessing && (
                <div className="text-center">
                  <div className="mb-4">
                    <Image
                      src="/iamcfo-logo.jpg"
                      alt="I AM CFO"
                      width={120}
                      height={48}
                      className="mx-auto object-contain"
                    />
                  </div>
                  <p className="text-gray-600 text-sm mb-4">
                    Hold the button and ask about your financial data
                  </p>
                  <div className="space-y-2 text-xs text-gray-500">
                    <p>"What's my revenue this month?"</p>
                    <p>"Which property makes the most money?"</p>
                    <p>"Show me my A/R aging"</p>
                  </div>
                </div>
              )}
            </div>

            {/* Action Button */}
            <div className="p-6 border-t border-gray-100">
              <button
                onMouseDown={handleHoldStart}
                onMouseUp={handleHoldEnd}
                onTouchStart={handleHoldStart}
                onTouchEnd={handleHoldEnd}
                className={`w-full h-12 rounded-xl flex items-center justify-center transition-colors duration-200 ${
                  isHolding
                    ? 'bg-red-500'
                    : isListening
                      ? 'bg-blue-600'
                      : 'bg-gradient-to-r from-blue-500 to-blue-600'
                }`}
                disabled={isProcessing}
              >
                {isListening ? (
                  <MicOff className="w-6 h-6 text-white" />
                ) : (
                  <Mic className="w-6 h-6 text-white" />
                )}
              </button>
              <p className="text-center text-xs text-gray-500 mt-2">
                {isListening ? 'Release to send' : 'Hold to speak'}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default SiriStyleAICFO
