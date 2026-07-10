import { useState, useEffect } from 'react'
import { SpiralAnimation } from '@/components/ui/spiral-animation'

export function SpiralDemo({ onEnter }) {
  const [startVisible, setStartVisible] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setStartVisible(true), 2000)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div style={{
      position: 'fixed', inset: 0, width: '100%', height: '100%',
      overflow: 'hidden', background: '#000', zIndex: 9999
    }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        <SpiralAnimation />
      </div>

      <div style={{
        position: 'absolute', left: '50%', top: '50%',
        transform: 'translate(-50%, -50%)', zIndex: 10,
        opacity: startVisible ? 1 : 0,
        transition: 'opacity 1.5s ease-out, transform 1.5s ease-out'
      }}>
        <button
          onClick={onEnter}
          style={{
            color: '#fff', fontSize: 24, letterSpacing: '0.2em',
            textTransform: 'uppercase', fontWeight: 200,
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'Orbitron, sans-serif',
            animation: startVisible ? 'spiral-pulse 2s ease-in-out infinite' : 'none'
          }}
        >
          ENTER
        </button>
      </div>
    </div>
  )
}
