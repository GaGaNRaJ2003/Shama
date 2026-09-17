'use client'

// The farmaish: a rolled cloth scroll, the room's invitation. Pressed, it
// glows and unrolls downwards, a wave running through the cloth as it falls,
// with the request written on it. The cloth is painted on a canvas; the words
// and the input are ordinary page content laid over it.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Play } from 'lucide-react'
import type { LineData, WorkData } from '../../data/ghazals'

export interface RecordingHit {
  videoId: string
  title: string
  artist: string
  duration?: string
  coverUrl?: string
}

interface FarmaishProps {
  works: WorkData[]
  onChooseWork: (work: WorkData) => void
  onPlayRecording: (hit: RecordingHit) => void
  searchRecordings: (query: string, signal: AbortSignal) => Promise<RecordingHit[]>
}

// ---------------------------------------------------------------- search --

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

interface LibraryMatch {
  work: WorkData
  line?: LineData
}

function matchLibrary(works: WorkData[], query: string): LibraryMatch[] {
  const words = fold(query).split(' ').filter(Boolean)
  if (!words.length) return []
  const hasAll = (text: string) => {
    const hay = fold(text)
    return words.every((w) => hay.includes(w))
  }
  const matches: LibraryMatch[] = []
  for (const work of works) {
    if (hasAll(`${work.title} ${work.poet} ${work.artist} ${work.mood || ''}`)) {
      matches.push({ work })
      continue
    }
    const line = work.lines.find((l) =>
      hasAll(`${l.roman} ${l.transliteration} ${l.englishText} ${l.translation} ${l.urdu} ${l.hindi}`)
    )
    if (line) matches.push({ work, line })
  }
  return matches
}

/** Resolves when the covers have loaded, or after `ms`, whichever is first. */
function preloadCovers(urls: string[], ms: number): Promise<void> {
  const loads = urls.map(
    (src) =>
      new Promise<void>((resolve) => {
        const img = new Image()
        img.onload = () => resolve()
        img.onerror = () => resolve()
        img.src = src
      })
  )
  return Promise.race([Promise.all(loads).then(() => undefined), new Promise<void>((r) => setTimeout(r, ms))])
}

const SUGGESTIONS = ['Ghalib', 'Mehdi Hassan', 'yaad', 'dil hi to hai']
const RECORDING_ROWS = 5

interface Answer {
  query: string
  library: LibraryMatch[]
  recordings: RecordingHit[] | null
  failed: boolean
}

// ----------------------------------------------------------------- cloth --

const CLOTH_WIDTH = 360
const SIDE = 30 // room either side for the sway and the rod's finials
const ROLL_RADIUS = 17 // the rolled scroll
const ROLL_RADIUS_END = 9 // what is left of the roll at full length
const MAX_LENGTH = 640
const TOP = ROLL_RADIUS + 3 // centre of the top rod
const INSET = 34 // the words keep clear of the borders
const WORDS_TOP = 24 // below the band under the rod
const WORDS_BOTTOM = 30 // above the bottom roll

