import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Play,
  Pause,
  Volume2,
  BookOpen,
  HelpCircle,
  FileText,
  VolumeX,
  Search,
  Music,
  Loader2
} from 'lucide-react'
import './App.css'
import { ShaderBackdrop } from './components/aesthetic/ShaderBackdrop'
import { LiquidLogoMark } from './components/aesthetic/LiquidLogoMark'
import { MehfilScene } from './components/aesthetic/MehfilScene'
import { YouTubePlayer } from './components/YouTubePlayer'
import { catalog, type WorkData, type LineData } from './data/ghazals'

const API_BASE = 'http://localhost:5000'

interface YtTrack {
  videoId: string
  title: string
  artist: string
  album?: string
  duration?: string
  thumbnail?: string
  coverUrl?: string
}


export function App() {
  const [worksList, setWorksList] = useState<any[]>(catalog)
  const [activeWork, setActiveWork] = useState<WorkData>(catalog[0])
  const [activeLine, setActiveLine] = useState<LineData>(catalog[0].lines[0])
  const [scriptMode, setScriptMode] = useState<'URDU' | 'HINDI' | 'ROMAN' | 'ENGLISH'>('URDU')
  const [activeTab, setActiveTab] = useState<'SIMPLE' | 'LITERARY' | 'GLOSSARY'>('SIMPLE')
  const [isPlaying, setIsPlaying] = useState<boolean>(false)
  const [playbackProgress, setPlaybackProgress] = useState<number>(0)
  const [volume, setVolume] = useState<number>(75)
  const [isMuted, setIsMuted] = useState<boolean>(false)
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false)

  // Console View state
  const [currentView, setCurrentView] = useState<'LISTENING' | 'CATALOG' | 'FEATURED' | 'YTMUSIC'>('LISTENING')
  const [searchTerm, setSearchTerm] = useState<string>('')

  // Playable Audio Refs & Timestamps
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [currentTime, setCurrentTime] = useState<number>(0)
  const [duration, setDuration] = useState<number>(0)

  // Playback engine: curated archive.org MP3s vs. YouTube Music (IFrame player).
  // Curated ghazals stream through YouTube by default (archive.org node URLs
  // rotate and 404), falling back to the archive audio only if no video resolves.
  const [playbackSource, setPlaybackSource] = useState<'archive' | 'youtube'>('youtube')
  const [ytTrack, setYtTrack] = useState<YtTrack | null>(null) // a pure YT-search selection
  const [ytVideoId, setYtVideoId] = useState<string | null>(null) // id loaded in the IFrame player
  const [ytSeek, setYtSeek] = useState<number | null>(null)
  const [resolving, setResolving] = useState<boolean>(false)
  const [playbackNote, setPlaybackNote] = useState<string | null>(null)
  const resolvedWorkRef = useRef<string | null>(null) // activeWork.id the current ytVideoId belongs to

  // YT Music search state
  const [ytQuery, setYtQuery] = useState<string>('')
  const [ytResults, setYtResults] = useState<YtTrack[]>([])
  const [ytLoading, setYtLoading] = useState<boolean>(false)
  const [ytError, setYtError] = useState<string | null>(null)
  const [ytLyrics, setYtLyrics] = useState<{ text: string | null; source: string | null; loading: boolean }>(
    { text: null, source: null, loading: false }
  )

  // `isYT` == showing the pure YT-Music content panel (lyrics, no couplets).
  const isYT = !!ytTrack
  const isStreaming = playbackSource === 'youtube'

  // Mehfil Mode (couplets synced to the singer) + timestamp authoring.
  const [mehfilSync, setMehfilSync] = useState<boolean>(true)
  const [stampMode, setStampMode] = useState<boolean>(false)
  const [stamps, setStamps] = useState<Record<string, Record<string, number>>>({})

  // A couplet's start time: a user-authored stamp overrides the seed value.
  const lineTime = (work: WorkData, line: LineData): number | null => {
    const s = stamps[work.id]?.[line.id]
    if (typeof s === 'number') return s
    return typeof line.t === 'number' ? line.t : null
  }
  const hasTimestamps = activeWork.lines.some((l) => lineTime(activeWork, l) !== null)

  // The couplet the singer is currently on (last one whose start time has passed).
  const activeSyncLineId = useMemo(() => {
    if (isYT) return null
    let current: string | null = null
    for (const l of activeWork.lines) {
      const t = lineTime(activeWork, l)
      if (t !== null && t <= currentTime + 0.15) current = l.id
    }
    return current
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTime, activeWork, stamps, isYT])

  // Fetch list of works on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/works`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          // The local catalog is authoritative for couplets + meanings; the API
          // only contributes any *extra* works it knows about that we don't.
          const extras = data
            .filter((item: any) => !catalog.some((c) => c.id === item.id))
            .map((item: any) => ({
              ...item,
              audioUrl: item.audio_url || item.audioUrl || '',
              coverUrl: item.cover_url || item.coverUrl || ''
            }))
          if (extras.length > 0) setWorksList([...catalog, ...extras])
        }
      })
      .catch(() => {
        console.log('[API_FALLBACK] Operating in local mock data mode.')
      })
  }, [])

  // A curated work changed → reset the transport. Playback (re)starts on demand
  // via handlePlayPause, which resolves a YouTube video for the work.
  useEffect(() => {
    resolvedWorkRef.current = null
    setYtVideoId(null)
    setIsPlaying(false)
    setPlaybackProgress(0)
    setCurrentTime(0)
    setDuration(0)
    setPlaybackNote(null)
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = activeWork.audioUrl || ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWork])

  // Sync Volume variables
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume / 100
    }
  }, [volume, isMuted])

  // Load any locally-authored couplet timestamps once.
  useEffect(() => {
    try {
      const raw = localStorage.getItem('shama.stamps')
      if (raw) setStamps(JSON.parse(raw))
    } catch {
      /* ignore */
    }
  }, [])

  // Mehfil Mode: follow the singer — select + scroll the active couplet into view.
  useEffect(() => {
    if (!mehfilSync || !activeSyncLineId) return
    const line = activeWork.lines.find((l) => l.id === activeSyncLineId)
    if (line && line.id !== activeLine.id) setActiveLine(line)
    if (typeof document !== 'undefined') {
      document.getElementById(`sher-${activeSyncLineId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSyncLineId, mehfilSync])

  // Shared progress writer used by both the <audio> element and the YT player.
  const updateProgress = (current: number, dur: number) => {
    setCurrentTime(current)
    setDuration(dur)
    setPlaybackProgress(dur > 0 ? (current / dur) * 100 : 0)
  }

  const seekTo = (sec: number) => {
    if (playbackSource === 'youtube') setYtSeek(sec)
    else if (audioRef.current) audioRef.current.currentTime = sec
  }

  // ---- Timestamp authoring (tap-to-sync) -----------------------------------
  const persistStamps = (next: Record<string, Record<string, number>>) => {
    try {
      localStorage.setItem('shama.stamps', JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }
  const stampCouplet = (lineId: string) => {
    setStamps((prev) => {
      const next = {
        ...prev,
        [activeWork.id]: {
          ...(prev[activeWork.id] || {}),
          [lineId]: Math.max(0, Math.round(currentTime * 10) / 10)
        }
      }
      persistStamps(next)
      return next
    })
  }
  const clearStamps = () => {
    setStamps((prev) => {
      const next = { ...prev }
      delete next[activeWork.id]
      persistStamps(next)
      return next
    })
  }
  const exportStamps = () => {
    const out = activeWork.lines.map((l) => ({ id: l.id, t: lineTime(activeWork, l) }))
    const json = JSON.stringify(out, null, 2)
    try {
      navigator.clipboard?.writeText(json)
    } catch {
      /* ignore */
    }
    if (typeof document !== 'undefined') {
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${activeWork.id}-timestamps.json`
      a.click()
      URL.revokeObjectURL(url)
    }
  }
  const mukarrar = () => {
    const line = activeWork.lines.find((l) => l.id === activeLine.id) || activeWork.lines[0]
    const t = lineTime(activeWork, line)
    if (t !== null) {
      seekTo(t)
      if (!isPlaying) handlePlayPause()
    }
  }

  // Resolve a YouTube video for a curated work (cached per work id).
  const ensureCuratedVideo = async (work: WorkData): Promise<string | null> => {
    if (ytVideoId && resolvedWorkRef.current === work.id) return ytVideoId
    setResolving(true)
    try {
      const q = (work.ytQuery || `${work.title} ${work.artist}`).trim()
      const res = await fetch(`${API_BASE}/api/yt/search?q=${encodeURIComponent(q)}&limit=1`)
      const data = await res.json()
      const vid: string | null = data.results?.[0]?.videoId || null
      resolvedWorkRef.current = vid ? work.id : null
      setYtVideoId(vid)
      return vid
    } catch {
      return null
    } finally {
      setResolving(false)
    }
  }

  const handlePlayPause = async () => {
    // Pure YT-search track: flip intent, the IFrame player reports the real state.
    if (ytTrack) {
      setIsPlaying((prev) => !prev)
      return
    }
    // Curated work.
    if (isPlaying) {
      setIsPlaying(false)
      if (playbackSource === 'archive' && audioRef.current) audioRef.current.pause()
      return
    }
    setPlaybackNote(null)
    setPlaybackSource('youtube')
    const vid =
      ytVideoId && resolvedWorkRef.current === activeWork.id
        ? ytVideoId
        : await ensureCuratedVideo(activeWork)
    if (vid) {
      setIsPlaying(true)
      return
    }
    // Fallback: try the (often stale) archive.org source directly.
    setPlaybackSource('archive')
    if (audioRef.current && activeWork.audioUrl) {
      try {
        await audioRef.current.play()
        setIsPlaying(true)
      } catch (err) {
        console.warn('[SHAMA] No playable source for', activeWork.title, (err as any)?.message)
        setPlaybackNote('No playable source found — try the [04] YT Music search for this ghazal.')
      }
    } else {
      setPlaybackNote('No playable source found — try the [04] YT Music search for this ghazal.')
    }
  }

  // ---- YouTube Music -------------------------------------------------------
  const runYtSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const q = ytQuery.trim()
    if (!q) return
    setYtLoading(true)
    setYtError(null)
    fetch(`${API_BASE}/api/yt/search?q=${encodeURIComponent(q)}&limit=24`)
      .then((res) => res.json())
      .then((data) => {
        const results: YtTrack[] = (data.results || []).map((r: any) => ({
          videoId: r.videoId,
          title: r.title,
          artist: r.artist || (r.artists ? r.artists.join(', ') : 'Unknown Artist'),
          album: r.album,
          duration: r.duration,
          thumbnail: r.thumbnail,
          coverUrl: r.thumbnail ? `${API_BASE}/api/yt/thumb?u=${encodeURIComponent(r.thumbnail)}` : undefined
        }))
        setYtResults(results)
        if (results.length === 0) setYtError(data.error || 'No results found for that search.')
        setYtLoading(false)
      })
      .catch(() => {
        setYtResults([])
        setYtError('YT Music service is unreachable. Start it with: cd ytmusic-service && python main.py')
        setYtLoading(false)
      })
  }

  const fetchYtLyrics = (videoId: string) => {
    setYtLyrics({ text: null, source: null, loading: true })
    fetch(`${API_BASE}/api/yt/lyrics/${videoId}`)
      .then((res) => res.json())
      .then((data) => {
        setYtLyrics({ text: data.lyrics || null, source: data.source || null, loading: false })
      })
      .catch(() => setYtLyrics({ text: null, source: null, loading: false }))
  }

  const playYtTrack = (track: YtTrack) => {
    // Stop the archive audio engine and hand playback to YouTube.
    if (audioRef.current) audioRef.current.pause()
    setPlaybackSource('youtube')
    setYtTrack(track)
    setYtVideoId(track.videoId)
    resolvedWorkRef.current = null
    setPlaybackNote(null)
    setCurrentTime(0)
    setDuration(0)
    setPlaybackProgress(0)
    setIsPlaying(true)
    setCurrentView('LISTENING')
    fetchYtLyrics(track.videoId)
    if (isSpeaking) {
      window.speechSynthesis.cancel()
      setIsSpeaking(false)
    }
  }

  const handleWorkSelect = (work: any) => {
    // Selecting a curated work drops any pure-YT selection; the activeWork
    // effect then resets the transport (playback restarts on demand).
    setYtTrack(null)
    if (work.lines && work.lines.length > 0) {
      setActiveWork(work)
      setActiveLine(work.lines[0])
      return
    }

    // Fetch full details from API
    fetch(`${API_BASE}/api/works/${work.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.lines && data.lines.length > 0) {
          const formattedLines = data.lines.map((l: any) => ({
            ...l,
            englishText: l.english_text || l.englishText
          }))
          const localMatch = catalog.find((c) => c.id === work.id)
          const mergedWork = {
            ...data,
            audioUrl: data.audio_url || data.audioUrl || (localMatch ? localMatch.audioUrl : ''),
            coverUrl: data.cover_url || data.coverUrl || (localMatch ? localMatch.coverUrl : ''),
            lines: formattedLines
          }
          setActiveWork(mergedWork)
          setActiveLine(formattedLines[0])
        } else {
          loadLocalFallback(work.id)
        }
      })
      .catch(() => {
        loadLocalFallback(work.id)
      })
  }

  const loadLocalFallback = (id: string) => {
    const local = catalog.find((w) => w.id === id)
    if (local) {
      setActiveWork(local)
      setActiveLine(local.lines[0])
    }
  }

  const handleLineSelect = (line: LineData) => {
    setActiveLine(line)
    if (isSpeaking) {
      window.speechSynthesis.cancel()
      setIsSpeaking(false)
    }
  }

  const toggleSpeech = () => {
    if (isSpeaking) {
      window.speechSynthesis.cancel()
      setIsSpeaking(false)
      return
    }

    const textToSpeak = isYT
      ? ytLyrics.text || `Now playing ${ytTrack?.title} by ${ytTrack?.artist} from YouTube Music.`
      : activeTab === 'SIMPLE'
        ? activeLine.simple
        : activeTab === 'LITERARY'
        ? activeLine.detailed
        : activeLine.vocabulary.map((v) => `${v.term} means ${v.meaning}`).join('. ')

    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(textToSpeak)
      utterance.rate = 0.9
      utterance.onend = () => setIsSpeaking(false)
      setIsSpeaking(true)
      window.speechSynthesis.speak(utterance)
    } else {
      alert('Text-to-speech is not supported in this browser.')
    }
  }

  const renderScriptText = (line: LineData) => {
    switch (scriptMode) {
      case 'URDU':
        return line.urdu
      case 'HINDI':
        return line.hindi
      case 'ROMAN':
        return line.roman
      case 'ENGLISH':
        return line.englishText
      default:
        return line.urdu
    }
  }

  // Format Time Helper (MM:SS)
  const formatTime = (time: number) => {
    if (isNaN(time)) return '00:00'
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }

  const filteredCatalog = worksList.filter(
    (work) =>
      work.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      work.poet.toLowerCase().includes(searchTerm.toLowerCase()) ||
      work.artist.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const activateCuratorSelection = async (workId: string) => {
    const matched = worksList.find((w) => w.id === workId)
    if (!matched) return
    handleWorkSelect(matched)
    setCurrentView('LISTENING')
    // Resolve this curated work on YouTube and start playing.
    const work = (matched.lines && matched.lines.length > 0
      ? matched
      : catalog.find((c) => c.id === workId)) as WorkData | undefined
    if (!work) return
    setPlaybackSource('youtube')
    const vid = await ensureCuratedVideo(work)
    if (vid) setIsPlaying(true)
    else setPlaybackNote('No playable source found — try the [04] YT Music search for this ghazal.')
  }

  // Now-playing metadata resolves from whichever engine is active.
  const nowTitle = isYT ? ytTrack!.title : activeWork.title
  const nowArtist = isYT ? ytTrack!.artist : activeWork.artist
  const nowCover = isYT ? ytTrack!.coverUrl : activeWork.coverUrl

  return (
    <main className="shama-shell">
      <div className="noise-overlay" />
      <ShaderBackdrop />

      {/* Archive.org audio engine (fallback for curated catalog) */}
      <audio
        ref={audioRef}
        src={activeWork.audioUrl}
        preload="none"
        onTimeUpdate={() => {
          if (audioRef.current && playbackSource === 'archive') {
            updateProgress(audioRef.current.currentTime, duration || audioRef.current.duration || 0)
          }
        }}
        onLoadedMetadata={() => {
          if (audioRef.current && playbackSource === 'archive') {
            setDuration(audioRef.current.duration)
          }
        }}
        onError={() => {
          // Only meaningful while the archive engine is actually driving playback.
          if (playbackSource === 'archive' && isPlaying) {
            setIsPlaying(false)
            setPlaybackNote('No playable source found — try the [04] YT Music search for this ghazal.')
          }
        }}
        onEnded={() => {
          if (playbackSource !== 'archive') return
          setIsPlaying(false)
          setPlaybackProgress(0)
          setCurrentTime(0)
        }}
      />

      {/* YouTube Music engine (headless IFrame player) */}
      <YouTubePlayer
        videoId={playbackSource === 'youtube' ? ytVideoId : null}
        playing={playbackSource === 'youtube' && isPlaying}
        volume={volume}
        muted={isMuted}
        seekTo={ytSeek}
        onSeekConsumed={() => setYtSeek(null)}
        onProgress={(current, dur) => {
          if (playbackSource === 'youtube') updateProgress(current, dur)
        }}
        onPlayStateChange={(playing) => {
          if (playbackSource === 'youtube') setIsPlaying(playing)
        }}
        onEnded={() => {
          if (playbackSource !== 'youtube') return
          setIsPlaying(false)
          setPlaybackProgress(0)
          setCurrentTime(0)
        }}
      />

      <div className="console-container">
        {/* Header Bar */}
        <header className="console-header">
          <div className="brand-section">
            <LiquidLogoMark />
            <div>
              <span className="mono-tag">Acoustic Audio System</span>
              <h1 className="console-title">
                SHAMA // CONSOLE <span className="status-dot status-dot--green" />
              </h1>
            </div>
            
            {/* View selectors */}
            <nav className="console-nav">
              <button
                type="button"
                className={`console-nav-btn ${
                  currentView === 'LISTENING' ? 'console-nav-btn--active' : ''
                }`}
                onClick={() => setCurrentView('LISTENING')}
              >
                [01] Listening Deck
              </button>
              <button
                type="button"
                className={`console-nav-btn ${
                  currentView === 'CATALOG' ? 'console-nav-btn--active' : ''
                }`}
                onClick={() => setCurrentView('CATALOG')}
              >
                [02] Catalog
              </button>
              <button
                type="button"
                className={`console-nav-btn ${
                  currentView === 'FEATURED' ? 'console-nav-btn--active' : ''
                }`}
                onClick={() => setCurrentView('FEATURED')}
              >
                [03] Curator Picks
              </button>
              <button
                type="button"
                className={`console-nav-btn ${
                  currentView === 'YTMUSIC' ? 'console-nav-btn--active' : ''
                }`}
                onClick={() => setCurrentView('YTMUSIC')}
              >
                [04] YT Music
              </button>
            </nav>
          </div>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }} className="nav-extra">
            <span className="mono-tag" style={{ opacity: 0.6 }}>
              AUDIO_STATE: {isPlaying ? 'PLAY' : 'STOP'}
            </span>
            <span className="mono-tag">
              SYS_TINT: BRONZE
            </span>
          </div>
        </header>

        {/* View switching logic */}
        {currentView === 'LISTENING' && (
          <div className="console-body">
            {/* Panel 1: Library Catalog Sidebar */}
            <aside className="console-panel">
              <div className="panel-header">
                <h2 className="panel-title">[01] SELECT WORK</h2>
                <span className="mono-tag">DECK_LIST</span>
              </div>
              <div className="panel-content" style={{ padding: '12px' }}>
                <div className="bracket-list">
                  {worksList.map((work) => (
                    <button
                      key={work.id}
                      type="button"
                      className={`bracket-item-btn ${
                        activeWork.id === work.id ? 'bracket-item-btn--active' : ''
                      }`}
                      onClick={() => handleWorkSelect(work)}
                    >
                      <span className="bracket-indicator">[{work.id}]</span>
                      <div style={{ flex: 1 }}>
                        <div className="item-main-text">{work.title}</div>
                        <div className="item-sub-text">
                          {work.poet.toUpperCase()} // {work.form.toUpperCase()}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </aside>

            {/* Panel 2: Listening Deck */}
            <section className="console-panel" style={{ borderRight: '1px solid var(--color-border)' }}>
              <div className="panel-header">
                <h2 className="panel-title">[02] PLAYBACK PANEL</h2>
                <div className="mono-tag" style={{ color: 'var(--color-highlight)' }}>
                  {isYT ? 'YT MUSIC' : nowArtist.toUpperCase()}
                </div>
              </div>

              {/* 3D Scene Viewport */}
              <div className="scene-deck">
                <MehfilScene isPlaying={isPlaying} coverUrl={nowCover} onTogglePlay={handlePlayPause} />
              </div>

              {/* Now-playing strip */}
              <div className="now-playing-strip">
                <div className="now-playing-meta">
                  <span className="mono-tag" style={{ color: 'var(--color-accent)' }}>
                    {resolving
                      ? '⟳ RESOLVING · YT MUSIC'
                      : isStreaming
                      ? '▶ STREAMING · YT MUSIC'
                      : '▶ ARCHIVE DECK'}
                  </span>
                  <div className="now-playing-title">{nowTitle}</div>
                  <div className="item-sub-text">{nowArtist}</div>
                  {playbackNote && (
                    <div className="playback-note">{playbackNote}</div>
                  )}
                </div>
              </div>

              {/* Hardware-like Audio Player Deck */}
              <div className="player-deck">
                <div className="player-controls">
                  <button
                    type="button"
                    className="console-btn console-btn--primary"
                    onClick={handlePlayPause}
                    disabled={resolving}
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                  >
                    {resolving ? (
                      <Loader2 size={14} className="spin" />
                    ) : isPlaying ? (
                      <Pause size={14} />
                    ) : (
                      <Play size={14} />
                    )}
                    <span>{resolving ? 'LOADING' : isPlaying ? 'PAUSE' : 'PLAY'}</span>
                  </button>
                </div>

                {/* Monospace Interactive Waveform Progress */}
                <div
                  className="waveform-display"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    const clickX = e.clientX - rect.left
                    const percentage = clickX / rect.width
                    if (!duration) return
                    if (playbackSource === 'youtube') {
                      setYtSeek(percentage * duration)
                    } else if (audioRef.current) {
                      audioRef.current.currentTime = percentage * duration
                    }
                  }}
                >
                  <div
                    className="waveform-progress"
                    style={{ width: `${playbackProgress}%` }}
                  />
                  <div className="waveform-bars">
                    {Array.from({ length: 40 }).map((_, i) => {
                      const isActive = (i / 40) * 100 <= playbackProgress
                      const barHeight =
                        4 + Math.abs(Math.sin((i + playbackProgress * 0.1) * 0.5)) * 14
                      return (
                        <div
                          key={i}
                          className={`waveform-bar ${isActive ? 'waveform-bar--active' : ''}`}
                          style={{ height: `${barHeight}px` }}
                        />
                      )
                    })}
                  </div>
                </div>

                {/* Volume & Timestamp knobs */}
                <div className="volume-section" style={{ gap: '14px' }}>
                  <span style={{ fontSize: '0.74rem', opacity: 0.8 }} className="timestamp">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => setIsMuted(!isMuted)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--color-text-muted)',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                    >
                      {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={isMuted ? 0 : volume}
                      onChange={(e) => {
                        setVolume(Number(e.target.value))
                        if (isMuted) setIsMuted(false)
                      }}
                      style={{
                        width: '50px',
                        height: '4px',
                        accentColor: 'var(--color-accent)',
                        cursor: 'pointer'
                      }}
                    />
                  </div>
                </div>
              </div>

              {!isYT ? (
                <>
                  {/* Script Toggles */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4, 1fr)',
                      borderBottom: '1px solid var(--color-border)',
                      background: 'rgba(16, 13, 11, 0.4)'
                    }}
                  >
                    {(['URDU', 'HINDI', 'ROMAN', 'ENGLISH'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        className={`tab-btn ${scriptMode === mode ? 'tab-btn--active' : ''}`}
                        onClick={() => setScriptMode(mode)}
                        style={{ borderBottom: 'none' }}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>

                  {/* Mehfil Mode toolbar */}
                  <div className="mehfil-bar">
                    <div className="mehfil-bar-left">
                      <button
                        type="button"
                        className={`mehfil-chip ${mehfilSync ? 'mehfil-chip--on' : ''}`}
                        onClick={() => setMehfilSync((v) => !v)}
                        title="Auto-scroll and reveal meaning as the singer reaches each couplet"
                      >
                        {mehfilSync ? '◉' : '○'} FOLLOW SINGER
                      </button>
                      <button
                        type="button"
                        className="mehfil-chip"
                        onClick={mukarrar}
                        title="Replay the current couplet"
                        disabled={!hasTimestamps}
                      >
                        ↺ MUKARRAR
                      </button>
                    </div>
                    <button
                      type="button"
                      className={`mehfil-chip ${stampMode ? 'mehfil-chip--rec' : ''}`}
                      onClick={() => setStampMode((v) => !v)}
                      title="Author couplet timestamps by tapping each couplet as the singer reaches it"
                    >
                      {stampMode ? '● SYNCING' : 'SYNC COUPLETS'}
                    </button>
                  </div>

                  {stampMode && (
                    <div className="stamp-hint">
                      Play the ghazal and tap each couplet the instant the singer begins it. Times
                      save automatically.
                      <div className="stamp-actions">
                        <button type="button" className="mehfil-chip" onClick={exportStamps}>
                          ⤓ EXPORT JSON
                        </button>
                        <button type="button" className="mehfil-chip" onClick={clearStamps}>
                          ✕ CLEAR
                        </button>
                      </div>
                    </div>
                  )}

                  {!hasTimestamps && !stampMode && (
                    <div className="stamp-hint">
                      Reader mode — tap any couplet to jump the audio there. Turn on{' '}
                      <strong>Sync couplets</strong> to teach Shama the timings and unlock live
                      Mehfil Mode.
                    </div>
                  )}

                  {/* Lyrics Sheet Scroll */}
                  <div className="panel-content lyrics-deck" style={{ padding: 0 }}>
                    {activeWork.lines.map((line, index) => {
                      const t = lineTime(activeWork, line)
                      const isSyncActive = activeSyncLineId === line.id
                      const isSelected = activeLine.id === line.id
                      return (
                        <div
                          id={`sher-${line.id}`}
                          key={line.id}
                          className={`sher-block ${isSelected ? 'sher-block--active' : ''} ${
                            isSyncActive ? 'sher-block--singing' : ''
                          } ${stampMode ? 'sher-block--stamp' : ''}`}
                          onClick={() => {
                            if (stampMode) {
                              stampCouplet(line.id)
                              return
                            }
                            handleLineSelect(line)
                            if (t !== null) seekTo(t)
                          }}
                        >
                          <div className="sher-meta-row">
                            <div
                              className="mono-tag"
                              style={{ fontSize: '0.66rem', color: 'var(--color-accent)' }}
                            >
                              COUPLET // [0{index + 1}]
                            </div>
                            {(t !== null || stampMode) && (
                              <span className={`stamp-badge ${t !== null ? 'stamp-badge--set' : ''}`}>
                                {t !== null ? `⏱ ${formatTime(t)}` : 'TAP TO STAMP'}
                              </span>
                            )}
                          </div>
                          <h3 className="verse-original">{renderScriptText(line)}</h3>
                          <p className="verse-translit">↳ {line.transliteration}</p>
                          <p className="verse-trans">{line.translation}</p>
                          {isSyncActive && mehfilSync && (
                            <div className="sher-reveal">
                              <span className="sher-reveal-label">MA&apos;NI · MEANING</span>
                              {line.simple}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </>
              ) : (
                /* YouTube Music lyrics sheet */
                <div className="panel-content lyrics-deck" style={{ padding: '0' }}>
                  <div className="yt-lyrics-header">
                    <span className="mono-tag" style={{ color: 'var(--color-accent)' }}>
                      LYRICS
                    </span>
                    {ytLyrics.source && (
                      <span className="item-sub-text">SOURCE // {ytLyrics.source}</span>
                    )}
                  </div>
                  <div className="yt-lyrics-body">
                    {ytLyrics.loading ? (
                      <div className="yt-lyrics-empty">
                        <Loader2 size={16} className="spin" /> Fetching lyrics…
                      </div>
                    ) : ytLyrics.text ? (
                      ytLyrics.text.split('\n').map((line, i) => (
                        <p key={i} className="yt-lyric-line">
                          {line.trim() === '' ? ' ' : line}
                        </p>
                      ))
                    ) : (
                      <div className="yt-lyrics-empty">
                        No synced lyrics available for this track on YouTube Music.
                        <br />
                        Enjoy the ghazal — the vinyl turns while it plays.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* Panel 3: Annotation Companion Deck */}
            <aside className="console-panel">
              <div className="panel-header">
                <h2 className="panel-title">[03] ANNOTATION PANEL</h2>
                <span className="mono-tag">DECK</span>
              </div>

              {/* Tab Deck */}
              {!isYT && (
                <div className="tab-deck">
                  <button
                    type="button"
                    className={`tab-btn ${activeTab === 'SIMPLE' ? 'tab-btn--active' : ''}`}
                    onClick={() => setActiveTab('SIMPLE')}
                  >
                    <BookOpen size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                    <span>Simple</span>
                  </button>
                  <button
                    type="button"
                    className={`tab-btn ${activeTab === 'LITERARY' ? 'tab-btn--active' : ''}`}
                    onClick={() => setActiveTab('LITERARY')}
                  >
                    <FileText size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                    <span>Poetic</span>
                  </button>
                  <button
                    type="button"
                    className={`tab-btn ${activeTab === 'GLOSSARY' ? 'tab-btn--active' : ''}`}
                    onClick={() => setActiveTab('GLOSSARY')}
                  >
                    <HelpCircle size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                    <span>Glossary</span>
                  </button>
                </div>
              )}

              <div className="panel-content">
                {isYT ? (
                  /* YouTube track details */
                  <div
                    style={{
                      marginBottom: '18px',
                      borderBottom: '1px solid var(--color-border)',
                      paddingBottom: '12px'
                    }}
                  >
                    <span className="mono-tag" style={{ color: 'var(--color-highlight)' }}>
                      NOW PLAYING · YT MUSIC
                    </span>
                    {nowCover && (
                      <img
                        src={nowCover}
                        alt={nowTitle}
                        style={{ width: '100%', borderRadius: '4px', margin: '12px 0', display: 'block' }}
                      />
                    )}
                    <div className="explanation-card">
                      <div className="explanation-card-header">Track</div>
                      <div className="explanation-card-body">
                        <strong style={{ color: 'var(--color-highlight)' }}>{nowTitle}</strong>
                        <br />
                        {nowArtist}
                        {ytTrack?.album ? (
                          <>
                            <br />
                            <span className="item-sub-text">Album // {ytTrack.album}</span>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <p className="item-sub-text" style={{ marginTop: '10px', lineHeight: 1.5 }}>
                      Streaming via the unofficial YouTube Music API. Lyrics, when available,
                      appear on the deck to the left.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Selected Line Header */}
                    <div
                      style={{
                        marginBottom: '18px',
                        borderBottom: '1px solid var(--color-border)',
                        paddingBottom: '12px'
                      }}
                    >
                      <span className="mono-tag" style={{ color: 'var(--color-highlight)' }}>
                        ACTIVE COUPLET DETAIL
                      </span>
                      <p className="verse-translit" style={{ marginTop: '8px', fontSize: '0.86rem' }}>
                        "{activeLine.roman}"
                      </p>
                    </div>

                    {/* Tab Content Display */}
                    {activeTab === 'SIMPLE' && (
                      <div className="explanation-card">
                        <div className="explanation-card-header">Simple Meaning</div>
                        <div className="explanation-card-body">{activeLine.simple}</div>
                      </div>
                    )}

                    {activeTab === 'LITERARY' && (
                      <div className="explanation-card">
                        <div className="explanation-card-header">Literary Analysis & Metaphors</div>
                        <div className="explanation-card-body">{activeLine.detailed}</div>
                      </div>
                    )}

                    {activeTab === 'GLOSSARY' && (
                      <div className="explanation-card">
                        <div className="explanation-card-header">Vocabulary & Glossary</div>
                        <div className="explanation-card-body">
                          <ul style={{ margin: 0, paddingLeft: '14px', listStyleType: 'square' }}>
                            {activeLine.vocabulary.map((vocab, index) => (
                              <li key={index} style={{ marginBottom: '8px' }}>
                                <strong style={{ color: 'var(--color-highlight)' }}>{vocab.term}</strong>: {vocab.meaning}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* TTS Control Area */}
                <div
                  style={{
                    marginTop: '24px',
                    borderTop: '1px solid var(--color-border)',
                    paddingTop: '20px'
                  }}
                >
                  <button
                    type="button"
                    className={`console-btn ${isSpeaking ? 'console-btn--active' : ''}`}
                    onClick={toggleSpeech}
                    style={{ width: '100%' }}
                  >
                    <Volume2 size={14} />
                    <span>
                      {isSpeaking
                        ? 'STOP NARRATION'
                        : isYT
                        ? 'NARRATE LYRICS'
                        : 'NARRATE DESCRIPTION'}
                    </span>
                  </button>
                  <div className="item-sub-text" style={{ textAlign: 'center', marginTop: '8px' }}>
                    {isYT ? 'Reads fetched lyrics using browser TTS' : 'Reads explanation using browser TTS'}
                  </div>
                </div>
              </div>
            </aside>
          </div>
        )}

        {/* View 2: Searchable catalog grid */}
        {currentView === 'CATALOG' && (
          <div className="catalog-deck">
            <div className="catalog-search-row">
              <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
                <Search
                  size={16}
                  style={{
                    position: 'absolute',
                    left: '16px',
                    color: 'var(--color-text-muted)'
                  }}
                />
                <input
                  type="text"
                  className="console-input"
                  placeholder="SEARCH BY TITLE, POET, ARTIST..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ paddingLeft: '44px' }}
                />
              </div>
            </div>

            <table className="catalog-table">
              <thead>
                <tr>
                  <th className="catalog-th" style={{ width: '80px' }}>Code</th>
                  <th className="catalog-th">Title</th>
                  <th className="catalog-th">Poet</th>
                  <th className="catalog-th">Artist</th>
                  <th className="catalog-th">Form</th>
                  <th className="catalog-th" style={{ width: '120px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredCatalog.map((work) => (
                  <tr key={work.id} className="catalog-tr" onClick={() => handleWorkSelect(work)}>
                    <td className="catalog-td">[{work.id}]</td>
                    <td className="catalog-td" style={{ fontWeight: 'bold', color: 'var(--color-highlight)' }}>
                      {work.title}
                    </td>
                    <td className="catalog-td">{work.poet}</td>
                    <td className="catalog-td">{work.artist}</td>
                    <td className="catalog-td">
                      <span className="catalog-tag">{work.form}</span>
                    </td>
                    <td className="catalog-td">
                      <button
                        type="button"
                        className="console-btn"
                        style={{ padding: '4px 8px', fontSize: '0.66rem' }}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleWorkSelect(work)
                          setCurrentView('LISTENING')
                        }}
                      >
                        LOAD DECK
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredCatalog.length === 0 && (
                  <tr>
                    <td colSpan={6} className="catalog-td" style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
                      NO CORRESPONDING RECORD FOUND IN THE ARCHIVE
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* View 3: Curatorpicks featured highlights */}
        {currentView === 'FEATURED' && (
          <div className="featured-deck">
            <div>
              <span className="mono-tag" style={{ color: 'var(--color-accent)' }}>
                CURATORIAL ANNOTATION DESK
              </span>
              <h2
                style={{
                  fontFamily: 'Space Mono',
                  fontSize: '1.6rem',
                  textTransform: 'uppercase',
                  margin: '8px 0 24px 0',
                  letterSpacing: '0.02em'
                }}
              >
                Ghazal Highlights of the Curation Cycle
              </h2>
            </div>

            <div className="featured-grid">
              {/* Card 1: Ghazal of the Day */}
              <article className="featured-card">
                <span className="featured-label">[Ghazal of the Day]</span>
                <h3 className="featured-card-title">Dil-e-Nadaan Tujhe</h3>
                <div className="featured-card-meta">Poet: Mirza Ghalib // Singer: Jagjit Singh</div>
                <p className="featured-card-desc">
                  Mirza Ghalib's timeless inquiry into the naive heart's desires. This rendition by Jagjit & Chitra Singh represents a watershed moment in classical ghazal composition, featuring smooth, minimal acoustic strings and clear, emotional vocal delivery that brings Ghalib's wordplay to life.
                </p>
                <button
                  type="button"
                  className="console-btn console-btn--primary"
                  onClick={() => activateCuratorSelection('01')}
                >
                  [▶ PLAY SELECTION]
                </button>
              </article>

              {/* Card 2: Ghazal of the Week */}
              <article className="featured-card">
                <span className="featured-label">[Ghazal of the Week]</span>
                <h3 className="featured-card-title">Aaj Jaane Ki Zid Na Karo</h3>
                <div className="featured-card-meta">Poet: Fayyaz Hashmi // Singer: Farida Khanum</div>
                <p className="featured-card-desc">
                  An iconic song of separation and persistent love. Farida Khanum's legendary rendition captures the sheer longing of the beloved. Her performance shows how classical music uses repetition and vocal modulations to express romantic devotion.
                </p>
                <button
                  type="button"
                  className="console-btn console-btn--primary"
                  onClick={() => activateCuratorSelection('02')}
                >
                  [▶ PLAY SELECTION]
                </button>
              </article>

              {/* Card 3: Ghazal of the Month */}
              <article className="featured-card">
                <span className="featured-label">[Ghazal of the Month]</span>
                <h3 className="featured-card-title">Gulon Mein Rang Bhare</h3>
                <div className="featured-card-meta">Poet: Faiz Ahmed Faiz // Singer: Mehdi Hassan</div>
                <p className="featured-card-desc">
                  Penned in prison, Faiz's verses blend the traditional flower-garden romantic motifs with a subtle revolutionary cry for spring. Sung by the king of ghazal Mehdi Hassan, this recording remains a masterclass in classic raag composition.
                </p>
                <button
                  type="button"
                  className="console-btn console-btn--primary"
                  onClick={() => activateCuratorSelection('03')}
                >
                  [▶ PLAY SELECTION]
                </button>
              </article>
            </div>
          </div>
        )}

        {/* View 4: YT Music search + streaming */}
        {currentView === 'YTMUSIC' && (
          <div className="catalog-deck">
            <div>
              <span className="mono-tag" style={{ color: 'var(--color-accent)' }}>
                YOUTUBE MUSIC · UNOFFICIAL API
              </span>
              <h2
                style={{
                  fontFamily: 'Space Mono',
                  fontSize: '1.5rem',
                  textTransform: 'uppercase',
                  margin: '8px 0 20px 0',
                  letterSpacing: '0.02em'
                }}
              >
                Search the World of Ghazals & Qawwalis
              </h2>
            </div>

            <form className="catalog-search-row" onSubmit={runYtSearch}>
              <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
                <Music
                  size={16}
                  style={{ position: 'absolute', left: '16px', color: 'var(--color-text-muted)' }}
                />
                <input
                  type="text"
                  className="console-input"
                  placeholder="e.g. Mehdi Hassan, Jagjit Singh, Nusrat Fateh Ali Khan..."
                  value={ytQuery}
                  onChange={(e) => setYtQuery(e.target.value)}
                  style={{ paddingLeft: '44px' }}
                />
              </div>
              <button type="submit" className="console-btn console-btn--primary" disabled={ytLoading}>
                {ytLoading ? <Loader2 size={14} className="spin" /> : <Search size={14} />}
                <span>{ytLoading ? 'SEARCHING' : 'SEARCH'}</span>
              </button>
            </form>

            {ytError && (
              <div
                className="explanation-card"
                style={{ borderColor: 'var(--color-accent)', marginBottom: '20px' }}
              >
                <div className="explanation-card-body">{ytError}</div>
              </div>
            )}

            {ytResults.length > 0 && (
              <div className="yt-results-grid">
                {ytResults.map((track) => (
                  <div
                    key={track.videoId}
                    className={`yt-result-card ${
                      isYT && ytTrack?.videoId === track.videoId ? 'yt-result-card--active' : ''
                    }`}
                    onClick={() => playYtTrack(track)}
                  >
                    <div className="yt-result-thumb">
                      {track.coverUrl ? (
                        <img src={track.coverUrl} alt={track.title} />
                      ) : (
                        <Music size={20} />
                      )}
                      <div className="yt-result-play">
                        <Play size={18} />
                      </div>
                    </div>
                    <div className="yt-result-meta">
                      <div className="yt-result-title">{track.title}</div>
                      <div className="item-sub-text">{track.artist}</div>
                      {track.duration && (
                        <div className="item-sub-text" style={{ opacity: 0.6 }}>
                          {track.duration}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!ytLoading && ytResults.length === 0 && !ytError && (
              <div
                className="item-sub-text"
                style={{ textAlign: 'center', padding: '40px', lineHeight: 1.6 }}
              >
                Search YouTube Music for any ghazal, qawwali, or artist.
                <br />
                Selecting a result loads it onto the Listening Deck — the vinyl spins as it plays.
                <br />
                <span style={{ opacity: 0.6 }}>
                  Requires the local bridge: cd ytmusic-service &amp;&amp; python main.py
                </span>
              </div>
            )}
          </div>
        )}

        {/* Console Footer */}
        <footer className="footer-section">
          SHAMA INSTRUMENTS DIGITAL DECK [V1.0.0-PROTOTYPE] // COPPER-BRONZE SHELL SYSTEM // METALLIC STACK COMPLIANT
        </footer>
      </div>
    </main>
  )
}

export default App
