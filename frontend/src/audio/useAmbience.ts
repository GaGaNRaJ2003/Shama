'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AmbientEngine, type AmbientState } from './ambientEngine'

const PREF_KEY = 'shama.ambience'
/** After music or narration ends, the room takes a breath before it hums again. */
const RETURN_DELAY_MS = 2500

function readPref(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== 'off'
  } catch {
    return true
  }
}

function writePref(on: boolean) {
  try {
    localStorage.setItem(PREF_KEY, on ? 'on' : 'off')
  } catch {
    /* private mode — the choice just won't be remembered */
  }
}

export interface Ambience {
  /** The listener's choice: on by default, and remembered. */
  enabled: boolean
  /** Actually sounding right now. */
  audible: boolean
  /** Wanted, but the browser is holding all sound until the first tap. */
  waiting: boolean
  toggle: () => void
}

/**
 * The room's tanpura. It starts the moment the browser allows — on arrival
 * where autoplay is permitted, otherwise on the listener's first tap or key —
 * and gives way to anything else that makes sound.
 *
 * @param ducked true while a recording, the archive audio or narration has the room
 */
export function useAmbience(ducked: boolean): Ambience {
  const engineRef = useRef<AmbientEngine | null>(null)
  const [enabled, setEnabled] = useState<boolean>(readPref)
  const [state, setState] = useState<AmbientState>('suspended')
  // Once the room has sounded, later silences are ours (ducking, a hidden tab),
  // never the browser's — so "waiting for a tap" can only mean the first one.
  const [everRan, setEverRan] = useState(false)
  const [hidden, setHidden] = useState<boolean>(() => typeof document !== 'undefined' && document.hidden)
  const heldRef = useRef(false)
  const liveRef = useRef({ enabled, ducked, hidden })
  liveRef.current = { enabled, ducked, hidden }

  useEffect(() => {
    const engine = new AmbientEngine((s) => {
      setState(s)
      if (s === 'running') setEverRan(true)
    })
    engineRef.current = engine
    return () => {
      engine.dispose()
      engineRef.current = null
    }
  }, [])

  useEffect(() => {
    const unlock = () => engineRef.current?.unlock()
    const onVisibility = () => setHidden(document.hidden)
    const opts = { capture: true, passive: true }
    window.addEventListener('pointerdown', unlock, opts)
    window.addEventListener('keydown', unlock, opts)
    window.addEventListener('touchend', unlock, opts)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pointerdown', unlock, opts)
      window.removeEventListener('keydown', unlock, opts)
      window.removeEventListener('touchend', unlock, opts)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  const wanted = enabled && !ducked && !hidden

  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    if (!wanted) {
      if (ducked) heldRef.current = true
      engine.stop(ducked ? 1.2 : 0.6)
      return
    }
    // Between tracks the player reports "paused" for a moment; waiting a
    // breath keeps the tanpura from blinking in and out of every gap.
    if (heldRef.current) {
      heldRef.current = false
      const id = setTimeout(() => engine.play(5), RETURN_DELAY_MS)
      return () => clearTimeout(id)
    }
    engine.play(3.5)
  }, [wanted, ducked])

  const toggle = useCallback(() => {
    const next = !liveRef.current.enabled
    writePref(next)
    setEnabled(next)
    // Start from inside the click itself: some browsers only let audio begin
    // in a gesture's own call stack.
    const { ducked: busy, hidden: away } = liveRef.current
    if (next && !busy && !away) engineRef.current?.play(2.5)
  }, [])

  return {
    enabled,
    audible: wanted && state === 'running',
    waiting: wanted && !everRan,
    toggle,
  }
}
