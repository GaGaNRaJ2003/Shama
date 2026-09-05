'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Mehfil Jam client.
 *
 * The host broadcasts what is playing and where; guests follow. Each browser
 * plays its own YouTube stream, so "sync" means agreeing on a videoId and a
 * position — never streaming audio between peers.
 *
 * Drift is corrected against the SERVER's clock, not the host's: browsers
 * disagree about the time by seconds, which would otherwise be indistinguishable
 * from real playback drift.
 */

export interface JamState {
  videoId: string | null
  positionMs: number
  paused: boolean
  title: string
  artist: string
  durationSeconds: number
  updatedAt: number
  queue: { title: string; artist: string }[]
}

export type JamRole = 'host' | 'guest' | null

/** Seek rather than wait it out beyond this; below it, let playback catch up. */
const DRIFT_TOLERANCE_MS = 1500
const HEARTBEAT_MS = 2000

export interface JamHandle {
  role: JamRole
  token: string | null
  listeners: number
  connected: boolean
  /** Guest-only: the state we should be matching right now. */
  remote: JamState | null
  start: () => Promise<string | null>
  join: (token: string) => void
  leave: () => void
  /** Host-only: publish the current transport. No-op for guests. */
  publish: (state: Omit<JamState, 'updatedAt'>) => void
  shareUrl: string | null
  /** True while the guest has not yet clicked to allow audio. */
  needsGesture: boolean
  acknowledgeGesture: () => void
  /** Where the host is right now, in ms, corrected for clock skew. */
  expectedPositionMs: () => number | null
}

export function useMehfilJam(apiBase: string): JamHandle {
  const [role, setRole] = useState<JamRole>(null)
  const [token, setToken] = useState<string | null>(null)
  const [listeners, setListeners] = useState(0)
  const [connected, setConnected] = useState(false)
  const [remote, setRemote] = useState<JamState | null>(null)
  const [needsGesture, setNeedsGesture] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const hostKeyRef = useRef<string | null>(null)
  // serverNow - Date.now(), so guests can place the host's timestamp on their
  // own timeline without trusting either browser clock.
  const clockSkewRef = useRef(0)
  const lastSentRef = useRef(0)
  // Mirrors `remote` so the position getter always sees the newest state
  // without needing to be re-created on every message.
  const remoteRef = useRef<JamState | null>(null)

  const wsUrl = useCallback(
    (tok: string, hostKey?: string | null) => {
      const base = apiBase.replace(/^http/, 'ws')
      const q = new URLSearchParams({ token: tok })
      if (hostKey) q.set('hostKey', hostKey)
      return `${base}/ws/mehfil?${q.toString()}`
    },
    [apiBase]
  )

  const connect = useCallback(
    (tok: string, asHost: boolean) => {
      wsRef.current?.close()
      const socket = new WebSocket(wsUrl(tok, asHost ? hostKeyRef.current : null))
      wsRef.current = socket

      socket.onopen = () => setConnected(true)
      socket.onclose = () => {
        setConnected(false)
        if (wsRef.current === socket) wsRef.current = null
      }
      socket.onerror = () => setConnected(false)
      socket.onmessage = (event) => {
        let msg: any
        try {
          msg = JSON.parse(event.data)
        } catch {
          return
        }
        if (typeof msg.serverNow === 'number') {
          clockSkewRef.current = msg.serverNow - Date.now()
        }
        if (msg.type === 'welcome') {
          setRole(msg.role)
          setToken(msg.token)
          setListeners(msg.listeners || 1)
          if (msg.role === 'guest') {
            remoteRef.current = msg.state
            setRemote(msg.state)
            // Browsers refuse to start audio without an interaction, so a guest
            // must click once. Surfacing that beats silently not playing.
            setNeedsGesture(true)
          }
        } else if (msg.type === 'state') {
          remoteRef.current = msg.state
          setRemote(msg.state)
        } else if (msg.type === 'presence') {
          setListeners(msg.listeners || 0)
        }
      }
    },
    [wsUrl]
  )

  const start = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch(`${apiBase}/api/mehfil`, { method: 'POST' })
      if (!res.ok) throw new Error(String(res.status))
      const { token: tok, hostKey } = await res.json()
      hostKeyRef.current = hostKey
      setRole('host')
      setToken(tok)
      connect(tok, true)
      return tok
    } catch (err) {
      console.warn('[shama] could not start a mehfil:', err)
      return null
    }
  }, [apiBase, connect])

  const join = useCallback(
    (tok: string) => {
      hostKeyRef.current = null
      setRole('guest')
      setToken(tok)
      connect(tok, false)
    },
    [connect]
  )

  const leave = useCallback(() => {
    wsRef.current?.close()
    wsRef.current = null
    hostKeyRef.current = null
    setRole(null)
    setToken(null)
    remoteRef.current = null
    setRemote(null)
    setListeners(0)
    setConnected(false)
    setNeedsGesture(false)
  }, [])

  const publish = useCallback((state: Omit<JamState, 'updatedAt'>) => {
    const socket = wsRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN || !hostKeyRef.current) return
    socket.send(JSON.stringify({ type: 'state', state }))
    lastSentRef.current = Date.now()
  }, [])

  // Reconnect once if the socket drops while we are still in a mehfil.
  useEffect(() => {
    if (!token || connected) return
    const t = setTimeout(() => {
      if (!wsRef.current && token) connect(token, role === 'host')
    }, 2500)
    return () => clearTimeout(t)
  }, [token, connected, role, connect])

  useEffect(() => () => wsRef.current?.close(), [])

  return {
    role,
    token,
    listeners,
    connected,
    remote,
    start,
    join,
    leave,
    publish,
    shareUrl:
      token && typeof window !== 'undefined'
        ? `${window.location.origin}${window.location.pathname}?mehfil=${token}`
        : null,
    needsGesture,
    acknowledgeGesture: () => setNeedsGesture(false),
    expectedPositionMs: () => {
      const state = remoteRef.current
      if (!state) return null
      if (state.paused) return state.positionMs
      // Place the host's server-stamped position on our own timeline.
      const nowOnServerClock = Date.now() + clockSkewRef.current
      return state.positionMs + Math.max(0, nowOnServerClock - state.updatedAt)
    },
  }
}

export { DRIFT_TOLERANCE_MS, HEARTBEAT_MS }
