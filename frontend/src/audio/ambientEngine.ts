/**
 * The room's own sound: a tanpura drone with a distant, bansuri-like voice
 * wandering through Raag Yaman, synthesised live with the Web Audio API.
 *
 * Nothing is downloaded and nothing loops — every pluck is humanised and each
 * phrase is chosen afresh — so it can sit under a whole evening without
 * turning into a jingle. It is deliberately very quiet and heavily softened:
 * it is the candle, not the singer, and it steps aside whenever real music
 * or narration plays (see useAmbience).
 *
 * While a feeling on the arrival screen is being considered, the voice sings
 * that feeling's own raag instead (FEELING_VOICES); the tanpura never changes.
 */

export type AmbientState = 'suspended' | 'running' | 'closed'

/** Sa, the tonic of the drone. C3 sits under a voice without muddying it. */
export const SA = 130.81
export const semis = (n: number) => Math.pow(2, n / 12)

/** Peak level of the whole room. Low on purpose — this is background. */
const ROOM_LEVEL = 0.3

// The four tanpura strings in playing order: Pa (lower octave), Sa, Sa, and
// Sa of the lower octave. The longer rest after the last lets the drone breathe.
const STRINGS = [SA * semis(-5), SA, SA, SA / 2]
const STRING_GAPS = [1.3, 1.3, 1.3, 1.9]

// Raag Yaman, the evening raag most ghazals lean on. Semitones above Sa;
// negatives dip into the lower octave. Short phrases, then long silences.
const PHRASES: number[][] = [
  [-1, 2, 4, 2, 0], //       ni re ga re sa — the pakad of Yaman
  [4, 6, 7, 6, 4, 2, 0], //  ga ma pa ma ga re sa
  [-1, 2, 0], //             ni re sa
  [7, 9, 11, 9, 7], //       pa dha ni dha pa
  [4, 6, 9, 7], //           ga ma dha pa
  [2, 4, 6, 4, 2, -1, 0], // re ga ma ga re ni sa
  [7], //                    a single held pa
  [4], //                    a single held ga
  [0], //                    a single held sa
]
const FLUTE_SA = SA * 2

/** How the flute sings: a raag's phrases, and how they are breathed. */
interface Voice {
  phrases: number[][]
  /** Seconds each note is held; the last note of a phrase rests longer. */
  hold: [number, number]
  last: [number, number]
  /** Silence after a phrase. */
  gap: [number, number]
  /** Meend: the time constant of the slide from one note into the next. */
  glide: number
  /** Vibrato rate and depth, in Hz. Slow and wide reads as andolan. */
  vibrato: [number, number]
  /** Loudness against the room's own voice. */
  level: number
  /** Each later note of a phrase this much softer: a line that trails away. */
  fade?: number
}

const YAMAN: Voice = {
  phrases: PHRASES,
  hold: [0.8, 1.9],
  last: [2.4, 4],
  gap: [7, 16],
  glide: 0.07,
  vibrato: [5.2, 1.1],
  level: 1,
}

