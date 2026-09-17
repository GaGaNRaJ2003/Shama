import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Check, Loader2, Music, Play, Plus, Search, Send, Trash2 } from 'lucide-react'
import './App.css'
import { useAmbience } from './audio/useAmbience'
import AmbienceToggle from './components/aesthetic/AmbienceToggle'
import { ShaderBackdrop } from './components/aesthetic/ShaderBackdrop'
import dynamic from 'next/dynamic'
import { prefersReducedMotion, shouldPlayIntro } from './components/aesthetic/introGate'
import { ArrivalStage, FeelingsGrid, arrivalEnabled } from './components/arrival/ArrivalStage'
import { YouTubePlayer } from './components/YouTubePlayer'
import ListeningStage from './components/listening/ListeningStage'
import MehfilJamBar, { GuestWaiting, HostQueue, JamJoinPrompt, RequestsInbox } from './components/listening/MehfilJamBar'
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
import { useMehfilJam, DRIFT_TOLERANCE_MS, HEARTBEAT_MS, type JamRequest, type SongWish } from './data/useMehfilJam'
import {
  makeMehfilItem,
  moveItem,
  readMehfil,
  sameItem,
  writeMehfil,
  type MehfilItem,
} from './data/mehfil'

// Set NEXT_PUBLIC_API_BASE to the deployed backend (Render); the ws URL for
// Listen Together is derived from it in useMehfilJam, so https becomes wss.
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:5000'

// The opening (three.js) loads only when it plays; the dark stands in meanwhile.
const IntroSequence = dynamic(() => import('./components/aesthetic/IntroSequence').then((m) => m.IntroSequence), {
  ssr: false,
  loading: () => <div className="intro" />,
})

/** A seek takes a moment to start sounding; aim at least that much ahead. */
const SEEK_LEAD_S = 0.3
/** The most a guest aims ahead, however slow its seeks have been. */
const SEEK_LEAD_MAX_S = 4
/** A seek still silent after this long is given up on and tried again. */
const SEEK_STALL_MS = 8000

