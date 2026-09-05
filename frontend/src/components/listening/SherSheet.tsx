'use client'

import { useEffect, useRef } from 'react'
import type { LineData } from '../../data/ghazals'

export type ScriptMode = 'URDU' | 'HINDI' | 'ROMAN' | 'ENGLISH'

const SCRIPTS: { mode: ScriptMode; label: string }[] = [
  { mode: 'URDU', label: 'Urdu' },
  { mode: 'HINDI', label: 'Hindi' },
  { mode: 'ROMAN', label: 'Roman' },
  { mode: 'ENGLISH', label: 'English' },
]

interface SherSheetProps {
  lines: LineData[]
  form: string
  activeLineId: string
  /** The couplet the singer is on, when timing data says so. */
  singingLineId: string | null
  scriptMode: ScriptMode
  onScriptMode: (mode: ScriptMode) => void
  onSelectLine: (line: LineData) => void
  lineTime: (line: LineData) => number | null
  formatTime: (seconds: number) => string
  follow: boolean
  onToggleFollow: () => void
  hasTimestamps: boolean
  /** Where the couplet timings came from, so we can say so honestly. */
  timingState: 'idle' | 'deriving' | 'done' | 'none'
}

/** Matla and maqta are definitional positions in a ghazal — not inferred content. */
function structureTag(index: number, total: number, form: string): string | null {
  if (!/ghazal/i.test(form) || total < 2) return null
  if (index === 0) return 'Matla'
  if (index === total - 1) return 'Maqta'
  return null
}

export function SherSheet({
  lines,
  form,
  activeLineId,
  singingLineId,
  scriptMode,
  onScriptMode,
  onSelectLine,
  lineTime,
  formatTime,
  follow,
  onToggleFollow,
  hasTimestamps,
  timingState,
}: SherSheetProps) {
  const sheetRef = useRef<HTMLDivElement | null>(null)

  // Follow the singer by scrolling *this panel*, not the window — and only when
  // the active couplet actually changes (§5).
  useEffect(() => {
    if (!follow || !singingLineId) return
    const container = sheetRef.current
    if (!container) return
    const el = container.querySelector<HTMLElement>(`[data-sher-id="${singingLineId}"]`)
    if (!el) return
    const target = el.offsetTop - container.clientHeight / 2 + el.offsetHeight / 2
    container.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
  }, [singingLineId, follow])

  const singingIndex = singingLineId ? lines.findIndex((l) => l.id === singingLineId) : -1

  const scriptOf = (line: LineData) => {
    switch (scriptMode) {
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

  const isUrduScript = scriptMode === 'URDU'
  const isDevanagari = scriptMode === 'HINDI'

  return (
    <section aria-labelledby="sheet-heading">
      <div className="panel-head">
        <div>
          <span className="eyebrow">The Poetry</span>
          <h2 className="panel-title" id="sheet-heading">
            Couplets
          </h2>
        </div>
        <div className="segmented" role="group" aria-label="Script">
          {SCRIPTS.map((s) => (
            <button
              key={s.mode}
              type="button"
              className={`segmented-btn ${scriptMode === s.mode ? 'segmented-btn--active' : ''}`}
              aria-pressed={scriptMode === s.mode}
              onClick={() => onScriptMode(s.mode)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="sync-bar">
        <button
          type="button"
          className={`text-btn ${follow ? '' : 'text-btn--off'}`}
          onClick={onToggleFollow}
          aria-pressed={follow}
          disabled={!hasTimestamps}
          title={
            hasTimestamps
              ? 'Let the page follow the singer from couplet to couplet'
              : 'Available once this recording has couplet timings'
          }
        >
          {follow ? 'Following the singer' : 'Follow the singer'}
        </button>
        {timingState === 'deriving' && (
          <span className="eyebrow">Finding the couplets…</span>
        )}
      </div>

      {timingState === 'none' && !hasTimestamps && (
        <p className="sync-note">
          This recording doesn&rsquo;t have timed lyrics, so the couplets can&rsquo;t follow along.
          Tap any couplet to jump the audio there.
        </p>
      )}

      <div className="sheet" ref={sheetRef}>
        {lines.map((line, index) => {
          const t = lineTime(line)
          const isSinging = singingLineId === line.id
          const isActive = activeLineId === line.id
          const isPast = singingIndex > -1 && index < singingIndex
          const tag = structureTag(index, lines.length, form)
          return (
            <button
              key={line.id}
              type="button"
              data-sher-id={line.id}
              className={[
                'sher',
                isActive ? 'sher--active' : '',
                isSinging ? 'sher--singing' : '',
                isPast ? 'sher--past' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-current={isSinging ? 'true' : undefined}
              onClick={() => onSelectLine(line)}
            >
              <span className="sher-meta">
                <span className="sher-index">{String(index + 1).padStart(2, '0')}</span>
                {tag && <span className="sher-tag">{tag}</span>}
                <span className={`sher-time ${t === null ? 'sher-time--unset' : ''}`}>
                  {t !== null ? formatTime(t) : ''}
                </span>
              </span>

              {isUrduScript ? (
                <p className="sher-urdu" lang="ur" dir="rtl">
                  {line.urdu}
                </p>
              ) : (
                <p
                  className="sher-urdu"
                  lang={isDevanagari ? 'hi' : 'en'}
                  dir="ltr"
                  style={isDevanagari ? undefined : { fontFamily: 'var(--font-serif)' }}
                >
                  {scriptOf(line)}
                </p>
              )}

              {scriptMode !== 'ROMAN' && <p className="sher-roman">{line.transliteration}</p>}
              {scriptMode !== 'ENGLISH' && <p className="sher-english">{line.translation}</p>}

              {isSinging && follow && line.simple && (
                <p className="sher-gloss">{line.simple}</p>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}

export default SherSheet
