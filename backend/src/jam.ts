/**
 * Mehfil Jam — listening together, without accounts.
 *
 * One person starts a mehfil and shares the link. Everyone who opens it hears
 * the same ghazal at the same moment. There is no signup, no profile and no
 * audio relay: each browser plays its *own* YouTube stream and we synchronise
 * only what is playing and where we are in it.
 *
 * The host is whoever created the room (proved by a `hostKey` only they hold).
 * Guests follow. Rooms live in memory and expire after everyone leaves.
 */

import type { Server } from 'node:http'
import { randomBytes } from 'node:crypto'
import { WebSocketServer, WebSocket } from 'ws'

export interface JamState {
  videoId: string | null
  /** Milliseconds into the track at the moment `updatedAt` was stamped. */
  positionMs: number
  paused: boolean
  title: string
  artist: string
  /** Track length in seconds. Guests need it to match lyrics as well as the
      host does — without it their lyric lookup is duration-blind. */
  durationSeconds: number
  /** Server clock, so guests never have to trust each other's clocks. */
  updatedAt: number
  queue: { title: string; artist: string }[]
  /** Which of `queue` is playing, or -1. */
  queueIndex: number
}

/** Someone in the room, as everyone else sees them. */
export interface Member {
  id: string
  name: string
  host: boolean
}

/**
 * A guest asking the host to add something to the queue. Guests can't play
 * anything themselves; this is how they take part in choosing.
 */
export interface SongRequest {
  id: string
  /** The member who asked, and what they were called at the time. */
  from: string
  fromName: string
  kind: 'work' | 'recording'
  /** A Library ghazal. */
  workId?: string
  /** A YouTube recording found in Explore. */
  videoId?: string
  title: string
  artist: string
  status: 'pending' | 'added' | 'declined'
  at: number
}

interface Room {
  token: string
  hostKey: string
  state: JamState
  sockets: Set<WebSocket>
  members: Map<WebSocket, Member>
  requests: SongRequest[]
  hostSocket: WebSocket | null
  createdAt: number
  emptySince: number | null
}

const rooms = new Map<string, Room>()

// Long enough to survive a refresh or a dropped connection, short enough that
// abandoned rooms don't accumulate.
const EMPTY_ROOM_TTL_MS = 30 * 60 * 1000
const MAX_ROOM_AGE_MS = 12 * 60 * 60 * 1000

const NAME_MAX = 24
const REQUESTS_MAX = 60
/** Waiting requests one guest may have at a time. */
const PENDING_PER_GUEST = 5
const WORK_ID = /^[A-Za-z0-9_-]{1,40}$/
const VIDEO_ID = /^[A-Za-z0-9_-]{6,20}$/

/** A nickname as typed: no control or format characters, single spaces, and short. */
function cleanName(raw: unknown): string {
  return String(raw ?? '')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX)
}

/** Ambiguous characters removed: these get read aloud and typed by hand. */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

function makeToken(length = 8): string {
  const bytes = randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length]
  return out
}

function emptyState(): JamState {
  return {
    videoId: null,
    positionMs: 0,
    paused: true,
    title: '',
    artist: '',
    durationSeconds: 0,
    updatedAt: Date.now(),
    queue: [],
    queueIndex: -1,
  }
}

export function createRoom(): { token: string; hostKey: string } {
  let token = makeToken()
  while (rooms.has(token)) token = makeToken()
  const hostKey = randomBytes(16).toString('hex')
  rooms.set(token, {
    token,
    hostKey,
    state: emptyState(),
    sockets: new Set(),
    members: new Map(),
    requests: [],
    hostSocket: null,
    createdAt: Date.now(),
    emptySince: null,
  })
  return { token, hostKey }
}

export function roomSummary(token: string) {
  const room = rooms.get(token)
  if (!room) return null
  return {
    token: room.token,
    listeners: room.sockets.size,
    hasHost: !!room.hostSocket,
    state: room.state,
    serverNow: Date.now(),
  }
}

function broadcast(room: Room, payload: unknown, except?: WebSocket) {
  const msg = JSON.stringify(payload)
  for (const socket of room.sockets) {
    if (socket !== except && socket.readyState === WebSocket.OPEN) socket.send(msg)
  }
}

/** The host first, then everyone in the order they arrived. */
function memberList(room: Room): Member[] {
  const all = Array.from(room.members.values())
  return [...all.filter((m) => m.host), ...all.filter((m) => !m.host)]
}

/** Everyone sees the requests: the host to act on them, guests to follow theirs. */
function sendRequests(room: Room) {
  broadcast(room, { type: 'requests', requests: room.requests })
}

/** A guest's request as sent, checked; null if it doesn't describe something playable. */
function readRequest(raw: any): Pick<SongRequest, 'kind' | 'workId' | 'videoId' | 'title' | 'artist'> | null {
  const title = String(raw?.title ?? '').slice(0, 300).trim()
  const artist = String(raw?.artist ?? '').slice(0, 300).trim()
  if (!title) return null
  if (raw?.kind === 'work' && typeof raw.workId === 'string' && WORK_ID.test(raw.workId)) {
    return { kind: 'work', workId: raw.workId, title, artist }
  }
  if (raw?.kind === 'recording' && typeof raw.videoId === 'string' && VIDEO_ID.test(raw.videoId)) {
    return { kind: 'recording', videoId: raw.videoId, title, artist }
  }
  return null
}

function presence(room: Room) {
  broadcast(room, {
    type: 'presence',
    listeners: room.sockets.size,
    hasHost: !!room.hostSocket,
    members: memberList(room),
  })
}

