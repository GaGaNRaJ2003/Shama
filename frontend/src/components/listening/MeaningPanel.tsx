'use client'

import { Loader2, Volume2 } from 'lucide-react'
import GhazalAnatomy from './GhazalAnatomy'
import type { Meaning } from '../../data/meaning'

export type StudyTab = 'MEANING' | 'WORDS' | 'CONTEXT'

export type { Meaning }

export interface CoupletView {
  urdu?: string
  roman: string
  translation?: string
}

export interface ContextFacts {
  title: string
  poet?: string
  singer?: string
  form?: string
  language?: string
  mood?: string
}

interface MeaningPanelProps {
  tab: StudyTab
  onTab: (tab: StudyTab) => void
  couplet: CoupletView | null
  meaning: Meaning | null
  loading: boolean
  /** True when the request failed. The reason is logged, never shown (§17). */
  failed: boolean
  onRetry: () => void
  /** Authored fallbacks that ship with the curated catalog. */
  fallback?: { simple?: string; detailed?: string; vocabulary?: { term: string; meaning: string }[] }
  facts: ContextFacts
  onExplorePoet?: (poet: string) => void
  onExploreSinger?: (singer: string) => void
  onPronounce: (text: string) => void
  isSpeaking: boolean
  onToggleNarration: () => void
  /** Copy for the "nothing selected yet" state. */
  emptyPrompt?: string
}

const TABS: { id: StudyTab; label: string }[] = [
  { id: 'MEANING', label: 'Meaning' },
  { id: 'WORDS', label: 'Words' },
  { id: 'CONTEXT', label: 'Context' },
]

function Unavailable({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <p className="state-note">
      {what} isn&rsquo;t available right now.{' '}
      <button type="button" className="text-btn" onClick={onRetry}>
        Try again
      </button>
    </p>
  )
}