// Each feeling on the arrival screen has a raag of its own, after the rasa the
// tradition gives it, each a different shade of the ghazal's melancholy. While
// a card is considered the voice comes a little nearer and its silences shorten,
// so the feeling is heard before it is chosen.
// Komal (flat) notes are marked ♭, tivra ma ♯; a leading - is the lower octave.
const NEAR = 1.3
export const FEELING_VOICES = {
  // Bhupali: five open notes, consoling.
  umeed: {
    phrases: [
      [4, 2, 0, -3, 0, 2, 4], //   ga re sa -dha sa re ga
      [7, 4, 9, 7, 4, 2, 0], //    pa ga dha pa ga re sa
      [0, 2, 4, 7, 9, 12], //      sa re ga pa dha sa', rising
      [9, 7, 4, 7], //             dha pa ga pa
    ],
    hold: [0.7, 1.5], last: [2.2, 3.4], gap: [1.8, 3.5], glide: 0.07, vibrato: [5, 1], level: NEAR,
  },
  // Desh: the monsoon's yearning, reaching up and falling back.
  arzoo: {
    phrases: [
      [2, 5, 7, 11, 12], //        re ma pa ni sa'
      [12, 10, 9, 7, 5, 4, 2], //  sa' ni♭ dha pa ma ga re
      [2, 5, 7, 5, 4, 2, 4, 0], // re ma pa ma ga re ga sa
      [7, 9, 7, 5, 4, 2], //       pa dha pa ma ga re
    ],
    hold: [0.9, 1.8], last: [2.6, 3.8], gap: [2, 4], glide: 0.09, vibrato: [5.2, 1.3], level: NEAR,
  },
  // Marwa: sunset unease. It circles re♭ and dha and won't come home to sa.
  bechaini: {
    phrases: [
      [-1, 1, 4, 6, 9], //         -ni re♭ ga ma♯ dha
      [9, 6, 4, 1], //             dha ma♯ ga re♭
      [6, 9, 11, 9, 6, 4, 1], //   ma♯ dha ni dha ma♯ ga re♭
      [-3, -1, 1], //              -dha -ni re♭
    ],
    hold: [0.35, 0.9], last: [1.4, 2.2], gap: [1, 2.2], glide: 0.04, vibrato: [6.4, 1.6], level: NEAR,
  },
  // Bageshree: the night raag of waiting for the beloved.
  khwahish: {
    phrases: [
      [-2, -3, 0, 5], //           -ni♭ -dha sa ma
      [3, 5, 9, 10, 9, 5], //      ga♭ ma dha ni♭ dha ma
      [5, 3, 2, 0], //             ma ga♭ re sa
      [9, 10, 12, 10, 9, 5, 3], // dha ni♭ sa' ni♭ dha ma ga♭
    ],
    hold: [0.9, 1.9], last: [2.6, 4], gap: [2.2, 4], glide: 0.1, vibrato: [4.8, 1.2], level: NEAR,
  },
  // Pilu: the thumri's wistfulness, both ga's at once.
  yaad: {
    phrases: [
      [-1, 0, 3, 2, 3, 0, -1], //  -ni sa ga♭ re ga♭ sa -ni
      [-5, -1, 0], //              -pa -ni sa
      [4, 5, 7, 9, 7, 5, 3, 2, 0], // ga ma pa dha pa ma ga♭ re sa
      [7, 10, 9, 7], //            pa ni♭ dha pa
    ],
    hold: [1, 2], last: [3, 4.4], gap: [2.4, 4.5], glide: 0.08, vibrato: [5, 1], level: NEAR,
  },
  // Darbari Kanada: grave and low, swaying slowly on ga♭ and dha♭.
  hijr: {
    phrases: [
      [2, 3, 2, 0], //             re ga♭ re sa
      [-2, -4, -2, 0], //          -ni♭ -dha♭ -ni♭ sa
      [5, 7, 8, 7, 5, 3, 2, 0], // ma pa dha♭ pa ma ga♭ re sa
      [3], //                      a held ga♭
    ],
    hold: [1.4, 2.6], last: [3.4, 5], gap: [2.5, 4.5], glide: 0.16, vibrato: [2.4, 3.2], level: NEAR,
  },
  // Shivranjani, each phrase trailing away as it goes.
  faramoshi: {
    phrases: [
      [7, 9, 12, 9, 7, 3, 2, 0], // pa dha sa' dha pa ga♭ re sa
      [3, 2, 0, -3, 0], //         ga♭ re sa -dha sa
      [0, 2, 3, 7, 9], //          sa re ga♭ pa dha
      [3, 2, 3], //                ga♭ re ga♭
    ],
    hold: [1, 1.8], last: [2, 3], gap: [2.6, 4.6], glide: 0.09, vibrato: [4.6, 0.9], level: NEAR, fade: 0.8,
  },
  // Bhairavi: every note flat, returning to the same grievance.
  shikwa: {
    phrases: [
      [0, 1, 3, 1, 0], //          sa re♭ ga♭ re♭ sa
      [5, 3, 1, 0], //             ma ga♭ re♭ sa
      [7, 8, 7, 5, 3, 1, 0], //    pa dha♭ pa ma ga♭ re♭ sa
      [3, 3, 1, 3, 1, 0], //       ga♭ ga♭ re♭ ga♭ re♭ sa, insisting
    ],
    hold: [0.6, 1.3], last: [2.2, 3.2], gap: [1.6, 3.2], glide: 0.06, vibrato: [5.6, 1.4], level: NEAR,
  },
  // Malkauns: the midnight raag, five dark notes and no re or pa.
  'na-umeedi': {
    phrases: [
      [-2, 0, 3, 5, 3, 0], //      -ni♭ sa ga♭ ma ga♭ sa
      [5, 8, 10, 8, 5, 3], //      ma dha♭ ni♭ dha♭ ma ga♭
      [3, 5, 3, 0, -2, -4, 0], //  ga♭ ma ga♭ sa -ni♭ -dha♭ sa
      [-4], //                     a held -dha♭
    ],
    hold: [1.3, 2.4], last: [3.6, 5], gap: [3, 5], glide: 0.13, vibrato: [3.6, 1.6], level: NEAR,
  },
  // Bhairav: the dawn raag, re♭ and dha♭ swaying, rising to sa'.
  bedaari: {
    phrases: [
      [0, 1, 1, 0], //             sa re♭ re♭ sa
      [4, 5, 8, 7], //             ga ma dha♭ pa
      [5, 4, 5, 1, 0], //          ma ga ma re♭ sa
      [7, 8, 11, 12], //           pa dha♭ ni sa', the day breaking
    ],
    hold: [0.9, 1.7], last: [2.6, 3.6], gap: [2, 4], glide: 0.09, vibrato: [4.2, 2], level: NEAR,
  },
} satisfies Record<string, Voice>

