'use client'

import { ChevronDown, ChevronUp, ListPlus, X } from 'lucide-react'
import type { MehfilItem } from '../../data/mehfil'

interface MehfilQueueProps {
  items: MehfilItem[]
  currentIndex: number
  onPlay: (index: number) => void
  onRemove: (index: number) => void
  onMove: (from: number, to: number) => void
  onPlayNext: (index: number) => void
  onBrowse: () => void
}

export function MehfilQueue({
  items,
  currentIndex,
  onPlay,
  onRemove,
  onMove,
  onPlayNext,
  onBrowse,
}: MehfilQueueProps) {
  return (
    <section aria-labelledby="mehfil-heading">
      <span className="eyebrow">Tonight</span>
      <h2 className="panel-title" id="mehfil-heading" style={{ marginTop: 2 }}>
        Tonight&rsquo;s Mehfil
      </h2>

      {items.length === 0 ? (
        <p className="state-note" style={{ marginTop: 'var(--space-4)' }}>
          Your mehfil is empty.{' '}
          <button type="button" className="text-btn" onClick={onBrowse}>
            Add a ghazal to begin
          </button>
        </p>
      ) : (
        <ol className="mehfil-list">
          {items.map((item, i) => (
            <li
              key={item.id}
              className={`mehfil-item ${i === currentIndex ? 'mehfil-item--current' : ''}`}
            >
              <span className="mehfil-num" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <button
                type="button"
                className="mehfil-item-main"
                onClick={() => onPlay(i)}
                aria-current={i === currentIndex ? 'true' : undefined}
              >
                <span className="mehfil-item-title">{item.title}</span>
                <span className="mehfil-item-sub">{item.artist}</span>
              </button>
              <span className="mehfil-item-actions">
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => onPlayNext(i)}
                  disabled={i === currentIndex || i === currentIndex + 1}
                  aria-label={`Play ${item.title} next`}
                  title="Play next"
                >
                  <ListPlus size={13} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => onMove(i, i - 1)}
                  disabled={i === 0}
                  aria-label={`Move ${item.title} earlier`}
                  title="Move up"
                >
                  <ChevronUp size={13} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => onMove(i, i + 1)}
                  disabled={i === items.length - 1}
                  aria-label={`Move ${item.title} later`}
                  title="Move down"
                >
                  <ChevronDown size={13} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="ghost-btn ghost-btn--danger"
                  onClick={() => onRemove(i)}
                  aria-label={`Remove ${item.title} from tonight's mehfil`}
                  title="Remove"
                >
                  <X size={13} aria-hidden="true" />
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}

      {items.length > 0 && (
        <p style={{ marginTop: 'var(--space-4)' }}>
          <button type="button" className="text-btn" onClick={onBrowse}>
            Add another ghazal
          </button>
        </p>
      )}
    </section>
  )
}

export default MehfilQueue
