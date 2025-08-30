'use client'

import { useRealtimeCFO } from '../hooks/useRealtimeCFO'

export default function VoiceCFO() {
  const { start, stop, connected, speaking, secondsLeft } = useRealtimeCFO()

  const handleClick = async () => {
    try {
      if (connected) stop()
      else await start()
    } catch (e) {
      console.error(e)
    }
  }

  const countdownClass = secondsLeft < 60 ? 'text-red-500' : 'text-muted-foreground'
  const status = connected ? (speaking ? 'assistant speaking' : 'connected') : 'disconnected'

  return (
    <div className="flex flex-col items-center space-y-2 p-4 border rounded-md w-full max-w-xs text-center">
      <button
        onClick={handleClick}
        aria-pressed={connected}
        className={`px-6 py-3 rounded-full text-white focus:outline-none focus:ring-2 focus:ring-offset-2 ${
          connected ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
        }`}
      >
        {connected ? 'Stop' : 'Start'}
      </button>
      <div className={`text-sm ${countdownClass}`}>
        {connected ? `${status} • ${secondsLeft}s` : 'tap to begin'}
      </div>
    </div>
  )
}
