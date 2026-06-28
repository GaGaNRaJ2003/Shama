import type { PropsWithChildren } from 'react'

type LiquidGlassPanelProps = PropsWithChildren<{
  className?: string
  intensity?: 'soft' | 'strong'
}>

export function LiquidGlassPanel({
  children,
  className = '',
  intensity = 'soft',
}: LiquidGlassPanelProps) {
  return (
    <div className={`liquid-glass liquid-glass--${intensity} ${className}`}>
      <span className="liquid-glass__shine" aria-hidden="true" />
      {children}
    </div>
  )
}
