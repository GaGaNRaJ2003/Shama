'use client'

/*
 * The Shama's diya, shared by the stage scene and the opening.
 *
 * A hand-thrown clay lamp: one surface, its rim drawn out and pinched into a
 * spout where the wick lies. It is painted the way festival diyas are: a
 * kumkum-red band carrying lotuses and paisleys between gold borders, a
 * dotted gold rim, and bare fired clay below and inside, darkened by oil and
 * soot by the spout. It stands on an engraved brass thali. Its flame is
 * painted light rather than solid shapes, so it holds up close.
 *
 * Geometry and textures are built once and shared by every canvas that shows
 * the diya.
 */

import { useImperativeHandle, useRef, type ReactNode, type Ref } from 'react'
import * as THREE from 'three'

// ---------------------------------------------------------------- shape -----

/** The wall's cross-section: out along the base, up the outside, over the rim, and down into the well. */
const PROFILE: [number, number][] = [
  [0, 0], [0.058, 0], [0.084, 0.004], [0.1, 0.014], [0.118, 0.032], [0.136, 0.056],
  [0.152, 0.082], [0.163, 0.106], [0.168, 0.124], [0.167, 0.135], [0.161, 0.142], [0.152, 0.143],
  [0.145, 0.137], [0.136, 0.118], [0.12, 0.096], [0.096, 0.08], [0.06, 0.07], [0, 0.068],
]
const PROFILE_STEPS = 72
const AROUND = 112
/** How far, and how sharply, the rim is drawn out into the spout (which points along +x). */
const SPOUT_REACH = 0.62
const SPOUT_SHARPNESS = 14
/** The lip runs a little lower at the spout, making a channel for the wick. */
const SPOUT_DIP = 0.014

/** Where the thali's dish is, and so where the diya stands. */
export const THALI_TOP = 0.012
/** The wick's burning end, in the diya's own space (the thali's centre is the origin). */
export const WICK_TIP: [number, number, number] = [0.252, THALI_TOP + 0.134, 0]

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
/** 1 at the spout, falling to 0 behind it. */
const spoutAt = (theta: number) => Math.pow(Math.cos(theta / 2), SPOUT_SHARPNESS)
/** The base stays round; the upper wall and rim follow the spout. */
const reachAt = (y: number) => smoothstep(0.03, 0.13, y)

interface Profile {
  points: THREE.Vector2[]
  length: number
  /** The v (0 = base centre, 1 = well centre) of the profile point nearest (x, y). */
  vAt: (x: number, y: number) => number
}

function buildProfile(): Profile {
  const curve = new THREE.SplineCurve(PROFILE.map(([x, y]) => new THREE.Vector2(x, y)))
  const points = curve.getSpacedPoints(PROFILE_STEPS)
  const vAt = (x: number, y: number) => {
    let best = 0
    let bestD = Infinity
    points.forEach((p, i) => {
      const d = (p.x - x) ** 2 + (p.y - y) ** 2
      if (d < bestD) {
        bestD = d
        best = i
      }
    })
    return best / PROFILE_STEPS
  }
  return { points, length: curve.getLength(), vAt }
}

