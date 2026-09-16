'use client'

/*
 * The opening. A dark room; a diya is lit; three drafts catch the flame and the
 * third throws light across the room; a record starts to turn, faster and
 * faster; then the view begins to move in, and the record winds down to rest
 * as a tanpura sounds; the camera settles on the record's label, where the name
 * is printed, and pushes into it; black; a flash of the diya's own gold; and
 * the mehfil opens out of that light, which settles back into the diya on the
 * stage.
 *
 * It plays on a first visit (see shouldPlayIntro) and again from the footer.
 * The world is the stage's own: the same painted diya (diya.tsx) and the same
 * record (MehfilScene), filmed up close.
 */

import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { createIntroSound, type IntroSound } from '../../audio/introSound'
import { ClassicalDiya, DiyaFlame, paintGlow, WICK_TIP, type FlameControls } from './diya'
import { useVinylGrooveTexture } from './MehfilScene'

const SEEN_KEY = 'shama.intro'

/** Seconds from the first frame. */
const CUE = {
  ember: 0.6, // a speck of light in the dark
  lit: 1.4, // the diya burns steadily
  drafts: [1.62, 1.88, 2.14], // three flickers; the third flares
  flare: 2.2,
  spinStart: 2.4, // the needle drops
  tension: 2.8, // the flame climbs with the record
  shift: 3.35, // the view starts to move in; the record starts to wind down; "ta"
  rest: 4.45, // the record is still, its label upright
  arrive: 4.72, // the camera has settled on the name
  cut: 4.98, // black, then the flash
}
/** The gentle version for reduced motion: the diya lights and the room opens. */
const CALM = { ember: 0.35, lit: 1.3, reveal: 1.8 }
const FLASH_MS = 160
const REVEAL_MS = 900
/** No first frame by then (no WebGL, say): open the room anyway. */
const STALL_MS = 4000
/** The longest the label waits for its typefaces: it must be printed before the record is seen (CUE.flare). */
const LABEL_WAIT_MS = 1200

// ---------------------------------------------------------------- when ------

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/** First visits get the opening; `?intro=1` asks for it. */
export function shouldPlayIntro(): boolean {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  if (params.get('intro') === '1') return true
  // A shared mehfil link joins a room already under way.
  if (params.get('mehfil')) return false
  if (prefersReducedMotion()) return false
  try {
    return !localStorage.getItem(SEEN_KEY)
  } catch {
    return true
  }
}

function markIntroSeen() {
  try {
    localStorage.setItem(SEEN_KEY, 'seen')
  } catch {
    /* private mode: it will play again next time */
  }
}

// ---------------------------------------------------------------- easing ----

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const span = (t: number, a: number, b: number) => clamp01((t - a) / (b - a))
const smooth = (x: number) => x * x * (3 - 2 * x)
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3)
const bump = (t: number, at: number, width: number) => Math.exp(-Math.pow((t - at) / width, 2))

// ---------------------------------------------------------------- the set ---

const TABLE_Y = -0.13
const DIYA_SCALE = 1.7
/** The diya stands back and to the left of the deck, clear of it. */
const DIYA_POS = new THREE.Vector3(-1.16, TABLE_Y, -0.62)
/** Turned a little so its spout, and the flame, lean toward the camera. */
const DIYA_TURN = -0.4
/** The wick's burning end, in world space. */
const WICK = new THREE.Vector3(...WICK_TIP)
  .applyAxisAngle(new THREE.Vector3(0, 1, 0), DIYA_TURN)
  .multiplyScalar(DIYA_SCALE)
  .add(DIYA_POS)
/** The heart of the flame, where its light comes from. */
const FLAME = WICK.clone().add(new THREE.Vector3(0, 0.1, 0))
const LABEL_Y = 0.034
/** The printed name, a little above the spindle: where the dive ends. */
const WORDMARK = new THREE.Vector3(0, LABEL_Y, -0.06)
/**
 * The tone arm: its pivot beyond the platter at the back right, and its swing
 * (radians about the pivot), parked off the record and on the lead-in groove.
 * Played, it crosses the record on a diagonal, which reads from the front.
 */
const ARM_PIVOT: [number, number, number] = [0.6, 0, -0.4]
const ARM_LENGTH = 0.92
const ARM_REST = 1.62
const ARM_PLAY = 1.146

/**
 * How far the record has turned. It spins up until the shift, then winds down
 * to rest, and in all makes whole turns, so the label comes to rest upright.
 */
