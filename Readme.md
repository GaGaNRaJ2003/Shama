# Shama — a digital mehfil

> *"From the shama to the parwana — guided by meaning."*

Shama is a listening room for ghazal and qawwali. You hear a recording, follow
the words as they are sung, and tap any couplet (*sher*) to understand it: a
translation, a plain reading, a close literary reading, the vocabulary, the
devices at work and the mood. The explanation can be read aloud, and a shared
link lets friends listen to the same ghazal at the same moment.

Live: **https://shama-beta.vercel.app**

---

## What it is for

Ghazal and qawwali are sung poetry. Much of their beauty sits in Urdu and
Persian wordplay that many listeners who love the music cannot fully follow.
Lyrics sites give the words without the meaning, and translators give a meaning
without the music.

Shama keeps the music in front and puts the meaning one tap away. It is meant
for:

- **listening with understanding:** you never leave the song to look a word up;
- **learning the form:** radif, qafia, tashbih and isti'ara are named where they
  occur, so a listener learns how a ghazal is built while hearing one;
- **listening together:** the old *mehfil*, a gathering around a singer, over a
  link and without accounts;
- **preservation:** 10 curated ghazals ship with hand-written readings, and any
  other song can be found through YouTube Music.

The name comes from the *shama*, the candle at the centre of a mehfil, and the
*parwana*, the moth drawn to it.

It runs entirely on free tiers.

---

## How a listen flows

1. **Arrival.** The home screen is a *farmaish* (a request to the singer). Write
   a poet, a singer, a mood or a half-remembered line, or begin with a feeling.
   First-time visitors get a short 3D opening.
2. **Finding the recording.** A curated work is matched to a YouTube recording
   (`/api/yt/resolve`). When the match isn't confident, the listener picks from
   candidates. If YouTube fails, playback falls back to the work's archive.org
   file. Any other song comes from YouTube Music search.
3. **Playback.** The YouTube IFrame player streams audio straight from YouTube to
   the listener's browser. Shama never relays audio.
4. **Lyrics.** Time-synced lyrics come from LRCLIB, matched on title, artist,
   duration and album so that the right rendition's timings are used. YouTube
   Music's plain lyrics are the fallback.
5. **Couplets.** Lyrics are split into shers by rules, not an LLM: blank-line
   groups, then radif and qafia detection (`/api/split-lyrics`). Each sher is then
   aligned to the synced timings (`/api/align-couplets`), so the active couplet
   lights up as it is sung.
