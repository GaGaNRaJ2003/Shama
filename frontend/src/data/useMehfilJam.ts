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
  /** Guest-only: false while the room has no host connected. */
  hostPresent: boolean
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
  /** Said once we are out of a mehfil, e.g. that its link has expired. */
  notice: string | null
  dismissNotice: () => void
}

export function useMehfilJam(apiBase: string): JamHandle {
  const [role, setRole] = useState<JamRole>(null)
  const [token, setToken] = useState<string | null>(null)
  const [listeners, setListeners] = useState(0)
  const [connected, setConnected] = useState(false)
  const [remote, setRemote] = useState<JamState | null>(null)
  const [needsGesture, setNeedsGesture] = useState(false)
  const [hostPresent, setHostPresent] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const hostKeyRef = useRef<string | null>(null)
  // serverNow - Date.now(), so guests can place the host's timestamp on their
  // own timeline without trusting either browser clock.
  const clockSkewRef = useRef(0)
  const lastSentRef = useRef(0)
  // Mirrors `remote` so the position getter always sees the newest state
  // without needing to be re-created on every message.
  const remoteRef = useRef<JamState | null>(null)
  // A browser keeps its permission to play sound for the rest of the page, so
  // a guest is asked to tap once, not again after every reconnect.
  const gestureAckedRef = useRef(false)
  // Socket callbacks outlive the render that made them, so they read these.
  const tokenRef = useRef<string | null>(null)
  const roleRef = useRef<JamRole>(null)
  tokenRef.current = token
  roleRef.current = role
  // Set while leaving or unmounting, so a socket we closed on purpose isn't
  // taken for one that dropped.
  const leavingRef = useRef(false)
  const attemptRef = useRef(0)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The close handler is made before `reconnect` exists, so it calls it here.
  const reconnectRef = useRef<() => void>(() => {})

  const wsUrl = useCallback(
    (tok: string, hostKey?: string | null) => {
      const base = apiBase.replace(/^http/, 'ws')
      const q = new URLSearchParams({ token: tok })
      if (hostKey) q.set('hostKey', hostKey)
      return `${base}/ws/mehfil?${q.toString()}`
    },
    [apiBase]
  )

  // Back off 1s, 2s, 4s… up to 15s, so a server that is down isn't hammered.
  const scheduleReconnect = useCallback(() => {
    retryTimerRef.current = setTimeout(
      () => reconnectRef.current(),
      Math.min(15000, 1000 * 2 ** attemptRef.current++)
    )
  }, [])

  const connect = useCallback(
    (tok: string, asHost: boolean) => {
      wsRef.current?.close()
      const socket = new WebSocket(wsUrl(tok, asHost ? hostKeyRef.current : null))
      wsRef.current = socket

      socket.onopen = () => setConnected(true)
      socket.onclose = () => {
        // Only the socket still in use counts: one we replaced, or closed on
        // purpose, must not bring us back.
        const wasActive = wsRef.current === socket
        setConnected(false)
        if (wasActive) wsRef.current = null
        if (wasActive && tokenRef.current && !leavingRef.current) scheduleReconnect()
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
          attemptRef.current = 0
          setRole(msg.role)
          setToken(msg.token)
          setListeners(msg.listeners || 1)
          if (msg.role === 'guest') {
            remoteRef.current = msg.state
            setRemote(msg.state)
            // Browsers refuse to start audio without an interaction, so a guest
            // must click once. Surfacing that beats silently not playing.
            if (!gestureAckedRef.current) setNeedsGesture(true)
          }
        } else if (msg.type === 'state') {
          remoteRef.current = msg.state
          setRemote(msg.state)
        } else if (msg.type === 'presence') {
          setListeners(msg.listeners || 0)
          if (typeof msg.hasHost === 'boolean') setHostPresent(msg.hasHost)
        }
      }
    },
    [wsUrl, scheduleReconnect]
  )

  // Browsers hide the 404 that refuses a socket to a room that is gone, so
  // this is how we find out. true = alive, false = ended, null = can't tell.
  const roomExists = useCallback(
    async (tok: string): Promise<boolean | null> => {
      try {
        const res = await fetch(`${apiBase}/api/mehfil/${encodeURIComponent(tok)}`)
        if (res.status === 404) return false
        return res.ok ? true : null
      } catch {
        return null
      }
    },
    [apiBase]
  )

  const start = useCallback(async (): Promise<string | null> => {
    leavingRef.current = false
    setNotice(null)
    try {
      const res = await fetch(`${apiBase}/api/mehfil`, { method: 'POST' })
      if (!res.ok) throw new Error(String(res.status))
      const { token: tok, hostKey } = await res.json()
      hostKeyRef.current = hostKey
      // Now rather than on the next render: a socket that fails at once must
      // still know which mehfil to retry.
      tokenRef.current = tok
      roleRef.current = 'host'
      setRole('host')
      setToken(tok)
      connect(tok, true)
      return tok
    } catch (err) {
      console.warn('[shama] could not start a mehfil:', err)
      return null
    }
  }, [apiBase, connect])

  const leave = useCallback(() => {
    leavingRef.current = true
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    retryTimerRef.current = null
    attemptRef.current = 0
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
    setHostPresent(true)
    setNotice(null)
  }, [])

  // The room is gone: reaped after everyone left, or lost to a server restart.
  // Stop trying, drop the dead link from the address bar, and say so.
  const endMehfil = useCallback(() => {
    leave()
    const url = new URL(window.location.href)
    url.searchParams.delete('mehfil')
    window.history.replaceState(null, '', url.toString())
    setNotice('That mehfil has ended.')
  }, [leave])

  const join = useCallback(
    async (tok: string) => {
      leavingRef.current = false
      // Ask first: a link to a mehfil that has ended should say so, rather
      // than leave a guest of nothing "reconnecting" forever.
      const alive = await roomExists(tok)
      if (alive === false) return endMehfil()
      // Left, or unmounted, while we were asking.
      if (leavingRef.current) return
      hostKeyRef.current = null
      tokenRef.current = tok
      roleRef.current = 'guest'
      setRole('guest')
      setToken(tok)
      connect(tok, false)
    },
    [connect, roomExists, endMehfil]
  )

  const publish = useCallback((state: Omit<JamState, 'updatedAt'>) => {
    const socket = wsRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN || !hostKeyRef.current) return
    socket.send(JSON.stringify({ type: 'state', state }))
    lastSentRef.current = Date.now()
  }, [])

  // After a drop: rejoin if the room is still there, end it if it isn't, and
  // try again later if the server can't say.
  const reconnect = useCallback(async () => {
    const tok = tokenRef.current
    if (!tok || leavingRef.current) return
    const alive = await roomExists(tok)
    // Left, or moved on to another mehfil, while we were asking.
    if (leavingRef.current || tokenRef.current !== tok) return
    if (alive === false) return endMehfil()
    if (alive === null) return scheduleReconnect()
    connect(tok, roleRef.current === 'host')
  }, [roomExists, endMehfil, scheduleReconnect, connect])
  reconnectRef.current = reconnect

  useEffect(() => {
    leavingRef.current = false
    return () => {
      // Unmounting (or StrictMode rehearsing it) is not a dropped socket, so
      // the close below must not schedule a reconnect.
      leavingRef.current = true
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
      wsRef.current?.close()
    }
  }, [])

  return {
    role,
    token,
    listeners,
    connected,
    hostPresent,
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
    acknowledgeGesture: () => {
      gestureAckedRef.current = true
      setNeedsGesture(false)
    },
    expectedPositionMs: () => {
      const state = remoteRef.current
      if (!state) return null
      if (state.paused) return state.positionMs
      // Place the host's server-stamped position on our own timeline.
      const nowOnServerClock = Date.now() + clockSkewRef.current
      return state.positionMs + Math.max(0, nowOnServerClock - state.updatedAt)
    },
    notice,
    dismissNotice: () => setNotice(null),
  }
}

export { DRIFT_TOLERANCE_MS, HEARTBEAT_MS }
