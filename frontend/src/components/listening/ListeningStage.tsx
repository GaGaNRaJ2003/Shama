'use client'

import {
  Heart,
  Repeat,
  Loader2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { MehfilScene } from '../aesthetic/MehfilScene'
import PoetryTimeline, { type TimelineMarker } from './PoetryTimeline'

export interface HeroCouplet {
  urdu?: string
  roman?: string
  english?: string
}

interface ListeningStageProps {
  formLabel: string | null
  title: string
  poet?: string
  singer: string
  couplet: HeroCouplet | null
  /** What the hero says when there is no couplet to show. */
  coupletFallback?: string
  coverUrl?: string
  isPlaying: boolean
  resolving: boolean
  onTogglePlay: () => void
  currentTime: number
  duration: number
  markers: TimelineMarker[]
  sectionLabel: string | null
  onSeek: (seconds: number) => void
  formatTime: (seconds: number) => string
  volume: number
  isMuted: boolean
  onVolume: (v: number) => void
  onToggleMute: () => void
  onPrev: () => void
  onNext: () => void
  hasPrev: boolean
  hasNext: boolean
  quiet: boolean
  onToggleQuiet: () => void
  playbackNote: string | null
  /** Offered when we can't confidently tell which recording a ghazal is. */
  candidates?: { videoId: string; title: string; artist: string; duration?: string }[] | null
  onPickCandidate?: (videoId: string) => void
  /** A line being sung that the catalogue holds no couplet for. */
  unknownLine?: string | null
  onExplainLine?: (text: string) => void
  /** Mukarrar: repeat the couplet currently being sung. */
  loopSher?: boolean
  onToggleLoop?: () => void
  canLoop?: boolean
  /** Saving a recording to the personal collection — only offered when there is one. */
  saveState?: { saved: boolean; onToggle: () => void } | null
  onExplorePoet?: (poet: string) => void
  onExploreSinger?: (singer: string) => void
  /** In a jam, guests follow the host: their transport doesn't drive playback. */
  readOnly?: boolean
}

export function ListeningStage({
  formLabel,
  title,
  poet,
  singer,
  couplet,
  coupletFallback,
  coverUrl,
  isPlaying,
  resolving,
  onTogglePlay,
  currentTime,
  duration,
  markers,
  sectionLabel,
  onSeek,
  formatTime,
  volume,
  isMuted,
  onVolume,
  onToggleMute,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  quiet,
  onToggleQuiet,
  playbackNote,
  candidates,
  onPickCandidate,
  unknownLine,
  onExplainLine,
  loopSher = false,
  onToggleLoop,
  canLoop = false,
  saveState,
  onExplorePoet,
  onExploreSinger,
  readOnly = false,
}: ListeningStageProps) {
  return (
    <div className="stage">
      <div className="stage-art">
        {/* The candle and the turning record — the recurring SHAMA mark (§13). */}
        <div className="stage-art-scene">
          <MehfilScene isPlaying={isPlaying} coverUrl={coverUrl} onTogglePlay={onTogglePlay} />
        </div>
        <div className="stage-art-glow" aria-hidden="true" />
      </div>

      <div className="stage-hero">
        {formLabel && (
          <div className="stage-form" lang="ur" dir="rtl" aria-hidden="true">
            {formLabel}
          </div>
        )}

        <h1 className="stage-title">{title}</h1>

        <div className="hero-sher">
          {couplet && (couplet.urdu || couplet.roman) ? (
            <div key={`${couplet.urdu || ''}${couplet.roman || ''}`}>
              {couplet.urdu && (
                <p className="hero-urdu" lang="ur" dir="rtl">
                  {couplet.urdu}
                </p>
              )}
              {couplet.roman && <p className="hero-roman">{couplet.roman}</p>}
              {couplet.english && <p className="hero-english">{couplet.english}</p>}
            </div>
          ) : coupletFallback ? (
            <p className="hero-english">{coupletFallback}</p>
          ) : null}
        </div>

        {unknownLine && onExplainLine && (
          <p className="unknown-line">
            <button type="button" className="text-btn" onClick={() => onExplainLine(unknownLine)}>
              What does this mean?
            </button>
          </p>
        )}

        <div className="stage-attrib">
          {poet &&
            (onExplorePoet ? (
              <button type="button" className="attrib-poet" onClick={() => onExplorePoet(poet)}>
                {poet}
              </button>
            ) : (
              <span className="attrib-poet">{poet}</span>
            ))}
          {onExploreSinger ? (
            <button type="button" className="attrib-singer" onClick={() => onExploreSinger(singer)}>
              {singer}
            </button>
          ) : (
            <span className="attrib-singer">{singer}</span>
          )}
        </div>

        <div className="transport">
          <PoetryTimeline
            currentTime={currentTime}
            duration={duration}
            markers={markers}
            onSeek={readOnly ? () => {} : onSeek}
            formatTime={formatTime}
            sectionLabel={sectionLabel}
          />

          <div className="transport-row">
            <button
              type="button"
              className="icon-btn"
              onClick={onPrev}
              disabled={!hasPrev}
              aria-label="Previous in tonight's mehfil"
            >
              <SkipBack size={17} aria-hidden="true" />
            </button>

            <button
              type="button"
              className="icon-btn icon-btn--primary"
              onClick={onTogglePlay}
              disabled={resolving || readOnly}
              aria-label={
                readOnly
                  ? 'The host controls playback in this mehfil'
                  : resolving
                  ? 'Finding the recording'
                  : isPlaying
                  ? 'Pause'
                  : 'Play'
              }
              title={readOnly ? 'The host is playing the record tonight' : undefined}
            >
              {resolving ? (
                <Loader2 size={20} className="spin" aria-hidden="true" />
              ) : isPlaying ? (
                <Pause size={20} aria-hidden="true" />
              ) : (
                <Play size={20} aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              className="icon-btn"
              onClick={onNext}
              disabled={!hasNext}
              aria-label="Next in tonight's mehfil"
            >
              <SkipForward size={17} aria-hidden="true" />
            </button>

            {onToggleLoop && (
              <button
                type="button"
                className={`icon-btn ${loopSher ? 'icon-btn--on' : ''}`}
                onClick={onToggleLoop}
                disabled={!canLoop}
                aria-pressed={loopSher}
                aria-label={loopSher ? 'Stop repeating this couplet' : 'Repeat this couplet'}
                title={
                  canLoop
                    ? loopSher
                      ? 'Mukarrar — repeating this couplet'
                      : 'Mukarrar — repeat this couplet'
                    : 'Available once the couplets are following along'
                }
              >
                <Repeat size={16} aria-hidden="true" />
              </button>
            )}

            <span className="volume">
              <button
                type="button"
                className="icon-btn"
                onClick={onToggleMute}
                aria-label={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? (
                  <VolumeX size={16} aria-hidden="true" />
                ) : (
                  <Volume2 size={16} aria-hidden="true" />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="100"
                value={isMuted ? 0 : volume}
                aria-label="Volume"
                onChange={(e) => onVolume(Number(e.target.value))}
              />
            </span>

            {saveState && (
              <button
                type="button"
                className={`icon-btn ${saveState.saved ? 'icon-btn--on' : ''}`}
                onClick={saveState.onToggle}
                aria-pressed={saveState.saved}
                aria-label={
                  saveState.saved ? 'Remove from your collection' : 'Keep in your collection'
                }
                title={saveState.saved ? 'In your collection' : 'Keep this'}
              >
                <Heart
                  size={16}
                  aria-hidden="true"
                  fill={saveState.saved ? 'currentColor' : 'none'}
                />
              </button>
            )}

            <button
              type="button"
              className="icon-btn"
              onClick={onToggleQuiet}
              aria-pressed={quiet}
              aria-label={quiet ? 'Show the poetry and the mehfil' : 'Just listen'}
              title={quiet ? 'Show everything' : 'Just listen'}
            >
              {quiet ? (
                <Minimize2 size={16} aria-hidden="true" />
              ) : (
                <Maximize2 size={16} aria-hidden="true" />
              )}
            </button>
          </div>

          {playbackNote && <p className="playback-note">{playbackNote}</p>}

          {candidates && onPickCandidate && (
            <div className="candidate-picker">
              {candidates.length ? (
                <>
                  <p className="playback-note">
                    We couldn&rsquo;t be certain which recording this is. Which one did you mean?
                  </p>
                  <ul className="candidate-list">
                    {candidates.map((c) => (
                      <li key={c.videoId}>
                        <button
                          type="button"
                          className="candidate-btn"
                          onClick={() => onPickCandidate(c.videoId)}
                        >
                          <span className="candidate-title">{c.title}</span>
                          <span className="candidate-sub">
                            {c.artist}
                            {c.duration ? ` · ${c.duration}` : ''}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="playback-note">
                  We couldn&rsquo;t find a recording of this ghazal. Try searching under Explore.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ListeningStage