function buildBowl(profile: Profile): THREE.BufferGeometry {
  const rows = PROFILE_STEPS + 1
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  // The seam runs down the back (theta = ±π), away from the spout.
  for (let j = 0; j <= AROUND; j++) {
    const theta = -Math.PI + (j / AROUND) * Math.PI * 2
    const s = spoutAt(theta)
    // Thrown by hand: never quite round.
    const wobble = 0.008 * Math.sin(3 * theta + 0.7) + 0.005 * Math.sin(5 * theta + 2.1)
    profile.points.forEach((p, i) => {
      const w = reachAt(p.y)
      const r = p.x * (1 + SPOUT_REACH * s * w) * (1 + wobble * w)
      const y = p.y - SPOUT_DIP * s * s * w
      positions.push(r * Math.cos(theta), y, -r * Math.sin(theta))
      uvs.push(j / AROUND, i / PROFILE_STEPS)
    })
  }
  for (let j = 0; j < AROUND; j++) {
    for (let i = 0; i < PROFILE_STEPS; i++) {
      const a = j * rows + i
      const b = (j + 1) * rows + i
      indices.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setIndex(indices)
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.computeVertexNormals()
  // Weld the seam's normals, and point the two poles straight down and up.
  const n = geo.attributes.normal as THREE.BufferAttribute
  const v = new THREE.Vector3()
  for (let i = 0; i < rows; i++) {
    const first = i
    const last = AROUND * rows + i
    v.set(n.getX(first) + n.getX(last), n.getY(first) + n.getY(last), n.getZ(first) + n.getZ(last)).normalize()
    n.setXYZ(first, v.x, v.y, v.z)
    n.setXYZ(last, v.x, v.y, v.z)
  }
  for (let j = 0; j <= AROUND; j++) {
    n.setXYZ(j * rows, 0, -1, 0)
    n.setXYZ(j * rows + PROFILE_STEPS, 0, 1, 0)
  }
  return geo
}

/** The pool of oil, following the well's outline at its surface. */
function buildOil(profile: Profile): THREE.BufferGeometry {
  const level = 0.097
  // The inner wall's radius at that height.
  const inner = profile.points.slice(Math.round(PROFILE_STEPS * 0.55))
  let radius = 0.11
  for (let i = 1; i < inner.length; i++) {
    const a = inner[i - 1]
    const b = inner[i]
    if ((a.y - level) * (b.y - level) <= 0 && a.y !== b.y) {
      radius = a.x + ((level - a.y) / (b.y - a.y)) * (b.x - a.x)
      break
    }
  }
  radius *= 0.985
  const shape = new THREE.Shape()
  const w = reachAt(level)
  for (let j = 0; j <= 96; j++) {
    const theta = -Math.PI + (j / 96) * Math.PI * 2
    const r = radius * (1 + SPOUT_REACH * spoutAt(theta) * w)
    const x = r * Math.cos(theta)
    const y = r * Math.sin(theta)
    if (j === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  const geo = new THREE.ShapeGeometry(shape, 24)
  geo.rotateX(-Math.PI / 2)
  geo.translate(0, level - SPOUT_DIP * 0.2, 0)
  return geo
}

/** A twisted cotton batti lying up the spout's channel, its end out over the lip. */
function buildWick(): THREE.BufferGeometry {
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.06, 0.092, 0.006),
    new THREE.Vector3(0.13, 0.098, -0.002),
    new THREE.Vector3(0.19, 0.11, 0.002),
    new THREE.Vector3(0.232, 0.124, 0),
    new THREE.Vector3(WICK_TIP[0], WICK_TIP[1] - THALI_TOP, WICK_TIP[2]),
  ])
  return new THREE.TubeGeometry(path, 40, 0.0078, 10, false)
}

/** A shallow brass thali with a rolled rim. */
function buildThali(): THREE.BufferGeometry {
  const pts: [number, number][] = [
    [0.0, 0.0], [0.18, 0.0], [0.232, 0.004], [0.258, 0.012], [0.274, 0.024], [0.283, 0.032],
    [0.282, 0.037], [0.274, 0.036], [0.262, 0.026], [0.242, 0.016], [0.21, THALI_TOP], [0.0, THALI_TOP],
  ]
  const curve = new THREE.SplineCurve(pts.map(([x, y]) => new THREE.Vector2(x, y)))
  return new THREE.LatheGeometry(curve.getSpacedPoints(48), 96)
}

// ---------------------------------------------------------------- paint -----

const INK = {
  clay: '#a4552f',
  clayDark: '#7c3c1f',
  ground: '#7b1d15',
  groundDeep: '#5a120c',
  ivory: '#f2e4c8',
  gold: '#d8a444',
  goldDeep: '#a8762a',
  leaf: '#3f6a48',
  rose: '#c9566a',
}

type Mode = 'color' | 'bump' | 'surface'

function canvas2d(width: number, height: number) {
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  return { c, ctx: c.getContext('2d') as CanvasRenderingContext2D }
}

/** One lotus: five petals fanned from a gold calyx, on a stem with two leaves. */
function lotus(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, mode: Mode) {
  const petal = (angle: number, len: number, wid: number) => {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(angle)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.bezierCurveTo(-wid, -len * 0.35, -wid * 0.6, -len * 0.85, 0, -len)
    ctx.bezierCurveTo(wid * 0.6, -len * 0.85, wid, -len * 0.35, 0, 0)
    ctx.closePath()
    if (mode === 'color') {
      const g = ctx.createLinearGradient(0, 0, 0, -len)
      g.addColorStop(0, INK.rose)
      g.addColorStop(0.55, INK.ivory)
      g.addColorStop(1, '#fbf1dc')
      ctx.fillStyle = g
    }
    ctx.fill()
    ctx.lineWidth = h * 0.035
    ctx.strokeStyle = mode === 'color' ? INK.gold : ctx.fillStyle
    ctx.stroke()
    // A painted vein down the petal.
    ctx.beginPath()
    ctx.moveTo(0, -len * 0.12)
    ctx.lineTo(0, -len * 0.72)
    ctx.lineWidth = h * 0.018
    ctx.strokeStyle = mode === 'color' ? INK.goldDeep : ctx.strokeStyle
    ctx.stroke()
    ctx.restore()
  }
  // Stem and leaves first, under the flower.
  ctx.save()
  ctx.lineCap = 'round'
  ctx.strokeStyle = mode === 'color' ? INK.leaf : ctx.strokeStyle
  ctx.lineWidth = h * 0.05
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.bezierCurveTo(x - h * 0.06, y + h * 0.2, x + h * 0.05, y + h * 0.32, x, y + h * 0.42)
  ctx.stroke()
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(x, y + h * 0.26)
    ctx.bezierCurveTo(x + side * h * 0.2, y + h * 0.12, x + side * h * 0.42, y + h * 0.22, x + side * h * 0.5, y + h * 0.34)
    ctx.bezierCurveTo(x + side * h * 0.34, y + h * 0.42, x + side * h * 0.14, y + h * 0.38, x, y + h * 0.26)
    ctx.fillStyle = mode === 'color' ? INK.leaf : ctx.fillStyle
    ctx.fill()
  }
  ctx.restore()
  petal(-1.12, h * 0.6, h * 0.2)
  petal(1.12, h * 0.6, h * 0.2)
  petal(-0.56, h * 0.82, h * 0.22)
  petal(0.56, h * 0.82, h * 0.22)
  petal(0, h, h * 0.25)
  // The calyx.
  ctx.beginPath()
  ctx.ellipse(x, y, h * 0.2, h * 0.08, 0, 0, Math.PI)
  ctx.fillStyle = mode === 'color' ? INK.gold : ctx.fillStyle
  ctx.fill()
}

