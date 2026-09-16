// First import, deliberately: it loads the repo-root .env before any module
// below reads process.env.
import './lib/env.js'
import express from 'express'
import cors from 'cors'
import { supabase, isDbConfigured } from './lib/supabase.js'
import { attachJam, createRoom, roomSummary } from './jam.js'

const app = express()
// NOT `PORT`: the shared root .env sets PORT=8000 for the Python services, so
// reading it here would move the API on top of the YT bridge.
const PORT = Number(process.env.BACKEND_PORT) || 5000

// Location of the Python `ytmusicapi` bridge service (see /ytmusic-service).
const YT_SERVICE_URL = (process.env.YT_SERVICE_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '')

// Location of the ML Engine (meaning + TTS) service (see /ml-engine).
const ML_ENGINE_URL = (process.env.ML_ENGINE_URL || 'http://127.0.0.1:8001').replace(/\/+$/, '')

// Outbound calls need a deadline: undici applies none, so a slow upstream
// pins an Express request (and its socket) indefinitely.
const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS) || 30_000
const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS) || 60_000
const MAX_THUMB_BYTES = 5 * 1024 * 1024

const fetchUpstream = (url: string, init: RequestInit = {}, timeoutMs = UPSTREAM_TIMEOUT_MS) =>
  fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000,http://127.0.0.1:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

app.use(
  cors({
    // Previously `cors()` — wildcard on every route, including the ones that
    // spend metered ElevenLabs and LLM credit.
    origin: (origin, cb) =>
      !origin || allowedOrigins.includes(origin) ? cb(null, true) : cb(null, false),
  })
)
app.use(express.json({ limit: '64kb' }))

/**
 * Minimal fixed-window limiter. These routes proxy metered third parties
 * (ElevenLabs is 10k characters/month) and an unofficial YouTube API that will
 * ban the host IP, so they cannot stay unauthenticated *and* unlimited.
 */
const hits = new Map<string, { count: number; resetAt: number }>()
// Buckets are keyed by route name, not req.path: Express matches routes
// case-insensitively and with an optional trailing slash, so keying on the
// spelling handed every variant of a path its own fresh bucket.
const rateLimit = (name: string, limit: number, windowMs: number) =>
  (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const key = `${name}|${req.ip}`
    const now = Date.now()
    const entry = hits.get(key)
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs })
      return next()
    }
    if (entry.count >= limit) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000))
      return res.status(429).json({ error: 'Too many requests. Please slow down.' })
    }
    entry.count += 1
    next()
  }

// Keep the map from growing without bound on a long-lived process.
setInterval(() => {
  const now = Date.now()
  for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k)
}, 60_000).unref()

