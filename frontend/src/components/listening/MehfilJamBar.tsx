'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Inbox, Link2, Users, X } from 'lucide-react'
import { suggestName, type JamHandle, type JamMember, type JamRequest } from '../../data/useMehfilJam'

interface MehfilJamBarProps {
  jam: JamHandle
}

interface BarProps extends MehfilJamBarProps {
  /** Leave the mehfil (a guest goes back to their own room). */
  onLeave: () => void
  /** Host: take me to the requests. */
  onShowRequests: () => void
}

/** The host's own name, if they have given one (not the stand-in "Host"). */
function hostName(members: JamMember[]): string | null {
  const host = members.find((m) => m.host)
  return host && host.name !== 'Host' ? host.name : null
}

/** "Ayesha", "Ayesha and Kabir", "Ayesha, Kabir and 3 others". */
function namesInBrief(members: JamMember[], selfId: string | null): string {
  const names = members.map((m) => (m.id === selfId ? 'you' : m.name))
  if (names.length <= 1) return names[0] ?? ''
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  const rest = names.length - 2
  return `${names[0]}, ${names[1]} and ${rest} ${rest === 1 ? 'other' : 'others'}`
}

/** Who is in the mehfil, and what this listener is called there. */
function MembersPanel({ jam }: MehfilJamBarProps) {
  const [draft, setDraft] = useState(jam.name)
  useEffect(() => setDraft(jam.name), [jam.name])
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const summaryRef = useRef<HTMLElement>(null)
  const close = (returnFocus = false) => {
    if (!detailsRef.current?.open) return
    detailsRef.current.open = false
    if (returnFocus) summaryRef.current?.focus()
  }
  // A click anywhere else, or Escape, closes it too.
  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      if (detailsRef.current && !detailsRef.current.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && detailsRef.current?.open) close(true)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [])
  const save = () => {
    if (draft.trim() && draft.trim() !== jam.name) jam.rename(draft)
  }
  return (
    <details className="jam-members" ref={detailsRef}>
      <summary className="jam-members-summary" ref={summaryRef}>
        <Users size={13} aria-hidden="true" />
        <span>
          {jam.members.length > 1
            ? `${jam.members.length} in the mehfil`
            : jam.role === 'host'
            ? 'Waiting for others'
            : 'Listening along'}
        </span>
      </summary>
      <div className="jam-members-panel">
        <button
          type="button"
          className="ghost-btn jam-members-close"
          onClick={() => close(true)}
          aria-label="Close the list"
          title="Close"
        >
          <X size={14} aria-hidden="true" />
        </button>
        <ul className="jam-members-list">
          {jam.members.map((m) => (
            <li key={m.id}>
              <span className="jam-member-mark" aria-hidden="true">
                {m.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="jam-member-name">{m.name}</span>
              {m.host && m.name !== 'Host' && <span className="jam-member-tag">host</span>}
              {m.id === jam.selfId && <span className="jam-member-tag">you</span>}
            </li>
          ))}
        </ul>
        <form
          className="jam-rename"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <label htmlFor="jam-rename-input">Your name here</label>
          <span className="jam-rename-row">
            <input
              id="jam-rename-input"
              value={draft}
              maxLength={24}
              placeholder="A nickname"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={save}
            />
            <button type="submit" className="text-btn" disabled={!draft.trim() || draft.trim() === jam.name}>
              Save
            </button>
          </span>
        </form>
      </div>
    </details>
  )
}

/**
 * Starting and joining a shared listening session. Deliberately small: it is a
 * way into the room, not a feature that competes with the poetry.
 */
