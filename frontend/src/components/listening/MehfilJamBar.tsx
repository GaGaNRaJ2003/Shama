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

  const copyLink = async () => {
    if (!jam.shareUrl) return
    try {
      await navigator.clipboard.writeText(jam.shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    } catch {
      /* clipboard blocked — the link is on screen to copy by hand */
    }
  }

  if (!jam.role) {
    return (
      <button
        type="button"
        className="text-btn"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          await jam.start()
          setBusy(false)
        }}
        title="Listen together — share a link, no account needed"
      >
        {busy ? 'Opening…' : 'Listen together'}
      </button>
    )
  }

  return (
    <div className="jam-bar">
      <span className="jam-status">
        <Users size={13} aria-hidden="true" />
        <span>
          {jam.listeners > 1
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