// Mock catalog data for fallback mode
const mockCatalog = [
  {
    id: '01',
    title: 'Dil-e-Nadaan Tujhe',
    artist: 'Jagjit & Chitra Singh',
    poet: 'Mirza Ghalib',
    form: 'Ghazal',
    audioUrl: 'https://ia801902.us.archive.org/30/items/mirza-ghalib-tv-serial-complete-all-ghazals-jagjit-singh-original/01%20-%20Dil-E-Nadaan%20Tujhe%20Hua%20Kya%20Hai.mp3',
    coverUrl: '/cover_01.png',
    lines: [
      {
        id: 'L01',
        urdu: 'دلِ ناداں تجھے ہوا کیا ہے',
        hindi: 'दिल-ए-नादाँ तुझे हुआ क्या है',
        roman: 'dil-e-nadaan tujhe hua kya hai',
        englishText: 'O innocent heart, what has happened to you?',
        transliteration: 'Dil-e-nādān tujhe huā kyā hai',
        translation: 'O naive, innocent heart, what is wrong with you?',
        simple: 'The poet addresses their own foolish, innocent heart, questioning its sudden state of longing and agitation.',
        detailed: 'Ghalib uses "dil-e-nadaan" (foolish/innocent heart) to create a dialogic tension between rational intellect and irrational emotion. It establishes a sense of helpless self-reflection.',
        vocabulary: [
          { term: 'Dil-e-nadaan', meaning: 'Innocent, naive, or foolish heart' },
          { term: 'Tujhe', meaning: 'To you' },
          { term: 'Hua kya hai', meaning: 'What has happened' }
        ]
      },
      {
        id: 'L02',
        urdu: 'آخر اس درد کی دوا کیا ہے',
        hindi: 'آخِر اس درد کی دوا کیا ہے',
        roman: 'aakhir is dard ki dawa kya hai',
        englishText: 'What cure can there finally be for this ache?',
        transliteration: 'Ākhir is dard kī dawā kyā hai',
        translation: 'What cure is there, ultimately, for this pain?',
        simple: 'The poet asks what remedy could possibly soothe the emotional ache of longing that they feel.',
        detailed: 'The word "dawa" (cure/medicine) contrasts with "dard" (emotional pain). Ghalib asks a rhetorical question, knowing that the pain of love and existence has no earthly cure.',
        vocabulary: [
          { term: 'Aakhir', meaning: 'After all, finally, or ultimately' },
          { term: 'Dard', meaning: 'Pain or heartache' },
          { term: 'Dawa', meaning: 'Cure, medicine, or remedy' }
        ]
      }
    ]
  },
  {
    id: '02',
    title: 'Aaj Jaane Ki Zid',
    artist: 'Farida Khanum',
    poet: 'Fayyaz Hashmi',
    form: 'Geet / Ghazal',
    audioUrl: 'https://ia800104.us.archive.org/15/items/FaridaKhanumAajJaaneKiZidNaKaro/FaridaKhanum-AajJaaneKiZidNaKaro.mp3',
    coverUrl: '/cover_02.png',
    lines: [
      {
        id: 'L03',
        urdu: 'آج جانے کی ضد نہ کرو',
        hindi: 'आज जाने की ज़िद न करो',
        roman: 'aaj jaane ki zid na karo',
        englishText: 'Do not insist on leaving tonight',
        transliteration: 'Āj jāne kī zid na karo',
        translation: 'Do not insist on leaving today/tonight.',
        simple: 'A gentle plea to the beloved to stay a little longer, begging them not to insist on departing.',
        detailed: 'The refrain "zid na karo" represents the emotional desperation of the lover. The poem uses immediate conversational Hindi/Urdu which makes it deeply relatable.',
        vocabulary: [
          { term: 'Aaj', meaning: 'Today / Tonight' },
          { term: 'Jaane ki', meaning: 'Of leaving / departing' },
          { term: 'Zid', meaning: 'Obstinacy, insistence, or stubborn demand' }
        ]
      },
      {
        id: 'L04',
        urdu: 'یوں ہی پہلو میں بیٹھے رہو',
        hindi: 'यूॅं ہی पहलू में बैठे रहो',
        roman: 'yoon hi pehlu mein baithe raho',
        englishText: 'Just keep sitting close beside me',
        transliteration: 'Yūñ hī pehlū meñ baiṭhe raho',
        translation: 'Just keep sitting by my side like this.',
        simple: 'Asking the beloved to remain close, sitting side-by-side, sharing the physical space of intimacy.',
        detailed: '"Pehlu" literally means side, flank, or lap. To sit in the "pehlu" is a classic South Asian idiom of romantic and protective proximity, symbolizing safety and affection.',
        vocabulary: [
          { term: 'Yoon hi', meaning: 'Just like this, casually' },
          { term: 'Pehlu', meaning: 'Flank, side, lap, or close proximity' },
          { term: 'Baithe raho', meaning: 'Keep sitting' }
        ]
      }
    ]
  },
  {
    id: '03',
    title: 'Gulon Mein Rang Bhare',
    artist: 'Mehdi Hassan',
    poet: 'Faiz Ahmed Faiz',
    form: 'Ghazal',
    audioUrl: 'https://ia803407.us.archive.org/15/items/MehdiHassanGulonMeinRangBhare/MehdiHassan-GulonMeinRangBhare.mp3',
    coverUrl: '/cover_03.png',
    lines: [
      {
        id: 'L05',
        urdu: 'گلوں میں رنگ بھرے بادِ نوبہار چلے',
        hindi: 'गुलों में रंग भरे बाद-ए-नौबहार चले',
        roman: 'gulon mein rang bhare baad-e-naubahar chale',
        englishText: 'Let the flowers fill with color, let the spring breeze blow',
        transliteration: 'Gulōñ meñ raṅg bhare bād-e-naubahār chale',
        translation: 'May the flowers fill with color, and the spring breeze start blowing.',
        simple: 'The poet wishes for spring to return to the garden, hoping the flowers bloom and the wind refreshes the earth.',
        detailed: 'Written while Faiz was imprisoned, this verse operates on two levels: a romantic longing for the beloved and a revolutionary call for political awakening (spring) to revive the nation (garden).',
        vocabulary: [
          { term: 'Gulon', meaning: 'Flowers' },
          { term: 'Rang bhare', meaning: 'Fill with color' },
          { term: 'Baad-e-naubahar', meaning: 'Breeze of early spring' },
          { term: 'Chale', meaning: 'Let it move / blow' }
        ]
      },
      {
        id: 'L06',
        urdu: 'چلے بھی آؤ کہ گلشن کا کاروبار چلے',
        hindi: 'چلے भी आओ कि गुलशन का कारोबार चले',
        roman: 'chale bhi aao ke gulshan ka karobar chale',
        englishText: 'Come back now, so the business of the garden can resume',
        transliteration: 'Chale bhī āo ke gulshan kā kārobār chale',
        translation: 'Come back, so that the normal business of the garden may proceed.',
        simple: 'Imploring the beloved to return, because without them, the beauty of the garden is idle and lifeless.',
        detailed: 'The phrase "gulshan ka karobar" (the business of the garden) is an ironic, beautiful coupling of commerce and nature. It signifies that the poet’s entire universe remains halted until the beloved returns.',
        vocabulary: [
          { term: 'Chale aao', meaning: 'Come along / return' },
          { term: 'Gulshan', meaning: 'Garden / homeland' },
          { term: 'Karobar', meaning: 'Business, affairs, or daily commerce' }
        ]
      }
    ]
  }
]