const SPIN = { turns: 5, rise: 1.6, fall: 1.6 }
const SPIN_UP = CUE.shift - CUE.spinStart
const SPIN_DOWN = CUE.rest - CUE.shift
const TOP_SPEED = (SPIN.turns * Math.PI * 2) / (SPIN_UP / (SPIN.rise + 1) + SPIN_DOWN / (SPIN.fall + 1))
function recordAngle(t: number) {
  if (t <= CUE.spinStart) return 0
  const up = (TOP_SPEED * SPIN_UP) / (SPIN.rise + 1)
  if (t <= CUE.shift) return up * Math.pow((t - CUE.spinStart) / SPIN_UP, SPIN.rise + 1)
  const v = span(t, CUE.shift, CUE.rest)
  return up + ((TOP_SPEED * SPIN_DOWN) / (SPIN.fall + 1)) * (1 - Math.pow(1 - v, SPIN.fall + 1))
}

interface Shot {
  pos: THREE.Vector3
  look: THREE.Vector3
}

/** Camera positions, drawn back further on narrow screens. */
function shots(aspect: number) {
  const widen = aspect < 1 ? Math.min(1.9, 1.02 / aspect) : 1
  const away = (look: THREE.Vector3, offset: THREE.Vector3, k: number): Shot => ({
    look,
    pos: look.clone().add(offset.clone().multiplyScalar(k)),
  })
  // On a narrow screen the close-up also draws back and centres on the bowl, so the diya isn't cut in half.
  const diyaLook = FLAME.clone().add(new THREE.Vector3(aspect < 1 ? -0.22 : -0.12, -0.16, 0))
  const closeUp = Math.pow(widen, 0.8)
  return {
    diyaFar: away(diyaLook, new THREE.Vector3(0.42, 0.2, 1.24), closeUp),
    diya: away(diyaLook, new THREE.Vector3(0.38, 0.15, 1.04), closeUp),
    room: away(new THREE.Vector3(-0.4, -0.04, -0.28), new THREE.Vector3(0.86, 1.32, 2.06), widen),
    push: away(new THREE.Vector3(-0.14, -0.02, -0.12), new THREE.Vector3(0.38, 1.1, 1.52), widen),
  }
}

function lerpShot(a: Shot, b: Shot, k: number, out: Shot) {
  out.pos.lerpVectors(a.pos, b.pos, k)
  out.look.lerpVectors(a.look, b.look, k)
}

// ---------------------------------------------------------------- paint -----

function useCanvasTexture(size: number, paint: (ctx: CanvasRenderingContext2D, size: number) => void, repeat = 1) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')
    if (ctx) paint(ctx, size)
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    if (repeat !== 1) {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping
      tex.repeat.set(repeat, repeat)
    }
    return tex
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, repeat])
  useEffect(() => () => texture.dispose(), [texture])
  return texture
}

/** Dark sheesham boards for the floor the diya and the deck stand on. */
function paintBoards(ctx: CanvasRenderingContext2D, size: number) {
  ctx.fillStyle = '#20160f'
  ctx.fillRect(0, 0, size, size)
  const plank = size / 6
  for (let row = 0; row < 6; row++) {
    const y = row * plank
    ctx.fillStyle = `rgba(${40 + (row % 3) * 6}, ${27 + (row % 2) * 4}, 18, 0.55)`
    ctx.fillRect(0, y, size, plank)
    for (let i = 0; i < 26; i++) {
      const gy = y + Math.random() * plank
      ctx.strokeStyle = `rgba(12, 8, 5, ${0.12 + Math.random() * 0.2})`
      ctx.lineWidth = 0.6 + Math.random() * 1.4
      ctx.beginPath()
      ctx.moveTo(0, gy)
      ctx.bezierCurveTo(size * 0.3, gy + Math.random() * 6 - 3, size * 0.7, gy + Math.random() * 6 - 3, size, gy)
      ctx.stroke()
    }
    ctx.fillStyle = 'rgba(6, 4, 2, 0.8)'
    ctx.fillRect(0, y, size, 2)
  }
}

/** Paper fibre, for the label's matte relief. */
function paintPaperGrain(ctx: CanvasRenderingContext2D, size: number) {
  ctx.fillStyle = '#808080'
  ctx.fillRect(0, 0, size, size)
  for (let i = 0; i < 14000; i++) {
    const v = 90 + Math.random() * 80
    ctx.fillStyle = `rgb(${v}, ${v}, ${v})`
    const long = Math.random() < 0.15
    ctx.fillRect(Math.random() * size, Math.random() * size, long ? 4 + Math.random() * 8 : 1.5, long ? 1 : 1.5)
  }
}