export function MehfilJamBar({ jam, onLeave, onShowRequests }: BarProps) {
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [startFailed, setStartFailed] = useState(false)
  // The link the clipboard refused, put on screen so it can be copied by hand.
  const [shownLink, setShownLink] = useState<string | null>(null)
  const pending = jam.requests.filter((r) => r.status === 'pending').length

  const copyLink = async () => {
    if (!jam.shareUrl) return
    try {
      await navigator.clipboard.writeText(jam.shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    } catch {
      /* clipboard blocked — show the link so it can be copied by hand */
      setShownLink(jam.shareUrl)
    }
  }

  if (!jam.role) {
    return (
      <>
        {jam.notice && (
          <span className="jam-status jam-dim">
            <span role="status">{jam.notice}</span>
            <button
              type="button"
              className="ghost-btn"
              onClick={jam.dismissNotice}
              aria-label="Dismiss this notice"
              title="Dismiss"
            >
              <X size={12} aria-hidden="true" />
            </button>
          </span>
        )}
        <button
          type="button"
          className="text-btn"
          disabled={busy}
          onClick={async () => {
            setStartFailed(false)
            setBusy(true)
            // The host goes by a name too, so the list reads naturally.
            if (!jam.name) jam.rename('Host')
            const tok = await jam.start()
            setBusy(false)
            if (!tok) setStartFailed(true)
          }}
          title="Listen together — share a link, no account needed"
        >
          {busy ? 'Opening…' : 'Listen together'}
        </button>
        {startFailed && (
          <span className="eyebrow" role="status">
            Couldn&rsquo;t open a mehfil just now. Try again in a moment.
          </span>
        )}
      </>
    )
  }

  return (
    <div className="jam-bar">
      <span className="jam-status">
        {jam.role === 'guest' && jam.connected && !jam.hostPresent ? (
          <span>The host has stepped away</span>
        ) : (
          <MembersPanel jam={jam} />
        )}
        {!jam.connected && <span className="jam-dim">· reconnecting</span>}
      </span>

      {jam.role === 'host' && pending > 0 && (
        <button type="button" className="text-btn jam-requests-badge" onClick={onShowRequests}>
          <Inbox size={12} aria-hidden="true" /> {pending} {pending === 1 ? 'request' : 'requests'}
        </button>
      )}

      {jam.role === 'host' && jam.shareUrl && (
        <button type="button" className="text-btn" onClick={copyLink}>
          <Link2 size={12} aria-hidden="true" /> {copied ? 'Link copied' : 'Copy link'}
        </button>
      )}

      {jam.role === 'host' && jam.shareUrl && shownLink === jam.shareUrl && (
        <input
          type="text"
          readOnly
          autoFocus
          value={jam.shareUrl}
          aria-label="Link to this mehfil"
          onFocus={(e) => e.currentTarget.select()}
          size={18}
          style={{
            background: 'none',
            border: 0,
            color: 'var(--color-text-muted)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.7rem',
          }}
        />
      )}

      {jam.role === 'guest' ? (
        <button type="button" className="text-btn jam-leave" onClick={onLeave}>
          Leave
        </button>
      ) : (
        <button
          type="button"
          className="ghost-btn"
          onClick={onLeave}
          aria-label="Leave the mehfil"
          title="Leave"
        >
          <X size={13} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

const STATUS_WORDS: Record<JamRequest['status'], string> = {
  pending: 'Waiting for the host',
  added: 'Added to the queue',
  declined: 'Not tonight',
}

/** For the host: what the guests have asked for. */
export function RequestsInbox({
  jam,
  onAdd,
}: MehfilJamBarProps & { onAdd: (request: JamRequest) => void }) {
  const waiting = jam.requests.filter((r) => r.status === 'pending')
  if (!waiting.length) return null
  return (
    <section className="requests" id="mehfil-requests" aria-labelledby="requests-heading" tabIndex={-1}>
      <h2 className="requests-title" id="requests-heading">
        Requests <span className="requests-count">{waiting.length}</span>
      </h2>
      <ul className="requests-list">
        {waiting.map((r) => (
          <li key={r.id} className="request">
            <span className="request-who">{r.fromName} asks for</span>
            <span className="request-title">{r.title}</span>
            {r.artist && <span className="request-sub">{r.artist}</span>}
            <span className="request-actions">
              <button type="button" className="request-add" onClick={() => onAdd(r)}>
                <Check size={13} aria-hidden="true" /> Add to queue
              </button>
              <button
                type="button"
                className="text-btn"
                onClick={() => jam.resolveRequest(r.id, false)}
                aria-label={`Decline ${r.fromName}’s request for ${r.title}`}
              >
                Decline
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** For a guest: what they have asked for, and what became of it. */
function MyRequests({ jam }: MehfilJamBarProps) {
  const mine = jam.requests.filter((r) => r.from === jam.selfId).slice(-6).reverse()
  if (!mine.length) {
    return (
      <p className="state-note" style={{ marginTop: 'var(--space-4)' }}>
        The host chooses what plays. Find a ghazal in the Library or Explore and ask for it.
      </p>
    )
  }
  return (
    <section className="my-requests" aria-labelledby="my-requests-heading">
      <h3 className="my-requests-title" id="my-requests-heading">
        Your requests
      </h3>
      <ul className="my-requests-list">
        {mine.map((r) => (
          <li key={r.id} className={`my-request my-request--${r.status}`}>
            <span className="mehfil-item-title">{r.title}</span>
            <span className="my-request-status">
              {STATUS_WORDS[r.status]}
              {r.status === 'pending' && (
                <>
                  {' '}
                  <button type="button" className="text-btn" onClick={() => jam.withdrawRequest(r.id)}>
                    Withdraw
                  </button>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

interface JoinProps {
  jam: JamHandle
  /** A guest arrived by link and hasn't come in yet. */
  open: boolean
  /** Their tap: it names them and lets the browser play sound. */
  onEnter: () => void
}

/**
 * The way in for a guest. Browsers won't play sound without a tap, so the tap
 * that enters the mehfil is also the one that lets it be heard; the guest
 * names themselves on the way in.
 */
export function JamJoinPrompt({ jam, open, onEnter }: JoinProps) {
  const suggestion = useMemo(suggestName, [])
  const [draft, setDraft] = useState(jam.name)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (open) inputRef.current?.focus({ preventScroll: true })
  }, [open])
  if (!open) return null

  const host = hostName(jam.members)
  const others = jam.members.filter((m) => !m.host && m.id !== jam.selfId)
  const playing = jam.remote?.videoId ? jam.remote.title : null

  return (
    <div className="jam-prompt" role="dialog" aria-modal="true" aria-labelledby="jam-join-title">
      <form
        className="jam-prompt-inner"
        onSubmit={(e) => {
          e.preventDefault()
          jam.rename(draft.trim() || suggestion)
          onEnter()
        }}
      >
        <p className="jam-prompt-urdu" lang="ur" dir="rtl" aria-hidden="true">
          محفل
        </p>
        <h2 className="jam-prompt-title" id="jam-join-title">
          {host ? `${host} has invited you` : 'You’re invited to a mehfil'}
        </h2>
        <p className="jam-prompt-lede">
          {playing ? `They’re listening to ${playing}.` : 'The host will choose what plays.'} You’ll hear it with them, in
          step.
          {others.length > 0 && (
            <>
              {' '}
              Already here: {namesInBrief(others, null)}.
            </>
          )}
        </p>
        <label className="jam-prompt-label" htmlFor="jam-join-name">
          What should the mehfil call you?
        </label>
        <input
          id="jam-join-name"
          ref={inputRef}
          className="jam-prompt-input"
          value={draft}
          maxLength={24}
          placeholder={suggestion}
          autoComplete="nickname"
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="jam-prompt-enter">
          Enter the mehfil
        </button>
      </form>
    </div>
  )
}

/** For a guest: the host's queue, to follow rather than to change. */
export function HostQueue({ jam }: MehfilJamBarProps) {
  const queue = jam.remote?.queue ?? []
  const current = jam.remote?.queueIndex ?? -1
  return (
    <section aria-labelledby="host-queue-heading">
      <span className="eyebrow">Tonight</span>
      <h2 className="panel-title" id="host-queue-heading" style={{ marginTop: 2 }}>
        Tonight&rsquo;s Mehfil
      </h2>
      {queue.length === 0 ? (
        <p className="state-note" style={{ marginTop: 'var(--space-4)' }}>
          Nothing is queued yet.
        </p>
      ) : (
        <ol className="host-queue">
          {queue.map((item, i) => (
            <li
              key={`${i}-${item.title}`}
              className={i === current ? 'host-queue-item host-queue-item--current' : 'host-queue-item'}
              aria-current={i === current ? 'true' : undefined}
            >
              <span className="mehfil-num">{String(i + 1).padStart(2, '0')}</span>
              <span>
                <span className="mehfil-item-title">{item.title}</span>
                <span className="mehfil-item-sub">{item.artist}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
      <MyRequests jam={jam} />
    </section>
  )
}

/** For a guest while the host hasn't started anything. */
export function GuestWaiting({ jam }: MehfilJamBarProps) {
  const host = hostName(jam.members)
  const others = jam.members.filter((m) => !m.host && m.id !== jam.selfId)
  return (
    <section className="arrival" aria-labelledby="guest-waiting-title">
      <header className="arrival-head">
        <p className="arrival-urdu" lang="ur" dir="rtl">
          محفل
        </p>
        <h1 className="arrival-title" id="guest-waiting-title">
          {jam.connected && !jam.hostPresent ? 'The host has stepped away' : 'The mehfil is gathering'}
        </h1>
        <p className="arrival-lede">
          {host ? `${host} will choose the first ghazal.` : 'The host will choose the first ghazal.'} When it starts,
          you&rsquo;ll hear it here, in step with everyone.
        </p>
      </header>
      <p className="guest-waiting-who">
        <Users size={14} aria-hidden="true" />
        {others.length > 0 ? `Here with you: ${namesInBrief(others, null)}` : 'You’re the first one here.'}
      </p>
    </section>
  )
}

export default MehfilJamBar
