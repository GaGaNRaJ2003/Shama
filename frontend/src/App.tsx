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
  Loader2,
  Heart,
  Trash2
} from 'lucide-react'
import './App.css'
import { ShaderBackdrop } from './components/aesthetic/ShaderBackdrop'
import { LiquidLogoMark } from './components/aesthetic/LiquidLogoMark'
import { MehfilScene } from './components/aesthetic/MehfilScene'
import { YouTubePlayer } from './components/YouTubePlayer'
import { catalog, type WorkData, type LineData } from './data/ghazals'
import {
  getUserCatalog,
  addToCatalog,
  removeFromCatalog,
  isInCatalog,
  type UserCatalogEntry,
} from './data/userCatalog'

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
  const [ytSyncedLines, setYtSyncedLines] = useState<{time_ms: number, text: string}[]>([])
  const syncedLyricsRef = useRef<HTMLDivElement | null>(null)

  // YT Music structured couplets + AI meaning
  const [ytCouplets, setYtCouplets] = useState<
    { index: number; line1: string; line2: string | null; combined_text: string; is_refrain: boolean }[]
  >([])
  const [selectedYtLine, setSelectedYtLine] = useState<
    { index: number; line1: string; line2: string | null; combined_text: string; is_refrain: boolean } | null
  >(null)
  const [ytMeaning, setYtMeaning] = useState<{
    translation: string; simple: string; detailed: string;
    vocabulary: { term: string; meaning: string }[];
    literary_devices: { device: string; english_name: string; explanation: string }[];
    mood: string; cached: boolean;
  } | null>(null)
  const [ytMeaningLoading, setYtMeaningLoading] = useState<boolean>(false)

  // User catalog state (persisted in localStorage)
  const [userCatalogItems, setUserCatalogItems] = useState<UserCatalogEntry[]>(() => getUserCatalog())

  // `isYT` == showing the pure YT-Music content panel (lyrics, no couplets).
  const isYT = !!ytTrack
  const isStreaming = playbackSource === 'youtube'

  // AI-generated meanings from the ML engine
  const [aiMeaning, setAiMeaning] = useState<{
    translation: string; simple: string; detailed: string;
    vocabulary: { term: string; meaning: string }[];
    literary_devices: { device: string; english_name: string; explanation: string }[];
    mood: string; cached: boolean;
  } | null>(null)
  const [aiLoading, setAiLoading] = useState<boolean>(false)
  const [aiError, setAiError] = useState<string | null>(null)

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

  // Fetch AI-generated meaning when active couplet changes
  useEffect(() => {
    if (isYT || !activeLine?.roman) return
    setAiMeaning(null)
    setAiError(null)
    setAiLoading(true)

    const depth = activeTab === 'LITERARY' ? 'detailed' : 'simple'
    fetch(`${API_BASE}/api/meaning`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        couplet: activeLine.roman,
        poet: activeWork.poet,
        language: 'roman',
        depth,
      }),
    })
      .then((res) => res.ok ? res.json() : Promise.reject(res.statusText))
      .then((data) => {
        setAiMeaning(data)
        setAiLoading(false)
      })
      .catch((err) => {
        console.warn('AI meaning unavailable:', err)
        setAiError('AI meaning unavailable')
        setAiLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLine?.id, activeTab])

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

  // ---- User Catalog (Add to My Catalog) ------------------------------------
  const toggleCatalogEntry = () => {
    if (!ytTrack) return
    if (isInCatalog(ytTrack.videoId)) {
      // Remove it
      const entry = userCatalogItems.find((e) => e.videoId === ytTrack.videoId)
      if (entry) {
        removeFromCatalog(entry.id)
        setUserCatalogItems(getUserCatalog())
      }
    } else {
      // Add it
      addToCatalog({
        videoId: ytTrack.videoId,
        title: ytTrack.title,
        artist: ytTrack.artist,
        album: ytTrack.album,
        thumbnail: ytTrack.coverUrl || ytTrack.thumbnail,
      })
      setUserCatalogItems(getUserCatalog())
    }
  }

  const removeUserCatalogEntry = (id: string) => {
    removeFromCatalog(id)
    setUserCatalogItems(getUserCatalog())
  }

  const playFromUserCatalog = (entry: UserCatalogEntry) => {
    const track: YtTrack = {
      videoId: entry.videoId,
      title: entry.title,
      artist: entry.artist,
      album: entry.album,
      thumbnail: entry.thumbnail,
      coverUrl: entry.thumbnail,
    }
    playYtTrack(track)
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

  const fetchYtLyrics = (videoId: string, title?: string, artist?: string) => {
    setYtLyrics({ text: null, source: null, loading: true })
    setYtSyncedLines([])

    const fallbackToYouTube = () => {
      fetch(`${API_BASE}/api/yt/lyrics/${videoId}`)
        .then((res) => res.json())
        .then((data) => {
          setYtLyrics({ text: data.lyrics || null, source: data.source || null, loading: false })
        })
        .catch(() => setYtLyrics({ text: null, source: null, loading: false }))
    }

    if (title || artist) {
      const params = new URLSearchParams()
      if (title) params.set('title', title)
      if (artist) params.set('artist', artist)

      fetch(`${API_BASE}/api/yt/lyrics/search?${params.toString()}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.hasLyrics) {
            setYtLyrics({ text: data.lyrics || null, source: data.source || 'lrclib', loading: false })
            setYtSyncedLines(data.syncedLines || [])
          } else {
            fallbackToYouTube()
          }
        })
        .catch(() => {
          fallbackToYouTube()
        })
    } else {
      fallbackToYouTube()
    }
  }

  // When ytLyrics.text is fetched, split into structured couplets.
  useEffect(() => {
    if (!ytLyrics.text) {
      setYtCouplets([])
      setSelectedYtLine(null)
      setYtMeaning(null)
      return
    }
    fetch(`${API_BASE}/api/split-lyrics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lyrics_text: ytLyrics.text,
        title: ytTrack?.title || '',
        artist: ytTrack?.artist || '',
      }),
    })
      .then((res) => res.ok ? res.json() : Promise.reject(res.statusText))
      .then((data) => {
        setYtCouplets(data.couplets || [])
      })
      .catch((err) => {
        console.warn('split-lyrics unavailable, falling back to raw lines:', err)
        setYtCouplets([])
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ytLyrics.text])

  // Fetch AI meaning when a YT couplet is selected or tab changes.
  useEffect(() => {
    if (!selectedYtLine) return
    setYtMeaning(null)
    setYtMeaningLoading(true)
    const depth = activeTab === 'LITERARY' ? 'detailed' : 'simple'
    fetch(`${API_BASE}/api/meaning`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        couplet: selectedYtLine.combined_text,
        poet: ytTrack?.artist || '',
        language: 'roman',
        depth,
      }),
    })
      .then((res) => res.ok ? res.json() : Promise.reject(res.statusText))
      .then((data) => {
        setYtMeaning(data)
        setYtMeaningLoading(false)
      })
      .catch((err) => {
        console.warn('AI meaning unavailable for YT couplet:', err)
        setYtMeaningLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYtLine?.index, activeTab])

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
    fetchYtLyrics(track.videoId, track.title, track.artist)
    setSelectedYtLine(null)
    setYtMeaning(null)
    setYtCouplets([])
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

  const toggleSpeech = async () => {
    if (isSpeaking) {
      // Stop any playing audio
      window.speechSynthesis.cancel()
      const ttsAudio = document.getElementById('shama-tts-audio') as HTMLAudioElement | null
      if (ttsAudio) { ttsAudio.pause(); ttsAudio.currentTime = 0 }
      setIsSpeaking(false)
      return
    }

    const textToSpeak = isYT
      ? (selectedYtLine
          ? (activeTab === 'SIMPLE' ? (ytMeaning?.simple || selectedYtLine.combined_text)
             : activeTab === 'LITERARY' ? (ytMeaning?.detailed || selectedYtLine.combined_text)
             : (ytMeaning?.vocabulary || []).map((v) => `${v.term} means ${v.meaning}`).join('. ') || selectedYtLine.combined_text)
          : ytLyrics.text || `Now playing ${ytTrack?.title} by ${ytTrack?.artist} from YouTube Music.`)
      : activeTab === 'SIMPLE'
        ? (aiMeaning?.simple || activeLine.simple)
        : activeTab === 'LITERARY'
        ? (aiMeaning?.detailed || activeLine.detailed)
        : (aiMeaning?.vocabulary || activeLine.vocabulary).map((v) => `${v.term} means ${v.meaning}`).join('. ')

    setIsSpeaking(true)

    try {
      // Try ElevenLabs via our backend
      const res = await fetch(`${API_BASE}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textToSpeak, voice: 'male', language: 'en' }),
      })
      const data = await res.json()

      if (res.ok && data.audio_url && !data.use_browser_tts) {
        // Play ElevenLabs audio
        let ttsAudio = document.getElementById('shama-tts-audio') as HTMLAudioElement | null
        if (!ttsAudio) {
          ttsAudio = document.createElement('audio')
          ttsAudio.id = 'shama-tts-audio'
          document.body.appendChild(ttsAudio)
        }
        ttsAudio.src = data.audio_url
        ttsAudio.onended = () => setIsSpeaking(false)
        ttsAudio.onerror = () => { setIsSpeaking(false) }
        await ttsAudio.play()
        return
      }
    } catch (e) {
      // ElevenLabs unavailable, fall through to browser TTS
      console.warn('ElevenLabs TTS unavailable, using browser fallback:', e)
    }

    // Fallback: browser speech synthesis
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(textToSpeak)
      utterance.rate = 0.9
      utterance.onend = () => setIsSpeaking(false)
      window.speechSynthesis.speak(utterance)
    } else {
      setIsSpeaking(false)
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
        src={activeWork.audioUrl || undefined}
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
                {userCatalogItems.length > 0 && (
                  <span
                    style={{
                      marginLeft: '6px',
                      background: 'var(--color-accent)',
                      color: '#1a1410',
                      borderRadius: '8px',
                      padding: '1px 6px',
                      fontSize: '0.62rem',
                      fontWeight: 'bold',
                    }}
                  >
                    {userCatalogItems.length}
                  </span>
                )}
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
                {/* Add to My Catalog heart button — only for YT tracks */}
                {isYT && ytTrack && (
                  <button
                    type="button"
                    className="console-btn"
                    onClick={toggleCatalogEntry}
                    title={isInCatalog(ytTrack.videoId) ? 'Remove from My Catalog' : 'Add to My Catalog'}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 12px',
                      color: isInCatalog(ytTrack.videoId) ? '#e57373' : 'var(--color-text-muted)',
                      borderColor: isInCatalog(ytTrack.videoId) ? '#e57373' : undefined,
                    }}
                  >
                    <Heart
                      size={16}
                      fill={isInCatalog(ytTrack.videoId) ? '#e57373' : 'none'}
                      stroke={isInCatalog(ytTrack.videoId) ? '#e57373' : 'currentColor'}
                    />
                    <span style={{ fontSize: '0.7rem' }}>
                      {isInCatalog(ytTrack.videoId) ? 'IN CATALOG' : 'ADD TO CATALOG'}
                    </span>
                  </button>
                )}
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
                  <div className="yt-lyrics-body" ref={syncedLyricsRef}>
                    {ytLyrics.loading ? (
                      <div className="yt-lyrics-empty">
                        <Loader2 size={16} className="spin" /> Fetching lyrics…
                      </div>
                    ) : ytSyncedLines.length > 0 ? (
                      ytSyncedLines.map((line, i) => {
                        const currentMs = currentTime * 1000
                        const isActive = line.time_ms <= currentMs && (i === ytSyncedLines.length - 1 || ytSyncedLines[i + 1].time_ms > currentMs)
                        return (
                          <p
                            key={i}
                            className={`yt-lyric-line ${isActive ? 'yt-lyric-line--active' : ''}`}
                            ref={(el) => {
                              if (isActive && el) {
                                el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                              }
                            }}
                          >
                            {line.text.trim() === '' ? '\u00A0' : line.text}
                          </p>
                        )
                      })
                    ) : ytLyrics.text ? (
                      ytCouplets.length > 0 ? (
                        ytCouplets.map((couplet) => (
                          <div
                            key={couplet.index}
                            className={`yt-couplet-block ${selectedYtLine?.index === couplet.index ? 'yt-couplet-block--active' : ''} ${couplet.is_refrain ? 'yt-couplet-block--refrain' : ''}`}
                            onClick={() => setSelectedYtLine(couplet)}
                            style={{
                              padding: '10px 14px',
                              margin: '4px 0',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              border: selectedYtLine?.index === couplet.index ? '1px solid var(--color-accent)' : '1px solid transparent',
                              background: selectedYtLine?.index === couplet.index ? 'rgba(var(--color-accent-rgb, 255,183,77), 0.08)' : 'transparent',
                              transition: 'all 0.2s ease',
                            }}
                          >
                            <p className="yt-lyric-line" style={{ margin: '2px 0', opacity: couplet.is_refrain ? 0.7 : 1 }}>
                              {couplet.line1}
                            </p>
                            {couplet.line2 && (
                              <p className="yt-lyric-line" style={{ margin: '2px 0', opacity: couplet.is_refrain ? 0.7 : 1 }}>
                                {couplet.line2}
                              </p>
                            )}
                            {couplet.is_refrain && (
                              <span className="mono-tag" style={{ fontSize: '0.55rem', opacity: 0.6 }}>MUKARRAR</span>
                            )}
                          </div>
                        ))
                      ) : (
                        ytLyrics.text.split('\n').map((line, i) => (
                          <p key={i} className="yt-lyric-line">
                            {line.trim() === '' ? '\u00A0' : line}
                          </p>
                        ))
                      )
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
              {(!isYT || selectedYtLine) && (
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
                  /* YouTube track details + AI meaning */
                  <>
                    <div
                      style={{
                        marginBottom: '12px',
                        borderBottom: '1px solid var(--color-border)',
                        paddingBottom: '10px'
                      }}
                    >
                      <span className="mono-tag" style={{ color: 'var(--color-highlight)' }}>
                        NOW PLAYING · YT MUSIC
                      </span>
                      <div className="explanation-card" style={{ marginTop: '8px' }}>
                        <div className="explanation-card-header">Track</div>
                        <div className="explanation-card-body">
                          <strong style={{ color: 'var(--color-highlight)' }}>{nowTitle}</strong>
                          {' — '}{nowArtist}
                          {ytTrack?.album && <span className="item-sub-text"> · {ytTrack.album}</span>}
                        </div>
                      </div>
                    </div>

                    {selectedYtLine ? (
                      <>
                        <div style={{ marginBottom: '14px', borderBottom: '1px solid var(--color-border)', paddingBottom: '10px' }}>
                          <span className="mono-tag" style={{ color: 'var(--color-highlight)' }}>ACTIVE COUPLET</span>
                          <p className="verse-translit" style={{ marginTop: '8px', fontSize: '0.86rem' }}>
                            "{selectedYtLine.combined_text}"
                          </p>
                          {ytMeaning?.translation && (
                            <p className="item-sub-text" style={{ marginTop: '6px', fontStyle: 'italic', lineHeight: 1.5 }}>
                              {ytMeaning.translation}
                            </p>
                          )}
                        </div>

                        {activeTab === 'SIMPLE' && (
                          <div className="explanation-card">
                            <div className="explanation-card-header">Simple Meaning</div>
                            <div className="explanation-card-body">
                              {ytMeaningLoading ? (
                                <span style={{ color: 'var(--color-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <Loader2 size={14} className="spin" /> Generating meaning...
                                </span>
                              ) : ytMeaning?.simple ? (
                                <>
                                  {ytMeaning.simple}
                                  {ytMeaning.mood && (
                                    <div className="item-sub-text" style={{ marginTop: '10px' }}>
                                      Mood: <strong style={{ color: 'var(--color-highlight)' }}>{ytMeaning.mood}</strong>
                                      {ytMeaning.cached && ' · cached'}
                                    </div>
                                  )}
                                </>
                              ) : (
                                <span style={{ color: 'var(--color-muted)' }}>Select a couplet to see its meaning.</span>
                              )}
                            </div>
                          </div>
                        )}

                        {activeTab === 'LITERARY' && (
                          <div className="explanation-card">
                            <div className="explanation-card-header">Literary Analysis & Metaphors</div>
                            <div className="explanation-card-body">
                              {ytMeaningLoading ? (
                                <span style={{ color: 'var(--color-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <Loader2 size={14} className="spin" /> Generating analysis...
                                </span>
                              ) : ytMeaning?.detailed ? (
                                <>
                                  {ytMeaning.detailed}
                                  {ytMeaning.literary_devices && ytMeaning.literary_devices.length > 0 && (
                                    <ul style={{ margin: '12px 0 0', paddingLeft: '14px', listStyleType: 'square' }}>
                                      {ytMeaning.literary_devices.map((d, i) => (
                                        <li key={i} style={{ marginBottom: '6px' }}>
                                          <strong style={{ color: 'var(--color-highlight)' }}>{d.device}</strong>
                                          {d.english_name && ` (${d.english_name})`}: {d.explanation}
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </>
                              ) : (
                                <span style={{ color: 'var(--color-muted)' }}>Select a couplet to see literary analysis.</span>
                              )}
                            </div>
                          </div>
                        )}

                        {activeTab === 'GLOSSARY' && (
                          <div className="explanation-card">
                            <div className="explanation-card-header">Vocabulary & Glossary</div>
                            <div className="explanation-card-body">
                              {ytMeaningLoading ? (
                                <span style={{ color: 'var(--color-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <Loader2 size={14} className="spin" /> Loading vocabulary...
                                </span>
                              ) : ytMeaning?.vocabulary && ytMeaning.vocabulary.length > 0 ? (
                                <ul style={{ margin: 0, paddingLeft: '14px', listStyleType: 'square' }}>
                                  {ytMeaning.vocabulary.map((vocab, index) => (
                                    <li key={index} style={{ marginBottom: '8px' }}>
                                      <strong style={{ color: 'var(--color-highlight)' }}>{vocab.term}</strong>: {vocab.meaning}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <span style={{ color: 'var(--color-muted)' }}>Select a couplet to see vocabulary.</span>
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="item-sub-text" style={{ marginTop: '10px', lineHeight: 1.5 }}>
                        Click a couplet on the lyrics deck to see its AI-generated meaning,
                        literary devices, and vocabulary.
                      </p>
                    )}
                  </>
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
                      {aiMeaning?.translation && (
                        <p className="item-sub-text" style={{ marginTop: '6px', fontStyle: 'italic', lineHeight: 1.5 }}>
                          {aiMeaning.translation}
                        </p>
                      )}
                    </div>

                    {/* Tab Content Display */}
                    {activeTab === 'SIMPLE' && (
                      <div className="explanation-card">
                        <div className="explanation-card-header">Simple Meaning</div>
                        <div className="explanation-card-body">
                          {aiLoading ? (
                            <span style={{ color: 'var(--color-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <Loader2 size={14} className="spin" /> Generating meaning...
                            </span>
                          ) : aiMeaning?.simple ? (
                            <>
                              {aiMeaning.simple}
                              {aiMeaning.mood && (
                                <div className="item-sub-text" style={{ marginTop: '10px' }}>
                                  Mood: <strong style={{ color: 'var(--color-highlight)' }}>{aiMeaning.mood}</strong>
                                  {aiMeaning.cached && ' · cached'}
                                </div>
                              )}
                            </>
                          ) : (
                            activeLine.simple
                          )}
                        </div>
                      </div>
                    )}

                    {activeTab === 'LITERARY' && (
                      <div className="explanation-card">
                        <div className="explanation-card-header">Literary Analysis & Metaphors</div>
                        <div className="explanation-card-body">
                          {aiLoading ? (
                            <span style={{ color: 'var(--color-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <Loader2 size={14} className="spin" /> Generating analysis...
                            </span>
                          ) : aiMeaning?.detailed ? (
                            <>
                              {aiMeaning.detailed}
                              {aiMeaning.literary_devices && aiMeaning.literary_devices.length > 0 && (
                                <ul style={{ margin: '12px 0 0', paddingLeft: '14px', listStyleType: 'square' }}>
                                  {aiMeaning.literary_devices.map((d, i) => (
                                    <li key={i} style={{ marginBottom: '6px' }}>
                                      <strong style={{ color: 'var(--color-highlight)' }}>{d.device}</strong>
                                      {d.english_name && ` (${d.english_name})`}: {d.explanation}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </>
                          ) : (
                            activeLine.detailed
                          )}
                        </div>
                      </div>
                    )}

                    {activeTab === 'GLOSSARY' && (
                      <div className="explanation-card">
                        <div className="explanation-card-header">Vocabulary & Glossary</div>
                        <div className="explanation-card-body">
                          {aiLoading ? (
                            <span style={{ color: 'var(--color-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <Loader2 size={14} className="spin" /> Loading vocabulary...
                            </span>
                          ) : (
                            <ul style={{ margin: 0, paddingLeft: '14px', listStyleType: 'square' }}>
                              {(aiMeaning?.vocabulary && aiMeaning.vocabulary.length > 0
                                ? aiMeaning.vocabulary
                                : activeLine.vocabulary
                              ).map((vocab, index) => (
                                <li key={index} style={{ marginBottom: '8px' }}>
                                  <strong style={{ color: 'var(--color-highlight)' }}>{vocab.term}</strong>: {vocab.meaning}
                                </li>
                              ))}
                            </ul>
                          )}
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
                        ? (selectedYtLine ? 'NARRATE MEANING' : 'NARRATE LYRICS')
                        : 'NARRATE DESCRIPTION'}
                    </span>
                  </button>
                  <div className="item-sub-text" style={{ textAlign: 'center', marginTop: '8px' }}>
                    {isYT ? 'Reads fetched lyrics aloud' : 'AI-powered voice narration'}
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

        {/* View 3: User's Personal Catalog + Curator picks */}
        {currentView === 'FEATURED' && (
          <div className="featured-deck">
            {/* User's Personal Catalog Section */}
            <div style={{ marginBottom: '32px' }}>
              <span className="mono-tag" style={{ color: 'var(--color-accent)' }}>
                MY CATALOG · SAVED FROM YT MUSIC
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
                Your Personal Collection
              </h2>

              {userCatalogItems.length === 0 ? (
                <div
                  className="explanation-card"
                  style={{ textAlign: 'center', padding: '40px 20px' }}
                >
                  <div className="explanation-card-body" style={{ color: 'var(--color-text-muted)' }}>
                    <Heart size={32} style={{ marginBottom: '12px', opacity: 0.4 }} />
                    <p style={{ margin: '8px 0', fontSize: '0.88rem' }}>
                      Your catalog is empty. Search on{' '}
                      <button
                        type="button"
                        onClick={() => setCurrentView('YTMUSIC')}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--color-accent)',
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          font: 'inherit',
                        }}
                      >
                        [04] YT Music
                      </button>{' '}
                      and hit the ❤️ button while a ghazal plays to save it here.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="yt-results-grid">
                  {userCatalogItems.map((entry) => (
                    <div
                      key={entry.id}
                      className={`yt-result-card ${
                        isYT && ytTrack?.videoId === entry.videoId ? 'yt-result-card--active' : ''
                      }`}
                      onClick={() => playFromUserCatalog(entry)}
                      style={{ position: 'relative' }}
                    >
                      <div className="yt-result-thumb">
                        {entry.thumbnail ? (
                          <img src={entry.thumbnail} alt={entry.title} />
                        ) : (
                          <Music size={20} />
                        )}
                        <div className="yt-result-play">
                          <Play size={18} />
                        </div>
                      </div>
                      <div className="yt-result-meta">
                        <div className="yt-result-title">{entry.title}</div>
                        <div className="item-sub-text">{entry.artist}</div>
                        {entry.album && (
                          <div className="item-sub-text" style={{ opacity: 0.6 }}>
                            {entry.album}
                          </div>
                        )}
                      </div>
                      {/* Remove button */}
                      <button
                        type="button"
                        title="Remove from catalog"
                        onClick={(e) => {
                          e.stopPropagation()
                          removeUserCatalogEntry(entry.id)
                        }}
                        style={{
                          position: 'absolute',
                          top: '8px',
                          right: '8px',
                          background: 'rgba(0,0,0,0.7)',
                          border: '1px solid rgba(229,115,115,0.4)',
                          borderRadius: '4px',
                          padding: '4px',
                          cursor: 'pointer',
                          color: '#e57373',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Original Curator Picks */}
            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '28px' }}>
              <span className="mono-tag" style={{ color: 'var(--color-accent)' }}>
                CURATORIAL ANNOTATION DESK
              </span>
              <h2
                style={{
                  fontFamily: 'Space Mono',
                  fontSize: '1.4rem',
                  textTransform: 'uppercase',
                  margin: '8px 0 24px 0',
                  letterSpacing: '0.02em'
                }}
              >
                Ghazal Highlights of the Curation Cycle
              </h2>

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
