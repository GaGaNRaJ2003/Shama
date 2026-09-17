'use client'

import { useRef, useState } from 'react'
import { MotionConfig, Reorder, useDragControls } from 'framer-motion'
import { ChevronDown, ChevronUp, GripVertical, ListPlus, X } from 'lucide-react'
import type { MehfilItem } from '../../data/mehfil'

interface MehfilQueueProps {
  items: MehfilItem[]
  currentIndex: number
  onPlay: (index: number) => void
  onRemove: (index: number) => void
  onMove: (from: number, to: number) => void
  onPlayNext: (index: number) => void
  onOpenLibrary: () => void
  onOpenExplore: () => void
  /** A jam guest: the host chooses what plays. Reordering and removing stay theirs. */
  readOnly?: boolean
}

// Rows glide to their new places at the room's pace (--dur, --ease).
const GLIDE_EASE: [number, number, number, number] = [0.22, 0.61, 0.36, 1]
const GLIDE = { duration: 0.32, ease: GLIDE_EASE }

export function MehfilQueue({
  items,
  currentIndex,
  onPlay,
  onRemove,
  onMove,
  onPlayNext,
  onOpenLibrary,
  onOpenExplore,
  readOnly = false,
}: MehfilQueueProps) {
  // While a row is dragged the list follows the pointer here; the mehfil itself
  // changes once, when the row is dropped.
  const [draft, setDraft] = useState<MehfilItem[] | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const listRef = useRef<HTMLOListElement>(null)

  const shown = draft ?? items
  const currentId = currentIndex > -1 ? items[currentIndex]?.id : undefined
  // Rows re-measure only when the order changes, not on every playback tick.
  const orderKey = shown.map((m) => m.id).join('|')

  const announce = (item: MehfilItem, to: number) =>
    setNotice(`${item.title} moved to position ${to + 1} of ${items.length}.`)

  const drop = (item: MehfilItem) => {
    setDraggingId(null)
    if (!draft) return
    const from = items.findIndex((m) => m.id === item.id)
    const to = draft.findIndex((m) => m.id === item.id)
    setDraft(null)
    if (from < 0 || to < 0 || from === to) return
    onMove(from, to)
    announce(item, to)
  }

  // Moving a row moves its DOM node, which drops focus. Put it back on the same
  // control once the list has re-rendered.
  const keepFocus = (id: string, control: string) =>
    requestAnimationFrame(() => {
      const btn = listRef.current?.querySelector<HTMLButtonElement>(
        `[data-mehfil-id="${id}"] [data-control="${control}"]`
      )
      if (btn && document.activeElement !== btn) btn.focus()
    })

  /** The arrow buttons: one step at a time. At either end they do nothing. */
  const step = (item: MehfilItem, index: number, delta: -1 | 1) => {
    const to = index + delta
    if (to < 0 || to >= items.length) return
    onMove(index, to)
    announce(item, to)
    keepFocus(item.id, delta < 0 ? 'earlier' : 'later')
  }

  const playNext = (item: MehfilItem, index: number) => {
    onPlayNext(index)
    setNotice(`${item.title} will play next.`)
    keepFocus(item.id, 'next')
  }

  return (
    <section aria-labelledby="mehfil-heading">
      <span className="eyebrow">Tonight</span>
      <h2 className="panel-title" id="mehfil-heading" style={{ marginTop: 2 }}>
        Tonight&rsquo;s Mehfil
      </h2>

      {items.length === 0 ? (
        <p className="state-note" style={{ marginTop: 'var(--space-4)' }}>
          Nothing is queued yet.{' '}
          <AddFrom lead="Add ghazals" onOpenLibrary={onOpenLibrary} onOpenExplore={onOpenExplore} />
        </p>
      ) : (
        <MotionConfig reducedMotion="user">
          <Reorder.Group
            as="ol"
            axis="y"
            ref={listRef}
            values={shown}
            onReorder={setDraft}
            className="mehfil-list"
          >
            {shown.map((item, position) => {
              const index = items.findIndex((m) => m.id === item.id)
              return (
                <MehfilRow
                  key={item.id}
                  item={item}
                  position={position}
                  orderKey={orderKey}
                  isCurrent={item.id === currentId}
                  isFirst={index === 0}
                  isLast={index === items.length - 1}
                  dragging={item.id === draggingId}
                  readOnly={readOnly}
                  canPlayNext={currentIndex > -1 && index !== currentIndex && index !== currentIndex + 1}
                  onPlay={() => onPlay(index)}
                  onPlayNext={() => playNext(item, index)}
                  onEarlier={() => step(item, index, -1)}
                  onLater={() => step(item, index, 1)}
                  onRemove={() => onRemove(index)}
                  onDragStart={() => setDraggingId(item.id)}
                  onDrop={() => drop(item)}
                />
              )
            })}
          </Reorder.Group>
        </MotionConfig>
      )}

      <p className="sr-only" role="status">
        {notice}
      </p>

      {items.length > 0 && (
        <p className="state-note" style={{ marginTop: 'var(--space-4)' }}>
          <AddFrom lead="Add more" onOpenLibrary={onOpenLibrary} onOpenExplore={onOpenExplore} />
        </p>
      )}
    </section>
  )
}