/** Letters set along the top of a circle, reading clockwise. */
function arcTop(ctx: CanvasRenderingContext2D, text: string, c: number, r: number) {
  const chars = [...text]
  const widths = chars.map((ch) => ctx.measureText(ch).width / r)
  let a = -Math.PI / 2 - widths.reduce((s, w) => s + w, 0) / 2
  chars.forEach((ch, i) => {
    ctx.save()
    ctx.translate(c, c)
    ctx.rotate(a + widths[i] / 2 + Math.PI / 2)
    ctx.fillText(ch, 0, -r)
    ctx.restore()
    a += widths[i]
  })
}

/** Letters set along the bottom of a circle, upright and reading left to right. */
function arcBottom(ctx: CanvasRenderingContext2D, text: string, c: number, r: number) {
  const chars = [...text]
  const widths = chars.map((ch) => ctx.measureText(ch).width / r)
  let a = Math.PI / 2 + widths.reduce((s, w) => s + w, 0) / 2
  chars.forEach((ch, i) => {
    ctx.save()
    ctx.translate(c, c)
    ctx.rotate(a - widths[i] / 2 - Math.PI / 2)
    ctx.fillText(ch, 0, r)
    ctx.restore()
    a -= widths[i]
  })
}

/** Set a word so its ink, not its line box, is centred on (x, y) and fits the box. */
function inkText(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: (px: number) => string,
  px: number,
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number
) {
  ctx.font = font(px)
  let m = ctx.measureText(text)
  const width = m.actualBoundingBoxLeft + m.actualBoundingBoxRight
  const height = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent
  const fit = Math.min(1, maxWidth / width, maxHeight / height)
  if (fit < 1) {
    ctx.font = font(Math.floor(px * fit))
    m = ctx.measureText(text)
  }
  const dx = (m.actualBoundingBoxLeft - m.actualBoundingBoxRight) / 2
  const dy = (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2
  ctx.fillText(text, x + dx, y + dy)
}

/** The record label: bronze paper, the name in nastaliq and in Cormorant. */
function paintLabel(ctx: CanvasRenderingContext2D, size: number) {
  const c = size / 2
  const r = size / 2
  const paper = ctx.createRadialGradient(c * 0.86, c * 0.8, r * 0.04, c, c, r)
  paper.addColorStop(0, '#e9c38c')
  paper.addColorStop(0.5, '#cf955a')
  paper.addColorStop(1, '#8c5128')
  ctx.fillStyle = paper
  ctx.fillRect(0, 0, size, size)

  // Paper grain.
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(80, 40, 15, 0.07)' : 'rgba(255, 240, 210, 0.05)'
    ctx.fillRect(Math.random() * size, Math.random() * size, 1.5, 1.5)
  }

  const ink = '#2b1409'
  ctx.strokeStyle = 'rgba(55, 26, 10, 0.7)'
  ctx.lineWidth = 7
  ctx.beginPath()
  ctx.arc(c, c, r * 0.955, 0, Math.PI * 2)
  ctx.stroke()
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(c, c, r * 0.915, 0, Math.PI * 2)
  ctx.stroke()

  ctx.fillStyle = ink
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = 'italic 500 62px "Cormorant Garamond", Georgia, serif'
  arcTop(ctx, 'a digital mehfil', c, r * 0.79)
  ctx.font = '500 50px "Cormorant Garamond", Georgia, serif'
  arcBottom(ctx, '33⅓', c, r * 0.83)

  // The name sits in the band between the rim's lettering and the spindle.
  ctx.textAlign = 'left'
  ctx.direction = 'rtl'
  inkText(ctx, 'شمع', (px) => `500 ${px}px "Noto Nastaliq Urdu", serif`, 300, c, c - r * 0.42, r * 0.95, r * 0.54)
  ctx.direction = 'ltr'
  inkText(ctx, 'Shama', (px) => `italic 500 ${px}px "Cormorant Garamond", Georgia, serif`, 150, c, c + r * 0.4, r * 0.86, r * 0.26)

  // The spindle hole.
  ctx.fillStyle = '#0d0704'
  ctx.beginPath()
  ctx.arc(c, c, r * 0.045, 0, Math.PI * 2)
  ctx.fill()
}

/** The label is painted once the name's typefaces are in (or LABEL_WAIT_MS has passed). */
function useLabelTexture() {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null)
  useEffect(() => {
    let cancelled = false
    const fonts = document.fonts
    const ready = fonts
      ? Promise.all([
          fonts.load('500 300px "Noto Nastaliq Urdu"', 'شمع'),
          fonts.load('italic 500 150px "Cormorant Garamond"', 'Shama'),
        ])
      : Promise.resolve()
    Promise.race([ready, new Promise((resolve) => setTimeout(resolve, LABEL_WAIT_MS))])
      .catch(() => undefined)
      .then(() => {
        if (cancelled) return
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 1024
        const ctx = canvas.getContext('2d')
        if (ctx) paintLabel(ctx, 1024)
        const tex = new THREE.CanvasTexture(canvas)
        tex.colorSpace = THREE.SRGBColorSpace
        tex.anisotropy = 8
        setTexture(tex)
      })
    return () => {
      cancelled = true
    }
  }, [])
  useEffect(() => () => texture?.dispose(), [texture])
  return texture
}

