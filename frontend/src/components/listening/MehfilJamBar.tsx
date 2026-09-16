'use client'

import { useState } from 'react'
import { Link2, Users, X } from 'lucide-react'
import type { JamHandle } from '../../data/useMehfilJam'

interface MehfilJamBarProps {
  jam: JamHandle
}

/**
 * Starting and joining a shared listening session. Deliberately small: it is a
 * way into the room, not a feature that competes with the poetry.
 */
export function MehfilJamBar({ jam }: MehfilJamBarProps) {
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [startFailed, setStartFailed] = useState(false)
  // The link the clipboard refused, put on screen so it can be copied by hand.
  const [shownLink, setShownLink] = useState<string | null>(null)

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
        <Users size={13} aria-hidden="true" />
        <span>
          {jam.role === 'guest' && jam.connected && !jam.hostPresent
            ? 'The host has stepped away'
            : jam.listeners > 1
            ? `${jam.listeners} in the mehfil`
            : jam.role === 'host'
            ? 'Waiting for others'
            : 'Listening along'}
        </span>
        {!jam.connected && <span className="jam-dim">· reconnecting</span>}
      </span>

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

      <button
        type="button"
        className="ghost-btn"
        onClick={jam.leave}
        aria-label="Leave the mehfil"
        title="Leave"
      >
        <X size={13} aria-hidden="true" />
      </button>
    </div>
  )
}

/**
 * Browsers will not start audio without a gesture, so a guest who follows a
 * link has to click once. Saying so is better than appearing to be broken.
 */
export function JamJoinPrompt({ jam }: MehfilJamBarProps) {
  if (!jam.needsGesture || jam.role !== 'guest') return null
  return (
    <div className="jam-prompt" role="dialog" aria-label="Join the mehfil">
      <div className="jam-prompt-inner">
        <span className="eyebrow">You&rsquo;ve been invited</span>
        <h2 className="stage-title" style={{ fontSize: '2rem' }}>
          Join the mehfil
        </h2>
        <p className="page-lede">
          {jam.remote?.title
            ? `They're listening to ${jam.remote.title}.`
            : 'The candle is lit and waiting.'}{' '}
          Your browser needs one tap before it will play sound.
        </p>
        <button
          type="button"
          className="icon-btn icon-btn--primary"
          style={{ marginTop: 'var(--space-5)' }}
          onClick={jam.acknowledgeGesture}
          aria-label="Join and start listening"
        >
          ▶
        </button>
      </div>
    </div>
  )
}

export default MehfilJamBar
