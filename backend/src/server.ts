import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { supabase, isDbConfigured } from './lib/supabase.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 5000

// Location of the Python `ytmusicapi` bridge service (see /ytmusic-service).
const YT_SERVICE_URL = (process.env.YT_SERVICE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

// Location of the ML Engine (meaning + TTS) service (see /ml-engine).
const ML_ENGINE_URL = (process.env.ML_ENGINE_URL || 'http://127.0.0.1:8001').replace(/\/$/, '')

app.use(cors())
app.use(express.json())

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

// API Routes
app.get('/api/works', async (req, res) => {
  try {
    if (isDbConfigured) {
      const { data: works, error } = await supabase
        .from('works')
        .select('id, title, artist, poet, form, audio_url, cover_url')
      if (error) {
        throw new Error(error.message)
      }
      return res.json(works)
    } else {
      // Fallback mode: map mockCatalog to brief list items
      const briefWorks = mockCatalog.map(w => ({
        id: w.id,
        title: w.title,
        artist: w.artist,
        poet: w.poet,
        form: w.form,
        audioUrl: w.audioUrl,
        coverUrl: w.coverUrl
      }))
      return res.json(briefWorks)
    }
  } catch (err: any) {
    console.error('Error fetching works:', err.message)
    return res.status(500).json({ error: 'Failed to fetch works.' })
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
    return res.status(500).json({ error: 'Failed to fetch work details.' })
  }
})

// ---------------------------------------------------------------------------
// ML Engine bridge (proxies the Python ML service in /ml-engine)
// Provides AI-powered meaning interpretation and TTS narration.
// ---------------------------------------------------------------------------

const mlUnavailable = (res: express.Response, err: any) => {
  console.error('[ML_BRIDGE] Upstream error:', err?.message || err)
  return res.status(503).json({
    error: 'ML Engine unavailable. Start it with: cd ml-engine && python main.py',
  })
}

// POST /api/meaning — Couplet interpretation
app.post('/api/meaning', async (req, res) => {
  try {
    const upstream = await fetch(`${ML_ENGINE_URL}/api/meaning`, {
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

// POST /api/tts — Text-to-speech narration
app.post('/api/tts', async (req, res) => {
  try {
    const upstream = await fetch(`${ML_ENGINE_URL}/api/tts`, {
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

// POST /api/split-lyrics — Intelligent lyrics couplet segmentation
app.post('/api/split-lyrics', async (req, res) => {
  try {
    const upstream = await fetch(`${ML_ENGINE_URL}/api/split-lyrics`, {
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
    const upstream = await fetch(`${ML_ENGINE_URL}/health`)
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
  return res.status(503).json({
    error: 'YT Music service unavailable. Start it with: cd ytmusic-service && python main.py',
    results: []
  })
}

// GET /api/yt/search?q=...&limit=...
app.get('/api/yt/search', async (req, res) => {
  const q = String(req.query.q || '').trim()
  if (!q) return res.status(400).json({ error: 'Missing query parameter "q".', results: [] })
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 40)
  try {
    const upstream = await fetch(
      `${YT_SERVICE_URL}/search?q=${encodeURIComponent(q)}&limit=${limit}`
    )
    const data = await upstream.json()
    return res.status(upstream.status).json(data)
  } catch (err) {
    return ytUnavailable(res, err)
  }
})

// GET /api/yt/lyrics/search?title=...&artist=... (LRCLIB synced lyrics)
app.get('/api/yt/lyrics/search', async (req, res) => {
  const title = String(req.query.title || '').trim()
  const artist = String(req.query.artist || '').trim()
  if (!title && !artist) {
    return res.status(400).json({ error: 'Provide at least title or artist.', hasLyrics: false })
  }
  try {
    const params = new URLSearchParams()
    if (title) params.set('title', title)
    if (artist) params.set('artist', artist)
    const upstream = await fetch(
      `${YT_SERVICE_URL}/lyrics/search?${params.toString()}`
    )
    const data = await upstream.json()
    return res.status(upstream.status).json(data)
  } catch (err) {
    return ytUnavailable(res, err)
  }
})

// GET /api/yt/lyrics/:videoId
app.get('/api/yt/lyrics/:videoId', async (req, res) => {
  try {
    const upstream = await fetch(
      `${YT_SERVICE_URL}/lyrics/${encodeURIComponent(req.params.videoId)}`
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
app.get('/api/yt/thumb', async (req, res) => {
  const u = String(req.query.u || '')
  if (!/^https:\/\/[a-z0-9.-]*(ytimg\.com|ggpht\.com|googleusercontent\.com)\//i.test(u)) {
    return res.status(400).json({ error: 'Only YouTube image hosts are allowed.' })
  }
  try {
    const upstream = await fetch(u)
    if (!upstream.ok || !upstream.body) {
      return res.status(502).json({ error: 'Failed to fetch thumbnail.' })
    }
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/jpeg')
    res.setHeader('Cache-Control', 'public, max-age=86400')
    const buffer = Buffer.from(await upstream.arrayBuffer())
    return res.end(buffer)
  } catch (err) {
    console.error('[YT_THUMB] Error:', (err as any)?.message || err)
    return res.status(502).json({ error: 'Failed to fetch thumbnail.' })
  }
})

app.listen(PORT, () => {
  console.log(`[SHAMA_API] Server listening at http://localhost:${PORT}`)
  console.log(`[SHAMA_API] YT Music bridge -> ${YT_SERVICE_URL}`)
  console.log(`[SHAMA_API] ML Engine bridge -> ${ML_ENGINE_URL}`)
})