// ---------------------------------------------------------------------------
// Mehfil Jam — listen together over a shared link, no accounts.
// ---------------------------------------------------------------------------

// POST /api/mehfil — start a mehfil. The caller keeps `hostKey` (it is what
// proves they may drive playback) and shares only the token.
app.post('/api/mehfil', rateLimit('mehfil-create', 20, 60_000), (_req, res) => {
  const { token, hostKey } = createRoom()
  res.status(201).json({ token, hostKey })
})

// GET /api/mehfil/:token — does this mehfil exist, and what is playing?
app.get('/api/mehfil/:token', (req, res) => {
  const summary = roomSummary(String(req.params.token || '').toLowerCase())
  if (!summary) return res.status(404).json({ error: 'That mehfil has ended.' })
  res.json(summary)
})

// GET /health — liveness for THIS gateway. (/api/ml/health probes a different
// service, so a load balancer pointed at it was testing the ML engine.)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'shama-api', db: isDbConfigured })
})

/**
 * The catalogue as a brief list. Used when Supabase is unconfigured AND when a
 * configured Supabase can't answer — the `works` table does not exist on the
 * current project (`PGRST205`), and a reader should get the catalogue rather
 * than an error either way.
 */
const briefMockWorks = () =>
  mockCatalog.map((w) => ({
    id: w.id,
    title: w.title,
    artist: w.artist,
    poet: w.poet,
    form: w.form,
    audioUrl: w.audioUrl,
    coverUrl: w.coverUrl,
  }))

