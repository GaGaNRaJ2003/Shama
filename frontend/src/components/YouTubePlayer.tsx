'use client'

import { useEffect, useRef } from 'react'

/**
 * Headless YouTube IFrame player.
 *
 * We can't stream YT Music audio directly (that would violate ToS and the
 * cipher is throttled), so playback runs through the official IFrame Player
 * API using the `videoId` returned by our ytmusicapi bridge. This component
 * renders a 1x1 offscreen iframe and exposes play/pause/seek/volume via props,
 * reporting progress and state back up so the console UI + vinyl stay in sync.
 */

interface YouTubePlayerProps {
  videoId: string | null
  playing: boolean
  volume: number // 0..100
  muted: boolean
  seekTo?: number | null // when set (seconds), player seeks and the parent clears it
  onReady?: () => void
  onProgress?: (currentTime: number, duration: number) => void
  onPlayStateChange?: (isPlaying: boolean) => void
  onEnded?: () => void
  onSeekConsumed?: () => void
}

// Module-level singleton loader for the IFrame API script.
let apiPromise: Promise<any> | null = null
function loadYouTubeAPI(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  const w = window as any
  if (w.YT && w.YT.Player) return Promise.resolve(w.YT)
  if (apiPromise) return apiPromise

  apiPromise = new Promise((resolve) => {
    const previous = w.onYouTubeIframeAPIReady
    w.onYouTubeIframeAPIReady = () => {
      if (typeof previous === 'function') previous()
      resolve(w.YT)
    }
    if (!document.getElementById('yt-iframe-api')) {
      const tag = document.createElement('script')
      tag.id = 'yt-iframe-api'
      tag.src = 'https://www.youtube.com/iframe_api'
      document.head.appendChild(tag)
    }
  })
  return apiPromise
}

export function YouTubePlayer({
  videoId,
  playing,
  volume,
  muted,
  seekTo,
  onReady,
  onProgress,
  onPlayStateChange,
  onEnded,
  onSeekConsumed
}: YouTubePlayerProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<any>(null)
  const readyRef = useRef(false)
  const loadedVideoRef = useRef<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Keep the latest callbacks in refs so the init effect runs exactly once.
  const cbRef = useRef({ onReady, onProgress, onPlayStateChange, onEnded })
  useEffect(() => {
    cbRef.current = { onReady, onProgress, onPlayStateChange, onEnded }
  })

  // Create the player once.
  useEffect(() => {
    let cancelled = false
    loadYouTubeAPI().then((YT) => {
      if (cancelled || !hostRef.current || playerRef.current) return
      playerRef.current = new YT.Player(hostRef.current, {
        width: '1',
        height: '1',
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          playsinline: 1,
          rel: 0,
          modestbranding: 1
        },
        events: {
          onReady: () => {
            readyRef.current = true
            try {
              playerRef.current.setVolume(volume)
              if (muted) playerRef.current.mute()
            } catch {
              /* noop */
            }
            cbRef.current.onReady?.()
          },
          onStateChange: (e: any) => {
            const YTPS = (window as any).YT.PlayerState
            if (e.data === YTPS.PLAYING) cbRef.current.onPlayStateChange?.(true)
            else if (e.data === YTPS.PAUSED) cbRef.current.onPlayStateChange?.(false)
            else if (e.data === YTPS.ENDED) {
              cbRef.current.onPlayStateChange?.(false)
              cbRef.current.onEnded?.()
            }
          }
        }
      })
    })

    // Poll progress ~4x/sec (the IFrame API has no timeupdate event).
    pollRef.current = setInterval(() => {
      const p = playerRef.current
      if (!readyRef.current || !p?.getCurrentTime) return
      try {
        const current = p.getCurrentTime() || 0
        const duration = p.getDuration() || 0
        if (duration > 0) cbRef.current.onProgress?.(current, duration)
      } catch {
        /* noop */
      }
    }, 250)

    return () => {
      cancelled = true
      if (pollRef.current) clearInterval(pollRef.current)
      try {
        playerRef.current?.destroy?.()
      } catch {
        /* noop */
      }
      playerRef.current = null
      readyRef.current = false
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Load / swap the active video.
  useEffect(() => {
    const p = playerRef.current
    if (!readyRef.current || !p) return
    if (!videoId) {
      try {
        p.stopVideo?.()
      } catch {
        /* noop */
      }
      loadedVideoRef.current = null
      return
    }
    if (loadedVideoRef.current !== videoId) {
      loadedVideoRef.current = videoId
      try {
        if (playing) p.loadVideoById(videoId)
        else p.cueVideoById(videoId)
      } catch {
        /* noop */
      }
    }
  }, [videoId, playing])

  // Play / pause.
  useEffect(() => {
    const p = playerRef.current
    if (!readyRef.current || !p || !videoId) return
    try {
      if (playing) p.playVideo?.()
      else p.pauseVideo?.()
    } catch {
      /* noop */
    }
  }, [playing, videoId])

  // Volume + mute.
  useEffect(() => {
    const p = playerRef.current
    if (!readyRef.current || !p) return
    try {
      p.setVolume?.(volume)
      if (muted) p.mute?.()
      else p.unMute?.()
    } catch {
      /* noop */
    }
  }, [volume, muted])

  // Seek requests from the parent (waveform scrubbing).
  useEffect(() => {
    const p = playerRef.current
    if (!readyRef.current || !p || seekTo == null) return
    try {
      p.seekTo?.(seekTo, true)
    } catch {
      /* noop */
    }
    onSeekConsumed?.()
  }, [seekTo]) // eslint-disable-line react-hooks/exhaustive-deps

  // Offscreen but still "visible" to the browser so playback isn't throttled.
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        width: '1px',
        height: '1px',
        opacity: 0,
        pointerEvents: 'none',
        zIndex: -1
      }}
    >
      <div ref={hostRef} />
    </div>
  )
}

export default YouTubePlayer