// ---------------------------------------------------------------- particles -

const SPARK_COUNT = 18
const MOTE_COUNT = 90

function useParticles() {
  return useMemo(() => {
    const sparks = Array.from({ length: SPARK_COUNT }, () => ({
      dir: new THREE.Vector3(Math.random() - 0.5, 1.4 + Math.random(), Math.random() - 0.5).normalize(),
      speed: 0.22 + Math.random() * 0.38,
      life: 0.55 + Math.random() * 0.6,
      delay: Math.random() * 0.12,
    }))
    const motes = Array.from({ length: MOTE_COUNT }, () => ({
      base: new THREE.Vector3(-1.9 + Math.random() * 2.8, TABLE_Y + 0.05 + Math.random() * 1.1, -1.5 + Math.random() * 2),
      phase: Math.random() * Math.PI * 2,
      rate: 0.15 + Math.random() * 0.35,
    }))
    const sparkGeo = new THREE.BufferGeometry()
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARK_COUNT * 3), 3))
    sparkGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(SPARK_COUNT * 3), 3))
    const moteGeo = new THREE.BufferGeometry()
    moteGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MOTE_COUNT * 3), 3))
    return { sparks, motes, sparkGeo, moteGeo }
  }, [])
}

// ---------------------------------------------------------------- scene -----

interface SceneProps {
  calm: boolean
  onStart: () => void
  onCut: () => void
  onCalmReveal: () => void
}