// Reap rooms nobody is in.
setInterval(() => {
  const now = Date.now()
  for (const [token, room] of rooms) {
    const abandoned = room.emptySince !== null && now - room.emptySince > EMPTY_ROOM_TTL_MS
    if (abandoned || now - room.createdAt > MAX_ROOM_AGE_MS) rooms.delete(token)
  }
}, 60_000).unref()

export function attachJam(server: Server, path = '/ws/mehfil') {
  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (req, socket, head) => {
    let url: URL
    try {
      url = new URL(req.url || '', `http://${req.headers.host}`)
    } catch {
      socket.destroy()
      return
    }
    if (url.pathname !== path) {
      // This is the only 'upgrade' listener, so nothing else will answer:
      // returning silently left the socket open until the client gave up.
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }

    const token = (url.searchParams.get('token') || '').toLowerCase()
    const room = rooms.get(token)
    if (!room) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
      socket.destroy()
      return
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      const isHost = url.searchParams.get('hostKey') === room.hostKey
      joinRoom(room, ws, isHost, cleanName(url.searchParams.get('name')))
    })
  })

  return wss
}

function joinRoom(room: Room, ws: WebSocket, isHost: boolean, name: string) {
  room.sockets.add(ws)
  room.emptySince = null
  if (isHost) room.hostSocket = ws
  const me: Member = { id: makeToken(6), name: name || (isHost ? 'Host' : 'Guest'), host: isHost }
  room.members.set(ws, me)

  ws.send(
    JSON.stringify({
      type: 'welcome',
      role: isHost ? 'host' : 'guest',
      token: room.token,
      state: room.state,
      serverNow: Date.now(),
      listeners: room.sockets.size,
      you: me.id,
      members: memberList(room),
      requests: room.requests,
    })
  )
  presence(room)

  ws.on('message', (raw) => {
    let msg: any
    try {
      msg = JSON.parse(String(raw))
    } catch {
      return
    }

    // Only the host may drive playback. Guests can ask for the current state
    // (e.g. after a reconnect) but cannot change it.
    if (msg?.type === 'state') {
      if (ws !== room.hostSocket) return
      const incoming = msg.state || {}
      room.state = {
        videoId: typeof incoming.videoId === 'string' ? incoming.videoId : null,
        positionMs: Math.max(0, Number(incoming.positionMs) || 0),
        paused: !!incoming.paused,
        title: String(incoming.title || '').slice(0, 300),
        artist: String(incoming.artist || '').slice(0, 300),
        durationSeconds: Math.max(0, Number(incoming.durationSeconds) || 0),
        // Stamped here, never by the client: guest clocks disagree with each
        // other and drift correction depends on a single reference.
        updatedAt: Date.now(),
        queue: Array.isArray(incoming.queue)
          ? incoming.queue.slice(0, 50).map((q: any) => ({
              title: String(q?.title || '').slice(0, 300),
              artist: String(q?.artist || '').slice(0, 300),
            }))
          : [],
        queueIndex: Number.isInteger(incoming.queueIndex) ? Math.max(-1, Math.min(49, incoming.queueIndex)) : -1,
      }
      broadcast(room, { type: 'state', state: room.state, serverNow: Date.now() }, ws)
      return
    }

    // Anyone may change what they are called.
    if (msg?.type === 'name') {
      const name = cleanName(msg.name)
      if (name && name !== me.name) {
        me.name = name
        presence(room)
      }
      return
    }

    // A guest asks for something to be added.
    if (msg?.type === 'request') {
      if (ws === room.hostSocket) return
      const wanted = readRequest(msg.request)
      if (!wanted) return
      const mine = room.requests.filter((r) => r.from === me.id && r.status === 'pending')
      const same = (r: SongRequest) =>
        r.kind === wanted.kind && (wanted.kind === 'work' ? r.workId === wanted.workId : r.videoId === wanted.videoId)
      if (mine.some(same) || mine.length >= PENDING_PER_GUEST) return
      room.requests.push({ id: makeToken(8), from: me.id, fromName: me.name, status: 'pending', at: Date.now(), ...wanted })
      // Past the limit, answered requests go first, then the oldest.
      while (room.requests.length > REQUESTS_MAX) {
        const done = room.requests.findIndex((r) => r.status !== 'pending')
        room.requests.splice(done >= 0 ? done : 0, 1)
      }
      sendRequests(room)
      return
    }

    // The host adds or declines it.
    if (msg?.type === 'resolve') {
      if (ws !== room.hostSocket) return
      const request = room.requests.find((r) => r.id === msg.id)
      if (!request || request.status !== 'pending') return
      request.status = msg.accept ? 'added' : 'declined'
      sendRequests(room)
      return
    }

    // A guest takes back a request still waiting.
    if (msg?.type === 'withdraw') {
      const index = room.requests.findIndex((r) => r.id === msg.id && r.from === me.id && r.status === 'pending')
      if (index < 0) return
      room.requests.splice(index, 1)
      sendRequests(room)
      return
    }

    if (msg?.type === 'sync') {
      ws.send(JSON.stringify({ type: 'state', state: room.state, serverNow: Date.now() }))
    }
  })

  const leave = () => {
    room.sockets.delete(ws)
    room.members.delete(ws)
    if (room.hostSocket === ws) room.hostSocket = null
    if (room.sockets.size === 0) room.emptySince = Date.now()
    else presence(room)
  }
  ws.on('close', leave)
  ws.on('error', leave)
}