/** A paisley (buta): a teardrop whose tip curls over, filled with a dot and a vein. */
function paisley(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, flip: number, mode: Mode) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(flip, 1)
  ctx.beginPath()
  ctx.moveTo(0, s * 0.5)
  ctx.bezierCurveTo(-s * 0.55, s * 0.5, -s * 0.55, -s * 0.15, -s * 0.1, -s * 0.35)
  ctx.bezierCurveTo(s * 0.2, -s * 0.5, s * 0.35, -s * 0.7, s * 0.15, -s * 0.85)
  ctx.bezierCurveTo(s * 0.6, -s * 0.6, s * 0.55, s * 0.5, 0, s * 0.5)
  ctx.closePath()
  if (mode === 'color') ctx.fillStyle = INK.groundDeep
  ctx.fill()
  ctx.lineWidth = s * 0.07
  if (mode === 'color') ctx.strokeStyle = INK.gold
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(0, s * 0.12, s * 0.13, 0, Math.PI * 2)
  if (mode === 'color') ctx.fillStyle = INK.ivory
  ctx.fill()
  ctx.restore()
}

function dots(ctx: CanvasRenderingContext2D, y: number, width: number, gap: number, r: number) {
  for (let x = gap / 2; x < width; x += gap) {
    ctx.beginPath()
    ctx.arc(x + (Math.random() - 0.5) * gap * 0.08, y, r * (0.85 + Math.random() * 0.3), 0, Math.PI * 2)
    ctx.fill()
  }
}

/**
 * The diya's surface in its own (u around, v along the profile) space: color,
 * relief (paint stands proud of the clay), and surface (roughness in green,
 * metalness in blue, as three.js reads them).
 */