export type Feeling = keyof typeof FEELING_VOICES

const rand = (min: number, max: number) => min + Math.random() * (max - min)

/** A room reverb, generated rather than shipped: decaying noise whose tail darkens. */
export function makeImpulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds)
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel)
    let smooth = 0
    for (let i = 0; i < length; i++) {
      const t = i / length
      const k = 0.2 + 0.75 * t // more smoothing later = a darker tail
      smooth = smooth * k + (Math.random() * 2 - 1) * (1 - k)
      data[i] = smooth * Math.pow(1 - t, 2.6)
    }
  }
  return buffer
}

/** Firefox can say up front that audio is blocked; elsewhere we simply try. */
function autoplayAllowed(): boolean {
  const nav = navigator as Navigator & { getAutoplayPolicy?: (kind: string) => string }
  try {
    return nav.getAutoplayPolicy?.('audiocontext') !== 'disallowed'
  } catch {
    return true
  }
}

export class AmbientEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private tanpuraBus: GainNode | null = null
  private fluteBus: GainNode | null = null
  private tanpuraWave: PeriodicWave | null = null
  private fluteWave: PeriodicWave | null = null
  private pad: AudioScheduledSourceNode[] = []
  private timer: ReturnType<typeof setInterval> | null = null
  private sleepTimer: ReturnType<typeof setTimeout> | null = null
  private nextPluck = 0
  private pluckIndex = 0
  private nextPhrase = 0
  private wanted = false
  private fadeIn = 4
  private voice: Voice = YAMAN
  /** The latest phrase, sounding or scheduled, so a new feeling can cut it short. */
  private sounding: { mute: GainNode; sources: OscillatorNode[]; end: number } | null = null

  constructor(private readonly onState: (state: AmbientState) => void) {}

  /** Ask for sound. Fades in once the browser lets the context run. */
  play(fadeSeconds = 4) {
    this.wanted = true
    this.fadeIn = fadeSeconds
    this.cancelSleep()
    // Where the browser has already said no, creating a context now would only
    // earn a console warning; the first tap (unlock) creates it instead.
    if (!this.ctx && !autoplayAllowed()) {
      this.onState('suspended')
      return
    }
    const ctx = this.ensure()
    if (!ctx) return
    if (ctx.state === 'running') this.sound()
    else void ctx.resume().catch(() => {})
  }

  /** Fade to silence, then let the context sleep so it costs nothing. */
  stop(fadeSeconds = 1.2) {
    this.wanted = false
    if (!this.ctx) return
    this.ramp(0, fadeSeconds)
    this.cancelSleep()
    this.sleepTimer = setTimeout(() => {
      this.sleepTimer = null
      if (this.wanted || !this.ctx) return
      this.stopScheduler()
      void this.ctx.suspend().catch(() => {})
    }, fadeSeconds * 1000 + 300)
  }

  /**
   * Called from a user gesture. Browsers hold audio until the listener first
   * touches the page; this is the moment we may start. Does nothing unless
   * sound is actually wanted, so it never wakes a room that was put to sleep.
   */
  unlock() {
    if (!this.wanted) return
    const ctx = this.ensure()
    if (ctx && ctx.state !== 'running') void ctx.resume().catch(() => {})
  }

  /**
   * Sing a feeling's raag while it is being considered; null hands the voice
   * back to the room's Yaman. A new feeling is heard at once (the phrase in the
   * air bows out); returning to Yaman lets the last phrase finish first.
   */
  setFeeling(feeling: Feeling | null) {
    const voice: Voice = feeling ? FEELING_VOICES[feeling] : YAMAN
    if (voice === this.voice) return
    this.voice = voice
    const ctx = this.ctx
    // Silent or fading out for a recording: the next phrase will simply use it.
    if (!ctx || ctx.state !== 'running' || !this.wanted) return
    const now = ctx.currentTime
    if (voice === YAMAN) {
      this.nextPhrase = Math.max(this.nextPhrase, now + rand(4, 8))
      return
    }
    const s = this.sounding
    if (s && s.end > now) {
      s.mute.gain.setTargetAtTime(0, now, 0.15)
      for (const src of s.sources) {
        try {
          src.stop(Math.min(s.end, now + 1))
        } catch {
          /* already stopped */
        }
      }
    }
    this.nextPhrase = now + 0.5
  }

  dispose() {
    this.wanted = false
    this.cancelSleep()
    this.stopScheduler()
    const ctx = this.ctx
    this.ctx = null
    if (ctx) {
      ctx.onstatechange = null
      void ctx.close().catch(() => {})
    }
  }

  // ---- graph ---------------------------------------------------------------

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    const ctx = new Ctor({ latencyHint: 'playback' })
    this.ctx = ctx

    // bus -> [dry + reverb send] -> mix -> soften -> gentle limiter -> master
    const master = ctx.createGain()
    master.gain.value = 0
    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -22
    limiter.ratio.value = 3
    const soften = ctx.createBiquadFilter()
    soften.type = 'lowpass'
    soften.frequency.value = 3000
    soften.Q.value = 0.5
    const mix = ctx.createGain()
    const reverb = ctx.createConvolver()
    reverb.buffer = makeImpulse(ctx, 3.8)
    mix.connect(soften).connect(limiter).connect(master).connect(ctx.destination)
    reverb.connect(mix)
    this.master = master

    const bus = (dry: number, wet: number) => {
      const input = ctx.createGain()
      const d = ctx.createGain()
      const w = ctx.createGain()
      d.gain.value = dry
      w.gain.value = wet
      input.connect(d).connect(mix)
      input.connect(w).connect(reverb)
      return input
    }
    this.tanpuraBus = bus(0.7, 0.35)
    this.fluteBus = bus(0.35, 0.75) // mostly reverb: heard from the next room

    // A tanpura's jawari leaves its upper partials unusually strong.
    const partials = [0, 1, 0.8, 0.72, 0.5, 0.55, 0.32, 0.3, 0.2, 0.18, 0.12, 0.1, 0.07, 0.06, 0.04, 0.03]
    this.tanpuraWave = ctx.createPeriodicWave(new Float32Array(partials.length), new Float32Array(partials))
    const breath = [0, 1, 0.18, 0.08, 0.03]
    this.fluteWave = ctx.createPeriodicWave(new Float32Array(breath.length), new Float32Array(breath))

    this.buildPad(ctx, bus(0.6, 0.4))

    ctx.onstatechange = () => {
      if (this.ctx !== ctx) return
      if (ctx.state === 'running' && this.wanted) this.sound()
      this.onState(ctx.state as AmbientState)
    }
    return ctx
  }

  /** A soft, breathing Sa–Pa bed under the plucks. */
  private buildPad(ctx: AudioContext, out: AudioNode) {
    const level = ctx.createGain()
    level.gain.value = 0.035
    const tone = ctx.createBiquadFilter()
    tone.type = 'lowpass'
    tone.frequency.value = 520
    tone.connect(level).connect(out)
    for (const [freq, cents] of [[SA, -3], [SA * semis(7), 3]] as const) {
      const osc = ctx.createOscillator()
      osc.type = 'triangle'
      osc.frequency.value = freq
      osc.detune.value = cents
      osc.connect(tone)
      osc.start()
      this.pad.push(osc)
    }
    const lfo = ctx.createOscillator()
    const depth = ctx.createGain()
    lfo.frequency.value = 0.07
    depth.gain.value = 0.014
    lfo.connect(depth).connect(level.gain)
    lfo.start()
    this.pad.push(lfo)
  }

  // ---- scheduling ----------------------------------------------------------

  private sound() {
    this.startScheduler()
    this.ramp(ROOM_LEVEL, this.fadeIn)
  }

  private ramp(level: number, seconds: number) {
    const ctx = this.ctx
    const gain = this.master?.gain
    if (!ctx || !gain) return
    const now = ctx.currentTime
    gain.cancelScheduledValues(now)
    gain.setValueAtTime(gain.value, now)
    gain.linearRampToValueAtTime(level, now + Math.max(0.05, seconds))
  }

  private startScheduler() {
    const ctx = this.ctx
    if (!ctx || this.timer) return
    const now = ctx.currentTime
    if (this.nextPluck < now) this.nextPluck = now + 0.15
    // Let the drone settle before the first phrase.
    if (this.nextPhrase < now) this.nextPhrase = now + rand(6, 10)
    this.timer = setInterval(this.tick, 250)
    this.tick()
  }

  private stopScheduler() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private cancelSleep() {
    if (this.sleepTimer) clearTimeout(this.sleepTimer)
    this.sleepTimer = null
  }

  /** Look-ahead scheduling: timers are jittery, the audio clock is not. */
  private tick = () => {
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running') return
    const horizon = ctx.currentTime + 1.2
    while (this.nextPluck < horizon) {
      const i = this.pluckIndex % STRINGS.length
      const when = Math.max(this.nextPluck + rand(-0.04, 0.04), ctx.currentTime + 0.02)
      this.pluck(STRINGS[i], when, 0.15 * rand(0.9, 1.1))
      this.nextPluck += STRING_GAPS[i]
      this.pluckIndex++
    }
    if (this.nextPhrase < horizon) {
      const length = this.phrase(Math.max(this.nextPhrase, ctx.currentTime + 0.05))
      this.nextPhrase += length + rand(...this.voice.gap)
    }
  }

  private pluck(freq: number, when: number, velocity: number) {
    const ctx = this.ctx!
    const env = ctx.createGain()
    const tone = ctx.createBiquadFilter()
    tone.type = 'lowpass'
    tone.Q.value = 0.7
    // A plucked string blooms bright and mellows as it rings.
    tone.frequency.setValueAtTime(2600, when)
    tone.frequency.exponentialRampToValueAtTime(650, when + 3.5)
    env.gain.setValueAtTime(0.0001, when)
    env.gain.exponentialRampToValueAtTime(velocity, when + 0.025)
    env.gain.exponentialRampToValueAtTime(0.0001, when + 6.5)
    tone.connect(env).connect(this.tanpuraBus!)
    // Two voices a few cents apart beat slowly against each other — the
    // shimmer a real tanpura gets from its bridge.
    ;[-2.5, 2.5].forEach((cents, i) => {
      const osc = ctx.createOscillator()
      osc.setPeriodicWave(this.tanpuraWave!)
      osc.frequency.value = freq
      osc.detune.value = cents
      osc.connect(tone)
      osc.start(when)
      osc.stop(when + 6.6)
      osc.onended = () => {
        osc.disconnect()
        if (i === 1) {
          tone.disconnect()
          env.disconnect()
        }
      }
    })
  }

  /** One phrase on a single breath, sliding between notes (meend). Returns its length. */
  private phrase(start: number): number {
    const ctx = this.ctx!
    const v = this.voice
    const notes = v.phrases[Math.floor(Math.random() * v.phrases.length)]
    const peak = 0.085 * v.level * rand(0.85, 1.1)
    const osc = ctx.createOscillator()
    const env = ctx.createGain()
    // Its own fader, untouched by the envelope, so a new feeling can cut it.
    const mute = ctx.createGain()
    const tone = ctx.createBiquadFilter()
    const vibrato = ctx.createOscillator()
    const vibratoDepth = ctx.createGain()
    osc.setPeriodicWave(this.fluteWave!)
    tone.type = 'lowpass'
    tone.frequency.value = 1900
    osc.connect(tone).connect(env).connect(mute).connect(this.fluteBus!)
    vibrato.frequency.value = v.vibrato[0]
    vibratoDepth.gain.setValueAtTime(0, start)
    vibratoDepth.gain.linearRampToValueAtTime(v.vibrato[1], start + 1.2)
    vibrato.connect(vibratoDepth).connect(osc.frequency)

    let t = start
    osc.frequency.setValueAtTime(FLUTE_SA * semis(notes[0]), t)
    env.gain.setValueAtTime(0.0001, t)
    env.gain.exponentialRampToValueAtTime(peak, t + 0.4)
    notes.forEach((note, i) => {
      const last = i === notes.length - 1
      const hold = last ? rand(...v.last) : rand(...v.hold)
      if (i > 0) {
        const level = peak * Math.pow(v.fade ?? 1, i)
        osc.frequency.setTargetAtTime(FLUTE_SA * semis(note), t, v.glide)
        // A slight lift of the breath between notes.
        env.gain.setTargetAtTime(level * 0.72, t - 0.1, 0.04)
        env.gain.setTargetAtTime(level, t + 0.06, 0.08)
      }
      t += hold
    })
    env.gain.setTargetAtTime(0.0001, t, 0.45)
    const end = t + 3
    osc.start(start)
    vibrato.start(start)
    osc.stop(end)
    vibrato.stop(end)
    const sounding = { mute, sources: [osc, vibrato], end }
    this.sounding = sounding
    osc.onended = () => {
      if (this.sounding === sounding) this.sounding = null
      osc.disconnect()
      vibrato.disconnect()
      vibratoDepth.disconnect()
      tone.disconnect()
      env.disconnect()
      mute.disconnect()
    }
    return t - start
  }
}
