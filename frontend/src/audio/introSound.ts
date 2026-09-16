'use client'

/**
 * The opening's sound, synthesised like the room's tanpura (ambientEngine):
 *
 *   - vinyl crackle while the record spins up, which slows and fades as the
 *     record winds down;
 *   - "ta-daa" as the view starts to move in: a low Pa, then Sa, plucked and
 *     left to ring, with a soft drone swelling under them through the flash;
 *   - air rushing as the camera pushes into the label;
 *   - a high shimmer on the golden flash.
 *
 * It rings for about five seconds, in the key the room hums in a moment
 * later. It is quiet by design, and stays silent when the listener has turned
 * the ambience off or the browser won't allow sound yet (a first visit,
 * before any tap, usually won't).
 */

import { makeImpulse, SA, semis } from './ambientEngine'

export interface IntroCues {
  /** Seconds from start(), matching the picture. */
  spinStart: number
  /** The view starts to move in, and the record to wind down. */
  shift: number
  /** The record is still. */
  rest: number
  /** The camera has settled on the name. */
  arrive: number
  cut: number
}

export interface IntroSound {
  /** Schedule everything from now. Call on the first frame of the picture. */
  start(): void
  /** Silence it at once. */
  stop(): void
  /** Let it die away over `seconds` (a skip), rather than cutting it. */
  fade(seconds: number): void
}

const LEVEL = 0.5
/** The gap between "ta" and "daa". */
const DAA_AFTER = 0.42

function ambienceOff(): boolean {
  try {
    return localStorage.getItem('shama.ambience') === 'off'
  } catch {
    return false
  }
}

/** Two seconds of surface noise: a faint hiss with sparse, uneven clicks. */
function makeCrackle(ctx: BaseAudioContext): AudioBuffer {
  const length = ctx.sampleRate * 2
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) {
    let v = (Math.random() * 2 - 1) * 0.02
    if (Math.random() < 0.0009) v += (Math.random() * 2 - 1) * (0.4 + Math.random() * 0.6)
    data[i] = v
  }
  return buffer
}

function makeNoise(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return buffer
}