// API Routes
app.get('/api/works', async (req, res) => {
  try {
    if (isDbConfigured) {
      const { data: works, error } = await supabase
        .from('works')
        .select('id, title, artist, poet, form, audio_url, cover_url')
      if (error) {
        // Configured but unusable (missing table, RLS, outage). Serve the
        // catalogue rather than failing the page.
        console.warn('[WORKS] Supabase query failed, serving local catalog:', error.message)
        return res.json(briefMockWorks())
      }
      return res.json(works)
    }
    return res.json(briefMockWorks())
  } catch (err: any) {
    console.error('Error fetching works:', err.message)
    return res.json(briefMockWorks())
  }
})

app.get('/api/works/:id', async (req, res) => {
  const { id } = req.params
  try {
    if (isDbConfigured) {
      // Fetch work header
      const { data: work, error: workErr } = await supabase
        .from('works')
        .select('*')
        .eq('id', id)
        .single()

      if (workErr || !work) {
        // Same reasoning as the list route: fall back rather than 404 a work
        // the local catalogue can serve perfectly well.
        const local = mockCatalog.find((w) => w.id === id)
        if (local) return res.json(local)
        return res.status(404).json({ error: 'Work not found.' })
      }

      // Fetch related lines
      const { data: lines, error: linesErr } = await supabase
        .from('lines')
        .select('*')
        .eq('work_id', id)
        .order('id', { ascending: true })

      if (linesErr) {
        throw new Error(linesErr.message)
      }

      return res.json({ ...work, lines })
    } else {
      const work = mockCatalog.find(w => w.id === id)
      if (!work) {
        return res.status(404).json({ error: 'Work not found.' })
      }
      return res.json(work)
    }
  } catch (err: any) {
    console.error(`Error fetching work details for ID ${id}:`, err.message)
    const local = mockCatalog.find((w) => w.id === id)
    if (local) return res.json(local)
    return res.status(500).json({ error: 'Failed to fetch work details.' })
  }
})

// ---------------------------------------------------------------------------
// ML Engine bridge (proxies the Python ML service in /ml-engine)
// Provides AI-powered meaning interpretation and TTS narration.
// ---------------------------------------------------------------------------

const mlUnavailable = (res: express.Response, err: any) => {
  // The reason is logged, never returned: this body reaches the browser, and
  // shell instructions are not something a listener should ever be shown.
  console.error('[ML_BRIDGE] Upstream error:', err?.message || err)
  const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError'
  return res.status(504 * Number(timedOut) || 503).json({
    error: timedOut ? 'That took too long. Please try again.' : 'That service is unavailable.',
  })
}

// POST /api/meaning — Couplet interpretation
app.post('/api/meaning', rateLimit('meaning', 30, 60_000), async (req, res) => {
  try {
    const upstream = await fetchUpstream(`${ML_ENGINE_URL}/api/meaning`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    }, LLM_TIMEOUT_MS)
    const data = await upstream.json()
    return res.status(upstream.status).json(data)
  } catch (err) {
    return mlUnavailable(res, err)
  }
})

// POST /api/tts — Text-to-speech narration
app.post('/api/tts', rateLimit('tts', 10, 60_000), async (req, res) => {
  try {
    const upstream = await fetchUpstream(`${ML_ENGINE_URL}/api/tts`, {
      method: 'POST',
      // Every call reaches the ML engine from this process, so without the
      // real client its limiter is one bucket shared by every listener.
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': req.ip || '' },
      body: JSON.stringify(req.body),
    })
    const data = await upstream.json()
    return res.status(upstream.status).json(data)
  } catch (err) {
    return mlUnavailable(res, err)
  }
})