function paintDiya(profile: Profile) {
  const W = 2048
  const H = 1024
  const yOf = (v: number) => (1 - v) * H // a canvas texture's top row is v = 1
  const marks = {
    foot: profile.vAt(0.1, 0.014),
    bandLow: profile.vAt(0.118, 0.032),
    bandHigh: profile.vAt(0.163, 0.106),
    border: profile.vAt(0.168, 0.124),
    rimOut: profile.vAt(0.167, 0.135),
    rimIn: profile.vAt(0.145, 0.137),
  }
  // Painted shapes are drawn to look right on the wall, not in the texture: a
  // unit across the wall spans `squash` times as many pixels as a unit up it.
  const circumference = 2 * Math.PI * 0.15
  const squash = W / circumference / (H / profile.length)
  const band = { top: yOf(marks.bandHigh), bottom: yOf(marks.bandLow) }
  const bandH = band.bottom - band.top
  const MOTIFS = 6

  const layers = (['color', 'bump', 'surface'] as Mode[]).map((mode) => {
    const { c, ctx } = canvas2d(mode === 'color' ? W : W / 2, mode === 'color' ? H : H / 2)
    const k = mode === 'color' ? 1 : 0.5
    ctx.scale(k, k)
    // Base: fired clay (rough, bare), with thrown rings and grain.
    if (mode === 'color') {
      ctx.fillStyle = INK.clay
      ctx.fillRect(0, 0, W, H)
      for (let i = 0; i < 26000; i++) {
        const tone = Math.random()
        ctx.fillStyle = tone < 0.5 ? `rgba(70, 30, 12, ${0.05 + tone * 0.12})` : `rgba(230, 150, 100, ${0.03 + (tone - 0.5) * 0.08})`
        ctx.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 2, 1 + Math.random() * 2)
      }
      for (let i = 0; i < 70; i++) {
        ctx.fillStyle = `rgba(60, 25, 10, ${0.03 + Math.random() * 0.05})`
        ctx.fillRect(0, Math.random() * H, W, 1 + Math.random() * 2)
      }
      // Inside: darkened by oil toward the bottom of the well.
      const well = ctx.createLinearGradient(0, yOf(marks.rimIn), 0, 0)
      well.addColorStop(0, 'rgba(60, 22, 8, 0.25)')
      well.addColorStop(1, 'rgba(25, 10, 4, 0.8)')
      ctx.fillStyle = well
      ctx.fillRect(0, 0, W, yOf(marks.rimIn))
      // Soot where the flame has burned, just inside the spout (u = 0.5).
      const soot = ctx.createRadialGradient(W / 2, yOf(marks.rimIn) - 30, 4, W / 2, yOf(marks.rimIn) - 30, 230)
      soot.addColorStop(0, 'rgba(12, 8, 6, 0.9)')
      soot.addColorStop(1, 'rgba(12, 8, 6, 0)')
      ctx.fillStyle = soot
      ctx.fillRect(W / 2 - 260, 0, 520, yOf(marks.rimIn) + 40)
    } else if (mode === 'bump') {
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, W, H)
    } else {
      ctx.fillStyle = 'rgb(0, 235, 0)' // clay: rough, not metal
      ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = 'rgb(0, 150, 0)' // the oiled well is smoother
      ctx.fillRect(0, 0, W, yOf(marks.rimIn))
    }

    const paint = mode === 'color' ? null : mode === 'bump' ? '#fff' : 'rgb(0, 120, 0)'
    const gilt = mode === 'color' ? INK.gold : mode === 'bump' ? '#fff' : 'rgb(0, 80, 190)'
    const set = (color: string) => {
      ctx.fillStyle = color
      ctx.strokeStyle = color
    }

    // The red ground of the band.
    if (mode === 'color') {
      const g = ctx.createLinearGradient(0, band.top, 0, band.bottom)
      g.addColorStop(0, INK.ground)
      g.addColorStop(1, INK.groundDeep)
      ctx.fillStyle = g
    } else set(mode === 'bump' ? '#444' : paint!)
    ctx.fillRect(0, band.top, W, bandH)

    // Gold borders above and below, a dotted rim, and scallops (little arches) under the band.
    set(gilt)
    ctx.fillRect(0, band.top - 6, W, 10)
    ctx.fillRect(0, band.bottom - 4, W, 10)
    const rimTop = yOf(marks.rimIn)
    const rimBottom = yOf(marks.border)
    ctx.fillRect(0, rimTop, W, rimBottom - rimTop)
    set(mode === 'color' ? INK.ivory : paint!)
    dots(ctx, (rimTop + rimBottom) / 2, W, 26, 5.5)
    dots(ctx, (band.top + rimBottom) / 2, W, 34, 4)
    ctx.lineWidth = 5
    set(gilt)
    const arch = W / (MOTIFS * 6)
    for (let x = 0; x < W; x += arch) {
      ctx.beginPath()
      ctx.arc(x + arch / 2, band.bottom + 6, arch / 2, 0, Math.PI)
      ctx.stroke()
    }

    // Lotuses and paisleys round the band; the spout (u = 0.5) keeps a single gold leaf.
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, band.top + 4, W, bandH - 8)
    ctx.clip()
    for (let m = 0; m < MOTIFS; m++) {
      const cx = ((m + 0.5) / MOTIFS) * W
      const nearSpout = Math.abs(cx - W / 2) < W / MOTIFS / 2
      ctx.save()
      ctx.translate(cx, 0)
      ctx.scale(squash, 1)
      if (nearSpout) {
        set(gilt)
        ctx.beginPath()
        const cy = band.top + bandH * 0.5
        ctx.ellipse(0, cy, bandH * 0.16, bandH * 0.36, 0, 0, Math.PI * 2)
        ctx.fill()
      } else {
        if (paint) set(paint)
        lotus(ctx, 0, band.top + bandH * 0.62, bandH * 0.5, mode)
        if (paint) set(gilt)
        paisley(ctx, W / MOTIFS / 2 / squash, band.top + bandH * 0.5, bandH * 0.36, m % 2 ? 1 : -1, mode)
      }
      ctx.restore()
    }
    ctx.restore()
    return c
  })

  const [color, bump, surface] = layers.map((c, i) => {
    const t = new THREE.CanvasTexture(c)
    if (i === 0) t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    return t
  })
  return { color, bump, surface }
}