6. **Meaning.** Tapping a sher calls `/api/meaning`. A cached answer returns
   immediately. Otherwise similar couplets from the corpus enrich the prompt and
   an LLM writes the reading (see [The meaning pipeline](#the-meaning-pipeline)).
7. **Narration.** `/api/tts` reads the explanation aloud (Edge TTS), with the
   audio cached.
8. **Listen Together.** The host shares a link. Guests hear the same moment,
   follow seeks and pauses, and can request songs.

---

## Architecture

```
┌───────────────────────────────── Listener's browser ─────────────────────────────────┐
│  Next.js app, served by Vercel                      YouTube IFrame player            │
│  arrival · listening room · 3D scene · ambience     (audio streams straight from     │
│  synced lyrics · meaning panel · Listen Together     YouTube to each browser)        │
└──────────────────┬───────────────────────────────────────────────────────────────────┘
                   │  HTTPS /api/*   ·   WSS /ws/mehfil
                   ▼
┌──────────────────────────────────────────────┐
│ shama-api: Node · Express · ws (Render)      │
│ the only backend origin the browser talks to │
│ CORS allowlist · per-route rate limits ·     │
│ upstream deadlines · Listen Together rooms   │
└─────────┬──────────────────────────┬─────────┘
          │                          │
          ▼                          ▼
┌───────────────────────────┐  ┌───────────────────────────────┐
│ shama-yt-service          │  │ shama-ml-engine               │
│ Python · FastAPI (Render) │  │ Python · FastAPI (Render)     │
│ search · resolve a        │  │ meaning: cache → RAG → LLM    │
│ recording (ytmusicapi)    │  │ narration: Edge TTS           │
│ synced lyrics (LRCLIB)    │  │ couplet split · alignment     │
│ YT Music lyrics fallback  │  │                               │
└─────────────┬─────────────┘  └───────┬───────────────┬───────┘
              ▼                        ▼               ▼
   YouTube Music · lrclib.net    Gemini · Groq    Supabase (Postgres)
                                                  pgvector corpus · meaning cache ·
                                                  narration cache + audio bucket
```

Four processes, two languages and one database. The split follows what each
part needs from its host:

- **The frontend** is a static Next.js build, so it lives on Vercel.
- **The gateway** holds WebSocket upgrades and keeps Listen Together rooms in
  memory, so it needs one long-lived process. A serverless function can do
  neither, which is why the gateway is not on Vercel.
- **The two Python services** carry models, clients and state that should stay
  warm between requests.

### Services

| Service | Path | Runtime | Local port | Responsibility |
|---|---|---|---|---|
| Frontend | `frontend/` | Next.js 15 (App Router), React 19 | 3000 | The whole UI: one page at `/` |
| Gateway | `backend/` | Node 22, Express, `ws` | 5000 | Single API origin: proxies both Python services, serves the catalogue, hosts Listen Together |
| YT bridge | `ytmusic-service/` | Python, FastAPI, `ytmusicapi` | 8000 | Search, recording resolution, lyrics (LRCLIB, then YouTube Music) |
| ML engine | `ml-engine/` | Python, FastAPI | 8001 | Meanings, narration, couplet splitting and alignment, RAG |

### The gateway (`backend/src/server.ts`, `backend/src/jam.ts`)

The browser only ever calls the gateway and YouTube. Every route enforces the
following:

- **CORS:** an explicit origin allowlist from `FRONTEND_URL`, comma-separated.
- **Rate limits:** a fixed window per route. The proxied services spend metered
  LLM quota or call an unofficial YouTube API.
- **Deadlines:** `UPSTREAM_TIMEOUT_MS` (30s) for ordinary calls and
  `LLM_TIMEOUT_MS` (60s) for meanings.
- **Errors:** JSON with a human message. Internal details are logged, never
  returned.

| Route | Goes to | Purpose |
|---|---|---|
| `GET /api/works`, `GET /api/works/:id` | built-in catalogue | The curated works. A Supabase `works` table is used if one exists |
| `POST /api/meaning` | ML engine | Read one couplet |
| `POST /api/tts` | ML engine | Narrate text |
| `POST /api/split-lyrics` | ML engine | Lyrics text → couplets |
| `POST /api/align-couplets` | ML engine | Couplets + synced lines → a start time per couplet |
| `GET /api/yt/search` | YT bridge | YouTube Music search |
| `GET /api/yt/resolve` | YT bridge | Which recording *is* this ghazal? Returns `best` only when confident, otherwise candidates |
| `GET /api/yt/lyrics/search` | YT bridge | LRCLIB synced lyrics for a specific recording |
| `GET /api/yt/lyrics/:videoId` | YT bridge | YouTube Music lyrics (fallback) |
| `GET /api/yt/thumb` | YouTube image hosts | Re-serves a thumbnail with open CORS so three.js can texture the vinyl label. Host allowlist, 5 MB cap, images only |
| `POST /api/mehfil`, `GET /api/mehfil/:token` | in memory | Start a Listen Together room, look one up |
| `WS /ws/mehfil` | in memory | Playback sync |
| `GET /health`, `GET /api/ml/health` | own, ML engine | Liveness |

### Listen Together (mehfil)

There are no accounts and no audio relay. Each browser plays its own YouTube
stream, and only *what* is playing and *where* travels over the socket.

1. `POST /api/mehfil` returns a short `token`, the shareable part, and a
   `hostKey`, which only the creator keeps.
2. Everyone connects to `/ws/mehfil?token=…`. The host also sends the `hostKey`,
   which is how the server knows who may drive.
3. The host sends `state`: video, position, paused, queue. The server stamps it
   with its own clock and broadcasts it. Guests correct their drift against that
   single reference, because guest clocks disagree with each other.
4. Guests can send `request` and `withdraw`. The host can `resolve` a request to
   add it or decline it. Anyone can rename themselves.
5. Rooms live in memory. A room expires 30 minutes after its last listener
   leaves, and after 12 hours at most.

Rooms live in process memory, so the gateway must run as a single instance.

### The meaning pipeline (`ml-engine/main.py`)

```
POST /api/meaning { couplet, poet?, language, depth }
  │
  ├─ 1. cache lookup ────────── Supabase `couplet_meanings` → hit: return immediately
  ├─ 2. coalesce ────────────── concurrent requests for the same couplet share one generation
  ├─ 3. RAG context ─────────── embed the couplet (all-MiniLM-L6-v2), fetch similar shers
  │                             from `couplet_embeddings` via the `search_couplets` RPC
  ├─ 4. LLM router ──────────── JSON mode; providers tried in LLM_PROVIDER_ORDER under one
  │                             shared deadline; models set by GEMINI_MODEL / GROQ_MODEL
  ├─ 5. normalise + validate ── coerce type drift; reject output that doesn't fit the schema
  └─ 6. cache store ─────────── successes only, so a bad provider day can't poison a couplet
→ { translation, simple, detailed, vocabulary[], literary_devices[], mood, cached }
```

- **Corpus.** The RAG corpus is about 8,000 couplets in
  `ml-engine/data/training_corpus.jsonl`, built with `ml-engine/scraper/` and
  the scripts in `ml-engine/data/`.
- **Warm-up.** The embedding model warms up in a background thread at boot.
  `RAG_ENABLED=0` turns retrieval off entirely, which also keeps torch out of
  memory.
- **Timings.** Each phase is timed and logged (`meaning timing: rag=… llm=…`),
  because "the meaning is slow" has several very different causes.
- **Narration.** Narration uses Edge TTS (male or female; English, Hindi or
  Urdu). Audio is cached in the Supabase Storage bucket `tts-audio`, keyed by a
  hash of voice and text. If the upload fails, the audio comes back inline.

### Data and graceful degradation

Supabase (Postgres) holds three things:

- the pgvector corpus `couplet_embeddings`;
- the meaning cache `couplet_meanings`;
- the narration cache: `tts_cache` plus the `tts-audio` bucket.

The schema is in `ml-engine/deploy/supabase_migrations/001_initial.sql` and
`ml-engine/rag/supabase_setup.sql`. Row-level security grants cache writes to
`service_role` only, so the ML engine needs `SUPABASE_SERVICE_ROLE_KEY` to cache
anything.

Every Supabase dependency is optional at runtime. If the database is
unreachable:

- the catalogue is served from the local copy;
- meanings are generated but not cached;
- RAG adds no context;
- narration audio is returned inline.

The app gets slower but keeps working.

### Frontend (`frontend/src`)

| Area | Where |
|---|---|
| Page shell and state | `app/page.tsx` → `App.tsx` |
| Arrival (farmaish scroll, feelings) | `components/arrival/` |
| Listening room: synced lyrics, couplet sheet, meaning panel, recording picker, queue, Listen Together bar | `components/listening/` |
| 3D mehfil scene (vinyl, diya), opening sequence | `components/aesthetic/` (three.js via `@react-three/fiber`) |
| Generative ambience and intro sound | `audio/` (Web Audio) |
| Curated catalogue (10 works, hand-written readings) | `data/ghazals.ts` |
| Personal library (browser storage) | `data/userCatalog.ts` |
| Listen Together client: reconnect with back-off, drift correction | `data/useMehfilJam.ts` |

`NEXT_PUBLIC_API_BASE` points the build at the gateway. It is inlined at build
time, and the WebSocket URL is derived from it (`https` → `wss`).

---

## Deployment

| Piece | Where | Configured by |
|---|---|---|
| Frontend | Vercel, project root `frontend` | `frontend/vercel.json` (framework `nextjs`); `NEXT_PUBLIC_API_BASE` |
| Gateway, YT bridge, ML engine | Render, three free web services | `render.yaml` Blueprint; deploys automatically on push to `main` |
| Database and storage | Supabase free project | SQL files above |

Some limits of the free tiers:

- **Sleep.** Render's free services sleep after 15 minutes idle. The first
  visitor after a quiet spell waits while they wake, from tens of seconds up to
  about a minute and a half for the ML engine.
- **Pausing.** Supabase pauses free projects after a stretch of inactivity, and
  a paused project has to be restored from its dashboard.
- **YouTube Music from a datacenter.** The YT bridge calls an unofficial
  YouTube Music API from a datacenter IP. That draws rate limits sooner than a
  home connection does, and some lyrics that resolve locally come back empty.

Environment variables per service:

| Service | Variables |
|---|---|
| `shama-api` | `FRONTEND_URL` (CORS allowlist), `YT_SERVICE_URL`, `ML_ENGINE_URL` (full URLs with scheme), optional `SUPABASE_URL`, `SUPABASE_ANON_KEY` |
| `shama-ml-engine` | `GROQ_API_KEY`, `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; optional `LLM_PROVIDER_ORDER`, `GROQ_MODEL`, `GEMINI_MODEL`, `RAG_ENABLED` |
| `shama-yt-service` | none |

Deploy order:

1. Render.
2. Vercel, with `NEXT_PUBLIC_API_BASE` set to the gateway's URL.
3. Back on Render, add the Vercel domain to `FRONTEND_URL`.

After any `render.yaml` change, re-check the `sync: false` values on Render:
a Blueprint re-sync can clear them.

[SETUP.md](./SETUP.md) has the step-by-step guide.

---

## Running locally

You need Node 18+, Python 3.11+, and free keys from
[Groq](https://console.groq.com), [Gemini](https://aistudio.google.com/apikey)
and [Supabase](https://supabase.com).

All four services read one `.env` at the repo root. Start from
`ml-engine/deploy/env.example`. The gateway reads **`BACKEND_PORT`**, not
`PORT`: the shared `.env` sets `PORT` for the Python services.

Run each service in its own terminal, starting from the repo root:

```bash
# 1. YT bridge → http://127.0.0.1:8000
cd ytmusic-service
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --port 8000

# 2. ML engine → http://127.0.0.1:8001  (requirements pin a CPU-only torch)
cd ml-engine
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --port 8001

# 3. Gateway → http://localhost:5000
cd backend && npm install && npm run dev

# 4. Frontend → http://localhost:3000
cd frontend && npm install && npm run dev
```

Don't run `next build` while `next dev` is running: they share `frontend/.next`.

---

## Project structure

```
Shama/
├── frontend/            Next.js app (deployed to Vercel)
│   └── src/             app/, components/{arrival,listening,aesthetic}, data/, audio/
├── backend/             Gateway: server.ts (routes, proxies), jam.ts (Listen Together)
├── ml-engine/           main.py (the served app)
│   ├── api/             LLM router, prompts, meaning cache, couplet splitter, aligner
│   ├── rag/             embeddings, retriever, Supabase setup SQL
│   ├── tts/             Edge TTS client, audio cache, /api/tts router
│   ├── data/            couplet corpus (JSONL)
│   ├── scraper/         corpus collection
│   └── deploy/          env example, Supabase migrations, architecture notes
├── ytmusic-service/     YT Music + LRCLIB bridge (main.py)
├── render.yaml          Render Blueprint for the three backend services
├── SETUP.md             Step-by-step local and deploy setup
└── AUDIT.md             Security and correctness audit, with fixes and open items
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, React 19, three.js / `@react-three/fiber`, Framer Motion, Tailwind, Web Audio |
| Gateway | Express, `ws` |
| Services | FastAPI, `ytmusicapi`, `sentence-transformers` (CPU) |
| LLMs | Gemini and Groq behind one router with fallback |
| Narration | Edge TTS |
| Lyrics | LRCLIB (synced), YouTube Music (fallback) |
| Data | Supabase: Postgres, pgvector, Storage |
| Hosting | Vercel (frontend), Render (services) |

---

## License

For educational and cultural-preservation purposes.

*Shama celebrates the soul of Indo-Persian poetry. It aims to be more than a
translator: a cultural bridge, an emotional companion and a poetic mentor.*
