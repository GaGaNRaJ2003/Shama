/**
 * End-to-end check for Mehfil Jam against a running backend.
 *
 * Run:  node test-jam.mjs        (backend must be on :5000)
 *
 * Verifies the guarantees the feature rests on: guests receive the host's
 * state, only the host can change it, position is stamped on the server clock,
 * and a guest can work out where it should be.
 */

import WebSocket from 'ws'

const BASE = process.env.BASE || 'http://localhost:5000'
const WS = BASE.replace(/^http/, 'ws')
const failures = []

const check = (name, cond, detail = '') => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' ' + detail}`)
  if (!cond) failures.push(name)
}

const open = (url) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    ws.once('open', () => resolve(ws))
    ws.once('error', reject)
  })

const next = (ws, type, timeout = 4000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), timeout)
    const onMsg = (raw) => {
      const msg = JSON.parse(String(raw))
      if (msg.type === type) {
        clearTimeout(timer)
        ws.off('message', onMsg)
        resolve(msg)
      }
    }
    ws.on('message', onMsg)
  })

console.log('\n-- Mehfil Jam ------------------------------------------------------')

const created = await fetch(`${BASE}/api/mehfil`, { method: 'POST' })
check('room is created', created.status === 201, `(got ${created.status})`)
const { token, hostKey } = await created.json()
check('token is share-friendly', /^[a-z2-9]{8}$/.test(token), `(got ${token})`)

const host = await open(`${WS}/ws/mehfil?token=${token}&hostKey=${hostKey}`)
const hostWelcome = await next(host, 'welcome')
check('host is recognised as host', hostWelcome.role === 'host', `(got ${hostWelcome.role})`)

const guest = await open(`${WS}/ws/mehfil?token=${token}`)
const guestWelcome = await next(guest, 'welcome')
check('guest joins without any credential', guestWelcome.role === 'guest')
check('guest is told who else is here', guestWelcome.listeners >= 2,
  `(got ${guestWelcome.listeners})`)

// Host starts a ghazal.
const guestState = next(guest, 'state')
host.send(JSON.stringify({
  type: 'state',
  state: {
    videoId: 'abc123XYZ01', positionMs: 42_000, paused: false,
    title: 'Aaj Jaane Ki Zid Na Karo', artist: 'Farida Khanum', durationSeconds: 453,
    queue: [{ title: 'Ranjish Hi Sahi', artist: 'Mehdi Hassan' }],
  },
}))
const received = await guestState
check('guest receives the host state', received.state.videoId === 'abc123XYZ01')
check('title travels', received.state.title === 'Aaj Jaane Ki Zid Na Karo')
check('queue travels', received.state.queue?.[0]?.title === 'Ranjish Hi Sahi')
// Guests match lyrics with the same evidence the host had; without duration
// their lookup is duration-blind and can pick the wrong rendition.
check('duration travels to guests', received.state.durationSeconds === 453,
  `(got ${received.state.durationSeconds})`)
check('server stamps its own clock', typeof received.serverNow === 'number')
check('updatedAt is server-side, not client-supplied',
  Math.abs(received.state.updatedAt - received.serverNow) < 1000,
  `(updatedAt ${received.state.updatedAt}, serverNow ${received.serverNow})`)

// Drift maths a guest performs.
const skew = received.serverNow - Date.now()
await new Promise((r) => setTimeout(r, 1200))
const expected = received.state.positionMs + Math.max(0, Date.now() + skew - received.state.updatedAt)
check('expected position advances with wall clock',
  expected > 43_000 && expected < 44_500, `(got ${Math.round(expected)}ms)`)

// A guest must not be able to drive the room.
let hostSawGuestWrite = false
host.on('message', (raw) => {
  const m = JSON.parse(String(raw))
  if (m.type === 'state' && m.state.videoId === 'GUEST_HIJACK') hostSawGuestWrite = true
})
guest.send(JSON.stringify({
  type: 'state',
  state: { videoId: 'GUEST_HIJACK', positionMs: 0, paused: true, title: 'x', artist: 'y', queue: [] },
}))
await new Promise((r) => setTimeout(r, 600))
check('guest cannot change what is playing', !hostSawGuestWrite)

const summary = await (await fetch(`${BASE}/api/mehfil/${token}`)).json()
check('state survives on the server', summary.state.videoId === 'abc123XYZ01')
check('listener count is reported', summary.listeners === 2, `(got ${summary.listeners})`)

// A late guest is caught up on arrival.
const late = await open(`${WS}/ws/mehfil?token=${token}`)
const lateWelcome = await next(late, 'welcome')
check('a guest joining mid-ghazal lands in the right place',
  lateWelcome.state.videoId === 'abc123XYZ01' && lateWelcome.state.positionMs === 42_000)

const missing = await fetch(`${BASE}/api/mehfil/doesnotex`)
check('unknown mehfil is a clean 404', missing.status === 404, `(got ${missing.status})`)

for (const s of [host, guest, late]) s.close()

console.log()
if (failures.length) {
  console.log(`${failures.length} FAILED: ${failures.join(', ')}`)
  process.exit(1)
}
console.log('All Mehfil Jam tests passed.')