export function createIntroSound(cues: IntroCues): IntroSound | null {
  if (typeof window === 'undefined' || ambienceOff()) return null
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null

  let ctx: AudioContext
  try {
    ctx = new Ctor()
  } catch {
    return null
  }
  // Inside a click (a replay) this succeeds; on arrival it usually doesn't.
  void ctx.resume().catch(() => {})

  const sources: AudioScheduledSourceNode[] = []
  let closed = false
  let master: GainNode | null = null

  const close = () => {
    if (closed) return
    closed = true
    for (const s of sources) {
      try {
        s.stop()
      } catch {
        /* never started */
      }
    }
    void ctx.close().catch(() => {})
  }

  /** `lag`: how many seconds ago the picture's first frame was. */
  const schedule = (lag: number) => {
    if (closed || ctx.state !== 'running') {
      close()
      return
    }
    const t0 = ctx.currentTime - lag + 0.02
    const at = (seconds: number) => t0 + seconds
    // Everything, the reverb included, runs through one level, so a skip can fade it all.
    const out = ctx.createGain()
    master = out
    out.gain.value = LEVEL
    const reverb = ctx.createConvolver()
    reverb.buffer = makeImpulse(ctx, 4.5)
    const wet = ctx.createGain()
    wet.gain.value = 0.8
    out.connect(ctx.destination)
    reverb.connect(wet).connect(out)

    // Crackle: it grows with the record's speed, then slows and fades as the record winds down.
    const crackle = ctx.createBufferSource()
    crackle.buffer = makeCrackle(ctx)
    crackle.loop = true
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = 2400
    band.Q.value = 0.6
    const crackleGain = ctx.createGain()
    crackleGain.gain.setValueAtTime(0, at(cues.spinStart))
    crackleGain.gain.linearRampToValueAtTime(0.1, at(cues.spinStart + 0.4))
    crackleGain.gain.linearRampToValueAtTime(0.22, at(cues.shift))
    crackleGain.gain.linearRampToValueAtTime(0.0001, at(cues.rest))
    crackle.playbackRate.setValueAtTime(1, at(cues.shift))
    crackle.playbackRate.linearRampToValueAtTime(0.25, at(cues.rest))
    crackle.connect(band).connect(crackleGain).connect(out)
    crackle.start(at(cues.spinStart))
    crackle.stop(at(cues.rest + 0.05))
    sources.push(crackle)

    const tone = (type: OscillatorType, freq: number, when: number, until: number, cents = 0) => {
      const osc = ctx.createOscillator()
      osc.type = type
      osc.frequency.value = freq
      osc.detune.value = cents
      osc.start(when)
      osc.stop(until)
      sources.push(osc)
      return osc
    }

    // Ta-daa: a plucked string that blooms, then rings a long while.
    const pluck = (freq: number, when: number, velocity: number, ring: number) => {
      const color = ctx.createBiquadFilter()
      color.type = 'lowpass'
      color.Q.value = 0.8
      color.frequency.setValueAtTime(3200, when)
      color.frequency.exponentialRampToValueAtTime(560, when + 4)
      const env = ctx.createGain()
      env.gain.setValueAtTime(0.0001, when)
      env.gain.exponentialRampToValueAtTime(velocity, when + 0.02)
      env.gain.setTargetAtTime(velocity * 0.55, when + 0.02, 0.2)
      env.gain.setTargetAtTime(0.0001, when + 0.9, ring)
      color.connect(env)
      env.connect(out)
      env.connect(reverb)
      for (const cents of [-3, 3]) tone('sawtooth', freq, when, when + 0.9 + ring * 6, cents).connect(color)
    }
    const ta = at(cues.shift)
    const daa = ta + DAA_AFTER
    pluck(SA * semis(-5), ta, 0.2, 1.1)
    pluck(SA, daa, 0.24, 1.7)

    // The drone under them: Sa, low Pa and low Sa, swelling to the flash, then letting go.
    const cut = at(cues.cut)
    const pad = ctx.createGain()
    pad.gain.setValueAtTime(0, daa)
    pad.gain.linearRampToValueAtTime(1, cut)
    pad.gain.setValueAtTime(1, cut + 0.8)
    pad.gain.setTargetAtTime(0, cut + 0.8, 1.2)
    const padColor = ctx.createBiquadFilter()
    padColor.type = 'lowpass'
    padColor.frequency.value = 900
    pad.connect(padColor)
    padColor.connect(out)
    padColor.connect(reverb)
    for (const [freq, level] of [
      [SA, 0.05],
      [SA * semis(-5), 0.035],
      [SA / 2, 0.03],
    ]) {
      const g = ctx.createGain()
      g.gain.value = level
      tone('triangle', freq, daa, cut + 7, 2).connect(g).connect(pad)
    }

    // The push into the label: air opening up, gone at the cut.
    const rushFrom = at(cues.arrive - 0.15)
    const rush = ctx.createBufferSource()
    rush.buffer = makeNoise(ctx, cues.cut - cues.arrive + 0.4)
    const sweep = ctx.createBiquadFilter()
    sweep.type = 'lowpass'
    sweep.Q.value = 1.2
    sweep.frequency.setValueAtTime(260, rushFrom)
    sweep.frequency.exponentialRampToValueAtTime(5200, cut)
    const rushGain = ctx.createGain()
    rushGain.gain.setValueAtTime(0.0001, rushFrom)
    rushGain.gain.exponentialRampToValueAtTime(0.14, cut - 0.02)
    rushGain.gain.setValueAtTime(0, cut)
    rush.connect(sweep).connect(rushGain).connect(out)
    rush.start(rushFrom)
    rush.stop(cut + 0.1)
    sources.push(rush)

    // The flash: a high shimmer, upper Sa and Pa, fading into the room.
    const shimmer = ctx.createGain()
    shimmer.gain.setValueAtTime(0.0001, cut)
    shimmer.gain.exponentialRampToValueAtTime(0.05, cut + 0.06)
    shimmer.gain.setTargetAtTime(0.0001, cut + 0.3, 0.9)
    shimmer.connect(out)
    shimmer.connect(reverb)
    tone('sine', SA * 2, cut, cut + 6).connect(shimmer)
    tone('sine', SA * 3, cut, cut + 6, 4).connect(shimmer)

    // Let it all ring out, then let go of the audio device.
    window.setTimeout(close, (cues.cut + 8 - lag) * 1000)
  }

  return {
    start() {
      const startedAt = performance.now()
      const lag = () => (performance.now() - startedAt) / 1000
      if (ctx.state === 'running') {
        schedule(0)
        return
      }
      // A resume granted late (say, by the tap on Skip) would start the sound
      // out of step with the picture; past half a second, stay silent.
      ctx.resume().then(() => (lag() < 0.5 ? schedule(lag()) : close()), close)
      window.setTimeout(() => {
        if (ctx.state !== 'running') close()
      }, 500)
    },
    stop: close,
    fade(seconds) {
      if (closed) return
      if (!master) {
        close()
        return
      }
      master.gain.cancelScheduledValues(ctx.currentTime)
      master.gain.setValueAtTime(master.gain.value, ctx.currentTime)
      master.gain.setTargetAtTime(0, ctx.currentTime, seconds / 4)
      window.setTimeout(close, seconds * 1000)
    },
  }
}