/** Engraving on the thali: rings, a band of petals, and a rope edge, in its lathe (u, v) space. */
function paintThali() {
  const W = 1024
  const H = 256
  return (['color', 'bump'] as const).map((mode) => {
    const { c, ctx } = canvas2d(W, H)
    ctx.fillStyle = mode === 'color' ? '#c99152' : '#808080'
    ctx.fillRect(0, 0, W, H)
    if (mode === 'color') {
      // Brushed brass: fine streaks and a little tarnish.
      for (let i = 0; i < 2600; i++) {
        ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '90, 60, 20' : '255, 225, 170'}, ${0.04 + Math.random() * 0.06})`
        ctx.fillRect(Math.random() * W, Math.random() * H, 6 + Math.random() * 30, 1)
      }
    }
    const cut = mode === 'color' ? 'rgba(70, 42, 14, 0.75)' : '#1e1e1e'
    ctx.strokeStyle = cut
    ctx.fillStyle = cut
    // The dish's face is the lower part of the texture (v from 0.55 to 1 runs rim to centre).
    const ring = (y: number, width: number) => {
      ctx.lineWidth = width
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(W, y)
      ctx.stroke()
    }
    ring(H * 0.08, 3)
    ring(H * 0.16, 1.5)
    ring(H * 0.3, 2)
    // Petals fanned around the dish, pointing toward its centre.
    const n = 24
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) / n) * W
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x - W / n / 2.4, H * 0.3)
      ctx.quadraticCurveTo(x, H * 0.02, x + W / n / 2.4, H * 0.3)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(x, H * 0.22, 3, 0, Math.PI * 2)
      ctx.fill()
    }
    // A twisted rope along the rolled rim.
    for (let x = 0; x < W; x += 9) {
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x, H * 0.52)
      ctx.lineTo(x + 7, H * 0.44)
      ctx.stroke()
    }
    const t = new THREE.CanvasTexture(c)
    if (mode === 'color') t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    return t
  })
}

/** The wick's length: oily cotton, then the charred end. */
function paintWick() {
  const { c, ctx } = canvas2d(256, 16)
  const g = ctx.createLinearGradient(0, 0, 256, 0)
  g.addColorStop(0, '#8a6030')
  g.addColorStop(0.45, '#e2d3b6')
  g.addColorStop(0.8, '#cdb894')
  g.addColorStop(0.9, '#2a1a10')
  g.addColorStop(1, '#0c0806')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 16)
  // The twist of the cotton.
  for (let x = 0; x < 256; x += 6) {
    ctx.fillStyle = 'rgba(80, 50, 20, 0.25)'
    ctx.fillRect(x, 0, 2, 16)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

// ---------------------------------------------------------------- flame -----

/** Where the wick sits in the flame images: sprites scale and sway from there. */
const WICK_ANCHOR = new THREE.Vector2(0.5, 0.14)

/** A soft round light, for halos, embers and motes. */
export function paintGlow(ctx: CanvasRenderingContext2D, size: number) {
  const c = size / 2
  const g = ctx.createRadialGradient(c, c, 0, c, c, c)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.18, 'rgba(255,255,255,0.75)')
  g.addColorStop(0.45, 'rgba(255,255,255,0.22)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
}

/**
 * A flame painted soft: a teardrop with a hot base and a fading tip. Seen up
 * close, a solid shape reads as a cartoon; this reads as fire. The wick sits
 * 86% of the way down the image.
 */
function paintFlame(ctx: CanvasRenderingContext2D, size: number, stops: [number, string][], blur: number, girth: number) {
  const cx = size / 2
  const base = size * 0.86
  const tip = size * 0.05
  const r = size * girth
  ctx.save()
  ctx.filter = `blur(${blur}px)`
  const g = ctx.createLinearGradient(0, base + r * 0.4, 0, tip)
  for (const [at, color] of stops) g.addColorStop(at, color)
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(cx, tip)
  ctx.bezierCurveTo(cx + r * 0.2, size * 0.34, cx + r * 1.08, size * 0.56, cx + r, base - r * 0.55)
  ctx.bezierCurveTo(cx + r * 0.95, base + r * 0.55, cx - r * 0.95, base + r * 0.55, cx - r, base - r * 0.55)
  ctx.bezierCurveTo(cx - r * 1.08, size * 0.56, cx - r * 0.2, size * 0.34, cx, tip)
  ctx.fill()
  ctx.restore()
}

function paintedTexture(size: number, paint: (ctx: CanvasRenderingContext2D, size: number) => void) {
  const { c, ctx } = canvas2d(size, size)
  paint(ctx, size)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

// ---------------------------------------------------------------- shared ----

let shared: ReturnType<typeof build> | null = null

function build() {
  const profile = buildProfile()
  const [thaliColor, thaliBump] = paintThali()
  return {
    bowl: buildBowl(profile),
    oil: buildOil(profile),
    wick: buildWick(),
    thali: buildThali(),
    art: paintDiya(profile),
    thaliColor,
    thaliBump,
    wickColor: paintWick(),
    glow: paintedTexture(128, paintGlow),
    flameBody: paintedTexture(256, (ctx, size) =>
      paintFlame(ctx, size, [[0, 'rgba(255,196,120,0.95)'], [0.3, 'rgba(255,152,62,0.9)'], [0.72, 'rgba(236,92,26,0.5)'], [1, 'rgba(200,60,10,0)']], 7, 0.2)
    ),
    flameCore: paintedTexture(256, (ctx, size) =>
      paintFlame(ctx, size, [[0, 'rgba(255,255,248,1)'], [0.38, 'rgba(255,240,196,0.95)'], [0.78, 'rgba(255,206,128,0.3)'], [1, 'rgba(255,180,90,0)']], 4, 0.105)
    ),
    flameFoot: paintedTexture(256, (ctx, size) => {
      const g = ctx.createRadialGradient(size / 2, size * 0.86, 0, size / 2, size * 0.86, size * 0.16)
      g.addColorStop(0, 'rgba(110,160,255,0.85)')
      g.addColorStop(0.6, 'rgba(70,110,255,0.35)')
      g.addColorStop(1, 'rgba(60,90,255,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, size, size)
    }),
  }
}

/**
 * Everything the diya is made of. Built on first use and kept: the stage shows
 * the diya for as long as the room is open, and each canvas uploads its own copy.
 */
export function diyaAssets() {
  if (!shared) shared = build()
  return shared
}

// ---------------------------------------------------------------- parts -----

export interface FlameControls {
  /**
   * @param height the flame's height, in the diya's units
   * @param alpha  0 (out) to 1
   * @param lean   sway, in radians
   * @param flicker a small signed number that stretches and narrows it
   */
  update(height: number, alpha: number, lean: number, flicker: number): void
}

/** The flame, standing on the wick. Its owner drives it through `ref`. */
export function DiyaFlame({ ref }: { ref?: Ref<FlameControls> }) {
  const a = diyaAssets()
  const foot = useRef<THREE.Sprite>(null)
  const body = useRef<THREE.Sprite>(null)
  const core = useRef<THREE.Sprite>(null)
  useImperativeHandle(
    ref,
    () => ({
      update(height, alpha, lean, flicker) {
        if (body.current) {
          body.current.scale.set(height * (1 - 0.35 * flicker), height * (1 + 0.45 * flicker), 1)
          body.current.material.rotation = lean
          body.current.material.opacity = alpha
        }
        if (core.current) {
          core.current.scale.set(height * 0.8 * (1 - 0.2 * flicker), height * 0.86 * (1 + 0.3 * flicker), 1)
          core.current.material.rotation = lean * 0.8
          core.current.material.opacity = alpha
        }
        if (foot.current) {
          foot.current.scale.set(height * 0.9, height * 0.9, 1)
          foot.current.material.opacity = alpha * 0.8
        }
      },
    }),
    []
  )
  return (
    <group position={WICK_TIP}>
      <sprite ref={foot} center={WICK_ANCHOR} scale={[0, 0, 1]} renderOrder={4}>
        <spriteMaterial map={a.flameFoot} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>
      <sprite ref={body} center={WICK_ANCHOR} scale={[0, 0, 1]} renderOrder={5}>
        <spriteMaterial map={a.flameBody} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>
      <sprite ref={core} center={WICK_ANCHOR} scale={[0, 0, 1]} renderOrder={6}>
        <spriteMaterial map={a.flameCore} transparent opacity={0} depthWrite={false} toneMapped={false} />
      </sprite>
    </group>
  )
}

interface ClassicalDiyaProps {
  /** How much the clay and oil glow with their own flame's light. */
  glow?: number
  bowlMaterial?: Ref<THREE.MeshStandardMaterial>
  oilMaterial?: Ref<THREE.MeshStandardMaterial>
  /** The flame, lights: anything that belongs at the diya. */
  children?: ReactNode
}

/** The painted clay diya on its brass thali. Its origin is the thali's centre. */
export function ClassicalDiya({ glow = 0, bowlMaterial, oilMaterial, children }: ClassicalDiyaProps) {
  const a = diyaAssets()
  return (
    <group>
      <mesh geometry={a.thali}>
        <meshStandardMaterial
          map={a.thaliColor}
          bumpMap={a.thaliBump}
          bumpScale={1.2}
          metalness={0.88}
          roughness={0.34}
          side={THREE.DoubleSide}
        />
      </mesh>
      <group position={[0, THALI_TOP, 0]}>
        <mesh geometry={a.bowl}>
          <meshStandardMaterial
            ref={bowlMaterial}
            map={a.art.color}
            bumpMap={a.art.bump}
            bumpScale={1.6}
            roughnessMap={a.art.surface}
            metalnessMap={a.art.surface}
            roughness={1}
            metalness={1}
            emissive="#ff7a24"
            emissiveIntensity={glow}
          />
        </mesh>
        <mesh geometry={a.oil}>
          <meshStandardMaterial
            ref={oilMaterial}
            color="#1e1006"
            roughness={0.04}
            metalness={0.35}
            emissive="#ff9a3c"
            emissiveIntensity={glow * 0.5}
          />
        </mesh>
        <mesh geometry={a.wick}>
          <meshStandardMaterial map={a.wickColor} roughness={0.95} />
        </mesh>
      </group>
      {children}
    </group>
  )
}