function IntroScene({ calm, onStart, onCut, onCalmReveal }: SceneProps) {
  const { camera, size } = useThree()
  const groove = useVinylGrooveTexture()
  const label = useLabelTexture()
  const glow = useCanvasTexture(128, paintGlow)
  const boards = useCanvasTexture(512, paintBoards, 4)
  const grain = useCanvasTexture(512, paintPaperGrain)
  const { sparks, motes, sparkGeo, moteGeo } = useParticles()
  useEffect(
    () => () => {
      sparkGeo.dispose()
      moteGeo.dispose()
    },
    [sparkGeo, moteGeo]
  )

  const flame = useRef<FlameControls>(null)
  const bowlMat = useRef<THREE.MeshStandardMaterial>(null)
  const oilMat = useRef<THREE.MeshStandardMaterial>(null)
  const roomLight = useRef<THREE.PointLight>(null)
  const nearLight = useRef<THREE.PointLight>(null)
  const artLight = useRef<THREE.PointLight>(null)
  const labelLight = useRef<THREE.SpotLight>(null)
  const halo = useRef<THREE.Sprite>(null)
  const haloMat = useRef<THREE.SpriteMaterial>(null)
  const ember = useRef<THREE.SpriteMaterial>(null)
  const roomGlow = useRef<THREE.SpriteMaterial>(null)
  const disc = useRef<THREE.Group>(null)
  const arm = useRef<THREE.Group>(null)
  const armLift = useRef<THREE.Group>(null)
  const moteMat = useRef<THREE.PointsMaterial>(null)

  const startRef = useRef<number | null>(null)
  const doneRef = useRef(false)
  const shotRef = useRef<Shot>({ pos: new THREE.Vector3(), look: new THREE.Vector3() })
  const scratch = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3() }), [])
  const aspect = size.width / Math.max(1, size.height)
  const framing = useMemo(() => shots(aspect), [aspect])
  // A still frame of any moment, for working on the timing: ?intro=1&introAt=3.4
  const pinned = useMemo(() => {
    if (process.env.NODE_ENV === 'production') return null
    const at = Number(new URLSearchParams(window.location.search).get('introAt'))
    return Number.isFinite(at) && at > 0 ? at : null
  }, [])

  useFrame(() => {
    const now = performance.now()
    if (startRef.current === null) {
      // The label arrives within LABEL_WAIT_MS, well before the record is seen,
      // so the clock needn't wait for it. The opening dark covers the first
      // frames' shader compiling.
      startRef.current = now
      onStart()
    }
    const t = pinned ?? (now - startRef.current) / 1000
    const cues = calm ? { ...CUE, ember: CALM.ember, lit: CALM.lit } : CUE

    // ---- the flame -------------------------------------------------------
    const ignite = smooth(span(t, cues.ember, cues.lit))
    // After the shift the room calms: the flame steadies as the record winds down.
    const settle = calm ? 0 : smooth(span(t, CUE.shift, CUE.rest))
    let level = (calm ? 0.95 : 0.55) * ignite
    let draft = 0
    if (!calm) {
      for (const d of CUE.drafts) draft += bump(t, d, 0.05)
      level += 0.75 * easeOut(span(t, CUE.flare, CUE.flare + 0.14)) + 0.35 * bump(t, CUE.flare + 0.1, 0.07)
      level += 0.6 * Math.pow(span(t, CUE.tension, CUE.shift), 2) - 0.35 * settle
    }
    const wobble =
      (0.05 * Math.sin(t * 21) + 0.035 * Math.sin(t * 33 + 1.3) + 0.03 * Math.sin(t * 9 + 0.7)) * (1 - 0.5 * settle)
    const gust = Math.min(1, draft)
    const flicker = (1 + wobble * ignite) * (1 - 0.55 * gust)
    const visible = t > cues.ember ? 1 : 0
    // The flame grows from an ember, stands taller when it flares, and ducks in a draft.
    const tall = 0.26 * (0.2 + 0.8 * ignite) * (1 + 0.3 * clamp01(level - 0.55)) * (1 - 0.42 * gust)
    const sway = Math.sin(t * 6) * 0.05 + Math.sin(t * 2.3 + 1) * 0.03 + gust * 0.45
    flame.current?.update(tall / DIYA_SCALE, visible * clamp01(ignite * 1.6) * (1 - 0.35 * gust), sway, wobble)
    const lit = level * flicker
    if (roomLight.current) roomLight.current.intensity = 2.6 * lit
    if (nearLight.current) nearLight.current.intensity = 0.3 * lit
    if (artLight.current) artLight.current.intensity = 1.3 * lit
    if (bowlMat.current) bowlMat.current.emissiveIntensity = 0.05 * lit
    if (oilMat.current) oilMat.current.emissiveIntensity = 0.06 * lit
    if (halo.current && haloMat.current) {
      const s = 0.34 + 0.5 * lit
      halo.current.scale.set(s * 0.8, s, 1)
      haloMat.current.opacity = visible * Math.min(0.85, 0.15 + 0.45 * lit)
    }
    if (ember.current) ember.current.opacity = visible * (1 - ignite) * 0.9
    if (roomGlow.current) roomGlow.current.opacity = 0.028 * lit

    // ---- sparks off the flare, motes in the light -------------------------
    const sparkPos = sparkGeo.attributes.position as THREE.BufferAttribute
    const sparkCol = sparkGeo.attributes.color as THREE.BufferAttribute
    sparks.forEach((s, i) => {
      const age = calm ? -1 : t - CUE.flare - s.delay
      const alive = age > 0 && age < s.life
      const k = alive ? age : 0
      scratch.a.copy(s.dir).multiplyScalar(s.speed * k)
      scratch.a.y -= 0.12 * k * k
      sparkPos.setXYZ(i, FLAME.x + scratch.a.x, FLAME.y + 0.03 + scratch.a.y, FLAME.z + scratch.a.z)
      const fade = alive ? 1 - age / s.life : 0
      sparkCol.setXYZ(i, fade, fade * 0.62, fade * 0.24)
    })
    sparkPos.needsUpdate = true
    sparkCol.needsUpdate = true
    // The motes slow with the room.
    const drift = calm || t < CUE.shift ? t : CUE.shift + (t - CUE.shift) * 0.45
    const motePos = moteGeo.attributes.position as THREE.BufferAttribute
    motes.forEach((m, i) => {
      motePos.setXYZ(
        i,
        m.base.x + Math.sin(drift * m.rate + m.phase) * 0.06,
        m.base.y + Math.sin(drift * m.rate * 0.7 + m.phase * 2) * 0.04,
        m.base.z + Math.cos(drift * m.rate * 0.8 + m.phase) * 0.05
      )
    })
    motePos.needsUpdate = true
    if (moteMat.current) moteMat.current.opacity = Math.min(0.55, 0.45 * Math.max(0, level - 0.4))

    // ---- the record --------------------------------------------------------
    if (!calm) {
      if (disc.current) disc.current.rotation.y = -recordAngle(t)
      // The arm swings over the lead-in groove, then lowers the needle.
      const swing = smooth(span(t, CUE.flare, CUE.spinStart))
      const drop = smooth(span(t, CUE.spinStart - 0.05, CUE.spinStart + 0.2))
      if (arm.current) arm.current.rotation.y = THREE.MathUtils.lerp(ARM_REST, ARM_PLAY, swing)
      if (armLift.current) armLift.current.rotation.z = THREE.MathUtils.lerp(-0.035, 0.028, drop)
      if (labelLight.current) labelLight.current.intensity = 2.6 * smooth(span(t, CUE.tension, CUE.arrive))
    }

    // ---- the camera --------------------------------------------------------
    const s = framing
    const shot = shotRef.current
    const cam = camera as THREE.PerspectiveCamera
    let fov = 38
    if (calm || t < CUE.flare) {
      lerpShot(s.diyaFar, s.diya, smooth(span(t, 0, calm ? CALM.reveal : CUE.flare)), shot)
    } else if (t < 3.0) {
      lerpShot(s.diya, s.room, easeInOut(span(t, CUE.flare, 3.0)), shot)
    } else if (t < CUE.shift) {
      lerpShot(s.room, s.push, Math.pow(span(t, 3.0, CUE.shift), 1.6), shot)
    } else {
      // The move in: it starts gently as the record winds down, gathers pace,
      // and settles over the name; then a last push into it before the cut.
      const end = scratch.b.set(WORDMARK.x, WORDMARK.y + 0.15, WORDMARK.z + 0.045)
      const control = scratch.a.set(WORDMARK.x, 0.9 * Math.max(1, s.push.pos.y), WORDMARK.z + 0.5)
      const k = smooth(Math.pow(span(t, CUE.shift, CUE.arrive), 1.6))
      const q = 1 - k
      shot.pos.set(
        q * q * s.push.pos.x + 2 * q * k * control.x + k * k * end.x,
        q * q * s.push.pos.y + 2 * q * k * control.y + k * k * end.y,
        q * q * s.push.pos.z + 2 * q * k * control.z + k * k * end.z
      )
      const push = Math.pow(span(t, CUE.arrive, CUE.cut), 2.2)
      shot.pos.lerp(WORDMARK, 0.8 * push)
      shot.look.lerpVectors(s.push.look, WORDMARK, smooth(span(t, CUE.shift, CUE.arrive)))
      fov = 38 + 8 * k + 12 * push
    }
    cam.position.copy(shot.pos)
    cam.lookAt(shot.look)
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov
      cam.updateProjectionMatrix()
    }

    // ---- hand back to the page --------------------------------------------
    if (pinned !== null || doneRef.current) return
    if (calm && t >= CALM.reveal) {
      doneRef.current = true
      onCalmReveal()
    } else if (!calm && t >= CUE.cut) {
      doneRef.current = true
      onCut()
    }
  })

  return (
    <>
      <color attach="background" args={['#000000']} />
      <fogExp2 attach="fog" args={['#000000', 0.12]} />
      <ambientLight intensity={0.012} />

      {/* The floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, TABLE_Y, 0]}>
        <planeGeometry args={[14, 14]} />
        <meshStandardMaterial map={boards} color="#8a6a52" roughness={0.92} metalness={0} />
      </mesh>

      {/* The diya: the stage's own, larger */}
      <group position={DIYA_POS} rotation={[0, DIYA_TURN, 0]} scale={DIYA_SCALE}>
        <ClassicalDiya bowlMaterial={bowlMat} oilMaterial={oilMat}>
          <DiyaFlame ref={flame} />
          <pointLight
            ref={nearLight}
            position={[WICK_TIP[0], WICK_TIP[1] + 0.1, WICK_TIP[2] + 0.06]}
            intensity={0}
            distance={0.9}
            decay={2}
            color="#ffb766"
          />
        </ClassicalDiya>
      </group>
      {/* A soft light from the camera's side, so the painting on the clay reads. */}
      <pointLight
        ref={artLight}
        position={[DIYA_POS.x + 0.45, DIYA_POS.y + 0.32, DIYA_POS.z + 0.9]}
        intensity={0}
        distance={0}
        decay={2}
        color="#ffcf9a"
      />

      {/* Light from the flame: a halo on the flame, a faint warmth over the room */}
      <sprite ref={halo} position={FLAME} renderOrder={2}>
        <spriteMaterial ref={haloMat} map={glow} color="#ffb45e" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <sprite position={WICK} scale={[0.06, 0.06, 1]} renderOrder={2}>
        <spriteMaterial ref={ember} map={glow} color="#ff7a26" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>
      <sprite position={[FLAME.x, FLAME.y + 0.2, FLAME.z - 0.9]} scale={[7, 4.5, 1]} renderOrder={1}>
        <spriteMaterial ref={roomGlow} map={glow} color="#ff9a45" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <pointLight ref={roomLight} position={[FLAME.x + 0.12, FLAME.y + 0.45, FLAME.z + 0.3]} intensity={0} distance={0} decay={2} color="#ffb870" />

      <points geometry={sparkGeo} renderOrder={3}>
        <pointsMaterial map={glow} size={0.026} vertexColors transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </points>
      <points geometry={moteGeo} renderOrder={3}>
        <pointsMaterial ref={moteMat} map={glow} size={0.014} color="#ffd9a0" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>

      {/* The deck */}
      <group>
        <mesh position={[0, -0.07, 0]}>
          <boxGeometry args={[1.32, 0.12, 1.32]} />
          <meshStandardMaterial color="#241a14" metalness={0.1} roughness={0.85} />
        </mesh>
        <mesh position={[0, -0.002, 0]}>
          <cylinderGeometry args={[0.585, 0.585, 0.01, 64]} />
          <meshStandardMaterial color="#3a2a20" roughness={0.95} />
        </mesh>
        <mesh>
          <cylinderGeometry args={[0.6, 0.61, 0.03, 64]} />
          <meshStandardMaterial color="#b2734a" metalness={0.92} roughness={0.18} />
        </mesh>
        <group ref={disc}>
          <mesh position={[0, 0.018, 0]}>
            <cylinderGeometry args={[0.565, 0.565, 0.022, 96]} />
            <meshPhysicalMaterial
              color="#0b0b0d"
              map={groove ?? undefined}
              roughness={0.55}
              metalness={0.12}
              clearcoat={0.38}
              clearcoatRoughness={0.45}
            />
          </mesh>
          <mesh position={[0, LABEL_Y - 0.004, 0]}>
            <cylinderGeometry args={[0.175, 0.175, 0.006, 64]} />
            <meshStandardMaterial color="#9a5c2e" roughness={1} metalness={0} />
          </mesh>
          {/* The label face: matte paper, mounted once it is printed (a map added
              to a compiled material never shows). A circle's UVs keep the
              printing upright when the record comes to rest. */}
          {label && (
            <mesh position={[0, LABEL_Y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.175, 96]} />
              <meshStandardMaterial
                map={label}
                bumpMap={grain}
                bumpScale={0.6}
                roughness={1}
                metalness={0}
                emissiveMap={label}
                emissive="#ffffff"
                emissiveIntensity={0.03}
              />
            </mesh>
          )}
          <mesh position={[0, LABEL_Y + 0.012, 0]}>
            <cylinderGeometry args={[0.008, 0.009, 0.03, 16]} />
            <meshStandardMaterial color="#cfcfcf" metalness={0.95} roughness={0.15} />
          </mesh>
        </group>
        <spotLight
          ref={labelLight}
          position={[0.15, 0.95, 0.35]}
          angle={0.32}
          penumbra={0.8}
          intensity={0}
          distance={0}
          decay={2}
          color="#ffd6a0"
        />
        {/* The tone arm: it swings about its post (y) and lowers the needle (z). */}
        <group ref={arm} position={ARM_PIVOT} rotation={[0, ARM_REST, 0]}>
          <mesh position={[0, 0.03, 0]}>
            <cylinderGeometry args={[0.055, 0.064, 0.06, 28]} />
            <meshStandardMaterial color="#b2734a" metalness={0.85} roughness={0.28} />
          </mesh>
          <mesh position={[0, 0.075, 0]}>
            <cylinderGeometry args={[0.018, 0.018, 0.05, 14]} />
            <meshStandardMaterial color="#c9894f" metalness={0.9} roughness={0.2} />
          </mesh>
          <group ref={armLift} position={[0, 0.095, 0]} rotation={[0, 0, -0.035]}>
            <mesh position={[0.11, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.03, 0.03, 0.075, 22]} />
              <meshStandardMaterial color="#2a2320" metalness={0.6} roughness={0.38} />
            </mesh>
            <mesh position={[-ARM_LENGTH / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.01, 0.01, ARM_LENGTH, 14]} />
              <meshStandardMaterial color="#b9b2a6" metalness={0.9} roughness={0.3} />
            </mesh>
            <mesh position={[-ARM_LENGTH - 0.01, -0.012, 0]}>
              <boxGeometry args={[0.07, 0.02, 0.036]} />
              <meshStandardMaterial color="#1c1714" metalness={0.4} roughness={0.5} />
            </mesh>
            <mesh position={[-ARM_LENGTH - 0.02, -0.03, 0]} rotation={[Math.PI, 0, 0]}>
              <coneGeometry args={[0.004, 0.02, 8]} />
              <meshStandardMaterial color="#d9d9d9" metalness={0.95} roughness={0.2} />
            </mesh>
          </group>
        </group>
      </group>
    </>
  )
}

