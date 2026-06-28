import { useEffect, useRef } from 'react'

export function LiquidLogoMark() {
  const turbRef = useRef<SVGFETurbulenceElement>(null)

  useEffect(() => {
    let animationFrameId: number
    const start = Date.now()

    const animate = () => {
      const elapsed = (Date.now() - start) / 1000
      // Animate baseFrequency coordinates dynamically to warp the metallic gradient organically
      if (turbRef.current) {
        const valX = 0.015 + Math.sin(elapsed * 0.45) * 0.005
        const valY = 0.03 + Math.cos(elapsed * 0.35) * 0.008
        turbRef.current.setAttribute('baseFrequency', `${valX} ${valY}`)
      }
      animationFrameId = requestAnimationFrame(animate)
    }

    animate()
    return () => {
      cancelAnimationFrame(animationFrameId)
    }
  }, [])

  return (
    <div className="liquid-logo" aria-label="Shama">
      {/* SVG Liquid Distortion Filter */}
      <svg 
        className="liquid-logo__svg" 
        viewBox="0 0 100 100" 
        style={{ width: '100%', height: '100%', display: 'block' }}
      >
        <defs>
          <filter id="liquid-logo-distortion" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence
              ref={turbRef}
              type="fractalNoise"
              baseFrequency="0.02 0.04"
              numOctaves="2"
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="14"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
          
          <linearGradient id="liquid-logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#d98a5b" /> {/* copper */}
            <stop offset="50%" stopColor="#e6b875" /> {/* brass */}
            <stop offset="100%" stopColor="#0d0b0a" /> {/* dark bronze */}
          </linearGradient>
        </defs>

        {/* Warped base rect forming the fluid metallic gradient */}
        <rect
          x="0"
          y="0"
          width="100"
          height="100"
          fill="url(#liquid-logo-gradient)"
          filter="url(#liquid-logo-distortion)"
        />
      </svg>
      <span className="liquid-logo__letter">S</span>
    </div>
  )
}
export default LiquidLogoMark