// POST /api/split-lyrics — Intelligent lyrics couplet segmentation
app.post('/api/split-lyrics', rateLimit('split-lyrics', 30, 60_000), async (req, res) => {
  try {
    const upstream = await fetchUpstream(`${ML_ENGINE_URL}/api/split-lyrics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    })
    const data = await upstream.json()
    return res.status(upstream.status).json(data)
  } catch (err) {
    return mlUnavailable(res, err)
  }
})

// POST /api/align-couplets — derive couplet timings from synced lyrics
app.post('/api/align-couplets', rateLimit('align-couplets', 30, 60_000), async (req, res) => {
  try {
    const upstream = await fetchUpstream(`${ML_ENGINE_URL}/api/align-couplets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    })
    const data = await upstream.json()
    return res.status(upstream.status).json(data)
  } catch (err) {
    return mlUnavailable(res, err)
  }
})

// GET /api/ml/health — ML Engine health check
app.get('/api/ml/health', async (req, res) => {
  try {
    const upstream = await fetchUpstream(`${ML_ENGINE_URL}/health`, {}, 10_000)
    const data = await upstream.json()
    return res.status(upstream.status).json(data)
  } catch (err) {
    return mlUnavailable(res, err)
  }
})

// ---------------------------------------------------------------------------
// YT Music bridge (proxies the Python `ytmusicapi` service in /ytmusic-service)
// Keeping these behind the Express origin means the frontend only talks to one
// host and thumbnails come back CORS-clean for use as WebGL textures.
// ---------------------------------------------------------------------------

const ytUnavailable = (res: express.Response, err: any) => {
  console.error('[YT_BRIDGE] Upstream error:', err?.message || err)
  const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError'
  return res.status(504 * Number(timedOut) || 503).json({
    error: timedOut ? 'That took too long. Please try again.' : 'Search is unavailable right now.',
    results: []
  })
}

// GET /api/yt/search?q=...&limit=...
app.get('/api/yt/search', rateLimit('yt-search', 40, 60_000), async (req, res) => {
  const q = String(req.query.q || '').trim()
  if (!q) return res.status(400).json({ error: 'Missing query parameter "q".', results: [] })
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 40)
  try {
    const upstream = await fetchUpstream(
      `${YT_SERVICE_URL}/search?q=${encodeURIComponent(q)}&limit=${limit}`
    )
    const data = await upstream.json()
    return res.status(upstream.status).json(data)
  } catch (err) {
    return ytUnavailable(res, err)
  }
})

// GET /api/yt/resolve?title=&artist= — which recording IS this ghazal?
// Returns a `best` only when confident; otherwise candidates for a human to pick.
app.get('/api/yt/resolve', rateLimit('yt-resolve', 40, 60_000), async (req, res) => {
  const title = String(req.query.title || '').trim()
  if (!title) return res.status(400).json({ error: 'Missing "title".', candidates: [] })
  const artist = String(req.query.artist || '').trim()
  try {
    const params = new URLSearchParams({ title })
    if (artist) params.set('artist', artist)
    const upstream = await fetchUpstream(`${YT_SERVICE_URL}/resolve?${params.toString()}`)
    const data = await upstream.json()
    return res.status(upstream.status).json(data)
  } catch (err) {
    return ytUnavailable(res, err)
  }
})

// GET /api/yt/lyrics/search?title=...&artist=... (LRCLIB synced lyrics)
app.get('/api/yt/lyrics/search', rateLimit('yt-lyrics-search', 60, 60_000), async (req, res) => {
  const title = String(req.query.title || '').trim()
  const artist = String(req.query.artist || '').trim()
  // Duration is the strongest signal that an LRC file belongs to THIS
  // recording rather than another rendition of the same ghazal.
  const duration = Number(req.query.duration) || 0
  const album = String(req.query.album || '').trim()
  if (!title && !artist) {
    return res.status(400).json({ error: 'Provide at least title or artist.', hasLyrics: false })
  }
  try {
    const params = new URLSearchParams()
    if (title) params.set('title', title)
    if (artist) params.set('artist', artist)
    if (duration > 0) params.set('duration', String(duration))
    if (album) params.set('album', album)
    const upstream = await fetchUpstream(
      `${YT_SERVICE_URL}/lyrics/search?${params.toString()}`
    )
    const data = await upstream.json()
    return res.status(upstream.status).json(data)
  } catch (err) {
    return ytUnavailable(res, err)
  }
})

