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
  /** `videoId` is the video these numbers belong to, so a swap can't borrow the last one's. */
  onProgress?: (currentTime: number, duration: number, videoId: string | null) => void
  onPlayStateChange?: (isPlaying: boolean) => void
  onEnded?: () => void
  onSeekConsumed?: () => void
  /** The player refused the video (private, removed, not embeddable). The IFrame API's code. */
  onError?: (code: number) => void
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
  onSeekConsumed,
  onError
}: YouTubePlayerProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<any>(null)
  const readyRef = useRef(false)
  const loadedVideoRef = useRef<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Swapping videos makes the player report the outgoing one as paused. Taken
  // at its word, that flipped the parent to "paused", and the play/pause effect
  // then paused the new video: a song chosen from the queue sat still until
  // Play was pressed. So from a load or stop until the new video plays or is
  // cued, "paused" and "ended" are not the listener's doing and are ignored.
  const swappingRef = useRef(false)
  const swapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const beginSwap = () => {
    swappingRef.current = true
    if (swapTimerRef.current) clearTimeout(swapTimerRef.current)
    // A load that never starts (autoplay refused, say) must not leave the parent
    // showing Pause over silence: after a while, report what the player is doing.
    swapTimerRef.current = setTimeout(() => {
      swappingRef.current = false
      swapTimerRef.current = null
      try {
        const YTPS = (window as any).YT?.PlayerState
        const state = playerRef.current?.getPlayerState?.()
        if (YTPS && state !== YTPS.PLAYING && state !== YTPS.BUFFERING) {
          cbRef.current.onPlayStateChange?.(false)
        }
      } catch {
        /* noop */
      }
    }, 5000)
  }
  const endSwap = () => {
    swappingRef.current = false
    if (swapTimerRef.current) clearTimeout(swapTimerRef.current)
    swapTimerRef.current = null
  }

  // Keep the latest callbacks in refs so the init effect runs exactly once.
  const cbRef = useRef({ onReady, onProgress, onPlayStateChange, onEnded, onError, onSeekConsumed })
  useEffect(() => {
    cbRef.current = { onReady, onProgress, onPlayStateChange, onEnded, onError, onSeekConsumed }
  })
  // The latest control props. The effects below drop anything asked of the
  // player before the IFrame API is ready, so onReady applies these instead.
  const propsRef = useRef({ videoId, playing, volume, muted, seekTo })
  propsRef.current = { videoId, playing, volume, muted, seekTo }

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
            const latest = propsRef.current
            const p = playerRef.current
            try {
              p.setVolume(latest.volume)
              if (latest.muted) p.mute()
              else p.unMute()
              // A video, a Play or a seek chosen before the API was ready never
              // reached the player; start from where the parent is now.
              if (latest.videoId) {
                loadedVideoRef.current = latest.videoId
                beginSwap()
                if (latest.playing) p.loadVideoById(latest.videoId, latest.seekTo ?? 0)
                else p.cueVideoById(latest.videoId, latest.seekTo ?? 0)
                if (latest.seekTo != null) cbRef.current.onSeekConsumed?.()
              }
            } catch {
              /* noop */
            }
            cbRef.current.onReady?.()
          },
          onStateChange: (e: any) => {
            const YTPS = (window as any).YT.PlayerState
            if (e.data === YTPS.PLAYING || e.data === YTPS.CUED) endSwap()
            if (e.data === YTPS.PLAYING) cbRef.current.onPlayStateChange?.(true)
            else if (swappingRef.current && (e.data === YTPS.PAUSED || e.data === YTPS.ENDED)) return
            else if (e.data === YTPS.PAUSED) cbRef.current.onPlayStateChange?.(false)
            else if (e.data === YTPS.ENDED) {
              cbRef.current.onPlayStateChange?.(false)
              cbRef.current.onEnded?.()
            }
          },
          onError: (e: any) => cbRef.current.onError?.(Number(e?.data))
        }
      })
    })

    // Poll progress ~4x/sec (the IFrame API has no timeupdate event).
    pollRef.current = setInterval(() => {
      const p = playerRef.current
      if (!readyRef.current || !p?.getCurrentTime) return
      try {
        // Right after a swap the player can still be answering for the last
        // video; its time and duration must not be reported as the new one's.
        const url = typeof p.getVideoUrl === 'function' ? String(p.getVideoUrl() || '') : ''
        const onId = /[?&]v=([A-Za-z0-9_-]{11})/.exec(url)?.[1] ?? null
        if (loadedVideoRef.current && onId && onId !== loadedVideoRef.current) return
        const current = p.getCurrentTime() || 0
        const duration = p.getDuration() || 0
        if (duration > 0) cbRef.current.onProgress?.(current, duration, loadedVideoRef.current)
      } catch {
        /* noop */
      }
    }, 250)

    return () => {
      cancelled = true
      if (pollRef.current) clearInterval(pollRef.current)
      endSwap()
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
      if (loadedVideoRef.current) beginSwap()
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
      beginSwap()
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
