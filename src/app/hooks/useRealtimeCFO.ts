'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export function useRealtimeCFO() {
  const maxSessionMs = 5 * 60 * 1000
  const idleTimeoutMs = 30 * 1000

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const dcRef = useRef<RTCDataChannel | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioElRef = useRef<HTMLAudioElement | null>(null)

  const sessionTimer = useRef<NodeJS.Timeout | null>(null)
  const idleTimer = useRef<NodeJS.Timeout | null>(null)
  const countdownTimer = useRef<NodeJS.Timeout | null>(null)
  const sessionEnd = useRef<number>(0)

  const [connected, setConnected] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(Math.floor(maxSessionMs / 1000))
  const [response, setResponse] = useState('')

  const clearResponse = useCallback(() => setResponse(''), [])

  const stop = useCallback(() => {
    if (countdownTimer.current) clearInterval(countdownTimer.current)
    if (sessionTimer.current) clearTimeout(sessionTimer.current)
    if (idleTimer.current) clearTimeout(idleTimer.current)
    mediaStreamRef.current?.getTracks().forEach(t => t.stop())
    dcRef.current?.close()
    pcRef.current?.close()
    pcRef.current = null
    dcRef.current = null
    mediaStreamRef.current = null
    setConnected(false)
    setSpeaking(false)
    setSecondsLeft(Math.floor(maxSessionMs / 1000))
  }, [maxSessionMs])

  const resetIdle = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => {
      try {
        dcRef.current?.send(
          JSON.stringify({
            type: 'response.create',
            instructions: "I'll be here when you need me",
          })
        )
      } catch {}
      stop()
    }, idleTimeoutMs)
  }, [idleTimeoutMs, stop])

  const start = useCallback(async () => {
    if (connected) return
    try {
      const sessionRes = await fetch('/api/realtime', { method: 'POST' })
      if (!sessionRes.ok) throw new Error('Failed to create session')
      const session = await sessionRes.json()
      const token = session?.client_secret?.value
      if (!token) throw new Error('Missing client token')

      setResponse('')

      const pc = new RTCPeerConnection()
      pcRef.current = pc

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(track => pc.addTrack(track, stream))
      mediaStreamRef.current = stream

      const audioEl = new Audio()
      audioEl.autoplay = true
      audioElRef.current = audioEl
      pc.ontrack = ev => {
        audioEl.srcObject = ev.streams[0]
      }

      const dc = pc.createDataChannel('oai-events')
      dcRef.current = dc
      dc.onopen = () => {
        setConnected(true)
        resetIdle()
      }
      dc.onclose = stop
      dc.onmessage = async e => {
        resetIdle()
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'response.output_audio.delta') {
            setSpeaking(true)
          } else if (msg.type === 'response.completed') {
            setSpeaking(false)
          } else if (msg.type === 'response.output_text.delta') {
            const delta = (msg.delta as string) || ''
            setResponse(prev => prev + delta)
          } else if (msg.type === 'response.function_call') {
            const { name, id: tool_call_id, arguments: argStr } = msg
            let parsed: Record<string, unknown> = {}
            try {
              parsed = argStr ? JSON.parse(argStr) : {}
            } catch {}
            let result: unknown
            try {
              const res = await fetch(`/api/tools/${name}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(parsed),
              })
              result = await res.json()
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Request failed'
              result = { success: false, error: message }
            }
            dc.send(
              JSON.stringify({
                type: 'tool_output.create',
                tool_output: { tool_call_id, output: JSON.stringify(result) },
              })
            )
            dc.send(JSON.stringify({ type: 'response.create' }))
          }
        } catch {}
      }

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      const sdpRes = await fetch(
        'https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17',
        {
          method: 'POST',
          body: offer.sdp || '',
          headers: {
            'Content-Type': 'application/sdp',
            Authorization: `Bearer ${token}`,
          },
        }
      )
      const answer = { type: 'answer', sdp: await sdpRes.text() }
      await pc.setRemoteDescription(answer as RTCSessionDescriptionInit)

      sessionEnd.current = Date.now() + maxSessionMs
      setSecondsLeft(Math.floor(maxSessionMs / 1000))
      sessionTimer.current = setTimeout(() => stop(), maxSessionMs)
      countdownTimer.current = setInterval(() => {
        const left = sessionEnd.current - Date.now()
        setSecondsLeft(Math.max(0, Math.floor(left / 1000)))
      }, 1000)
      resetIdle()
    } catch (err) {
      console.error('realtime start failed', err)
      stop()
      throw err
    }
  }, [connected, maxSessionMs, resetIdle, stop])

  useEffect(() => {
    return () => stop()
  }, [stop])

  return { start, stop, connected, speaking, secondsLeft, response, clearResponse }
}