// GET /api/yt/lyrics/:videoId
app.get('/api/yt/lyrics/:videoId', rateLimit('yt-lyrics-video', 60, 60_000), async (req, res) => {
  const videoId = String(req.params.videoId || '')
  // A YouTube video id is exactly this shape; anything else is not worth a
  // round-trip to the bridge.
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: 'Invalid video id.', hasLyrics: false })
  }
  try {
    const upstream = await fetchUpstream(
      `${YT_SERVICE_URL}/lyrics/${encodeURIComponent(videoId)}`
    )
    const data = await upstream.json()
    return res.status(upstream.status).json(data)
  } catch (err) {
    return ytUnavailable(res, err)
  }
})

// GET /api/yt/thumb?u=<encoded image url>
// Re-serves a YouTube thumbnail through our origin with permissive CORS so the
// three.js TextureLoader can use it on the vinyl label without tainting the canvas.
app.get('/api/yt/thumb', rateLimit('yt-thumb', 200, 60_000), async (req, res) => {
  const u = String(req.query.u || '')
  // Anchored to a real domain boundary. The previous `[a-z0-9.-]*` matched by
  // substring, so `https://evil-ytimg.com/payload` was accepted and re-served
  // from our origin with permissive CORS.
  if (!/^https:\/\/([a-z0-9-]+\.)*(ytimg\.com|ggpht\.com|googleusercontent\.com)\/[^\s]*$/i.test(u)) {
    return res.status(400).json({ error: 'Only YouTube image hosts are allowed.' })
  }
  try {
    const upstream = await fetchUpstream(u, {}, 10_000)
    if (!upstream.ok || !upstream.body) {
      return res.status(502).json({ error: 'Failed to fetch thumbnail.' })
    }
    const declared = Number(upstream.headers.get('content-length') || 0)
    if (declared > MAX_THUMB_BYTES) {
      return res.status(413).json({ error: 'Thumbnail too large.' })
    }
    const type = upstream.headers.get('content-type') || ''
    // Never let our origin vouch for non-image bytes.
    if (!type.startsWith('image/')) {
      return res.status(415).json({ error: 'Not an image.' })
    }
    // Counted as it arrives: with no (or an understated) content-length, the
    // whole body used to be buffered before the size check could run.
    const reader = upstream.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_THUMB_BYTES) {
        await reader.cancel()
        return res.status(413).json({ error: 'Thumbnail too large.' })
      }
      chunks.push(value)
    }
    const buffer = Buffer.concat(chunks)
    // Wildcard is load-bearing here: three.js needs an untainted canvas for
    // the vinyl label texture.
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Content-Type', type)
    res.setHeader('Cache-Control', 'public, max-age=86400')
    return res.end(buffer)
  } catch (err) {
    console.error('[YT_THUMB] Error:', (err as any)?.message || err)
    return res.status(502).json({ error: 'Failed to fetch thumbnail.' })
  }
})

// A JSON API should not answer with Express's default HTML for these.
app.use((_req, res) => res.status(404).json({ error: 'Not found.' }))

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[SHAMA_API] Unhandled error:', err)
  res.status(500).json({ error: 'Something went wrong.' })
})

const server = app.listen(PORT, () => {
  console.log(`[SHAMA_API] Server listening at http://localhost:${PORT}`)
  console.log(`[SHAMA_API] YT Music bridge -> ${YT_SERVICE_URL}`)
  console.log(`[SHAMA_API] ML Engine bridge -> ${ML_ENGINE_URL}`)
})

// Playback sync rides a WebSocket on the same server/port as the API.
attachJam(server)

server.on('error', (err: any) => {
  if (err?.code === 'EADDRINUSE') {
    console.error(`[SHAMA_API] Port ${PORT} is already in use. Set BACKEND_PORT to another port.`)
    process.exit(1)
  }
  throw err
})