// The wave: its length along the cloth, its speed, and the largest sway.
const WAVE_K = (2 * Math.PI) / 150
const WAVE_OMEGA = 7.5
const SWAY_MAX = 9

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Ivory silk with a woven grain, madder borders edged in gold. Drawn once. */
function weave(width: number, length: number, dpr: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.round(width * dpr)
  c.height = Math.round(length * dpr)
  const g = c.getContext('2d')!
  g.scale(dpr, dpr)

  const base = g.createLinearGradient(0, 0, width, 0)
  base.addColorStop(0, '#e6d6b4')
  base.addColorStop(0.5, '#f2e8d2')
  base.addColorStop(1, '#e2d0ab')
  g.fillStyle = base
  g.fillRect(0, 0, width, length)

  g.fillStyle = 'rgba(120, 88, 48, 0.035)'
  for (let x = 0; x < width; x += 3) g.fillRect(x, 0, 1, length)
  g.fillStyle = 'rgba(255, 255, 255, 0.06)'
  for (let y = 0; y < length; y += 4) g.fillRect(0, y, width, 1)
  // Slubs in the silk.
  for (let i = 0; i < (width * length) / 700; i++) {
    g.fillStyle = `rgba(140, 104, 58, ${0.02 + Math.random() * 0.045})`
    g.fillRect(Math.random() * width, Math.random() * length, 2 + Math.random() * 7, 1)
  }

  const buti = (cx: number, cy: number, r: number) => {
    g.beginPath()
    g.moveTo(cx, cy - r)
    g.lineTo(cx + r, cy)
    g.lineTo(cx, cy + r)
    g.lineTo(cx - r, cy)
    g.closePath()
    g.fillStyle = '#dcb66c'
    g.fill()
  }
  const sideBand = (x: number) => {
    g.fillStyle = '#7b2d1f'
    g.fillRect(x, 0, 14, length)
    g.fillStyle = '#c9a25a'
    g.fillRect(x - 3, 0, 1, length)
    g.fillRect(x + 16, 0, 1, length)
    for (let y = 12; y < length; y += 16) buti(x + 7, y, 3.1)
  }
  sideBand(10)
  sideBand(width - 24)

  g.fillStyle = '#7b2d1f'
  g.fillRect(7, 4, width - 14, 11)
  g.fillStyle = '#c9a25a'
  g.fillRect(7, 2, width - 14, 1)
  g.fillRect(7, 17, width - 14, 1)
  for (let x = 18; x < width - 12; x += 14) buti(x, 9.5, 2.5)
  return c
}

function finial(g: CanvasRenderingContext2D, x: number, y: number, r: number, side: number) {
  const grd = g.createRadialGradient(x + side * r * 0.1, y - r * 0.4, r * 0.1, x, y, r * 1.1)
  grd.addColorStop(0, '#f7df9f')
  grd.addColorStop(0.45, '#c69846')
  grd.addColorStop(1, '#4f3510')
  g.fillStyle = grd
  g.beginPath()
  g.ellipse(x + side * r * 0.45, y, r * 0.7, r, 0, 0, Math.PI * 2)
  g.fill()
}

function rod(g: CanvasRenderingContext2D, cx: number, y: number, half: number, thick: number) {
  const grd = g.createLinearGradient(0, y - thick / 2, 0, y + thick / 2)
  grd.addColorStop(0, '#24130a')
  grd.addColorStop(0.35, '#86552f')
  grd.addColorStop(0.55, '#a9764b')
  grd.addColorStop(1, '#24130a')
  g.fillStyle = grd
  g.fillRect(cx - half, y - thick / 2, half * 2, thick)
  finial(g, cx - half, y, thick * 0.95, -1)
  finial(g, cx + half, y, thick * 0.95, 1)
}