export function MeaningPanel({
  tab,
  onTab,
  couplet,
  meaning,
  loading,
  failed,
  onRetry,
  fallback,
  facts,
  onExplorePoet,
  onExploreSinger,
  onPronounce,
  isSpeaking,
  onToggleNarration,
  emptyPrompt = 'Choose a couplet to sit with it a while.',
}: MeaningPanelProps) {
  const simple = meaning?.simple || fallback?.simple || ''
  const detailed = meaning?.detailed || fallback?.detailed || ''
  const vocabulary =
    meaning?.vocabulary && meaning.vocabulary.length > 0
      ? meaning.vocabulary
      : fallback?.vocabulary || []

  return (
    <section aria-labelledby="study-heading">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Going deeper</span>
          <h2 className="panel-title" id="study-heading">
            The Couplet
          </h2>
        </div>
        <div className="segmented" role="tablist" aria-label="How deeply to explore">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`study-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="study-panel"
              className={`segmented-btn ${tab === t.id ? 'segmented-btn--active' : ''}`}
              onClick={() => onTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div id="study-panel" role="tabpanel" aria-labelledby={`study-tab-${tab}`}>
        {!couplet ? (
          <p className="state-note">{emptyPrompt}</p>
        ) : (
          <>
            {couplet.urdu && (
              <p className="study-quote" lang="ur" dir="rtl">
                {couplet.urdu}
              </p>
            )}
            <p className="study-quote-roman">{couplet.roman}</p>

            {tab === 'MEANING' && (
              <>
                {loading && !simple ? (
                  <p className="state-note">
                    <Loader2 size={14} className="spin" aria-hidden="true" /> Reading the couplet…
                  </p>
                ) : simple ? (
                  <>
                    <p className="prose">{simple}</p>
                    {(meaning?.translation || couplet.translation) && (
                      <p className="prose">
                        <em>{meaning?.translation || couplet.translation}</em>
                      </p>
                    )}
                    {meaning?.mood && (
                      <p className="prose" style={{ marginTop: 'var(--space-4)' }}>
                        <span className="eyebrow">In the key of</span>
                        {meaning.mood}
                      </p>
                    )}
                  </>
                ) : failed ? (
                  <Unavailable what="The meaning" onRetry={onRetry} />
                ) : (
                  <p className="state-note">No meaning has been written for this couplet yet.</p>
                )}
              </>
            )}

            {tab === 'WORDS' && (
              <>
                {loading && vocabulary.length === 0 ? (
                  <p className="state-note">
                    <Loader2 size={14} className="spin" aria-hidden="true" /> Gathering the words…
                  </p>
                ) : vocabulary.length > 0 ? (
                  <ul className="word-list">
                    {vocabulary.map((v, i) => (
                      <li className="word" key={`${v.term}-${i}`}>
                        <span className="word-term">{v.term}</span>
                        <span className="word-gloss">{v.meaning}</span>
                        <button
                          type="button"
                          className="ghost-btn"
                          onClick={() => onPronounce(v.term)}
                          aria-label={`Hear ${v.term} pronounced`}
                          title="Hear it"
                        >
                          <Volume2 size={14} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : failed ? (
                  <Unavailable what="The word list" onRetry={onRetry} />
                ) : (
                  <p className="state-note">
                    No difficult words have been noted for this couplet.
                  </p>
                )}
              </>
            )}

            {tab === 'CONTEXT' && (
              <>
                <dl className="context-list">
                  <div className="context-row">
                    <dt className="context-label">Poetry</dt>
                    <dd className="context-value" style={{ margin: 0 }}>
                      {facts.poet && onExplorePoet ? (
                        <button
                          type="button"
                          className="link-value"
                          onClick={() => onExplorePoet(facts.poet as string)}
                        >
                          {facts.poet}
                        </button>
                      ) : (
                        facts.poet || 'Not recorded'
                      )}
                    </dd>
                  </div>
                  <div className="context-row">
                    <dt className="context-label">Sung by</dt>
                    <dd className="context-value" style={{ margin: 0 }}>
                      {facts.singer && onExploreSinger ? (
                        <button
                          type="button"
                          className="link-value"
                          onClick={() => onExploreSinger(facts.singer as string)}
                        >
                          {facts.singer}
                        </button>
                      ) : (
                        facts.singer || 'Not recorded'
                      )}
                    </dd>
                  </div>
                  {facts.form && (
                    <div className="context-row">
                      <dt className="context-label">Form</dt>
                      <dd className="context-value" style={{ margin: 0 }}>
                        {facts.form}
                      </dd>
                    </div>
                  )}
                  {facts.mood && (
                    <div className="context-row">
                      <dt className="context-label">Mood</dt>
                      <dd className="context-value" style={{ margin: 0 }}>
                        {facts.mood}
                      </dd>
                    </div>
                  )}
                </dl>

                {loading && !detailed ? (
                  <p className="state-note">
                    <Loader2 size={14} className="spin" aria-hidden="true" /> Reading more closely…
                  </p>
                ) : detailed ? (
                  <>
                    <p className="prose">{detailed}</p>
                    {meaning?.literary_devices && meaning.literary_devices.length > 0 && (
                      <ul className="word-list" style={{ marginTop: 'var(--space-4)' }}>
                        {meaning.literary_devices.map((d, i) => (
                          <li className="word" key={`${d.device}-${i}`}>
                            <span className="word-term">
                              {d.device}
                              {d.english_name ? ` · ${d.english_name}` : ''}
                            </span>
                            <span className="word-gloss">{d.explanation}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : failed ? (
                  <Unavailable what="The reading" onRetry={onRetry} />
                ) : (
                  <p className="state-note">No close reading has been written for this couplet.</p>
                )}

                <GhazalAnatomy />
              </>
            )}

            <p style={{ marginTop: 'var(--space-5)' }}>
              <button type="button" className="text-btn" onClick={onToggleNarration}>
                {isSpeaking ? 'Stop reading aloud' : 'Read this aloud'}
              </button>
            </p>
          </>
        )}
      </div>
    </section>
  )
}

export default MeaningPanel
