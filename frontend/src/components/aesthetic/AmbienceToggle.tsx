'use client'

import { useRef } from 'react'
import type { Ambience } from '../../audio/useAmbience'

/**
 * The room's tanpura: on by default, one tap to silence, and remembered.
 * As quiet in the header as it is in the speakers.
 */
export function AmbienceToggle({ ambience }: { ambience: Ambience }) {
  const { enabled, audible, waiting, toggle } = ambience
  // While the browser is holding sound, a tap on this button is the tap it
  // wants — the page-wide listener has already let the room in — so that same
  // tap must not also switch the ambience off.
  const unlockingRef = useRef(false)
  const arm = () => {
    unlockingRef.current = waiting
  }

  const hint = !enabled
    ? 'Let a soft tanpura fill the room while nothing else is playing'
    : waiting
    ? 'Your browser holds sound until you tap — tap anywhere to hear the room'
    : 'A soft tanpura fills the room while nothing else plays. Tap to silence it.'

  return (
    <button
      type="button"
      className={[
        'ambience-toggle',
        !enabled && 'ambience-toggle--off',
        audible && 'ambience-toggle--sounding',
        waiting && 'ambience-toggle--waiting',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-pressed={enabled}
      title={hint}
      onPointerDown={arm}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') arm()
      }}
      onClick={() => {
        if (unlockingRef.current) {
          unlockingRef.current = false
          return
        }
        toggle()
      }}
    >
      <span className="ambience-bars" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span>Ambience</span>
    </button>
  )
}

export default AmbienceToggle
