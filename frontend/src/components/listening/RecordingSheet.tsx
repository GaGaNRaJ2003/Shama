'use client'

import { useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'

export interface Couplet {
  index: number
  line1: string
  line2: string | null
  combined_text: string
  is_refrain: boolean
  confidence?: number
  group_type?: string
}

export interface SyncedLine {
  time_ms: number
  text: string
}

interface RecordingSheetProps {
  loading: boolean
  syncedLines: SyncedLine[]
  couplets: Couplet[]
  rawText: string | null
  currentTime: number
  activeSyncedIndex: number
  selectedCoupletIndex: number | null
  onSelectCouplet: (couplet: Couplet) => void
  onSeek: (seconds: number) => void
  /** Ask what a line means. Synced lines are explainable too, not just couplets. */
  onExplainLine?: (text: string) => void
  /** The line currently under discussion in the study panel. */
  explainedLine?: string | null
  /** Manual correction, in seconds, applied to the lyric timings. */
  offset: number
  onOffsetChange: (seconds: number) => void
  /** False when the matched lyrics belong to a noticeably different rendition. */
  timingReliable: boolean
  /** Other performances of the same ghazal that do have words. */
  otherRenditions?: { trackName: string; artistName: string; hasSynced: boolean }[]
  onFindRendition?: (query: string) => void
}

/**
 * The words for a recording found through search. Time-synced lines when the
 * lyric source provides them, couplets when the splitter groups them, plain
 * lines otherwise — and an honest empty state when there is nothing (§22, §25).
 */
export function RecordingSheet({
  loading,
  syncedLines,
  couplets,
  rawText,
  activeSyncedIndex,
  selectedCoupletIndex,
  onSelectCouplet,
  onSeek,
  onExplainLine,
  explainedLine,
  offset,
  onOffsetChange,
  timingReliable,
  otherRenditions = [],
  onFindRendition,
}: RecordingSheetProps) {
  const sheetRef = useRef<HTMLDivElement | null>(null)

  // Scroll this panel — not the window — and only when the line changes (§5).
  useEffect(() => {
    if (activeSyncedIndex < 0) return
    const container = sheetRef.current
    if (!container) return
    const el = container.querySelector<HTMLElement>(`[data-line-index="${activeSyncedIndex}"]`)
    if (!el) return
    const target = el.offsetTop - container.clientHeight / 2 + el.offsetHeight / 2
    container.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
  }, [activeSyncedIndex])

  return (
    <section aria-labelledby="recording-sheet-heading">
      <div className="panel-head">
        <div>
          <span className="eyebrow">The Poetry</span>
          <h2 className="panel-title" id="recording-sheet-heading">
            Words
          </h2>
        </div>
        {syncedLines.length > 0 && (
          <div className="segmented" role="group" aria-label="Adjust lyric timing">
            <span className="eyebrow">
              {offset ? `${offset > 0 ? '+' : ''}${offset.toFixed(1)}s` : 'In sync?'}
            </span>
            <button
              type="button"
              className="segmented-btn"
              onClick={() => onOffsetChange(Math.round((offset - 0.5) * 10) / 10)}
              aria-label="Lyrics are running late — shift them earlier"
              title="Running late"
            >
              &minus;
            </button>
            <button
              type="button"
              className="segmented-btn"
              onClick={() => onOffsetChange(Math.round((offset + 0.5) * 10) / 10)}
              aria-label="Lyrics are running early — shift them later"
              title="Running early"
            >
              +
            </button>
            {offset !== 0 && (
              <button type="button" className="segmented-btn" onClick={() => onOffsetChange(0)}>
                Reset
              </button>
            )}
          </div>
        )}
      </div>

      {syncedLines.length > 0 && !timingReliable && (
        <p className="sync-note">
          These words come from a different recording of the same song, so they may drift.
          Nudge them with &minus; and + above.
        </p>
      )}

      <div className="sheet" ref={sheetRef}>
        {loading ? (
          <p className="state-note" style={{ padding: 'var(--space-4) 0' }}>
            <Loader2 size={14} className="spin" aria-hidden="true" /> Preparing the mehfil…
          </p>
        ) : syncedLines.length > 0 ? (
          <div className="lyric-stream">
            {syncedLines.map((line, i) => {
              const text = line.text.trim()
              // Instrumental markers still need data-line-index: without it the
              // scroll effect's querySelector returns null, aborts, and the
              // sheet appears to freeze mid-song.
              if (!text) {
                return (
                  <p key={i} data-line-index={i} className="lyric-line" aria-hidden="true">
                    &nbsp;
                  </p>
                )
              }
              return (
                <button
                  key={i}
                  type="button"
                  data-line-index={i}
                  className={`sher ${i === activeSyncedIndex ? 'sher--singing' : ''} ${
                    activeSyncedIndex > -1 && i < activeSyncedIndex ? 'sher--past' : ''
                  } ${explainedLine === text ? 'sher--active' : ''}`}
                  style={{ padding: 'var(--space-1) var(--space-4)' }}
                  aria-current={i === activeSyncedIndex ? 'true' : undefined}
                  onClick={(e) => {
                    // Plain tap jumps the audio; with a modifier, or via the
                    // explain affordance, it becomes the subject of the panel.
                    // The seek carries the offset, as the highlight does.
                    if (onExplainLine && (e.metaKey || e.ctrlKey || e.altKey)) onExplainLine(text)
                    else onSeek(Math.max(0, line.time_ms / 1000 + offset))
                  }}
                >
                  <span className={`lyric-line ${i === activeSyncedIndex ? 'lyric-line--active' : ''}`}>
                    {text}
                  </span>
                  {onExplainLine && (
                    <span
                      role="button"
                      tabIndex={0}
                      className="lyric-explain"
                      aria-label={`What does "${text.slice(0, 40)}" mean?`}
                      onClick={(e) => {
                        e.stopPropagation()
                        onExplainLine(text)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          e.stopPropagation()
                          onExplainLine(text)
                        }
                      }}
                    >
                      meaning
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ) : couplets.length > 0 ? (
          <>
            {couplets.map((couplet) => (
              <button
                key={couplet.index}
                type="button"
                className={`sher ${
                  selectedCoupletIndex === couplet.index ? 'sher--active' : ''
                }`}
                onClick={() => onSelectCouplet(couplet)}
              >
                <span className="sher-meta">
                  <span className="sher-index">{String(couplet.index + 1).padStart(2, '0')}</span>
                  {couplet.is_refrain && <span className="sher-tag">Refrain</span>}
                </span>
                <p className="sher-roman" style={{ margin: 0, fontStyle: 'normal' }}>
                  {couplet.line1}
                </p>
                {couplet.line2 && (
                  <p className="sher-roman" style={{ marginTop: 2, fontStyle: 'normal' }}>
                    {couplet.line2}
                  </p>
                )}
              </button>
            ))}
          </>
        ) : rawText ? (
          <div className="lyric-stream" style={{ padding: 'var(--space-2) var(--space-4)' }}>
            {rawText.split('\n').map((line, i) => (
              <p key={i} className="lyric-line">
                {line.trim() === '' ? ' ' : line}
              </p>
            ))}
          </div>
        ) : (
          <div className="state-block">
            <span className="state-title">Lyrics aren&rsquo;t available for this recording.</span>
            {otherRenditions.length > 0 && onFindRendition ? (
              <>
                {/* A ghazal is a poem: another singer performs the same verse,
                    so their words are the right words — only the timings
                    belong to their performance. */}
                Other performances of this ghazal do have words.
                <ul className="rendition-list">
                  {otherRenditions.map((r) => (
                    <li key={`${r.trackName}-${r.artistName}`}>
                      <button
                        type="button"
                        className="text-btn"
                        onClick={() => onFindRendition(`${r.trackName} ${r.artistName}`)}
                      >
                        {r.artistName}
                      </button>
                      {r.hasSynced && <span className="eyebrow"> follows along</span>}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>The candle is lit all the same — let it play.</>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

export default RecordingSheet
