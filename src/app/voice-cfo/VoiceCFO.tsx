'use client'

import { useRealtimeCFO } from '../hooks/useRealtimeCFO'

export default function VoiceCFO() {
  const { start, stop, connected, speaking, secondsLeft, response, clearResponse } = useRealtimeCFO()

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
    <div className="fixed bottom-4 inset-x-4 flex flex-col items-center space-y-2">
      {response && (
        <div
          className="w-full max-h-60 overflow-y-auto border rounded-md p-3 bg-white text-left shadow relative"
          role="region"
          aria-label="Assistant response"
        >
          <button
            onClick={clearResponse}
            className="absolute top-1 right-2 text-sm text-gray-500 hover:text-gray-700"
            aria-label="Close response"
          >
            ×
          </button>
          <div className="pr-4 whitespace-pre-wrap break-words">{response}</div>
        </div>
      )}
      <div className="flex flex-col items-center space-y-2 p-4 border rounded-md w-full max-w-xs text-center bg-white">
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
    </div>
  )
}
