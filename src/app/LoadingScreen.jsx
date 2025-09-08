'use client'

const LoadingScreenSpinner = () => {
  const lineCount = 25
  const startColor = [139, 109, 63]
  const endColor = [59, 108, 180]
  const lines = Array.from({ length: lineCount }, (_, i) => {
    const ratio = i / (lineCount - 1)
    const color = startColor.map((c, idx) => Math.round(c + (endColor[idx] - c) * ratio))
    const x = 40 + (i * (400 - 40)) / (lineCount - 1)
    return { x, color: `rgb(${color.join(',')})` }
  })

  return (
    <div className="fixed inset-0 bg-white flex flex-col items-center justify-center z-50">
      <div className="flex flex-col items-center space-y-8">
        {/* Alliance CFO Logo */}
        <div className="relative">
          <svg
            width="440"
            height="176"
            viewBox="0 0 440 176"
            aria-label="Alliance CFO and Advisory logo"
            className="object-contain"
          >
            <polygon points="40,130 220,10 400,130" fill="none" stroke="#3b6cb4" strokeWidth="4" />
            {lines.map(({ x, color }) => (
              <line key={x} x1={x} y1={130} x2={220} y2={10} stroke={color} strokeWidth={2} />
            ))}
            <text
              x={220}
              y={160}
              textAnchor="middle"
              fontSize="24"
              fill="#2b6cbf"
              fontFamily="sans-serif"
            >
              ALLIANCE CFO AND ADVISORY
            </text>
          </svg>
        </div>

        {/* Circular Spinner matching your brand colors */}
        <div className="relative">
          <div className="w-12 h-12 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin"></div>
        </div>

        {/* Loading Text */}
        <div className="text-center">
          <p className="text-gray-700 text-xl font-semibold">ALLIANCE CFO AND ADVISORY</p>
          <p className="text-gray-500 text-sm mt-1">Loading...</p>
        </div>
      </div>
    </div>
  )
}

export default LoadingScreenSpinner