/** Nothing technical reaches the user (§17); the detail goes to the console. */
const COPY = {
  noRecording:
    'We couldn’t find a recording of this ghazal right now. You can look for it under Explore.',
  searchDown: 'We couldn’t reach the recordings just now.',
  noResults: 'Nothing came back for that. Try another poet, singer or ghazal.',
  unplayable: 'This recording can’t be played here. Try another one under Explore.',
  slowDown: 'That was a lot of searching at once. Give it a minute, then try again.',
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

/** A search result from the recordings bridge. */
const toYtTrack = (r: any): YtTrack => ({
  videoId: r.videoId,
  title: r.title,
  artist: r.artist || (r.artists ? r.artists.join(', ') : 'Unknown Artist'),
  album: r.album,
  duration: r.duration,
  durationSeconds: r.durationSeconds,
  thumbnail: r.thumbnail,
  coverUrl: r.thumbnail ? `${API_BASE}/api/yt/thumb?u=${encodeURIComponent(r.thumbnail)}` : undefined,
})

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
  // Until something is chosen the room opens on the arrival (an invitation to
  // send a farmaish) rather than on a ghazal nobody picked.
  const [arrivalOn] = useState(arrivalEnabled)
  const [hasChosen, setHasChosen] = useState(false)
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
  // Which video currentTime and duration were reported for. Until the new one
  // reports, they are still the previous recording's.
  const progressVideoRef = useRef<string | null>(null)
  const [progressVideoId, setProgressVideoId] = useState<string | null>(null)
  // Bumped by every new playback intent, so a slower lookup can't land late.
  const resolveTokenRef = useRef(0)
  const activeWorkIdRef = useRef(activeWork.id)
  const ytVideoIdRef = useRef<string | null>(null)
  // What a recording's lyrics were last asked with, so the player's real
  // duration can correct a lookup made without it (once per recording).
  const lyricsLookupRef = useRef<{ videoId: string; durationSeconds: number } | null>(null)
  const relookupDoneRef = useRef<string | null>(null)

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
  // Spoken confirmation for the + on a search result (the icon change is silent).
  const [mehfilNotice, setMehfilNotice] = useState('')

  // The opening (a first visit, or replayed from the footer). `run` remounts it.
  const [intro, setIntro] = useState<{ calm: boolean; silent: boolean; run: number } | null>(() =>
    shouldPlayIntro() ? { calm: false, silent: false, run: 0 } : null
  )
  // The room appearing out of the opening's light.
  const [emerging, setEmerging] = useState(false)

  // Mehfil Jam — listening together over a shared link.
  const jam = useMehfilJam(API_BASE)
  const isGuest = jam.role === 'guest'
  // Arriving by a shared link makes this browser a guest from the first frame,
  // before the room has answered, so no home screen or stray ghazal flashes by.
  const [viaLink, setViaLink] = useState(
    () => typeof window !== 'undefined' && !!new URLSearchParams(window.location.search).get('mehfil')
  )
  const guestMode = isGuest || (viaLink && jam.role === null && !jam.notice)
  // A guest comes in through the join card; its tap is what lets sound play.
  const [guestEntered, setGuestEntered] = useState(false)
  const joinPending = guestMode && !guestEntered
  // A guest hears the host once they are in and the opening has finished.
  const guestMayPlay = !joinPending && intro === null
  // Nothing from the host yet: the stage says so rather than showing a ghazal.
  const guestWaiting = guestMode && !(jam.remote?.videoId && ytTrack?.videoId === jam.remote.videoId)
  const awaitingChoice = arrivalOn && !hasChosen && !guestMode
  // Host: publish now rather than at the next heartbeat (a seek), at a known position.
  const publishNowRef = useRef<(positionSeconds?: number) => void>(() => {})
  // A short word at the foot of the room: a request sent, answered, or arrived.
  const [roomNote, setRoomNote] = useState<string | null>(null)
  const roomNoteTimer = useRef<number | null>(null)
  const showNote = (text: string) => {
    setRoomNote(text)
    if (roomNoteTimer.current) window.clearTimeout(roomNoteTimer.current)
    roomNoteTimer.current = window.setTimeout(() => setRoomNote(null), 4000)
  }

  // A guest can't play anything; choosing something asks the host for it instead.
  const requestFor = (wish: SongWish) =>
    jam.requests.find(
      (r) =>
        r.from === jam.selfId &&
        r.kind === wish.kind &&
        (wish.kind === 'work' ? r.workId === wish.workId : r.videoId === wish.videoId)
    )
  const askHost = (wish: SongWish) => {
    if (!isGuest || !jam.connected) return showNote('Still joining the mehfil. Try again in a moment.')
    const earlier = requestFor(wish)
    if (earlier?.status === 'pending') return showNote(`You’ve already asked for ${wish.title}.`)
    if (earlier?.status === 'added') return showNote(`${wish.title} is already in the queue.`)
    const waiting = jam.requests.filter((r) => r.from === jam.selfId && r.status === 'pending').length
    if (waiting >= 5) return showNote('You have five requests waiting. Let the host answer those first.')
    jam.requestSong(wish)
    showNote(`Asked the host for ${wish.title}.`)
  }
  const workWish = (work: { id: string; title: string; artist: string }): SongWish => ({
    kind: 'work',
    workId: work.id,
    title: work.title,
    artist: work.artist,
  })
  const recordingWish = (track: { videoId: string; title: string; artist: string }): SongWish => ({
    kind: 'recording',
    videoId: track.videoId,
    title: track.title,
    artist: track.artist,
  })
  const askedLabel = (status?: JamRequest['status']) =>
    status === 'pending' ? 'Asked' : status === 'added' ? 'In the queue' : status === 'declined' ? 'Not tonight' : 'Ask the host'
  /** What became of this guest's request for something, if they made one. */
  const askedStatus = (wish: SongWish) => (guestMode ? requestFor(wish)?.status : undefined)

  // Leaving: a guest goes back to a room of their own, as if they had come in fresh.
  const leaveMehfil = () => {
    const wasGuest = guestMode
    jam.leave()
    if (!wasGuest) return
    forgetMehfilLink()
    setGuestEntered(false)
    setIsPlaying(false)
    setYtTrack(null)
    setYtVideoId(null)
    setHasChosen(false)
    setCurrentView('LISTEN')
  }
  const forgetMehfilLink = () => {
    setViaLink(false)
    const url = new URL(window.location.href)
    if (url.searchParams.has('mehfil')) {
      url.searchParams.delete('mehfil')
      window.history.replaceState(null, '', url.toString())
    }
  }

  // `isRecording` == showing a searched recording rather than a curated ghazal.
  const isRecording = !!ytTrack
  const isStreaming = playbackSource === 'youtube'

  // The room's tanpura hums while nothing else is sounding. It also holds
  // while a guest's join prompt is saying the browser can't play sound yet.
  // The tanpura waits for the opening to finish, then swells in.
  const ambience = useAmbience(
    isPlaying || isSpeaking || resolving || joinPending || intro !== null
  )

  // Meaning from the ML engine
  const [aiMeaning, setAiMeaning] = useState<Meaning | null>(null)
  const [aiLoading, setAiLoading] = useState<boolean>(false)
  const [aiFailed, setAiFailed] = useState<boolean>(false)
  const [meaningNonce, setMeaningNonce] = useState<number>(0)
  // A sung line the catalogue has no couplet for, which the listener asked
  // about. The meaning engine works on any text, so nothing has to be missing.
  const [adhocLine, setAdhocLine] = useState<string | null>(null)
  // A recording with no words at all: there is no line to tap, so the meaning
  // panel has nothing to offer and stays out of the way.
  const recordingHasNoWords =
    isRecording &&
    !ytLyrics.loading &&
    !ytLyrics.text &&
    ytSyncedLines.length === 0 &&
    ytCouplets.length === 0 &&
    !adhocLine

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

  // A couplet's start time: a derived timing wins over the seeded value, but
  // only for the recording it was derived from.
  const lineTime = useCallback(
    (work: WorkData, line: LineData): number | null => {
      const derived = autoTimings[work.id]?.[line.id]
      const ownRecording =
        !ytVideoId || (autoTimings as unknown as TimingStore).__keys?.[work.id] === `${work.id}:${ytVideoId}`
      if (typeof derived === 'number' && ownRecording) return derived
      return typeof line.t === 'number' ? line.t : null
    },
    [autoTimings, ytVideoId]
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
    // A slow answer for the previous couplet must never land on this one.
    const ctrl = new AbortController()
    let live = true
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
      signal: ctrl.signal,
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(res.statusText)))
      .then((data) => {
        if (!live) return
        const clean = sanitizeMeaning(data)
        if (clean) {
          setAiMeaning(clean)
        } else {
          // The service answered but had nothing showable. Detail stays here.
          console.warn('[shama] meaning service returned no usable content:', data)
          setAiMeaning(null)
          setAiFailed(true)
        }
        setAiLoading(false)
      })
      .catch((err) => {
        if (!live) return
        // Logged for us, never surfaced to the reader.
        console.warn('[shama] meaning request failed:', err)
        setAiMeaning(null)
        setAiFailed(true)
        setAiLoading(false)
      })
    return () => {
      live = false
      ctrl.abort()
      setAiLoading(false)
    }
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

  // The mehfil a guest was in has ended: back to a room of their own.
  useEffect(() => {
    if (!jam.notice || !viaLink) return
    forgetMehfilLink()
    setGuestEntered(false)
    setIsPlaying(false)
    setYtTrack(null)
    setYtVideoId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jam.notice])

  // Requests: the host hears of new ones; a guest hears what became of theirs.
  const seenRequestsRef = useRef<Map<string, string>>(new Map())
  useEffect(() => {
    const seen = seenRequestsRef.current
    for (const r of jam.requests) {
      const before = seen.get(r.id)
      seen.set(r.id, r.status)
      if (before === r.status) continue
      if (jam.role === 'host' && !before && r.status === 'pending') {
        showNote(`${r.fromName} asks for ${r.title}.`)
      } else if (jam.role === 'guest' && r.from === jam.selfId && before === 'pending') {
        showNote(r.status === 'added' ? `The host added ${r.title} to the queue.` : `The host passed on ${r.title} tonight.`)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jam.requests])

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
      resetProgress()
      // A new recording: nothing learned about the last one's seek applies.
      Object.assign(alignStateRef.current, { waitingToMove: false, lastT: -1 })
      setYtVideoId(remote.videoId)
      resolvedWorkRef.current = null
      setSelectedYtLine(null)
      setAdhocLine(null)
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
    // Coming in (or out of the opening) to a recording already under way: start
    // it where the host is, before it plays from the top.
    const alreadyHeard = progressVideoRef.current === remote.videoId
    const expectedNow = jam.expectedPositionMs()
    const align = alignStateRef.current
    if (
      guestMayPlay &&
      jam.remotePlaying() &&
      !alreadyHeard &&
      !align.waitingToMove &&
      expectedNow !== null &&
      expectedNow > DRIFT_TOLERANCE_MS
    ) {
      const target = expectedNow / 1000 + align.lead
      Object.assign(align, { seekAt: Date.now(), seekTarget: target, waitingToMove: true, lastT: -1 })
      setYtSeek(target)
    }
    setIsPlaying(guestMayPlay && !remote.paused)
    // Every word from the host is a chance to check we're still with them.
    alignRef.current()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGuest, jam.remote?.videoId, jam.remote?.paused, jam.remote?.updatedAt, guestMayPlay])

  // Guest: nudge back into line only when we have genuinely drifted. Seeking on
  // every tick would stutter; ignoring drift lets the room fall apart. The check
  // keeps its own steady clock: tied to the host's heartbeat, it was reset every
  // two seconds, just before it could run, and never corrected anything.
  //
  // A seek isn't heard at once: the player buffers first, for a moment on a good
  // connection and seconds on a slow one. So it only judges drift while its own
  // clock is moving, never re-seeks a seek still loading, and learns how long
  // seeks take here, aiming that far ahead so they land in step.
  const alignStateRef = useRef({ lastT: -1, seekAt: 0, seekTarget: 0, lead: SEEK_LEAD_S, waitingToMove: false })
  const alignRef = useRef<() => void>(() => {})
  alignRef.current = () => {
    if (!isGuest || !guestMayPlay || !jam.remotePlaying()) return
    // Our player must be reporting on the host's recording before its clock counts.
    if (!ytVideoIdRef.current || progressVideoRef.current !== ytVideoIdRef.current) return
    const st = alignStateRef.current
    const now = Date.now()
    const t = currentTimeRef.current
    const moving = st.lastT >= 0 && t !== st.lastT
    st.lastT = t
    if (st.waitingToMove) {
      if (!moving) {
        if (now - st.seekAt < SEEK_STALL_MS) return
      } else {
        // Heard at last: how long did the seek sit silent?
        const silent = (now - st.seekAt) / 1000 - Math.max(0, t - st.seekTarget)
        st.lead = Math.min(SEEK_LEAD_MAX_S, Math.max(SEEK_LEAD_S, 0.5 * st.lead + 0.5 * silent))
        st.waitingToMove = false
        return
      }
    } else if (!moving) {
      return
    }
    const expected = jam.expectedPositionMs()
    if (expected === null) return
    if (Math.abs(expected - t * 1000) > DRIFT_TOLERANCE_MS) {
      const target = expected / 1000 + st.lead
      Object.assign(st, { seekAt: now, seekTarget: target, waitingToMove: true, lastT: -1 })
      seekTo(target)
    }
  }
  useEffect(() => {
    if (!isGuest || !guestMayPlay) return
    const id = setInterval(() => alignRef.current(), 1000)
    return () => clearInterval(id)
  }, [isGuest, guestMayPlay])

  // Host: broadcast the transport on every change plus a slow heartbeat, so a
  // guest who joins mid-ghazal lands in the right place.
  useEffect(() => {
    if (jam.role !== 'host') return
    const send = (positionSeconds?: number) => {
      // Until the new video reports, the clock still belongs to the last one;
      // guests would seek to its position and match lyrics to its duration.
      const fresh = progressVideoRef.current === ytVideoId
      const at = positionSeconds ?? (fresh ? currentTimeRef.current : 0)
      jam.publish({
        videoId: ytVideoId,
        positionMs: Math.round(at * 1000),
        paused: !isPlaying,
        title: nowTitleRef.current,
        artist: nowArtistRef.current,
        durationSeconds: fresh ? Math.round(durationRef.current) : 0,
        queue: mehfil.map((m) => ({ title: m.title, artist: m.artist })),
        queueIndex: currentMehfilId ? mehfil.findIndex((m) => m.id === currentMehfilId) : -1,
      })
    }
    publishNowRef.current = send
    send()
    const id = setInterval(() => send(), HEARTBEAT_MS)
    return () => {
      clearInterval(id)
      publishNowRef.current = () => {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jam.role, jam.connected, ytVideoId, isPlaying, mehfil, currentMehfilId])

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
  // via handlePlayPause, which resolves a YouTube video for the work. The
  // resolve token and `resolving` are left alone: by the time the effect runs,
  // openWork has usually started the next lookup.
  const resetTransport = () => {
    resolvedWorkRef.current = null
    setYtVideoId(null)
    setResolveCandidates(null)
    setAdhocLine(null)
    setOccurrences([])
    setIsPlaying(false)
    resetProgress()
    setPlaybackNote(null)
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = activeWork.audioUrl || ''
    }
  }
  useEffect(() => {
    resetTransport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // In the commit where ytVideoId changes, duration is still the previous
    // recording's; wait until this video has reported its own.
    if (progressVideoId !== ytVideoId) return
    if (resolvedWorkRef.current !== activeWork.id) return
    void deriveTimings(activeWork, ytVideoId, duration)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWork.id, ytVideoId, duration, isRecording, progressVideoId])

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

  /**
   * Put an entry in tonight's mehfil (if it isn't already) and make it current.
   * A new entry goes right after the current one (at the top when nothing is
   * current), so whatever was waiting to come next still comes next.
   */
  const enqueue = (entry: Omit<MehfilItem, 'id'>) => {
    const candidate = makeMehfilItem(entry)
    const existing = mehfil.find((m) => sameItem(m, candidate))
    if (existing) {
      setCurrentMehfilId(existing.id)
      return
    }
    const next = mehfil.slice()
    next.splice(mehfilIndex + 1, 0, candidate)
    persistMehfil(next)
    setCurrentMehfilId(candidate.id)
  }

  /** Add an entry to the end of tonight's mehfil for later: nothing plays, and what's current stays current. */
  const addToMehfil = (entry: Omit<MehfilItem, 'id'>) => {
    const candidate = makeMehfilItem(entry)
    if (mehfil.some((m) => sameItem(m, candidate))) return false
    persistMehfil([...mehfil, candidate])
    return true
  }

  const isRecordingQueued = (videoId: string) =>
    mehfil.some((m) => m.kind === 'recording' && m.videoId === videoId)

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
  const updateProgress = (current: number, dur: number, videoId: string | null = null) => {
    currentTimeRef.current = current
    durationRef.current = dur
    progressVideoRef.current = videoId
    setCurrentTime(current)
    setDuration(dur)
    setProgressVideoId(videoId)
  }

  /** A new recording starts its clock at zero instead of borrowing the last one's. */
  const resetProgress = () => {
    currentTimeRef.current = 0
    durationRef.current = 0
    progressVideoRef.current = null
    setProgressVideoId(null)
    setCurrentTime(0)
    setDuration(0)
    // Every play asks for lyrics afresh, so a replay of the same recording
    // may need the duration re-query again too.
    relookupDoneRef.current = null
  }

  const seekTo = (sec: number) => {
    if (playbackSource === 'youtube') setYtSeek(sec)
    else if (audioRef.current) audioRef.current.currentTime = sec
  }

  // Seeks the listener asks for. A jam guest's playhead belongs to the host.
  const userSeek = (sec: number) => {
    if (isGuest) return
    seekTo(sec)
    // Guests follow a jump at once, not at the next heartbeat.
    if (jam.role === 'host') publishNowRef.current(sec)
  }

  // Resolve a YouTube recording for a curated work (cached per work id).
  //
  // Search ranks by relevance, not by "is this the song you asked for", so
  // taking result #1 unchecked used to play a different ghazal entirely — and
  // then, correctly, find no lyrics for it. We now only auto-play a confident
  // match and otherwise let the listener choose.
  const ensureCuratedVideo = async (
    work: WorkData
  ): Promise<{ videoId: string | null; candidates: YtTrack[] | null; stale: boolean }> => {
    if (ytVideoId && resolvedWorkRef.current === work.id) {
      return { videoId: ytVideoId, candidates: null, stale: false }
    }
    setResolving(true)
    setResolveCandidates(null)
    // A newer playback intent bumps the token; this lookup then changes nothing.
    const token = ++resolveTokenRef.current
    try {
      const params = new URLSearchParams({ title: work.title, artist: work.artist })
      const res = await fetch(`${API_BASE}/api/yt/resolve?${params.toString()}`)
      if (!res.ok) throw new Error(String(res.status))
      const data = await res.json()
      if (token !== resolveTokenRef.current || activeWorkIdRef.current !== work.id) {
        return { videoId: null, candidates: null, stale: true }
      }

      if (data.best?.videoId) {
        resolvedWorkRef.current = work.id
        resetProgress()
        setYtVideoId(data.best.videoId)
        return { videoId: data.best.videoId, candidates: null, stale: false }
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
      return { videoId: null, candidates, stale: false }
    } catch (err) {
      console.warn('[shama] could not resolve a recording for', work.title, err)
      return { videoId: null, candidates: null, stale: token !== resolveTokenRef.current }
    } finally {
      if (token === resolveTokenRef.current) setResolving(false)
    }
  }

  /** The listener picked which recording this ghazal is. */
  const playCandidate = (track: YtTrack) => {
    setResolveCandidates(null)
    resolvedWorkRef.current = activeWork.id
    setPlaybackSource('youtube')
    resetProgress()
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
    const r =
      ytVideoId && resolvedWorkRef.current === activeWork.id
        ? { videoId: ytVideoId, candidates: null, stale: false }
        : await ensureCuratedVideo(activeWork)
    // Superseded while it looked: the newer choice owns the transport now.
    if (r.stale) return
    if (r.videoId) {
      setIsPlaying(true)
      return
    }
    // The listener is being asked which recording this is; the picker says so.
    if (r.candidates !== null) return
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
    if (guestMode) return askHost(workWish(work))
    setHasChosen(true)
    // A new choice supersedes any recording still being looked up.
    resolveTokenRef.current++
    setResolving(false)
    // Opening a curated ghazal drops any searched recording; the activeWork
    // effect then resets the transport.
    const wasRecording = !!ytTrack
    setYtTrack(null)
    const resolved = await resolveWork(work)
    // Reopening the ghazal a recording was playing over leaves activeWork
    // unchanged, so that effect never runs and the recording would play on.
    if (wasRecording && resolved.id === activeWork.id) resetTransport()
    setActiveWork(resolved)
    activeWorkIdRef.current = resolved.id
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
    const r = await ensureCuratedVideo(resolved)
    if (r.stale) return
    if (r.videoId) setIsPlaying(true)
    else if (r.candidates === null) setPlaybackNote(COPY.noRecording)
  }

  const handleLineSelect = (line: LineData) => {
    setAdhocLine(null)
    setActiveLine(line)
    const t = workLineTime(line)
    if (t !== null) userSeek(t)
    stopSpeaking()
  }

  // ---- Automatic couplet timings -----------------------------------------
  // Fetch the recording's synced lyrics and align the catalogue's couplets to
  // them. Runs once per (work, recording) and is remembered locally.
  const deriveTimings = useCallback(
    async (work: WorkData, videoId: string, durationSeconds: number) => {
      const cacheKey = `${work.id}:${videoId}`
      // Another ghazal or recording may have taken over while we waited.
      const stillCurrent = () => activeWorkIdRef.current === work.id && ytVideoIdRef.current === videoId
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
          if (stillCurrent()) setTimingState('none')
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
        if (stillCurrent()) setOccurrences(Array.isArray(occ) ? occ : [])
        record(typeof coverage === 'number' ? coverage : 0)
        if (!matched) {
          if (stillCurrent()) setTimingState('none')
          return
        }
        const map: Record<string, number> = {}
        for (const a of aligned as { index: number; time: number | null }[]) {
          const line = work.lines[a.index]
          if (line && a.time !== null) map[line.id] = a.time
        }
        // Merge into a fresh read, not `already`: another derive may have
        // written while this one waited. Keyed, so it is kept even when this
        // result is no longer the one on screen.
        const latest = readAutoTimings()
        const next = { ...latest, [work.id]: map }
        next.__keys = { ...(latest.__keys || {}), [work.id]: cacheKey }
        next.__occurrences = { ...(latest.__occurrences || {}), [cacheKey]: occ || [] }
        writeAutoTimings(next)
        setAutoTimings(next)
        if (stillCurrent()) setTimingState('done')
      } catch (err) {
        console.warn('[shama] could not derive couplet timings:', err)
        if (stillCurrent()) setTimingState('none')
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
  /** Recordings for the arrival request slip; the Explore page keeps its own state. */
  const searchRecordings = useCallback(async (q: string, signal: AbortSignal) => {
    const res = await fetch(`${API_BASE}/api/yt/search?q=${encodeURIComponent(q)}&limit=6`, { signal })
    if (!res.ok) throw new Error(`recordings search: ${res.status}`)
    const data = await res.json()
    return (data.results || []).map(toYtTrack) as YtTrack[]
  }, [])

  const runSearch = (e?: React.FormEvent, term?: string) => {
    if (e) e.preventDefault()
    const q = (term ?? ytQuery).trim()
    if (!q) return
    setYtQuery(q)
    setYtLoading(true)
    setYtError(null)
    fetch(`${API_BASE}/api/yt/search?q=${encodeURIComponent(q)}&limit=24`)
      // Keep the status: a rate limit or an outage is not "nothing found".
      .then(async (res) => ({ ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) }))
      .then(({ ok, status, data }) => {
        if (!ok) {
          console.warn('[shama] recordings search failed:', status, data?.error || data?.detail)
          setYtResults([])
          setYtError(status === 429 ? COPY.slowDown : COPY.searchDown)
          setYtLoading(false)
          return
        }
        const results: YtTrack[] = (data.results || []).map(toYtTrack)
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
    lyricsLookupRef.current = { videoId, durationSeconds: durationSeconds || 0 }

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

  // Collection and mehfil replays carry no duration, and a jam guest has only
  // what the host last broadcast. Once the player knows how long THIS
  // recording is, ask for its lyrics again with that — once per recording.
  useEffect(() => {
    if (!isRecording || !ytTrack || progressVideoId !== ytTrack.videoId || duration <= 0) return
    const asked = lyricsLookupRef.current
    if (!asked || asked.videoId !== ytTrack.videoId || relookupDoneRef.current === ytTrack.videoId) return
    if (asked.durationSeconds && Math.abs(asked.durationSeconds - duration) <= 5) return
    relookupDoneRef.current = ytTrack.videoId
    const secs = Math.round(duration)
    setYtTrack((t) => (t && t.videoId === ytTrack.videoId ? { ...t, durationSeconds: secs } : t))
    fetchYtLyrics({ ...ytTrack, durationSeconds: secs })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording, ytTrack?.videoId, progressVideoId, duration])

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
    // As above: only the line now under discussion may fill the panel.
    const ctrl = new AbortController()
    let live = true
    setYtMeaning(null)
    setYtMeaningFailed(false)
    setYtMeaningLoading(true)
    fetch(`${API_BASE}/api/meaning`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        couplet: subject,
        // A searched recording names its singer, not its poet; passing the
        // performer as the poet misattributes the verse.
        poet: '',
        language: 'roman',
      }),
      signal: ctrl.signal,
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(res.statusText)))
      .then((data) => {
        if (!live) return
        const clean = sanitizeMeaning(data)
        if (clean) {
          setYtMeaning(clean)
        } else {
          console.warn('[shama] meaning service returned no usable content:', data)
          setYtMeaning(null)
          setYtMeaningFailed(true)
        }
        setYtMeaningLoading(false)
      })
      .catch((err) => {
        if (!live) return
        console.warn('[shama] meaning request failed for the selected couplet:', err)
        setYtMeaning(null)
        setYtMeaningFailed(true)
        setYtMeaningLoading(false)
      })
    return () => {
      live = false
      ctrl.abort()
      setYtMeaningLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording, adhocLine, selectedYtLine?.index, meaningNonce])

  /** A searched recording as a mehfil entry. */
  const recordingEntry = (track: YtTrack): Omit<MehfilItem, 'id'> => ({
    kind: 'recording',
    videoId: track.videoId,
    title: track.title,
    artist: track.artist,
    thumbnail: track.coverUrl || track.thumbnail,
  })

  /**
   * The + on a search result: the recording waits in tonight's mehfil and playback
   * is untouched. A jam guest may add too; like reordering, that plays nothing.
   */
  /** Host: a guest's request, added to tonight's mehfil. */
  const acceptRequest = (request: JamRequest) => {
    if (request.kind === 'work') {
      const work = worksList.find((w) => w.id === request.workId) || catalog.find((w) => w.id === request.workId)
      addToMehfil({
        kind: 'work',
        workId: request.workId,
        title: work?.title || request.title,
        artist: work?.artist || request.artist,
        poet: work?.poet,
        thumbnail: work?.coverUrl,
      })
    } else if (request.videoId) {
      addToMehfil({
        kind: 'recording',
        videoId: request.videoId,
        title: request.title,
        artist: request.artist,
        thumbnail: `${API_BASE}/api/yt/thumb?u=${encodeURIComponent(`https://i.ytimg.com/vi/${request.videoId}/mqdefault.jpg`)}`,
      })
    }
    jam.resolveRequest(request.id, true)
    showNote(`Added ${request.title} to tonight’s mehfil.`)
  }

  const queueRecording = (track: YtTrack) => {
    if (guestMode) return askHost(recordingWish(track))
    if (addToMehfil(recordingEntry(track))) setMehfilNotice(`Added ${track.title} to tonight’s mehfil.`)
  }

  const playRecording = (track: YtTrack) => {
    if (guestMode) return askHost(recordingWish(track))
    setHasChosen(true)
    // A new choice supersedes any curated recording still being looked up.
    resolveTokenRef.current++
    setResolving(false)
    // Stop the archive audio engine and hand playback to YouTube.
    if (audioRef.current) audioRef.current.pause()
    setPlaybackSource('youtube')
    setYtTrack(track)
    setYtVideoId(track.videoId)
    resolvedWorkRef.current = null
    setPlaybackNote(null)
    resetProgress()
    setOccurrences([])
    setIsPlaying(true)
    setCurrentView('LISTEN')
    fetchYtLyrics(track)
    setSelectedYtLine(null)
    setAdhocLine(null)
    setYtMeaning(null)
    setYtCouplets([])
    enqueue(recordingEntry(track))
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

  /** "Replay intro": the room goes dark and the opening plays again. */
  const replayIntro = () => {
    stopSpeaking()
    // A guest's record belongs to the host: it keeps turning, under a silent opening.
    const keepPlaying = isGuest && isPlaying
    if (isPlaying && !keepPlaying) {
      setIsPlaying(false)
      if (playbackSource === 'archive' && audioRef.current) audioRef.current.pause()
    }
    setIntro((prev) => ({ calm: prefersReducedMotion(), silent: keepPlaying, run: (prev?.run ?? 0) + 1 }))
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
  activeWorkIdRef.current = activeWork.id
  ytVideoIdRef.current = ytVideoId

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
    if (isGuest || !loopSher || !loopSpan) return
    const [start, end] = loopSpan
    // Also catch a manual seek out of the span: the loop should follow the
    // listener rather than yanking them back from wherever they went.
    if (currentTime >= end - 0.05 || currentTime < start - 1.5) seekTo(start)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loopSher, loopSpan, currentTime, isGuest])

  const toggleLoop = () => {
    // In a jam the host holds the playhead; a guest's loop would fight the drift check.
    if (isGuest) return
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
      // Shifted like the highlight, so a tick sits where its line is heard.
      return ytSyncedLines.length > 4 && ytSyncedLines.length < 80
        ? ytSyncedLines.map((l, i) => ({ id: `s${i}`, label: '', t: l.time_ms / 1000 + lyricOffset }))
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
  }, [isRecording, ytSyncedLines, activeWork, lineTime, occurrences, lyricOffset])

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

      {intro && !joinPending && (
        <IntroSequence
          key={intro.run}
          calm={intro.calm}
          silent={intro.silent}
          onReveal={() => setEmerging(true)}
          onDone={() => {
            setIntro(null)
            setEmerging(false)
          }}
        />
      )}

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
        onProgress={(current, dur, videoId) => {
          if (playbackSource === 'youtube') updateProgress(current, dur, videoId)
        }}
        onPlayStateChange={(playing) => {
          if (playbackSource === 'youtube') setIsPlaying(playing)
        }}
        onEnded={() => {
          if (playbackSource !== 'youtube') return
          onTrackEnded()
        }}
        onError={(code) => {
          // Private, removed or not embeddable. The code is for us, not the page.
          if (playbackSource !== 'youtube') return
          console.warn('[shama] the YouTube player could not play', ytVideoId, code)
          setIsPlaying(false)
          setPlaybackNote(COPY.unplayable)
        }}
      />

      <JamJoinPrompt
        jam={jam}
        open={joinPending}
        onEnter={() => {
          jam.acknowledgeGesture()
          setGuestEntered(true)
        }}
      />

      {roomNote && (
        <p className="room-toast" role="status">
          {roomNote}
        </p>
      )}

      {/* Out of reach while the opening plays; it rises out of the opening's light. */}
      <div
        className={`shama-room ${emerging ? 'shama-room--emerging' : ''}`}
        inert={intro !== null || undefined}
      >
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

          <div className="room-actions">
            <AmbienceToggle ambience={ambience} />
            <MehfilJamBar
              jam={jam}
              onLeave={leaveMehfil}
              onShowRequests={() => {
                setCurrentView('LISTEN')
                window.setTimeout(() => document.getElementById('mehfil-requests')?.focus(), 80)
              }}
            />
          </div>
        </header>

        {/* ------------------------------------------------------- LISTEN -- */}
        {currentView === 'LISTEN' && (
          <div
            className={`mehfil-room ${quiet ? 'mehfil-room--quiet' : ''} ${
              (awaitingChoice && mehfil.length === 0) || (guestWaiting && !jam.remote?.queue?.length)
                ? 'mehfil-room--bare'
                : ''
            } ${arrivalOn && hasChosen ? 'mehfil-room--arrived' : ''}`}
          >
            <aside className="mehfil-aside">
              {jam.role === 'host' && <RequestsInbox jam={jam} onAdd={acceptRequest} />}
              {guestMode ? (
                <HostQueue jam={jam} />
              ) : (
              <MehfilQueue
                items={mehfil}
                currentIndex={mehfilIndex}
                onPlay={playMehfilAt}
                onRemove={removeFromMehfil}
                onMove={reorderMehfil}
                onPlayNext={playNextInMehfil}
                onOpenLibrary={() => setCurrentView('LIBRARY')}
                onOpenExplore={() => setCurrentView('EXPLORE')}
                readOnly={isGuest}
              />
              )}
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
                onSeek={userSeek}
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
                arrival={
                  awaitingChoice ? (
                    <ArrivalStage
                      works={catalog}
                      onChooseWork={(work) => void openWork(work, true)}
                      onPlayRecording={(hit) => playRecording(hit as YtTrack)}
                      searchRecordings={searchRecordings}
                    />
                  ) : guestWaiting ? (
                    <GuestWaiting jam={jam} />
                  ) : undefined
                }
              />
              {awaitingChoice && <FeelingsGrid works={catalog} onChooseWork={(work) => void openWork(work, true)} />}
            </div>

            <div
              className={`mehfil-study ${recordingHasNoWords ? 'mehfil-study--single' : ''}`}
              // With no words and no other performance to point to, the title already says it all.
              hidden={
                awaitingChoice || guestWaiting || (recordingHasNoWords && ytLyrics.otherRenditions.length === 0)
              }
            >
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
                  onSeek={userSeek}
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

              {!recordingHasNoWords && (
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
              )}
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
                {guestMode
                  ? ' You’re a guest in this mehfil: choose one to ask the host to add it.'
                  : ' Choose one and it joins tonight’s mehfil.'}
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
                      aria-label={
                        guestMode
                          ? `Ask the host to add ${work.title}, ${work.poet}, sung by ${work.artist}`
                          : `Listen to ${work.title}, ${work.poet}, sung by ${work.artist}`
                      }
                      title={guestMode ? 'Ask the host to add it' : 'Listen now — it joins tonight’s mehfil'}
                    >
                      <span className="sher-index">{String(i + 1).padStart(2, '0')}</span>
                      <span>
                        <span className="work-title">{work.title}</span>
                        <span className="work-sub">
                          {work.poet} &nbsp;·&nbsp; sung by {work.artist}
                        </span>
                        <span className="work-meta-row">
                          {work.mood && <span className="work-mood">{work.mood}</span>}
                          {guestMode && (
                            <span className={`work-ask work-ask--${askedStatus(workWish(work)) ?? 'none'}`}>
                              {askedLabel(askedStatus(workWish(work)))}
                            </span>
                          )}
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
                {guestMode && ' You’re a guest in this mehfil: choose a recording to ask the host to add it.'}
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
                {ytResults.map((track, idx) => {
                  const asked = askedStatus(recordingWish(track))
                  const queued = guestMode ? asked === 'pending' || asked === 'added' : isRecordingQueued(track.videoId)
                  return (
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
                        title={guestMode ? 'Ask the host to add it' : undefined}
                      >
                        <span className="result-art">
                          {track.coverUrl ? (
                            <img src={track.coverUrl} alt="" loading="lazy" />
                          ) : (
                            <Music size={20} aria-hidden="true" />
                          )}
                          <span className="result-art-veil">
                            {guestMode ? <Send size={18} aria-hidden="true" /> : <Play size={20} aria-hidden="true" />}
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
                      <button
                        type="button"
                        className={`result-add ${queued ? 'result-add--done' : ''}`}
                        aria-disabled={queued || undefined}
                        aria-label={
                          guestMode
                            ? queued
                              ? `You’ve asked the host for ${track.title}`
                              : `Ask the host to add ${track.title}`
                            : queued
                            ? `${track.title} is in tonight’s mehfil`
                            : `Add ${track.title} to tonight’s mehfil`
                        }
                        title={
                          guestMode
                            ? queued
                              ? 'Asked'
                              : 'Ask the host to add it'
                            : queued
                            ? 'In tonight’s mehfil'
                            : 'Add to tonight’s mehfil'
                        }
                        onClick={() => {
                          if (!queued) queueRecording(track)
                        }}
                      >
                        {queued ? <Check size={15} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            <p className="sr-only" role="status">
              {mehfilNotice}
            </p>

            {!ytLoading && ytResults.length === 0 && !ytError && (
              <div className="state-block">
                <span className="state-title">The room is quiet.</span>
                Search above, then play a recording, or press + to add it to tonight&rsquo;s mehfil.
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
                      aria-label={`Listen to ${work.title}, ${pick.label}`}
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
          <span className="room-footer-start">
            <span>Shama · a digital mehfil</span>
            <button type="button" className="text-btn footer-replay" onClick={replayIntro}>
              Replay intro
            </button>
          </span>
          <span>{isStreaming && isPlaying ? 'Playing' : ambience.audible ? 'Tanpura, softly' : 'Quiet'}</span>
        </footer>
      </div>
    </main>
  )
}

export default App
