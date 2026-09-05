import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Loader2, Music, Play, Search, Trash2 } from 'lucide-react'
import './App.css'
import { ShaderBackdrop } from './components/aesthetic/ShaderBackdrop'
import { YouTubePlayer } from './components/YouTubePlayer'
import ListeningStage from './components/listening/ListeningStage'
import MehfilJamBar, { JamJoinPrompt } from './components/listening/MehfilJamBar'
import MehfilQueue from './components/listening/MehfilQueue'
import MeaningPanel, { type StudyTab } from './components/listening/MeaningPanel'
import RecordingSheet, { type Couplet, type SyncedLine } from './components/listening/RecordingSheet'
import SherSheet, { type ScriptMode } from './components/listening/SherSheet'
import type { TimelineMarker } from './components/listening/PoetryTimeline'
import { catalog, type WorkData, type LineData } from './data/ghazals'
import { sanitizeMeaning, type Meaning } from './data/meaning'
import {
  readReadiness,
  writeReadiness,
  score as readinessScore,
  describe as describeReadiness,
  type Readiness,
} from './data/readiness'
import {
  getUserCatalog,
  addToCatalog,
  removeFromCatalog,
  isInCatalog,
  type UserCatalogEntry,
} from './data/userCatalog'
import { useMehfilJam, DRIFT_TOLERANCE_MS, HEARTBEAT_MS } from './data/useMehfilJam'
import {
  makeMehfilItem,
  moveItem,
  readMehfil,
  sameItem,
  writeMehfil,
  type MehfilItem,
} from './data/mehfil'

const API_BASE = 'http://localhost:5000'

/** Nothing technical reaches the user (§17); the detail goes to the console. */
const COPY = {
  noRecording:
    'We couldn’t find a recording of this ghazal right now. You can look for it under Explore.',
  searchDown: 'We couldn’t reach the recordings just now.',
  noResults: 'Nothing came back for that. Try another poet, singer or ghazal.',
}

interface YtTrack {
  videoId: string
  title: string
  artist: string
  album?: string
  duration?: string
  /** Seconds. The single strongest signal that an LRC file is THIS recording. */
  durationSeconds?: number
  thumbnail?: string
  coverUrl?: string
}

type View = 'LISTEN' | 'LIBRARY' | 'EXPLORE'

/** Derived couplet timings, remembered so we align once per recording. */
type TimingStore = Record<string, any> & { __keys?: Record<string, string> }