/** Ghazals join the mehfil from either room: the Library's curated works or any recording found in Explore. */
function AddFrom({
  lead,
  onOpenLibrary,
  onOpenExplore,
}: {
  lead: string
  onOpenLibrary: () => void
  onOpenExplore: () => void
}) {
  // One span, so the parent's flex gap doesn't pull the sentence apart.
  return (
    <span>
      {lead} from the{' '}
      <button type="button" className="text-btn" onClick={onOpenLibrary}>
        Library
      </button>{' '}
      or{' '}
      <button type="button" className="text-btn" onClick={onOpenExplore}>
        Explore
      </button>
    </span>
  )
}

interface MehfilRowProps {
  item: MehfilItem
  /** Where the row sits on screen right now; it differs from the mehfil mid-drag. */
  position: number
  orderKey: string
  isCurrent: boolean
  isFirst: boolean
  isLast: boolean
  dragging: boolean
  readOnly: boolean
  canPlayNext: boolean
  onPlay: () => void
  onPlayNext: () => void
  onEarlier: () => void
  onLater: () => void
  onRemove: () => void
  onDragStart: () => void
  onDrop: () => void
}

function MehfilRow({
  item,
  position,
  orderKey,
  isCurrent,
  isFirst,
  isLast,
  dragging,
  readOnly,
  canPlayNext,
  onPlay,
  onPlayNext,
  onEarlier,
  onLater,
  onRemove,
  onDragStart,
  onDrop,
}: MehfilRowProps) {
  const drag = useDragControls()

  return (
    <Reorder.Item
      value={item}
      data-mehfil-id={item.id}
      // Only the grip starts a drag, so the rest of the row still scrolls the
      // page on a phone. The arrow buttons are the way to reorder without dragging.
      dragListener={false}
      dragControls={drag}
      onDragStart={onDragStart}
      onDragEnd={onDrop}
      layoutDependency={orderKey}
      transition={GLIDE}
      className={`mehfil-item ${isCurrent ? 'mehfil-item--current' : ''} ${
        dragging ? 'mehfil-item--dragging' : ''
      }`}
    >
      <span
        className="mehfil-grip"
        aria-hidden="true"
        title="Drag to reorder"
        onPointerDown={(e) => drag.start(e)}
      >
        <span className="mehfil-num">{String(position + 1).padStart(2, '0')}</span>
        <GripVertical className="mehfil-grip-icon" size={14} />
      </span>
      <button
        type="button"
        className="mehfil-item-main"
        onClick={onPlay}
        disabled={readOnly}
        aria-current={isCurrent ? 'true' : undefined}
      >
        <span className="mehfil-item-title">{item.title}</span>
        <span className="mehfil-item-sub">{item.artist}</span>
      </button>
      {/* aria-disabled rather than disabled: a control that goes inert after it
          is used keeps focus instead of dropping it. */}
      <span className="mehfil-item-actions">
        <button
          type="button"
          className="ghost-btn"
          data-control="next"
          onClick={() => {
            if (canPlayNext) onPlayNext()
          }}
          disabled={readOnly}
          aria-disabled={!canPlayNext || undefined}
          aria-label={`Play ${item.title} next`}
          title="Play next"
        >
          <ListPlus size={13} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="ghost-btn"
          data-control="earlier"
          onClick={onEarlier}
          aria-disabled={isFirst || undefined}
          aria-label={`Move ${item.title} earlier`}
          title="Move up"
        >
          <ChevronUp size={13} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="ghost-btn"
          data-control="later"
          onClick={onLater}
          aria-disabled={isLast || undefined}
          aria-label={`Move ${item.title} later`}
          title="Move down"
        >
          <ChevronDown size={13} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="ghost-btn ghost-btn--danger"
          onClick={onRemove}
          aria-label={`Remove ${item.title} from tonight's mehfil`}
          title="Remove"
        >
          <X size={13} aria-hidden="true" />
        </button>
      </span>
    </Reorder.Item>
  )
}

export default MehfilQueue