/** If the 3D scene fails, the room still opens. */
class SceneBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.warn('[shama] the opening could not play:', error)
    this.props.onError()
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

// ---------------------------------------------------------------- overlay ---

type Phase = 'dark' | 'scene' | 'burst' | 'reveal'

interface IntroSequenceProps {
  /** The gentle version: no spin, no dive, no flash. */
  calm: boolean
  /** Music is still playing underneath: the opening makes no sound of its own. */
  silent?: boolean
  /** The light has broken: the page should start to appear. */
  onReveal: () => void
  /** The opening is over and can be removed. */
  onDone: () => void
}

export function IntroSequence({ calm, silent = false, onReveal, onDone }: IntroSequenceProps) {
  const [phase, setPhase] = useState<Phase>('dark')
  const phaseRef = useRef<Phase>('dark')
  const rootRef = useRef<HTMLDivElement>(null)
  const skipRef = useRef<HTMLButtonElement>(null)
  const soundRef = useRef<IntroSound | null>(null)
  const timers = useRef<number[]>([])
  const callbacks = useRef({ onReveal, onDone })
  callbacks.current = { onReveal, onDone }

  const go = (next: Phase) => {
    phaseRef.current = next
    setPhase(next)
  }
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms))
  }

  const reveal = useCallback(() => {
    if (phaseRef.current === 'reveal') return
    markIntroSeen()
    // The light goes home to the stage's diya: its glow sits at 34% 30% of the art.
    const art = document.querySelector<HTMLElement>('.stage-art')
    const logo = document.querySelector<HTMLElement>('.liquid-logo')
    const box = art?.getBoundingClientRect()
    const onScreen = box && box.width > 0 && box.bottom > 0 && box.top < window.innerHeight
    let x = window.innerWidth / 2
    let y = window.innerHeight / 2
    if (box && onScreen) {
      x = box.left + box.width * 0.34
      y = box.top + box.height * 0.3
    } else if (logo) {
      const l = logo.getBoundingClientRect()
      x = l.left + l.width / 2
      y = l.top + l.height / 2
    }
    rootRef.current?.style.setProperty('--dx', `${x - window.innerWidth / 2}px`)
    rootRef.current?.style.setProperty('--dy', `${y - window.innerHeight / 2}px`)
    go('reveal')
    callbacks.current.onReveal()
    later(() => art?.classList.add('stage-art--lit'), REVEAL_MS * 0.6)
    later(() => callbacks.current.onDone(), REVEAL_MS)
  }, [])

  const cut = useCallback(() => {
    go('burst')
    later(reveal, FLASH_MS)
  }, [reveal])

  const start = useCallback(() => {
    soundRef.current?.start()
    go('scene')
  }, [])

  const skip = useCallback(() => {
    soundRef.current?.fade(0.5)
    reveal()
  }, [reveal])

  useEffect(() => {
    if (!calm && !silent) {
      soundRef.current = createIntroSound({
        spinStart: CUE.spinStart,
        shift: CUE.shift,
        rest: CUE.rest,
        arrive: CUE.arrive,
        cut: CUE.cut,
      })
    }
    skipRef.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') skip()
    }
    window.addEventListener('keydown', onKey)
    const stall = window.setTimeout(() => {
      if (phaseRef.current === 'dark') reveal()
    }, STALL_MS)
    const pending = timers.current
    return () => {
      window.removeEventListener('keydown', onKey)
      window.clearTimeout(stall)
      pending.forEach((id) => window.clearTimeout(id))
      // Once the light has broken, the ta-daa rings on past the opening and
      // closes itself. Only an opening cut short is silenced here.
      if (phaseRef.current !== 'reveal') soundRef.current?.stop()
    }
  }, [calm, silent, reveal, skip])

  return (
    <div ref={rootRef} className={`intro intro--${phase}${calm ? ' intro--calm' : ''}`}>
      <div className="intro-stage" aria-hidden="true">
        <SceneBoundary onError={reveal}>
          <Canvas dpr={[1, 1.75]} gl={{ antialias: true }} camera={{ fov: 38, near: 0.005, far: 30, position: [0, 0.5, 2] }}>
            <IntroScene calm={calm} onStart={start} onCut={cut} onCalmReveal={reveal} />
          </Canvas>
        </SceneBoundary>
      </div>
      <div className="intro-flash" aria-hidden="true" />
      <div className="intro-handoff" aria-hidden="true" />
      <button ref={skipRef} type="button" className="intro-skip" onClick={skip}>
        Skip intro
      </button>
    </div>
  )
}

export default IntroSequence