function readAutoTimings(): TimingStore {
  try {
    const raw = localStorage.getItem('shama.autoTimings')
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeAutoTimings(next: TimingStore) {
  try {
    localStorage.setItem('shama.autoTimings', JSON.stringify(next))
  } catch {
    /* ignore */
  }
}

/** A one-tap correction per recording, remembered locally. */
function readLyricOffset(videoId: string): number {
  try {
    const raw = localStorage.getItem('shama.lyricOffsets')
    return raw ? Number(JSON.parse(raw)[videoId]) || 0 : 0
  } catch {
    return 0
  }
}

function writeLyricOffset(videoId: string, seconds: number) {
  try {
    const raw = localStorage.getItem('shama.lyricOffsets')
    const all = raw ? JSON.parse(raw) : {}
    if (seconds) all[videoId] = seconds
    else delete all[videoId]
    localStorage.setItem('shama.lyricOffsets', JSON.stringify(all))
  } catch {
    /* ignore */
  }
}

/** Which script a sung line is in, so it is rendered with the right face. */
function scriptOf(text: string): 'urdu' | 'other' {
  return /[؀-ۿ]/.test(text) ? 'urdu' : 'other'
}

const FORM_LABELS: Record<string, string> = {
  ghazal: 'غزل',
  nazm: 'نظم',
  qawwali: 'قوّالی',
}

export function App() {
  const [worksList, setWorksList] = useState<any[]>(catalog)
  const [activeWork, setActiveWork] = useState<WorkData>(catalog[0])
  const [activeLine, setActiveLine] = useState<LineData>(catalog[0].lines[0])
  const [scriptMode, setScriptMode] = useState<ScriptMode>('URDU')
  const [studyTab, setStudyTab] = useState<StudyTab>('MEANING')
  const [isPlaying, setIsPlaying] = useState<boolean>(false)
  const [volume, setVolume] = useState<number>(75)
  const [isMuted, setIsMuted] = useState<boolean>(false)
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false)

  const [currentView, setCurrentView] = useState<View>('LISTEN')
  const [quiet, setQuiet] = useState<boolean>(false)
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [moodFilter, setMoodFilter] = useState<string | null>(null)
  // Measured completeness per ghazal, filled in as recordings are prepared.
  const [readiness, setReadiness] = useState<Record<string, Readiness>>(() => readReadiness())

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
  // When we can't tell which recording a ghazal is, we ask instead of guessing.
  const [resolveCandidates, setResolveCandidates] = useState<YtTrack[] | null>(null)
  const [playbackNote, setPlaybackNote] = useState<string | null>(null)
  const resolvedWorkRef = useRef<string | null>(null) // activeWork.id the current ytVideoId belongs to
  const lyricsAbortRef = useRef<AbortController | null>(null)
  // Read by the jam heartbeat and drift check, which run on intervals and must
  // not be torn down and rebuilt four times a second.
  const currentTimeRef = useRef(0)
  const nowTitleRef = useRef('')
  const nowArtistRef = useRef('')
  const durationRef = useRef(0)

  // Recording search state
  const [ytQuery, setYtQuery] = useState<string>('')
  const [ytResults, setYtResults] = useState<YtTrack[]>([])
  const [ytLoading, setYtLoading] = useState<boolean>(false)
  const [ytError, setYtError] = useState<string | null>(null)
  const [ytLyrics, setYtLyrics] = useState<{
    text: string | null
    source: string | null
    loading: boolean
    /** False when the matched LRC belongs to a noticeably different rendition. */
    timingReliable: boolean
    durationDelta: number | null
    otherRenditions: { trackName: string; artistName: string; hasSynced: boolean }[]
  }>({ text: null, source: null, loading: false, timingReliable: false, durationDelta: null, otherRenditions: [] })
  // A one-tap correction, per recording, for when the timings run early/late.
  const [lyricOffset, setLyricOffset] = useState<number>(0)
  const [ytSyncedLines, setYtSyncedLines] = useState<SyncedLine[]>([])

  // Structured couplets + meaning for a searched recording
  const [ytCouplets, setYtCouplets] = useState<Couplet[]>([])
  const [selectedYtLine, setSelectedYtLine] = useState<Couplet | null>(null)
  const [ytMeaning, setYtMeaning] = useState<Meaning | null>(null)
  const [ytMeaningLoading, setYtMeaningLoading] = useState<boolean>(false)
  const [ytMeaningFailed, setYtMeaningFailed] = useState<boolean>(false)

  // Personal collection (persisted in localStorage)
  const [userCatalogItems, setUserCatalogItems] = useState<UserCatalogEntry[]>(() => getUserCatalog())

  // Tonight's Mehfil — the session queue.
  const [mehfil, setMehfil] = useState<MehfilItem[]>(() => readMehfil())
  const [currentMehfilId, setCurrentMehfilId] = useState<string | null>(null)

  // Mehfil Jam — listening together over a shared link.
  const jam = useMehfilJam(API_BASE)
  const isGuest = jam.role === 'guest'

  // `isRecording` == showing a searched recording rather than a curated ghazal.
  const isRecording = !!ytTrack
  const isStreaming = playbackSource === 'youtube'

  // Meaning from the ML engine
  const [aiMeaning, setAiMeaning] = useState<Meaning | null>(null)
  const [aiLoading, setAiLoading] = useState<boolean>(false)
  const [aiFailed, setAiFailed] = useState<boolean>(false)
  const [meaningNonce, setMeaningNonce] = useState<number>(0)
  // A sung line the catalogue has no couplet for, which the listener asked
  // about. The meaning engine works on any text, so nothing has to be missing.
  const [adhocLine, setAdhocLine] = useState<string | null>(null)

  const [follow, setFollow] = useState<boolean>(true)
  // Mukarrar — hold on the couplet being sung and hear it again. The single
  // most useful thing you can do while learning a sher.
  const [loopSher, setLoopSher] = useState<boolean>(false)
  // The span is PINNED when the loop is switched on. Deriving it live from the
  // active line meant it advanced with the playhead, so the end never arrived
  // and nothing ever repeated.
  const [loopSpan, setLoopSpan] = useState<[number, number] | null>(null)
  // Couplet timings derived automatically from the recording's synced lyrics.
  // Keyed workId -> lineId -> seconds. Nobody stamps anything by hand.
  const [autoTimings, setAutoTimings] = useState<Record<string, Record<string, number>>>(
    () => readAutoTimings()
  )
  const [timingState, setTimingState] = useState<'idle' | 'deriving' | 'done' | 'none'>('idle')
  // Every moment a couplet is sung in THIS recording, in order. A ghazal
  // returns to its lines constantly, so one timestamp per couplet describes
  // only the opening minute of a seven-minute performance.
  const [occurrences, setOccurrences] = useState<
    { time: number; couplet: number | null; text: string }[]
  >([])

  // A couplet's start time: a derived timing wins over the seeded value.
  const lineTime = useCallback(
    (work: WorkData, line: LineData): number | null => {
      const derived = autoTimings[work.id]?.[line.id]
      if (typeof derived === 'number') return derived
      return typeof line.t === 'number' ? line.t : null
    },
    [autoTimings]
  )
  const workLineTime = useCallback(
    (line: LineData) => lineTime(activeWork, line),
    [lineTime, activeWork]
  )
  const hasTimestamps = activeWork.lines.some((l) => lineTime(activeWork, l) !== null)

  // ---- Meaning ------------------------------------------------------------
  useEffect(() => {
    const subject = adhocLine || activeLine?.roman
    if (isRecording || !subject) return
    setAiMeaning(null)
    setAiFailed(false)
    setAiLoading(true)

    fetch(`${API_BASE}/api/meaning`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        couplet: subject,
        poet: activeWork.poet,
        // The sung line may be Devanagari or Urdu; the engine reads either.
        language: 'roman',
      }),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(res.statusText)))
      .then((data) => {
        const clean = sanitizeMeaning(data)
        if (clean) {
          setAiMeaning(clean)
        } else {
          // The service answered but had nothing showable. Detail stays here.
          console.warn('[shama] meaning service returned no usable content:', data)
          setAiFailed(true)
        }
        setAiLoading(false)
      })
      .catch((err) => {
        // Logged for us, never surfaced to the reader.
        console.warn('[shama] meaning request failed:', err)
        setAiFailed(true)
        setAiLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLine?.id, adhocLine, meaningNonce])

  // Where the singer is right now, as an index into the performance timeline.
  const currentOccurrence = useMemo(() => {
    if (isRecording || occurrences.length === 0) return null
    // +0.15s lead offsets the 250ms progress poll.
    const t = currentTime + 0.15
    let found: (typeof occurrences)[number] | null = null
    for (const o of occurrences) {
      if (o.time <= t) found = o
      else break
    }
    if (!found) return null
    // Let the last line go once the singing is clearly over, rather than
    // leaving a couplet lit through several minutes of outro.
    const last = occurrences[occurrences.length - 1]
    if (found === last && duration > 0 && t - last.time > 25) return null
    return found
  }, [isRecording, occurrences, currentTime, duration])

  // The couplet the singer is on. Falls back to the seeded timings when we
  // have no occurrence timeline for this recording.
  const activeSyncLineId = useMemo(() => {
    if (isRecording) return null
    if (occurrences.length > 0) {
      const idx = currentOccurrence?.couplet
      return idx != null ? activeWork.lines[idx]?.id ?? null : null
    }
    let current: string | null = null
    for (const l of activeWork.lines) {
      const t = lineTime(activeWork, l)
      if (t !== null && t <= currentTime + 0.15) current = l.id
    }
    return current
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTime, activeWork, autoTimings, isRecording, occurrences, currentOccurrence])

  // A shared link (?mehfil=TOKEN) drops you straight into someone's mehfil.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const tok = new URLSearchParams(window.location.search).get('mehfil')
    if (tok) jam.join(tok.toLowerCase())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Guest: follow whatever the host is playing.
  useEffect(() => {
    if (!isGuest || !jam.remote) return
    const remote = jam.remote
    if (remote.videoId && remote.videoId !== ytVideoId) {
      // Adopt the host's recording. We only carry what the host broadcast —
      // no metadata is invented for a track we haven't looked up.
      setPlaybackSource('youtube')
      setYtTrack({
        videoId: remote.videoId,
        title: remote.title || 'Now playing',
        artist: remote.artist || '',
        durationSeconds: remote.durationSeconds || undefined,
      })
      setYtVideoId(remote.videoId)
      resolvedWorkRef.current = null
      setSelectedYtLine(null)
      setYtCouplets([])
      fetchYtLyrics({
        videoId: remote.videoId,
        title: remote.title || '',
        artist: remote.artist || '',
        // Without this a guest's lyric match is duration-blind — the very
        // defect that made lyrics pick the wrong recording in the first place.
        durationSeconds: remote.durationSeconds || undefined,
      })
    }
    if (!jam.needsGesture) setIsPlaying(!remote.paused)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGuest, jam.remote?.videoId, jam.remote?.paused, jam.remote?.updatedAt, jam.needsGesture])

  // Guest: nudge back into line only when we have genuinely drifted. Seeking on
  // every tick would stutter; ignoring drift lets the room fall apart.
  useEffect(() => {
    if (!isGuest || jam.needsGesture || !jam.remote || jam.remote.paused) return
    const id = setInterval(() => {
      const expected = jam.expectedPositionMs()
      if (expected === null) return
      const drift = Math.abs(expected - currentTimeRef.current * 1000)
      if (drift > DRIFT_TOLERANCE_MS) seekTo(expected / 1000)
    }, 2000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGuest, jam.needsGesture, jam.remote?.paused, jam.remote?.updatedAt])

  // Host: broadcast the transport on every change plus a slow heartbeat, so a
  // guest who joins mid-ghazal lands in the right place.
  useEffect(() => {
    if (jam.role !== 'host') return
    const send = () =>
      jam.publish({
        videoId: ytVideoId,
        positionMs: Math.round(currentTimeRef.current * 1000),
        paused: !isPlaying,
        title: nowTitleRef.current,
        artist: nowArtistRef.current,
        durationSeconds: Math.round(durationRef.current),
        queue: mehfil.map((m) => ({ title: m.title, artist: m.artist })),
      })
    send()
    const id = setInterval(send, HEARTBEAT_MS)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jam.role, jam.connected, ytVideoId, isPlaying, mehfil])

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
              coverUrl: item.cover_url || item.coverUrl || '',
            }))
          if (extras.length > 0) setWorksList([...catalog, ...extras])
        }
      })
      .catch(() => {
        console.log('[shama] works API unreachable — using the local catalog.')
      })
  }, [])

  // A curated work changed → reset the transport. Playback (re)starts on demand
  // via handlePlayPause, which resolves a YouTube video for the work.
  useEffect(() => {
    resolvedWorkRef.current = null
    setYtVideoId(null)
    setResolveCandidates(null)
    setAdhocLine(null)
    setOccurrences([])
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setPlaybackNote(null)
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = activeWork.audioUrl || ''
    }
  }, [activeWork])

  // Sync Volume variables
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume / 100
    }
  }, [volume, isMuted])

  // Once a curated ghazal has a resolved recording and a known duration, work
  // out its couplet timings from that recording's synced lyrics. This is what
  // replaced asking the listener to tap every couplet.
  useEffect(() => {
    if (isRecording || !ytVideoId || !duration) return
    if (resolvedWorkRef.current !== activeWork.id) return
    void deriveTimings(activeWork, ytVideoId, duration)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWork.id, ytVideoId, duration, isRecording])

  // Following the singer: keep the selected couplet on the one being sung.
  // (The scrolling itself happens inside the sheet, not the window.)
  useEffect(() => {
    if (!follow || !activeSyncLineId) return
    const line = activeWork.lines.find((l) => l.id === activeSyncLineId)
    if (line && line.id !== activeLine.id) setActiveLine(line)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSyncLineId, follow])

  // ---- Tonight's Mehfil ----------------------------------------------------
  const persistMehfil = (next: MehfilItem[]) => {
    setMehfil(next)
    writeMehfil(next)
  }

  const mehfilIndex = currentMehfilId ? mehfil.findIndex((m) => m.id === currentMehfilId) : -1

  /** Put an entry in tonight's mehfil (if it isn't already) and make it current. */
  const enqueue = (entry: Omit<MehfilItem, 'id'>) => {
    const candidate = makeMehfilItem(entry)
    const existing = mehfil.find((m) => sameItem(m, candidate))
    if (existing) {
      setCurrentMehfilId(existing.id)
      return
    }
    persistMehfil([...mehfil, candidate])
    setCurrentMehfilId(candidate.id)
  }

  const removeFromMehfil = (index: number) => {
    const item = mehfil[index]
    if (!item) return
    if (item.id === currentMehfilId) setCurrentMehfilId(null)
    persistMehfil(mehfil.filter((_, i) => i !== index))
  }

  const reorderMehfil = (from: number, to: number) => {
    persistMehfil(moveItem(mehfil, from, to))
  }

  const playNextInMehfil = (index: number) => {
    if (mehfilIndex < 0) return
    persistMehfil(moveItem(mehfil, index, index < mehfilIndex ? mehfilIndex : mehfilIndex + 1))
  }

  // ---- Playback engine -----------------------------------------------------
  const updateProgress = (current: number, dur: number) => {
    currentTimeRef.current = current
    durationRef.current = dur
    setCurrentTime(current)
    setDuration(dur)
  }

  const seekTo = (sec: number) => {
    if (playbackSource === 'youtube') setYtSeek(sec)
    else if (audioRef.current) audioRef.current.currentTime = sec
  }

  // Resolve a YouTube recording for a curated work (cached per work id).
  //
  // Search ranks by relevance, not by "is this the song you asked for", so
  // taking result #1 unchecked used to play a different ghazal entirely — and
  // then, correctly, find no lyrics for it. We now only auto-play a confident
  // match and otherwise let the listener choose.
  const ensureCuratedVideo = async (work: WorkData): Promise<string | null> => {
    if (ytVideoId && resolvedWorkRef.current === work.id) return ytVideoId
    setResolving(true)
    setResolveCandidates(null)
    try {
      const params = new URLSearchParams({ title: work.title, artist: work.artist })
      const res = await fetch(`${API_BASE}/api/yt/resolve?${params.toString()}`)
      if (!res.ok) throw new Error(String(res.status))
      const data = await res.json()

      if (data.best?.videoId) {
        resolvedWorkRef.current = work.id
        setYtVideoId(data.best.videoId)
        return data.best.videoId
      }

      const candidates: YtTrack[] = (data.candidates || []).slice(0, 5).map((r: any) => ({
        videoId: r.videoId,
        title: r.title,
        artist: r.artist,
        durationSeconds: r.durationSeconds,
        duration: r.duration,
      }))
      resolvedWorkRef.current = null
      setYtVideoId(null)
      setResolveCandidates(candidates.length ? candidates : [])
      return null
    } catch (err) {
      console.warn('[shama] could not resolve a recording for', work.title, err)
      return null
    } finally {
      setResolving(false)
    }
  }

  /** The listener picked which recording this ghazal is. */
  const playCandidate = (track: YtTrack) => {
    setResolveCandidates(null)
    resolvedWorkRef.current = activeWork.id
    setPlaybackSource('youtube')
    setYtVideoId(track.videoId)
    setPlaybackNote(null)
    setIsPlaying(true)
  }

  const handlePlayPause = async () => {
    // A searched recording: flip intent, the IFrame player reports the real state.
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
        console.warn('[shama] no playable source for', activeWork.title, (err as any)?.message)
        setPlaybackNote(COPY.noRecording)
      }
    } else {
      setPlaybackNote(COPY.noRecording)
    }
  }

  // ---- Curated works -------------------------------------------------------
  const resolveWork = async (work: any): Promise<WorkData> => {
    if (work.lines && work.lines.length > 0) return work as WorkData
    try {
      const res = await fetch(`${API_BASE}/api/works/${work.id}`)
      const data = await res.json()
      if (data && data.lines && data.lines.length > 0) {
        const formattedLines = data.lines.map((l: any) => ({
          ...l,
          englishText: l.english_text || l.englishText,
        }))
        const localMatch = catalog.find((c) => c.id === work.id)
        return {
          ...data,
          audioUrl: data.audio_url || data.audioUrl || (localMatch ? localMatch.audioUrl : ''),
          coverUrl: data.cover_url || data.coverUrl || (localMatch ? localMatch.coverUrl : ''),
          lines: formattedLines,
        }
      }
    } catch {
      /* fall through to the local catalog */
    }
    return (catalog.find((w) => w.id === work.id) || work) as WorkData
  }

  const openWork = async (work: any, play = false, alreadyQueued = false) => {
    // Opening a curated ghazal drops any searched recording; the activeWork
    // effect then resets the transport.
    setYtTrack(null)
    const resolved = await resolveWork(work)
    setActiveWork(resolved)
    setActiveLine(resolved.lines[0])
    // Stepping through the mehfil is already pointed at its entry — enqueueing
    // again could append a duplicate if the resolved id ever drifts.
    if (!alreadyQueued) {
      enqueue({
        kind: 'work',
        workId: resolved.id,
        title: resolved.title,
        artist: resolved.artist,
        poet: resolved.poet,
        thumbnail: resolved.coverUrl,
      })
    }
    setCurrentView('LISTEN')
    if (!play) return
    setPlaybackSource('youtube')
    // ensureCuratedVideo goes to the network, so the activeWork reset effect has
    // already run by the time we ask for playback.
    const vid = await ensureCuratedVideo(resolved)
    if (vid) setIsPlaying(true)
    else if (!resolveCandidates) setPlaybackNote(COPY.noRecording)
  }

  const handleLineSelect = (line: LineData) => {
    setAdhocLine(null)
    setActiveLine(line)
    const t = workLineTime(line)
    if (t !== null) seekTo(t)
    stopSpeaking()
  }

  // ---- Automatic couplet timings -----------------------------------------
  // Fetch the recording's synced lyrics and align the catalogue's couplets to
  // them. Runs once per (work, recording) and is remembered locally.
  const deriveTimings = useCallback(
    async (work: WorkData, videoId: string, durationSeconds: number) => {
      const cacheKey = `${work.id}:${videoId}`
      const already = readAutoTimings()
      const cachedTimings = already[work.id] && already.__keys?.[work.id] === cacheKey
      // Only short-circuit once we ALSO hold a readiness measurement; otherwise
      // a work aligned before readiness existed would never be measured.
      if (cachedTimings && readReadiness()[work.id]) {
        setAutoTimings(already)
        setOccurrences(already.__occurrences?.[cacheKey] || [])
        setTimingState('done')
        return
      }
      setTimingState('deriving')
      setOccurrences([])
      try {
        const params = new URLSearchParams({ title: work.title, artist: work.artist })
        if (durationSeconds) params.set('duration', String(Math.round(durationSeconds)))
        const lyricRes = await fetch(`${API_BASE}/api/yt/lyrics/search?${params.toString()}`)
        if (!lyricRes.ok) throw new Error(`lyrics ${lyricRes.status}`)
        const lyrics = await lyricRes.json()
        const lines = lyrics.syncedLines || []

        const record = (coverage: number) => {
          const value: Readiness = {
            hasLyrics: !!lyrics.hasLyrics,
            hasSynced: lines.length > 0,
            timingReliable: !!lyrics.timingReliable,
            coverage,
            couplets: work.lines.length,
            checkedAt: Date.now(),
          }
          writeReadiness(work.id, value)
          setReadiness((prev) => ({ ...prev, [work.id]: value }))
        }

        if (!lines.length) {
          record(0)
          setTimingState('none')
          return
        }
        const alignRes = await fetch(`${API_BASE}/api/align-couplets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            // Every script we hold, so the matcher can work in whichever one
            // the lyric source happens to use (usually Devanagari).
            couplets: work.lines.map((l) => [l.hindi, l.urdu, l.roman].filter(Boolean)),
            lines,
          }),
        })
        if (!alignRes.ok) throw new Error(`align ${alignRes.status}`)
        const { aligned, matched, occurrences: occ, coverage } = await alignRes.json()
        setOccurrences(Array.isArray(occ) ? occ : [])
        record(typeof coverage === 'number' ? coverage : 0)
        if (!matched) {
          setTimingState('none')
          return
        }
        const map: Record<string, number> = {}
        for (const a of aligned as { index: number; time: number | null }[]) {
          const line = work.lines[a.index]
          if (line && a.time !== null) map[line.id] = a.time
        }
        const next = { ...already, [work.id]: map }
        next.__keys = { ...(already.__keys || {}), [work.id]: cacheKey }
        next.__occurrences = { ...(already.__occurrences || {}), [cacheKey]: occ || [] }
        writeAutoTimings(next)
        setAutoTimings(next)
        setTimingState('done')
      } catch (err) {
        console.warn('[shama] could not derive couplet timings:', err)
        setTimingState('none')
      }
    },
    []
  )

  // ---- Personal collection -------------------------------------------------
  const toggleCollected = () => {
    if (!ytTrack) return
    if (isInCatalog(ytTrack.videoId)) {
      const entry = userCatalogItems.find((e) => e.videoId === ytTrack.videoId)
      if (entry) {
        removeFromCatalog(entry.id)
        setUserCatalogItems(getUserCatalog())
      }
    } else {
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

  const removeCollected = (id: string) => {
    removeFromCatalog(id)
    setUserCatalogItems(getUserCatalog())
  }

  // ---- Recordings ----------------------------------------------------------
  const runSearch = (e?: React.FormEvent, term?: string) => {
    if (e) e.preventDefault()
    const q = (term ?? ytQuery).trim()
    if (!q) return
    setYtQuery(q)
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
          durationSeconds: r.durationSeconds,
          thumbnail: r.thumbnail,
          coverUrl: r.thumbnail
            ? `${API_BASE}/api/yt/thumb?u=${encodeURIComponent(r.thumbnail)}`
            : undefined,
        }))
        setYtResults(results)
        if (results.length === 0) {
          if (data.error) console.warn('[shama] search returned an error:', data.error)
          setYtError(COPY.noResults)
        }
        setYtLoading(false)
      })
      .catch((err) => {
        console.warn('[shama] recordings search unreachable:', err)
        setYtResults([])
        setYtError(COPY.searchDown)
        setYtLoading(false)
      })
  }

  const fetchYtLyrics = (track: YtTrack) => {
    const { videoId, title, artist, album, durationSeconds } = track

    // Cancel any in-flight lookup: without this, switching tracks quickly let
    // the slower response land last and paint track A's lyrics over track B.
    lyricsAbortRef.current?.abort()
    const controller = new AbortController()
    lyricsAbortRef.current = controller

    setYtLyrics({ text: null, source: null, loading: true, timingReliable: false, durationDelta: null, otherRenditions: [] })
    setYtSyncedLines([])
    setLyricOffset(readLyricOffset(videoId))

    const settle = (patch: Partial<{ text: string | null; source: string | null; timingReliable: boolean; durationDelta: number | null; otherRenditions: { trackName: string; artistName: string; hasSynced: boolean }[] }>) =>
      setYtLyrics((prev) => ({ ...prev, loading: false, ...patch }))

    const fallbackToYouTube = () => {
      fetch(`${API_BASE}/api/yt/lyrics/${videoId}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
        .then((data) => settle({ text: data.lyrics || null, source: data.source || null }))
        .catch((err) => {
          if (controller.signal.aborted) return
          console.warn('[shama] lyrics lookup failed:', err)
          settle({ text: null, source: null })
        })
    }

    if (title || artist) {
      const params = new URLSearchParams()
      if (title) params.set('title', title)
      if (artist) params.set('artist', artist)
      // Duration and album are what let the server tell renditions apart.
      if (durationSeconds) params.set('duration', String(durationSeconds))
      if (album) params.set('album', album)

      fetch(`${API_BASE}/api/yt/lyrics/search?${params.toString()}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
        .then((data) => {
          if (controller.signal.aborted) return
          if (!data.hasLyrics && (data.otherRenditions || []).length) {
            settle({ text: null, source: null, otherRenditions: data.otherRenditions })
            return
          }
          if (data.hasLyrics) {
            if (data.syncParseFailed) {
              console.warn('[shama] synced lyrics existed but could not be parsed')
            }
            settle({
              text: data.lyrics || null,
              source: data.source || 'lrclib',
              timingReliable: !!data.timingReliable,
              durationDelta: data.durationDelta ?? null,
              otherRenditions: data.otherRenditions || [],
            })
            setYtSyncedLines(data.syncedLines || [])
          } else {
            fallbackToYouTube()
          }
        })
        .catch((err) => {
          if (controller.signal.aborted) return
          console.warn('[shama] lyrics search failed:', err)
          fallbackToYouTube()
        })
    } else {
      fallbackToYouTube()
    }
  }

  // When lyrics arrive, split them into structured couplets.
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
      .then((res) => (res.ok ? res.json() : Promise.reject(res.statusText)))
      .then((data) => {
        setYtCouplets(data.couplets || [])
      })
      .catch((err) => {
        console.warn('[shama] couplet splitting unavailable, showing raw lines:', err)
        setYtCouplets([])
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ytLyrics.text])

  // Meaning for whatever line of a searched recording is under discussion.
  //
  // This used to key off `selectedYtLine`, which only the couplet branch ever
  // sets — so a recording with SYNCED lyrics (the common, better case) had no
  // way to ever fill the panel. `adhocLine` covers both branches.
  useEffect(() => {
    const subject = adhocLine || selectedYtLine?.combined_text
    if (!isRecording || !subject) return
    setYtMeaning(null)
    setYtMeaningFailed(false)
    setYtMeaningLoading(true)
    fetch(`${API_BASE}/api/meaning`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        couplet: subject,
        poet: ytTrack?.artist || '',
        language: 'roman',
      }),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(res.statusText)))
      .then((data) => {
        const clean = sanitizeMeaning(data)
        if (clean) {
          setYtMeaning(clean)
        } else {
          console.warn('[shama] meaning service returned no usable content:', data)
          setYtMeaningFailed(true)
        }
        setYtMeaningLoading(false)
      })
      .catch((err) => {
        console.warn('[shama] meaning request failed for the selected couplet:', err)
        setYtMeaningFailed(true)
        setYtMeaningLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording, adhocLine, selectedYtLine?.index, meaningNonce])

  const playRecording = (track: YtTrack) => {
    // Stop the archive audio engine and hand playback to YouTube.
    if (audioRef.current) audioRef.current.pause()
    setPlaybackSource('youtube')
    setYtTrack(track)
    setYtVideoId(track.videoId)
    resolvedWorkRef.current = null
    setPlaybackNote(null)
    setCurrentTime(0)
    setDuration(0)
    setIsPlaying(true)
    setCurrentView('LISTEN')
    fetchYtLyrics(track)
    setSelectedYtLine(null)
    setYtMeaning(null)
    setYtCouplets([])
    enqueue({
      kind: 'recording',
      videoId: track.videoId,
      title: track.title,
      artist: track.artist,
      thumbnail: track.coverUrl || track.thumbnail,
    })
    stopSpeaking()
  }

  const playCollected = (entry: UserCatalogEntry) => {
    playRecording({
      videoId: entry.videoId,
      title: entry.title,
      artist: entry.artist,
      album: entry.album,
      thumbnail: entry.thumbnail,
      coverUrl: entry.thumbnail,
    })
  }

  const playMehfilAt = (index: number) => {
    const item = mehfil[index]
    if (!item) return
    setCurrentMehfilId(item.id)
    if (item.kind === 'work') {
      const work = worksList.find((w) => w.id === item.workId) || catalog.find((w) => w.id === item.workId)
      if (work) void openWork(work, true, true)
      return
    }
    if (item.videoId) {
      playRecording({
        videoId: item.videoId,
        title: item.title,
        artist: item.artist,
        thumbnail: item.thumbnail,
        coverUrl: item.thumbnail,
      })
    }
  }

  const hasPrev = mehfilIndex > 0
  const hasNext = mehfilIndex > -1 && mehfilIndex < mehfil.length - 1
  const goPrev = () => hasPrev && playMehfilAt(mehfilIndex - 1)
  const goNext = () => hasNext && playMehfilAt(mehfilIndex + 1)

  const onTrackEnded = () => {
    setIsPlaying(false)
    setCurrentTime(0)
    if (hasNext) playMehfilAt(mehfilIndex + 1)
  }

  // ---- Voice ---------------------------------------------------------------
  const stopSpeaking = () => {
    if (typeof window === 'undefined') return
    window.speechSynthesis?.cancel()
    const ttsAudio = document.getElementById('shama-tts-audio') as HTMLAudioElement | null
    if (ttsAudio) {
      ttsAudio.pause()
      ttsAudio.currentTime = 0
    }
    setIsSpeaking(false)
  }

  const speak = async (textToSpeak: string) => {
    if (!textToSpeak) return
    setIsSpeaking(true)
    try {
      const res = await fetch(`${API_BASE}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textToSpeak, voice: 'male', language: 'en' }),
      })
      const data = await res.json()

      if (res.ok && data.audio_url && !data.use_browser_tts) {
        let ttsAudio = document.getElementById('shama-tts-audio') as HTMLAudioElement | null
        if (!ttsAudio) {
          ttsAudio = document.createElement('audio')
          ttsAudio.id = 'shama-tts-audio'
          document.body.appendChild(ttsAudio)
        }
        ttsAudio.src = data.audio_url
        ttsAudio.onended = () => setIsSpeaking(false)
        ttsAudio.onerror = () => setIsSpeaking(false)
        await ttsAudio.play()
        return
      }
    } catch (err) {
      console.warn('[shama] voice service unavailable, using the browser voice:', err)
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(textToSpeak)
      utterance.rate = 0.9
      utterance.onend = () => setIsSpeaking(false)
      window.speechSynthesis.speak(utterance)
    } else {
      setIsSpeaking(false)
    }
  }

  const pronounce = (term: string) => {
    stopSpeaking()
    void speak(term)
  }

  // ---- Derived view data ---------------------------------------------------
  const formatTime = (time: number) => {
    if (!isFinite(time) || isNaN(time)) return '0:00'
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const nowTitle = isRecording ? ytTrack!.title : activeWork.title
  const nowArtist = isRecording ? ytTrack!.artist : activeWork.artist
  const nowCover = isRecording ? ytTrack!.coverUrl : activeWork.coverUrl
  nowTitleRef.current = nowTitle
  nowArtistRef.current = nowArtist

  const activeSyncedIndex = useMemo(() => {
    if (!isRecording || ytSyncedLines.length === 0) return -1
    // +150ms lead matches the curated path and offsets the 250ms poll, which
    // otherwise makes every highlight land systematically late.
    const ms = (currentTime - lyricOffset) * 1000 + 150
    let idx = -1
    for (let i = 0; i < ytSyncedLines.length; i++) {
      if (ytSyncedLines[i].time_ms <= ms) idx = i
      else break
    }
    // Release the final line instead of leaving it "singing" through the whole
    // outro: treat it as over once it has run longer than any other line.
    if (idx === ytSyncedLines.length - 1 && idx > 0 && duration > 0) {
      const started = ytSyncedLines[idx].time_ms
      const longest = ytSyncedLines.reduce((max, l, i) =>
        i === 0 ? max : Math.max(max, l.time_ms - ytSyncedLines[i - 1].time_ms), 0)
      if (ms - started > Math.max(longest * 1.5, 15000)) return -1
    }
    return idx
  }, [isRecording, ytSyncedLines, currentTime, lyricOffset, duration])

  /** [start, end) of whatever is being sung right now, if we know it. */
  const currentSpan = useMemo((): [number, number] | null => {
    if (isRecording) {
      if (activeSyncedIndex < 0 || ytSyncedLines.length === 0) return null
      const start = ytSyncedLines[activeSyncedIndex].time_ms / 1000 + lyricOffset
      const next = ytSyncedLines[activeSyncedIndex + 1]
      return [start, next ? next.time_ms / 1000 + lyricOffset : duration || start + 30]
    }
    if (!currentOccurrence || occurrences.length === 0) return null
    const i = occurrences.indexOf(currentOccurrence)
    const next = occurrences[i + 1]
    return [currentOccurrence.time, next ? next.time : duration || currentOccurrence.time + 30]
  }, [isRecording, activeSyncedIndex, ytSyncedLines, lyricOffset, currentOccurrence, occurrences, duration])

  // Hold on this sher until the listener has it.
  useEffect(() => {
    if (!loopSher || !loopSpan) return
    const [start, end] = loopSpan
    // Also catch a manual seek out of the span: the loop should follow the
    // listener rather than yanking them back from wherever they went.
    if (currentTime >= end - 0.05 || currentTime < start - 1.5) seekTo(start)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loopSher, loopSpan, currentTime])

  const toggleLoop = () => {
    setLoopSher((on) => {
      if (on) {
        setLoopSpan(null)
        return false
      }
      if (!currentSpan) return false
      setLoopSpan(currentSpan)
      return true
    })
  }

  // A new recording or ghazal ends the repeat.
  useEffect(() => {
    setLoopSher(false)
    setLoopSpan(null)
  }, [activeWork.id, ytVideoId])

  // The couplet that carries the stage.
  const heroCouplet = useMemo(() => {
    if (!isRecording) {
      // Sung right now, but not a couplet we hold: show the words anyway
      // rather than going blank for minutes at a time.
      if (currentOccurrence && currentOccurrence.couplet === null) {
        const text = currentOccurrence.text
        return scriptOf(text) === 'urdu' ? { urdu: text } : { roman: text }
      }
      return {
        urdu: activeLine.urdu,
        roman: activeLine.transliteration || activeLine.roman,
        english: activeLine.translation,
      }
    }
    if (activeSyncedIndex > -1) {
      return { roman: ytSyncedLines[activeSyncedIndex]?.text?.trim() || '' }
    }
    if (selectedYtLine) return { roman: selectedYtLine.combined_text }
    return null
  }, [isRecording, activeLine, activeSyncedIndex, ytSyncedLines, selectedYtLine, currentOccurrence])

  // What the hero says when no couplet is current — never claim the words are
  // missing while they are sitting in the sheet below (§22, §25).
  const heroFallback = useMemo(() => {
    if (!isRecording) return ''
    if (ytLyrics.loading) return 'Preparing the mehfil…'
    if (ytSyncedLines.length > 0 || ytCouplets.length > 0 || ytLyrics.text) {
      return 'Choose a couplet below to bring it up here.'
    }
    return 'Lyrics aren’t available for this recording.'
  }, [isRecording, ytLyrics.loading, ytLyrics.text, ytSyncedLines.length, ytCouplets.length])

  // Sher boundaries for the timeline — real timings only (§14, §22).
  const timelineMarkers: TimelineMarker[] = useMemo(() => {
    if (isRecording) {
      return ytSyncedLines.length > 4 && ytSyncedLines.length < 80
        ? ytSyncedLines.map((l, i) => ({ id: `s${i}`, label: '', t: l.time_ms / 1000 }))
        : []
    }
    // Every return to a couplet, so the ticks describe the whole recording
    // rather than bunching into its opening minute.
    if (occurrences.length > 0) {
      return occurrences
        .filter((o) => o.couplet !== null)
        .map((o, i) => ({ id: `o${i}`, label: `Sher ${(o.couplet ?? 0) + 1}`, t: o.time }))
    }
    return activeWork.lines
      .map((l) => ({ id: l.id, t: lineTime(activeWork, l) }))
      .filter((m): m is { id: string; t: number } => m.t !== null)
      .map((m, i) => ({ id: m.id, label: `Sher ${i + 1}`, t: m.t }))
  }, [isRecording, ytSyncedLines, activeWork, lineTime, occurrences])

  const sectionLabel = useMemo(() => {
    if (isRecording || !activeSyncLineId) return null
    const i = activeWork.lines.findIndex((l) => l.id === activeSyncLineId)
    if (i < 0) return null
    if (i === 0) return 'Matla'
    if (i === activeWork.lines.length - 1) return 'Maqta'
    return `Sher ${String(i + 1).padStart(2, '0')}`
  }, [isRecording, activeSyncLineId, activeWork])

  const formLabel = isRecording ? null : FORM_LABELS[(activeWork.form || '').toLowerCase()] || null

  const narrationText = isRecording
    ? studyTab === 'MEANING'
      ? ytMeaning?.simple || selectedYtLine?.combined_text || ''
      : studyTab === 'CONTEXT'
      ? ytMeaning?.detailed || selectedYtLine?.combined_text || ''
      : (ytMeaning?.vocabulary || []).map((v) => `${v.term} means ${v.meaning}`).join('. ')
    : studyTab === 'MEANING'
    ? aiMeaning?.simple || activeLine.simple
    : studyTab === 'CONTEXT'
    ? aiMeaning?.detailed || activeLine.detailed
    : (aiMeaning?.vocabulary || activeLine.vocabulary)
        .map((v) => `${v.term} means ${v.meaning}`)
        .join('. ')

  const toggleNarration = () => {
    if (isSpeaking) stopSpeaking()
    else void speak(narrationText)
  }

  const moods = useMemo(() => {
    const seen = new Set<string>()
    worksList.forEach((w) => {
      if (w.mood) seen.add(w.mood)
    })
    const list = Array.from(seen)
    // One mood per ghazal isn't a grouping — showing it as a filter would just
    // hide everything else on every click. Each row still wears its own mood.
    return list.length > 1 && list.length < worksList.length ? list : []
  }, [worksList])

  const orderedWorks = useMemo(() => {
    // Ghazals where the whole experience works come first. Unmeasured ones
    // keep their catalogue position rather than being pushed to the bottom —
    // "not checked yet" is not the same as "poor".
    const withScore = worksList.map((w, i) => ({
      w,
      i,
      known: readiness[w.id] !== undefined,
      s: readinessScore(readiness[w.id]),
    }))
    return withScore
      .sort((a, b) => (a.known && b.known ? b.s - a.s : a.known === b.known ? a.i - b.i : a.known ? -1 : 1))
      .map((x) => x.w)
  }, [worksList, readiness])

  const filteredWorks = orderedWorks.filter((work) => {
    const q = searchTerm.toLowerCase()
    const matchesText =
      !q ||
      work.title.toLowerCase().includes(q) ||
      work.poet.toLowerCase().includes(q) ||
      work.artist.toLowerCase().includes(q)
    const matchesMood = !moodFilter || work.mood === moodFilter
    return matchesText && matchesMood
  })

  const exploreSubject = (name: string) => {
    setYtQuery(name)
    setCurrentView('EXPLORE')
    runSearch(undefined, name)
  }

  // -------------------------------------------------------------- render ----
  return (
    <main className="shama-shell">
      <div className="noise-overlay" />
      <ShaderBackdrop />

      {/* Archive.org audio engine (fallback for the curated catalog).
          Both engines live outside the view switch so changing view never
          interrupts playback. */}
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
            setPlaybackNote(COPY.noRecording)
          }
        }}
        onEnded={() => {
          if (playbackSource !== 'archive') return
          onTrackEnded()
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
          onTrackEnded()
        }}
      />

      <JamJoinPrompt jam={jam} />

      <div className="shama-room">
        <header className="room-header">
          <div className="brand">
            <span className="liquid-logo" aria-hidden="true">
              <span className="liquid-logo__letter">ش</span>
            </span>
            <div>
              <h1 className="brand-name">SHAMA</h1>
              <div className="brand-sub">A digital mehfil</div>
            </div>
          </div>

          <div className="room-actions">
            <MehfilJamBar jam={jam} />
          </div>

          <nav className="room-nav" aria-label="Sections">
            {(
              [
                ['LISTEN', 'Listen'],
                ['LIBRARY', 'Library'],
                ['EXPLORE', 'Explore'],
              ] as [View, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`room-nav-btn ${currentView === id ? 'room-nav-btn--active' : ''}`}
                aria-current={currentView === id ? 'page' : undefined}
                onClick={() => setCurrentView(id)}
              >
                {label}
                {id === 'LISTEN' && mehfil.length > 0 && (
                  <span className="room-nav-count">{mehfil.length}</span>
                )}
              </button>
            ))}
          </nav>
        </header>

        {/* ------------------------------------------------------- LISTEN -- */}
        {currentView === 'LISTEN' && (
          <div className={`mehfil-room ${quiet ? 'mehfil-room--quiet' : ''}`}>
            <aside className="mehfil-aside">
              <MehfilQueue
                items={mehfil}
                currentIndex={mehfilIndex}
                onPlay={playMehfilAt}
                onRemove={removeFromMehfil}
                onMove={reorderMehfil}
                onPlayNext={playNextInMehfil}
                onBrowse={() => setCurrentView('LIBRARY')}
              />
            </aside>

            <div className="mehfil-stage">
              <ListeningStage
                formLabel={formLabel}
                title={nowTitle}
                poet={isRecording ? undefined : activeWork.poet}
                singer={nowArtist}
                couplet={heroCouplet}
                coupletFallback={heroFallback}
                coverUrl={nowCover}
                isPlaying={isPlaying}
                resolving={resolving}
                onTogglePlay={handlePlayPause}
                currentTime={currentTime}
                duration={duration}
                markers={timelineMarkers}
                sectionLabel={sectionLabel}
                onSeek={seekTo}
                formatTime={formatTime}
                volume={volume}
                isMuted={isMuted}
                onVolume={(v) => {
                  setVolume(v)
                  if (isMuted) setIsMuted(false)
                }}
                onToggleMute={() => setIsMuted(!isMuted)}
                onPrev={goPrev}
                onNext={goNext}
                hasPrev={hasPrev && !isGuest}
                hasNext={hasNext && !isGuest}
                readOnly={isGuest}
                quiet={quiet}
                onToggleQuiet={() => setQuiet((v) => !v)}
                playbackNote={playbackNote}
                loopSher={loopSher}
                onToggleLoop={toggleLoop}
                canLoop={!!currentSpan}
                unknownLine={
                  !isRecording && currentOccurrence?.couplet === null && adhocLine !== currentOccurrence.text
                    ? currentOccurrence.text
                    : null
                }
                onExplainLine={(text) => {
                  setAdhocLine(text)
                  setStudyTab('MEANING')
                }}
                candidates={isRecording ? null : resolveCandidates}
                onPickCandidate={(videoId) => {
                  const pick = resolveCandidates?.find((c) => c.videoId === videoId)
                  if (pick) playCandidate(pick)
                }}
                saveState={
                  isRecording && ytTrack
                    ? { saved: isInCatalog(ytTrack.videoId), onToggle: toggleCollected }
                    : null
                }
                onExplorePoet={isRecording ? undefined : exploreSubject}
                onExploreSinger={exploreSubject}
              />
            </div>

            <div className="mehfil-study">
              {isRecording ? (
                <RecordingSheet
                  loading={ytLyrics.loading}
                  syncedLines={ytSyncedLines}
                  couplets={ytCouplets}
                  rawText={ytLyrics.text}
                  currentTime={currentTime}
                  activeSyncedIndex={activeSyncedIndex}
                  selectedCoupletIndex={selectedYtLine?.index ?? null}
                  onSelectCouplet={(c) => {
                    setAdhocLine(null)
                    setSelectedYtLine(c)
                  }}
                  onSeek={seekTo}
                  onExplainLine={(text) => {
                    setSelectedYtLine(null)
                    setAdhocLine(text)
                    setStudyTab('MEANING')
                  }}
                  explainedLine={adhocLine}
                  offset={lyricOffset}
                  onOffsetChange={(v) => {
                    setLyricOffset(v)
                    if (ytTrack) writeLyricOffset(ytTrack.videoId, v)
                  }}
                  timingReliable={ytLyrics.timingReliable}
                  otherRenditions={ytLyrics.otherRenditions}
                  onFindRendition={(q) => {
                    setYtQuery(q)
                    setCurrentView('EXPLORE')
                    runSearch(undefined, q)
                  }}
                />
              ) : (
                <SherSheet
                  lines={activeWork.lines}
                  form={activeWork.form}
                  activeLineId={activeLine.id}
                  singingLineId={activeSyncLineId}
                  scriptMode={scriptMode}
                  onScriptMode={setScriptMode}
                  onSelectLine={handleLineSelect}
                  lineTime={workLineTime}
                  formatTime={formatTime}
                  follow={follow}
                  onToggleFollow={() => setFollow((v) => !v)}
                  hasTimestamps={hasTimestamps}
                  timingState={timingState}
                />
              )}

              <MeaningPanel
                tab={studyTab}
                onTab={setStudyTab}
                couplet={
                  isRecording
                    ? adhocLine
                      ? { roman: adhocLine }
                      : selectedYtLine
                      ? { roman: selectedYtLine.combined_text }
                      : null
                    : adhocLine
                    ? { roman: adhocLine }
                    : {
                        urdu: activeLine.urdu,
                        roman: activeLine.transliteration || activeLine.roman,
                        translation: activeLine.translation,
                      }
                }
                meaning={isRecording ? ytMeaning : aiMeaning}
                loading={isRecording ? ytMeaningLoading : aiLoading}
                failed={isRecording ? ytMeaningFailed : aiFailed}
                onRetry={() => setMeaningNonce((n) => n + 1)}
                fallback={
                  isRecording || adhocLine
                    ? undefined
                    : {
                        simple: activeLine.simple,
                        detailed: activeLine.detailed,
                        vocabulary: activeLine.vocabulary,
                      }
                }
                facts={{
                  title: nowTitle,
                  poet: isRecording ? undefined : activeWork.poet,
                  singer: nowArtist,
                  form: isRecording ? undefined : activeWork.form,
                  mood: isRecording ? ytMeaning?.mood : activeWork.mood || aiMeaning?.mood,
                }}
                onExplorePoet={isRecording ? undefined : exploreSubject}
                onExploreSinger={exploreSubject}
                onPronounce={pronounce}
                isSpeaking={isSpeaking}
                onToggleNarration={toggleNarration}
                emptyPrompt={
                  isRecording
                    ? 'Tap any line of the poetry to read what it means.'
                    : 'Choose a couplet to sit with it a while.'
                }
              />
            </div>
          </div>
        )}

        {/* ------------------------------------------------------ LIBRARY -- */}
        {currentView === 'LIBRARY' && (
          <div className="page">
            <div className="page-head">
              <span className="eyebrow">The Library</span>
              <h2 className="page-title">Ghazals, read and heard</h2>
              <p className="page-lede">
                Each of these carries its couplets, their meanings and the words worth knowing.
                Choose one and it joins tonight&rsquo;s mehfil.
              </p>
            </div>

            <div className="search-field">
              <Search size={16} aria-hidden="true" color="var(--color-text-faint)" />
              <input
                type="search"
                aria-label="Search the library by ghazal, poet or singer"
                placeholder="A ghazal, a poet, a singer…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {moods.length > 0 && (
              <div className="mood-row" role="group" aria-label="Filter by mood">
                <button
                  type="button"
                  className={`mood-chip ${moodFilter === null ? 'mood-chip--active' : ''}`}
                  aria-pressed={moodFilter === null}
                  onClick={() => setMoodFilter(null)}
                >
                  All
                </button>
                {moods.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`mood-chip ${moodFilter === m ? 'mood-chip--active' : ''}`}
                    aria-pressed={moodFilter === m}
                    onClick={() => setMoodFilter(moodFilter === m ? null : m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}

            {filteredWorks.length === 0 ? (
              <div className="state-block">
                <span className="state-title">Nothing here matches that.</span>
                Try another poet, singer or title.
              </div>
            ) : (
              <ul className="work-list">
                {filteredWorks.map((work, i) => (
                  <li className="work-row" key={work.id}>
                    <button
                      type="button"
                      className="work-row-main"
                      onClick={() => void openWork(work, true)}
                    >
                      <span className="sher-index">{String(i + 1).padStart(2, '0')}</span>
                      <span>
                        <span className="work-title">{work.title}</span>
                        <span className="work-sub">
                          {work.poet} &nbsp;·&nbsp; sung by {work.artist}
                        </span>
                        <span className="work-meta-row">
                          {work.mood && <span className="work-mood">{work.mood}</span>}
                          {readiness[work.id] && (
                            <span
                              className={`work-ready work-ready--${
                                readinessScore(readiness[work.id]) >= 0.7
                                  ? 'full'
                                  : readinessScore(readiness[work.id]) >= 0.4
                                  ? 'part'
                                  : 'thin'
                              }`}
                              title="Measured when this ghazal was last prepared"
                            >
                              {describeReadiness(readiness[work.id])}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                    <span className="work-actions">
                      <button
                        type="button"
                        className="text-btn"
                        onClick={() => void openWork(work, false)}
                      >
                        Read
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="section-head">
              <div>
                <span className="eyebrow">Kept by you</span>
                <h3 className="section-title">Your collection</h3>
              </div>
            </div>

            {userCatalogItems.length === 0 ? (
              <p className="state-note">
                Nothing kept yet — while a recording plays, press the heart to keep it here.
              </p>
            ) : (
              <div className="result-grid">
                {userCatalogItems.map((entry) => (
                  <div
                    key={entry.id}
                    className={`result-wrap ${
                      isRecording && ytTrack?.videoId === entry.videoId
                        ? 'result-wrap--current'
                        : ''
                    }`}
                  >
                    <button
                      type="button"
                      className="result-card"
                      onClick={() => playCollected(entry)}
                    >
                      <span className="result-art">
                        {entry.thumbnail ? (
                          <img src={entry.thumbnail} alt="" loading="lazy" />
                        ) : (
                          <Music size={20} aria-hidden="true" />
                        )}
                        <span className="result-art-veil">
                          <Play size={20} aria-hidden="true" />
                        </span>
                      </span>
                      <span>
                        <span className="result-title">{entry.title}</span>
                        <span className="result-sub">{entry.artist}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="result-remove"
                      aria-label={`Remove ${entry.title} from your collection`}
                      onClick={() => removeCollected(entry.id)}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------ EXPLORE -- */}
        {currentView === 'EXPLORE' && (
          <div className="page">
            <div className="page-head">
              <span className="eyebrow">Explore</span>
              <h2 className="page-title">Other voices, other nights</h2>
              <p className="page-lede">
                Search for a ghazal, a poet or a singer. The same poetry has been sung many times
                over — hearing two renditions beside each other is half the pleasure.
              </p>
            </div>

            <form className="search-field" onSubmit={runSearch}>
              <Music size={16} aria-hidden="true" color="var(--color-text-faint)" />
              <input
                type="search"
                aria-label="Search recordings"
                placeholder="Mehdi Hassan, Farida Khanum, Ranjish hi sahi…"
                value={ytQuery}
                onChange={(e) => setYtQuery(e.target.value)}
              />
              <button type="submit" className="text-btn" disabled={ytLoading}>
                {ytLoading ? 'Searching' : 'Search'}
              </button>
            </form>

            {!isRecording && activeWork && (
              <p className="state-note" style={{ marginBottom: 'var(--space-5)' }}>
                Looking for another rendition of <em>{activeWork.title}</em>?{' '}
                <button
                  type="button"
                  className="text-btn"
                  onClick={() => exploreSubject(activeWork.title)}
                >
                  Search recordings of it
                </button>
              </p>
            )}

            {ytError && (
              <p className="state-note" style={{ marginBottom: 'var(--space-5)' }}>
                {ytError}{' '}
                <button type="button" className="text-btn" onClick={() => runSearch()}>
                  Try again
                </button>
              </p>
            )}

            {ytLoading && (
              <p className="state-note">
                <Loader2 size={14} className="spin" aria-hidden="true" /> Preparing the mehfil…
              </p>
            )}

            {!ytLoading && ytResults.length > 0 && (
              <div className="result-grid">
                {ytResults.map((track, idx) => (
                  <div
                    key={`${track.videoId}-${idx}`}
                    className={`result-wrap ${
                      isRecording && ytTrack?.videoId === track.videoId
                        ? 'result-wrap--current'
                        : ''
                    }`}
                  >
                    <button
                      type="button"
                      className="result-card"
                      onClick={() => playRecording(track)}
                    >
                      <span className="result-art">
                        {track.coverUrl ? (
                          <img src={track.coverUrl} alt="" loading="lazy" />
                        ) : (
                          <Music size={20} aria-hidden="true" />
                        )}
                        <span className="result-art-veil">
                          <Play size={20} aria-hidden="true" />
                        </span>
                      </span>
                      <span>
                        <span className="result-title">{track.title}</span>
                        <span className="result-sub">
                          {track.artist}
                          {track.duration ? ` · ${track.duration}` : ''}
                        </span>
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {!ytLoading && ytResults.length === 0 && !ytError && (
              <div className="state-block">
                <span className="state-title">The room is quiet.</span>
                Search above, and whatever you choose begins tonight&rsquo;s mehfil.
              </div>
            )}

            <div className="section-head">
              <div>
                <span className="eyebrow">From the curator</span>
                <h3 className="section-title">Three to begin with</h3>
              </div>
            </div>

            <ul className="work-list">
              {[
                {
                  id: '01',
                  label: 'Ghazal of the day',
                  note: 'Ghalib turning on his own heart, and Jagjit and Chitra Singh giving the question all the room it needs.',
                },
                {
                  id: '02',
                  label: 'Ghazal of the week',
                  note: 'Farida Khanum stretching a single plea across a whole night — the most famous refusal to say goodbye in the language.',
                },
                {
                  id: '03',
                  label: 'Ghazal of the month',
                  note: 'Written from a prison cell, sung by Mehdi Hassan as though the garden were still in reach.',
                },
              ].map((pick) => {
                const work = worksList.find((w) => w.id === pick.id)
                if (!work) return null
                return (
                  <li className="work-row" key={pick.id}>
                    <button
                      type="button"
                      className="work-row-main"
                      onClick={() => void openWork(work, true)}
                    >
                      <span className="sher-index">{pick.id}</span>
                      <span>
                        <span className="work-mood" style={{ marginTop: 0 }}>
                          {pick.label}
                        </span>
                        <span className="work-title">{work.title}</span>
                        <span className="work-sub">
                          {work.poet} &nbsp;·&nbsp; sung by {work.artist}
                        </span>
                        <p className="page-lede" style={{ fontSize: '0.95rem', marginTop: 6 }}>
                          {pick.note}
                        </p>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        <footer className="room-footer">
          <span>Shama · a digital mehfil</span>
          <span>{isStreaming && isPlaying ? 'Playing' : 'Quiet'}</span>
        </footer>
      </div>
    </main>
  )
}

export default App
