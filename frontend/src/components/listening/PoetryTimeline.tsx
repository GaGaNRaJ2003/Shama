'use client'

import { useRef } from 'react'

export interface TimelineMarker {
  id: string
  label: string
  t: number
}

interface PoetryTimelineProps {
  currentTime: number
  duration: number
  /** Sher boundaries. Only ever passed real timing data — never invented (§22). */
  markers: TimelineMarker[]
  onSeek: (seconds: number) => void
  formatTime: (seconds: number) => string
  /** Label for the section the singer is in, when timing data makes it knowable. */
  sectionLabel?: string | null
  /** Shows progress but won't seek: a jam guest follows the host. */
  readOnly?: boolean
}

/**
 * A poetry-aware progress line: the same scrubber as before, but when the
 * recording has couplet timings it also carries faint sher boundaries (§14).
 * With no timings it degrades silently to a plain progress line.
 */
export function PoetryTimeline({
  currentTime,
  duration,
  markers,
  onSeek,
  formatTime,
  sectionLabel,
  readOnly,
}: PoetryTimelineProps) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const pct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0
  const seekable = duration > 0 && !readOnly

  const seekFromClientX = (clientX: number) => {
    const el = trackRef.current
    if (!el || !seekable) return
    const rect = el.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    onSeek(ratio * duration)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!seekable) return
    const step = e.shiftKey ? 30 : 5
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault()
      onSeek(Math.min(duration, currentTime + step))
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      onSeek(Math.max(0, currentTime - step))
    } else if (e.key === 'Home') {
      e.preventDefault()
      onSeek(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      onSeek(duration)
    }
  }

  return (
    <div>
      <div
        ref={trackRef}
        className="timeline"
        role="slider"
        tabIndex={0}
        aria-label="Seek within the recording"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration) || 0}
        aria-valuenow={Math.round(currentTime) || 0}
        aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
        aria-disabled={!seekable}
        onClick={(e) => seekFromClientX(e.clientX)}
        onKeyDown={onKeyDown}
      >
        <div className="timeline-track">
          <div className="timeline-fill" style={{ width: `${pct}%` }} />
          {duration > 0 &&
            markers.map((m) => {
              const left = (m.t / duration) * 100
              if (left < 0 || left > 100) return null
              return (
                <span
                  key={m.id}
                  className={`timeline-tick ${m.t <= currentTime ? 'timeline-tick--passed' : ''}`}
                  style={{ left: `${left}%` }}
                  aria-hidden="true"
                />
              )
            })}
          <span className="timeline-head" style={{ left: `${pct}%` }} aria-hidden="true" />
        </div>
      </div>
      <div className="timeline-labels">
        <span>{sectionLabel || ' '}</span>
        <span>
          {formatTime(currentTime)} &nbsp;·&nbsp; {formatTime(duration)}
        </span>
      </div>
    </div>
  )
}

export default PoetryTimeline
