'use client'

// How the room opens before anything has been chosen: an invitation to send a
// farmaish, and the scroll to write it on. It gives way to the stage at the
// first choice. `?arrival=off` opens the room as it used to be, for comparison.

import { useLayoutEffect, useRef } from 'react'
import { Play } from 'lucide-react'
import type { WorkData } from '../../data/ghazals'
import { FarmaishScroll, type RecordingHit } from './FarmaishScroll'
import './arrival.css'

export function arrivalEnabled(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('arrival') !== 'off'
}

interface ArrivalStageProps {
  works: WorkData[]
  onChooseWork: (work: WorkData) => void
  onPlayRecording: (hit: RecordingHit) => void
  searchRecordings: (query: string, signal: AbortSignal) => Promise<RecordingHit[]>
}

export function ArrivalStage(props: ArrivalStageProps) {
  return (
    <section className="arrival" aria-labelledby="arrival-title">
      <header className="arrival-head">
        <p className="arrival-urdu" lang="ur" dir="rtl">
          فرمائش
        </p>
        <h1 className="arrival-title" id="arrival-title">
          What shall we hear tonight?
        </h1>
        <p className="arrival-lede">
          At a mehfil, listeners send the singer a request. Unroll the scroll and write yours: a poet, a singer, a
          mood, or a line you half remember.
        </p>
      </header>
      <FarmaishScroll {...props} />
    </section>
  )
}

// A way in by feeling: one well-loved ghazal for each state of the heart,
// ordered from hope, through longing and loss, to awakening.
const FEELINGS: { workId: string; urdu: string; roman: string; english: string; hue: string }[] = [
  { workId: '03', urdu: 'امید', roman: 'umeed', english: 'hope', hue: '#a9bf6e' },
  { workId: '02', urdu: 'آرزو', roman: 'arzoo', english: 'longing', hue: '#dc8f8f' },
  { workId: '01', urdu: 'بےچینی', roman: 'bechaini', english: 'restlessness', hue: '#e2a64c' },
  { workId: '06', urdu: 'خواہش', roman: 'khwahish', english: 'desire', hue: '#d0594a' },
  { workId: '05', urdu: 'یاد', roman: 'yaad', english: 'remembrance', hue: '#c9a57c' },
  { workId: '04', urdu: 'ہجر', roman: 'hijr', english: 'separation', hue: '#8494cf' },
  { workId: '09', urdu: 'فراموشی', roman: 'faramoshi', english: 'forgetting', hue: '#93a8b2' },
  { workId: '10', urdu: 'شکوہ', roman: 'shikwa', english: 'complaint', hue: '#b85e52' },
  { workId: '07', urdu: 'ناامیدی', roman: 'na-umeedi', english: 'despair', hue: '#7b89a2' },
  { workId: '08', urdu: 'بیداری', roman: 'bedaari', english: 'awakening', hue: '#eab24e' },
]

/** An element's top on the page, from layout alone (entrance transforms ignored). */
function pageTop(el: HTMLElement): number {
  let top = 0
  for (let node: HTMLElement | null = el; node; node = node.offsetParent as HTMLElement | null) top += node.offsetTop
  return top
}

// How far the grid may move to meet the fold: up into the stage's bottom
// padding and the space above its heading, or down on a tall screen.
const LIFT_MARGIN = 40
const LIFT_HEAD = 24
const DROP_MAX = 160

interface FeelingsProps {
  works: WorkData[]
  onChooseWork: (work: WorkData) => void
}

export function FeelingsGrid({ works, onChooseWork }: FeelingsProps) {
  const cards = FEELINGS.map((f) => ({ ...f, work: works.find((w) => w.id === f.workId) })).filter(
    (f): f is (typeof FEELINGS)[number] & { work: WorkData } => !!f.work
  )
  const sectionRef = useRef<HTMLElement>(null)
  const headRef = useRef<HTMLElement>(null)
  const gridRef = useRef<HTMLUListElement>(null)

  // At a desktop width the first screen ends midway through the gap between
  // the first two rows: one full row in view, the next just below the fold.
  useLayoutEffect(() => {
    const section = sectionRef.current
    const head = headRef.current
    const grid = gridRef.current
    if (!section || !head || !grid) return
    const place = () => {
      section.style.marginTop = ''
      head.style.paddingTop = ''
      if (!window.matchMedia('(min-width: 901px)').matches) return
      const items = Array.from(grid.children) as HTMLElement[]
      const firstTop = items[0] ? pageTop(items[0]) : 0
      const nextRow = items.find((li) => pageTop(li) > firstTop + 4)
      if (!nextRow) return
      const rowEnd = Math.max(...items.filter((li) => pageTop(li) === firstTop).map((li) => firstTop + li.offsetHeight))
      const gapMiddle = (rowEnd + pageTop(nextRow)) / 2
      const lift = gapMiddle - window.innerHeight
      if (lift > 0) {
        section.style.marginTop = `${-Math.min(lift, LIFT_MARGIN)}px`
        const more = Math.min(Math.max(lift - LIFT_MARGIN, 0), LIFT_HEAD)
        if (more > 0) head.style.paddingTop = `${parseFloat(getComputedStyle(head).paddingTop) - more}px`
      } else {
        section.style.marginTop = `${Math.min(-lift, DROP_MAX)}px`
      }
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(grid)
    window.addEventListener('resize', place)
    document.fonts?.ready.then(place)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', place)
    }
  }, [])

  if (!cards.length) return null
  return (
    <section className="feelings" aria-labelledby="feelings-title" ref={sectionRef}>
      <header className="feelings-head" ref={headRef}>
        <h2 className="feelings-title" id="feelings-title">
          Or begin with a feeling
        </h2>
        <span className="feelings-urdu" lang="ur" dir="rtl" aria-hidden="true">
          کیفیت
        </span>
      </header>
      <ul className="feelings-grid" ref={gridRef}>
        {cards.map((f, i) => (
          <li key={f.workId} style={{ animationDelay: `${120 + i * 45}ms` }}>
            <button
              type="button"
              className="feeling"
              style={{ '--hue': f.hue } as React.CSSProperties}
              onClick={() => onChooseWork(f.work)}
            >
              <span className="feeling-urdu" lang="ur" dir="rtl" aria-hidden="true">
                {f.urdu}
              </span>
              <span className="feeling-name">
                {f.roman.replace('-', ' ')}, {f.english}
              </span>
              <span className="feeling-rule" aria-hidden="true" />
              <span className="feeling-title">{f.work.title}</span>
              <span className="feeling-by">sung by {f.work.artist}</span>
              <span className="feeling-play" aria-hidden="true">
                <Play size={13} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default ArrivalStage