function roll(g: CanvasRenderingContext2D, cx: number, y: number, half: number, r: number, tie: number) {
  rod(g, cx, y, half + 10, Math.max(6, r * 0.7))
  const body = g.createLinearGradient(0, y - r, 0, y + r)
  body.addColorStop(0, '#8f7b58')
  body.addColorStop(0.28, '#f7efdc')
  body.addColorStop(0.55, '#e8dbbd')
  body.addColorStop(1, '#5f4d33')
  g.fillStyle = body
  g.fillRect(cx - half, y - r, half * 2, r * 2)
  g.fillStyle = 'rgba(123, 45, 31, 0.92)'
  g.fillRect(cx - half + 10, y - r, 14, r * 2)
  g.fillRect(cx + half - 24, y - r, 14, r * 2)
  const shade = g.createLinearGradient(0, y - r, 0, y + r)
  shade.addColorStop(0, 'rgba(0, 0, 0, 0.3)')
  shade.addColorStop(0.3, 'rgba(255, 250, 235, 0.14)')
  shade.addColorStop(1, 'rgba(0, 0, 0, 0.45)')
  g.fillStyle = shade
  g.fillRect(cx - half, y - r, half * 2, r * 2)
  // The rolled ends, a spiral of cloth.
  for (const s of [-1, 1]) {
    g.fillStyle = '#d3c19b'
    g.beginPath()
    g.ellipse(cx + s * half, y, r * 0.32, r, 0, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = 'rgba(96, 64, 30, 0.45)'
    g.lineWidth = 0.8
    for (let k = 1; k < 4; k++) {
      g.beginPath()
      g.ellipse(cx + s * half, y, (r * 0.32 * k) / 4, (r * k) / 4, 0, 0, Math.PI * 2)
      g.stroke()
    }
  }
  if (tie > 0.01) {
    g.fillStyle = `rgba(150, 34, 30, ${tie})`
    g.fillRect(cx - 6, y - r - 0.5, 12, r * 2 + 1)
    g.fillStyle = `rgba(230, 180, 100, ${tie * 0.7})`
    g.fillRect(cx - 6, y - r - 0.5, 1, r * 2 + 1)
    g.fillRect(cx + 5, y - r - 0.5, 1, r * 2 + 1)
  }
}

interface Sim {
  length: number
  velocity: number
  target: number
  sway: number
  time: number
  last: number
  closing: boolean
}

// ------------------------------------------------------------- component --

export function FarmaishScroll({ works, onChooseWork, onPlayRecording, searchRecordings }: FarmaishProps) {
  const [open, setOpen] = useState(false)
  const [glowing, setGlowing] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [query, setQuery] = useState('')
  const [answer, setAnswer] = useState<Answer | null>(null)
  const [clothWidth, setClothWidth] = useState(CLOTH_WIDTH)

  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wordsRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const texture = useRef<HTMLCanvasElement | null>(null)
  const sim = useRef<Sim>({ length: 0, velocity: 0, target: 0, sway: 0, time: 0, last: 0, closing: false })
  const frame = useRef<number | null>(null)
  const wordsHeight = useRef(0)
  const revealedRef = useRef(false)
  const cache = useRef(new Map<string, RecordingHit[]>())
  const pending = useRef<AbortController | null>(null)
  const timers = useRef<number[]>([])

  const canvasWidth = clothWidth + SIDE * 2
  const canvasHeight = TOP + MAX_LENGTH + ROLL_RADIUS * 2 + 24


  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const tex = texture.current
    if (!canvas || !tex) return
    const g = canvas.getContext('2d')!
    const dpr = tex.width / clothWidth
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, canvasWidth, canvasHeight)

    const s = sim.current
    const length = Math.max(0, s.length)
    const cx = canvasWidth / 2
    const x0 = cx - clothWidth / 2
    const sway = s.sway / SWAY_MAX
    const dxAt = (y: number) => s.sway * Math.pow(y / 300, 1.15) * Math.sin(WAVE_K * y - WAVE_OMEGA * s.time)

    if (length > 1) {
      g.save()
      g.shadowColor = 'rgba(0, 0, 0, 0.55)'
      g.shadowBlur = 26
      g.shadowOffsetY = 12
      g.fillStyle = 'rgba(0, 0, 0, 0.9)'
      g.fillRect(x0 + 8 + dxAt(length) * 0.5, TOP, clothWidth - 16, length)
      g.restore()

      for (let y = 0; y < length; y++) {
        const phase = WAVE_K * y - WAVE_OMEGA * s.time
        const reach = Math.pow(y / 300, 1.15)
        const dx = s.sway * reach * Math.sin(phase)
        const pinch = 1 - 0.035 * sway * Math.min(reach, 1.5) * (0.5 - 0.5 * Math.cos(2 * phase))
        const w = clothWidth * pinch
        const sx = x0 + (clothWidth - w) / 2 + dx
        g.drawImage(tex, 0, y * dpr, tex.width, dpr, sx, TOP + y, w, 1.05)
        const light = sway * Math.min(reach, 1.4) * Math.cos(phase)
        if (light > 0.03) {
          g.fillStyle = `rgba(255, 248, 228, ${light * 0.2})`
          g.fillRect(sx, TOP + y, w, 1.05)
        } else if (light < -0.03) {
          g.fillStyle = `rgba(58, 30, 10, ${-light * 0.26})`
          g.fillRect(sx, TOP + y, w, 1.05)
        }
      }
      // The cloth's shadow under the rod.
      const under = g.createLinearGradient(0, TOP, 0, TOP + 10)
      under.addColorStop(0, 'rgba(40, 20, 8, 0.35)')
      under.addColorStop(1, 'rgba(40, 20, 8, 0)')
      g.fillStyle = under
      g.fillRect(x0, TOP, clothWidth, 10)
      rod(g, cx, TOP, clothWidth / 2 + 10, 9)
    }

    const radius = ROLL_RADIUS - (ROLL_RADIUS - ROLL_RADIUS_END) * Math.min(1, length / MAX_LENGTH)
    const tie = Math.max(0, 1 - length / 6)
    roll(g, cx + dxAt(length), TOP + length, clothWidth / 2, radius, tie)

    // Keep the words on the cloth, and let the page make way for it.
    const words = wordsRef.current
    if (words) {
      const hidden = Math.max(0, WORDS_TOP + wordsHeight.current + WORDS_BOTTOM - 8 - length)
      words.style.clipPath = `inset(0 0 ${hidden}px 0)`
    }
    if (wrapRef.current) {
      wrapRef.current.style.height = `${TOP + length + radius + 34}px`
    }
  }, [canvasHeight, canvasWidth, clothWidth])

  const settle = useCallback(() => {
    const s = sim.current
    if (s.closing) {
      s.closing = false
      setOpen(false)
      if (wrapRef.current) wrapRef.current.style.height = ''
      buttonRef.current?.focus({ preventScroll: true })
    }
  }, [])

  const reveal = useCallback(() => {
    if (revealedRef.current || sim.current.closing) return
    revealedRef.current = true
    setRevealed(true)
    inputRef.current?.focus({ preventScroll: true })
  }, [])

  const step = useCallback(
    (now: number) => {
      const s = sim.current
      const dt = s.last ? Math.min(0.034, (now - s.last) / 1000) : 1 / 60
      s.last = now
      s.time += dt
      // A falling roll bounces a little; a roll being wound up doesn't.
      const k = 58
      const c = s.closing ? 2.1 * Math.sqrt(k) : 0.8 * Math.sqrt(k)
      s.velocity += (k * (s.target - s.length) - c * s.velocity) * dt
      s.length += s.velocity * dt
      if (s.length < 0) {
        s.length = 0
        s.velocity = 0
      }
      // Once the words are on the cloth it barely stirs, so they stay with it.
      const drive = Math.min(revealedRef.current ? 1.5 : SWAY_MAX, Math.abs(s.velocity) * 0.032)
      s.sway = Math.max(drive, s.sway * Math.exp(-dt * 2.2))
      draw()
      const near = Math.abs(s.target - s.length) < 3
      if (near && s.sway < 2.2 && !s.closing && s.target > 0) reveal()
      if (near && Math.abs(s.velocity) < 4 && s.sway < 0.3) {
        s.length = s.target
        s.velocity = 0
        s.sway = 0
        draw()
        frame.current = null
        s.last = 0
        settle()
        return
      }
      frame.current = requestAnimationFrame(step)
    },
    [draw, reveal, settle]
  )

  const run = useCallback(() => {
    if (reducedMotion()) {
      const s = sim.current
      s.length = s.target
      s.velocity = 0
      s.sway = 0
      draw()
      if (s.target > 0) reveal()
      else settle()
      return
    }
    if (frame.current === null) frame.current = requestAnimationFrame(step)
  }, [draw, reveal, settle, step])

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms))
  }

  // Size the cloth to the room and weave it.
  useLayoutEffect(() => {
    const room = wrapRef.current?.parentElement
    if (!room) return
    const fit = () => setClothWidth(Math.max(260, Math.min(CLOTH_WIDTH, room.clientWidth - SIDE * 2)))
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(room)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(canvasWidth * dpr)
    canvas.height = Math.round(canvasHeight * dpr)
    texture.current = weave(clothWidth, MAX_LENGTH + 20, dpr)
    draw()
  }, [canvasHeight, canvasWidth, clothWidth, draw])

  // The cloth unrolls as far as the words need.
  useEffect(() => {
    const words = wordsRef.current
    if (!words) return
    const observer = new ResizeObserver(() => {
      wordsHeight.current = words.offsetHeight
      const s = sim.current
      if (open && !s.closing) {
        s.target = Math.min(MAX_LENGTH, WORDS_TOP + wordsHeight.current + WORDS_BOTTOM)
        if (frame.current !== null || s.length > 0) run()
      }
      draw()
    })
    observer.observe(words)
    return () => observer.disconnect()
  }, [open, draw, run])

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
      timers.current.forEach((t) => clearTimeout(t))
      pending.current?.abort()
    },
    []
  )

  const unroll = () => {
    const s = sim.current
    s.closing = false
    setOpen(true)
    setGlowing(true)
    later(() => setGlowing(false), 1100)
    // A breath of light first, then the roll drops.
    later(() => {
      s.target = Math.min(MAX_LENGTH, WORDS_TOP + (wordsRef.current?.offsetHeight ?? 160) + WORDS_BOTTOM)
      run()
    }, reducedMotion() ? 0 : 320)
  }

  const rollUp = () => {
    const s = sim.current
    s.closing = true
    revealedRef.current = false
    setRevealed(false)
    later(() => {
      s.target = 0
      run()
    }, reducedMotion() ? 0 : 160)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') rollUp()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const send = (raw: string) => {
    const q = raw.trim()
    if (!q) return
    pending.current?.abort()
    const ctrl = new AbortController()
    pending.current = ctrl
    const library = matchLibrary(works, q).slice(0, 4)
    const known = cache.current.get(q.toLowerCase())
    setAnswer({ query: q, library, recordings: known ?? null, failed: false })
    if (known) return
    // Every request here is for a ghazal; saying so keeps film songs out.
    searchRecordings(/ghazal/i.test(q) ? q : `${q} ghazal`, ctrl.signal)
      .then(async (hits) => {
        const shown = hits.slice(0, RECORDING_ROWS)
        await preloadCovers(shown.map((h) => h.coverUrl).filter((u): u is string => !!u), 1500)
        if (ctrl.signal.aborted) return
        cache.current.set(q.toLowerCase(), shown)
        setAnswer((a) => (a && a.query === q ? { ...a, recordings: shown } : a))
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return
        console.warn('[shama] farmaish search failed:', err)
        setAnswer((a) => (a && a.query === q ? { ...a, recordings: [], failed: true } : a))
      })
  }

  return (
    <div
      ref={wrapRef}
      className={`farmaish-scroll ${open ? 'farmaish-scroll--open' : ''} ${glowing ? 'farmaish-scroll--glow' : ''}`}
      style={{ width: canvasWidth }}
    >
      <span className="farmaish-scroll-halo" aria-hidden="true" />
      <canvas
        ref={canvasRef}
        className="farmaish-scroll-cloth"
        style={{ width: canvasWidth, height: canvasHeight }}
        aria-hidden="true"
      />
      {!open && <span className="farmaish-scroll-tassel" aria-hidden="true" />}

      <button
        ref={buttonRef}
        type="button"
        className="farmaish-scroll-roll"
        style={{ left: SIDE - 16, width: clothWidth + 32 }}
        aria-expanded={open}
        aria-controls="farmaish-words"
        onClick={() => (open ? rollUp() : unroll())}
      >
        {open ? (
          <span className="sr-only">Roll the farmaish up</span>
        ) : (
          <span className="farmaish-scroll-label">
            <span className="farmaish-scroll-urdu" lang="ur" dir="rtl" aria-hidden="true">
              فرمائش
            </span>
            Send a farmaish
          </span>
        )}
      </button>

      {open && (
        <div
          ref={wordsRef}
          id="farmaish-words"
          className={`farmaish-words ${revealed ? 'farmaish-words--shown' : ''}`}
          style={{ left: SIDE + INSET, width: clothWidth - INSET * 2, top: TOP + WORDS_TOP }}
          role="region"
          aria-labelledby="farmaish-heading"
        >
          <p className="farmaish-words-urdu" lang="ur" dir="rtl">
            فرمائش
          </p>
          <h2 className="farmaish-words-title" id="farmaish-heading">
            Aap ki farmaish?
          </h2>
          <p className="farmaish-words-lede">A poet, a singer, a mood, or a line you half remember.</p>

          <form
            className="farmaish-words-form"
            role="search"
            onSubmit={(e) => {
              e.preventDefault()
              send(query)
            }}
          >
            <label className="sr-only" htmlFor="farmaish-input">
              Your request
            </label>
            <input
              id="farmaish-input"
              ref={inputRef}
              className="farmaish-words-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Write it here…"
              autoComplete="off"
              tabIndex={revealed ? 0 : -1}
            />
            <button type="submit" className="farmaish-words-send" disabled={!query.trim()} tabIndex={revealed ? 0 : -1}>
              Send
            </button>
          </form>

          {!answer && (
            <p className="farmaish-words-suggest">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="farmaish-words-chip"
                  tabIndex={revealed ? 0 : -1}
                  onClick={() => {
                    setQuery(s)
                    send(s)
                  }}
                >
                  {s}
                </button>
              ))}
            </p>
          )}

          {answer && (
            <div className="farmaish-words-answer" aria-live="polite">
              <h3 className="farmaish-words-kicker">In the Library</h3>
              {answer.library.length ? (
                <ul className="farmaish-words-list">
                  {answer.library.map(({ work, line }) => (
                    <li key={work.id}>
                      <button type="button" className="farmaish-words-row" onClick={() => onChooseWork(work)}>
                        <span className="farmaish-words-play" aria-hidden="true">
                          <Play size={11} />
                        </span>
                        <span>
                          <span className="farmaish-words-row-title">{work.title}</span>
                          <span className="farmaish-words-row-sub">
                            {line ? `“${line.transliteration || line.roman}”` : `${work.poet}, sung by ${work.artist}`}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="farmaish-words-none">Nothing in the Library for “{answer.query}”.</p>
              )}

              <h3 className="farmaish-words-kicker">Recordings</h3>
              {answer.recordings === null ? (
                <ul className="farmaish-words-list" aria-label="Looking for recordings">
                  {Array.from({ length: RECORDING_ROWS }, (_, i) => (
                    <li key={i} className="farmaish-words-row farmaish-words-row--waiting" aria-hidden="true">
                      <span className="farmaish-words-cover" />
                      <span>
                        <span className="farmaish-words-ink" style={{ width: `${72 - i * 6}%` }} />
                        <span className="farmaish-words-ink farmaish-words-ink--thin" style={{ width: `${42 + i * 4}%` }} />
                      </span>
                    </li>
                  ))}
                </ul>
              ) : answer.failed ? (
                <p className="farmaish-words-none">Recordings can’t be searched just now.</p>
              ) : answer.recordings.length ? (
                <ul className="farmaish-words-list farmaish-words-list--arrived">
                  {answer.recordings.map((hit) => (
                    <li key={hit.videoId}>
                      <button type="button" className="farmaish-words-row" onClick={() => onPlayRecording(hit)}>
                        {hit.coverUrl ? (
                          <img className="farmaish-words-cover" src={hit.coverUrl} alt="" />
                        ) : (
                          <span className="farmaish-words-cover" />
                        )}
                        <span>
                          <span className="farmaish-words-row-title">{hit.title}</span>
                          <span className="farmaish-words-row-sub">
                            {hit.artist}
                            {hit.duration ? `, ${hit.duration}` : ''}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="farmaish-words-none">No recordings found for “{answer.query}”.</p>
              )}
            </div>
          )}

          <button type="button" className="farmaish-words-close" onClick={rollUp} tabIndex={revealed ? 0 : -1}>
            Roll it up
          </button>
        </div>
      )}
    </div>
  )
}

export default FarmaishScroll
