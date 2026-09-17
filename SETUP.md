# Shama — Complete Setup Guide

> **From clone to running: exact step-by-step instructions.**

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                 http://localhost:3000                        │
│                 Next.js Frontend                             │
└────────────────────────┬────────────────────────────────────┘
                         │ all /api/* calls
┌────────────────────────▼────────────────────────────────────┐
│                 http://localhost:5000                        │
│                 Node.js Backend (Express)                    │
│                                                             │
│   /api/works, /api/works/:id  → Supabase / mock data       │
│   /api/meaning                → proxies to ML Engine        │
│   /api/tts                    → proxies to ML Engine        │
│   /api/yt/*                   → proxies to YT Music Bridge  │
└───────┬─────────────────────────────────┬───────────────────┘
        │                                 │
┌───────▼───────────┐           ┌─────────▼─────────────────┐
│  :8001 ML Engine  │           │  :8000 YT Music Bridge    │
│  (FastAPI/Python) │           │  (FastAPI/Python)         │
│                   │           │                           │
│  /api/meaning     │           │  /search?q=...            │
│  /api/tts         │           │  /lyrics/:videoId         │
│  /health          │           └───────────────────────────┘
└───────┬───────────┘
        │
┌───────▼───────────────────────────────────────────────────┐
│                    External Services                        │
│                                                            │
│  • Groq API (free) — Llama 3.3 70B for meanings           │
│  • Gemini API (free) — fallback LLM                       │
│  • ElevenLabs (free) — TTS narration (10K chars/mo)       │
│  • Supabase (free) — DB (pgvector) + Storage              │
└────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

| Tool | Version | Check |
|------|---------|-------|
| Node.js | 18+ | `node --version` |
| Python | 3.11+ | `python --version` |
| pip | latest | `pip --version` |
| Git | any | `git --version` |

---

## Step 1: Get Free API Keys

You need 4 free accounts. Each takes ~2 minutes:

### 1.1 Groq (Primary LLM — free, 30 req/min)
1. Go to https://console.groq.com
2. Sign up with Google/GitHub
3. Go to **API Keys** → Create new key
4. Copy the key (starts with `gsk_...`)

### 1.2 Google Gemini (Fallback LLM — free, 15 req/min)
1. Go to https://aistudio.google.com/apikey
2. Sign in with Google account
3. Click **Create API Key**
4. Copy the key

### 1.3 ElevenLabs (TTS — free, 10,000 chars/month)
1. Go to https://elevenlabs.io
2. Sign up (free tier)
3. Go to **Profile** → **API Keys**
4. Copy your API key (starts with `sk_...`)

### 1.4 Supabase (Database + Storage — free, 500MB)
1. Go to https://supabase.com → Start your project
2. Create a new project (any region)
3. Go to **Settings** → **API**
4. Copy:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **anon public key** (starts with `eyJ...`)

---

## Step 2: Configure Environment

Create/edit the `.env` file in the **project root** (`Shama/.env`):

```env
# --- LLM Providers ---
GROQ_API_KEY=gsk_your_key_here
GEMINI_API_KEY=your_gemini_key_here

# --- Text-to-Speech ---
ELEVENLABS_API_KEY=sk_your_key_here

# --- Supabase ---
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ_your_anon_key_here

# --- Ports (defaults) ---
PORT=5000
ML_ENGINE_PORT=8001
YT_SERVICE_URL=http://127.0.0.1:8000
ML_ENGINE_URL=http://127.0.0.1:8001
FRONTEND_URL=http://localhost:3000

# --- ML Engine Config ---
ENVIRONMENT=development
LOG_LEVEL=debug
TORCH_CPU_ONLY=1
EMBEDDING_MODEL=all-MiniLM-L6-v2
```

---


## Step 3: Set Up Supabase Database

### 3.1 Enable pgvector extension
1. Open your Supabase Dashboard → **SQL Editor**
2. Run:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 3.2 Create tables
Run the full migration in the SQL Editor. Copy-paste from:
`ml-engine/deploy/supabase_migrations/001_initial.sql`

This creates:
- `couplet_embeddings` — vector store for RAG (384-dim embeddings)
- `couplet_meanings` — LLM response cache (never re-generate same meaning)
- `tts_cache` — audio file metadata (never re-generate same audio)
- RLS policies, indexes, and helper functions

### 3.3 Create Storage Bucket
1. Go to **Storage** in Supabase Dashboard
2. Click **New Bucket**
3. Name: `tts-audio`
4. Toggle **Public bucket**: ON
5. File size limit: 500KB
6. Allowed MIME types: `audio/mpeg, audio/wav`

---

## Step 4: Install Dependencies

Open **4 terminal windows** (PowerShell recommended):

### Terminal 1 — ML Engine (Python)
```powershell
cd ml-engine
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt --extra-index-url https://download.pytorch.org/whl/cpu
```

> **Note:** First install downloads the `all-MiniLM-L6-v2` model (~90MB) and PyTorch CPU (~200MB). This is a one-time cost.

### Terminal 2 — YT Music Bridge (Python)
```powershell
cd ytmusic-service
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### Terminal 3 — Node Backend
```powershell
cd backend
npm install
```

### Terminal 4 — Next.js Frontend
```powershell
cd frontend
npm install
```

---

## Step 5: Seed the RAG Vector Database

This converts your 30 existing ghazal couplets into embeddings and stores them in Supabase for semantic search:

```powershell
cd ml-engine
.venv\Scripts\Activate.ps1

# Step 5a: Generate the JSONL corpus from ghazals.ts
python data/seed_corpus.py
# Output: ml-engine/data/training_corpus.jsonl

# Step 5b: Embed and upsert into Supabase pgvector
python -m rag.embeddings
# This takes ~30 seconds (generates embeddings locally, uploads to Supabase)
```

**Verification:** Go to Supabase → Table Editor → `couplet_embeddings`. You should see ~30 rows with populated `embedding` vectors.

---

## Step 6: Start All Services

Start in this order (each in its own terminal):

### Terminal 1 — ML Engine (must start first)
```powershell
cd ml-engine
.venv\Scripts\Activate.ps1
python main.py
```
Expected output:
```
INFO  ✓ LLM Router initialized (Groq=ON, Gemini=ON)
INFO  ✓ Meaning cache: enabled
INFO  ═══════════════════════════════════════════
INFO    Shama ML Engine running at :8001
INFO    Endpoints: /api/meaning, /api/tts, /health
INFO  ═══════════════════════════════════════════
```

### Terminal 2 — YT Music Bridge
```powershell
cd ytmusic-service
.venv\Scripts\Activate.ps1
python main.py
```
Expected: `Uvicorn running on http://127.0.0.1:8000`

### Terminal 3 — Node Backend
```powershell
cd backend
npm run dev
```
Expected:
```
[SHAMA_API] Server listening at http://localhost:5000
[SHAMA_API] YT Music bridge -> http://127.0.0.1:8000
[SHAMA_API] ML Engine bridge -> http://127.0.0.1:8001
```

### Terminal 4 — Frontend
```powershell
cd frontend
npm run dev
```
Expected: `ready - started server on 0.0.0.0:3000`

---


## Step 7: Verify Everything Works

### 7.1 Health Check
```powershell
curl http://localhost:8001/health
```
Expected:
```json
{
  "status": "healthy",
  "llm_available": true,
  "cache_enabled": true,
  "groq_configured": true,
  "gemini_configured": true,
  "elevenlabs_configured": true
}
```

### 7.2 Test Meaning Generation
```powershell
curl -X POST http://localhost:5000/api/meaning `
  -H "Content-Type: application/json" `
  -d '{"couplet": "dil-e-nadaan tujhe hua kya hai", "poet": "Mirza Ghalib", "language": "roman", "depth": "detailed"}'
```
Expected: JSON with `translation`, `simple`, `detailed`, `vocabulary[]`, `literary_devices[]`, `mood`

### 7.3 Test TTS
```powershell
curl -X POST http://localhost:5000/api/tts `
  -H "Content-Type: application/json" `
  -d '{"text": "The poet questions his own naive heart.", "voice": "male", "language": "en"}'
```
Expected: JSON with `audio_url`, `cached`, `chars_remaining`

### 7.4 Open the App
Navigate to **http://localhost:3000** in your browser.

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| `ML Engine unavailable` | ML service not running | Start with `cd ml-engine && python main.py` |
| `LLM service not initialized` | Missing API keys | Check `.env` has GROQ_API_KEY or GEMINI_API_KEY |
| `Cache lookup failed` | Supabase not set up | Run the SQL migration (Step 3.2) |
| `No couplets extracted` in seed | ghazals.ts path wrong | Run from `ml-engine/` directory |
| `ModuleNotFoundError: sentence_transformers` | venv not activated | Run `.venv\Scripts\Activate.ps1` first |
| `torch` install fails | Wrong pip index | Use `--extra-index-url https://download.pytorch.org/whl/cpu` |
| Groq returns 429 | Rate limited (30/min) | Wait 60s, Gemini fallback kicks in automatically |
| TTS returns `use_browser_tts: true` | 10K chars/month exhausted | Wait for month reset, or rely on browser TTS |
| Cold starts on Render | Free tier spin-down | First request after 15min idle takes ~30s |

---

## Project Structure

```
Shama/
├── .env                          # All secrets (gitignored)
├── SETUP.md                      # ← You are here
├── Readme.md                     # Project vision & features
│
├── frontend/                     # Next.js 15 + React 19
│   ├── src/App.tsx               # Main app (Mehfil Mode, Library, YT Music)
│   ├── src/data/ghazals.ts       # 5 ghazals, 30 couplets (gold standard)
│   └── package.json
│
├── backend/                      # Express.js API gateway
│   ├── src/server.ts             # Proxies to ML Engine + YT Bridge
│   └── package.json
│
├── ml-engine/                    # Python AI service (FastAPI)
│   ├── main.py                   # Unified entry point (:8001)
│   ├── requirements.txt          # All Python deps
│   ├── api/                      # Meaning generation
│   │   ├── llm_client.py         # Groq → Gemini fallback
│   │   ├── prompts.py            # Scholar persona + few-shot
│   │   └── cache.py              # Supabase meaning cache
│   ├── tts/                      # Voice narration
│   │   ├── elevenlabs_client.py  # Budget-tracked TTS
│   │   ├── audio_cache.py        # Supabase Storage cache
│   │   └── router.py             # /api/tts endpoint
│   ├── rag/                      # Retrieval-Augmented Generation
│   │   ├── embeddings.py         # Corpus → Supabase pgvector
│   │   ├── retriever.py          # Semantic search at inference
│   │   └── config.py             # Supabase + model config
│   ├── data/
│   │   ├── seed_corpus.py        # ghazals.ts → JSONL converter
│   │   └── training_corpus.jsonl # Generated seed data
│   ├── scraper/                  # Data collection pipeline
│   │   ├── rekhta_scraper.py     # Rekhta.org couplet scraper
│   │   ├── schema.py             # Pydantic training schema
│   │   └── corpus_builder.py     # Dedup + validate + merge
│   └── deploy/                   # Production deployment
│       ├── docker/Dockerfile     # Container for Render
│       ├── architecture.md       # System design doc
│       └── supabase_migrations/
│           └── 001_initial.sql   # Full DB schema
│
└── ytmusic-service/              # YouTube Music bridge
    ├── main.py                   # Search + lyrics API (:8000)
    └── requirements.txt
```

---

## Free Tier Limits (Stay Aware)

| Service | Limit | What Happens When Exceeded |
|---------|-------|----------------------------|
| Groq | 30 req/min, 14,400/day | Auto-falls back to Gemini |
| Gemini | 15 req/min, 1,500/day | Returns graceful error message |
| ElevenLabs | 10,000 chars/month | Returns `use_browser_tts: true` |
| Supabase DB | 500MB | Enough for ~100K cached meanings |
| Supabase Storage | 1GB | Enough for ~2,000 TTS audio clips |
| Render | 750 hrs/month, spins down after 15min | 30s cold start on first request |
| Vercel | 100GB bandwidth | More than enough for dev/demo |

---

## Next Steps (After Setup)

1. **Grow the corpus** — Run `python scraper/rekhta_scraper.py --poet "Mirza Ghalib"` to scrape more couplets
2. **Re-embed** — After adding data, run `python -m rag.embeddings` again
3. **Connect frontend** — Wire the meaning panel in App.tsx to call `POST /api/meaning` when a couplet is clicked
4. **Add TTS button** — Add a 🔊 button next to meanings that calls `POST /api/tts`
5. **Deploy** — Push to GitHub, connect Render + Vercel (see `ml-engine/deploy/architecture.md`)

---

## Quick Reference Commands

```powershell
# Start everything (run in order)
cd ml-engine;  .venv\Scripts\Activate.ps1; python main.py          # Terminal 1
cd ytmusic-service; .venv\Scripts\Activate.ps1; python main.py     # Terminal 2
cd backend; npm run dev                                             # Terminal 3
cd frontend; npm run dev                                            # Terminal 4

# Re-seed after adding new ghazals to ghazals.ts
cd ml-engine; python data/seed_corpus.py; python -m rag.embeddings

# Test meaning API directly
curl -X POST http://localhost:8001/api/meaning -H "Content-Type: application/json" -d "{\"couplet\": \"hazaaron khwahishein aisi ke har khwahish pe dam nikle\"}"

# Check ML engine health
curl http://localhost:8001/health
```



---

## Expanding the Corpus (Growing AI Knowledge)

### Why Expand?

Your AI meaning engine works on **any** couplet (it calls Groq/Gemini). The RAG vector database makes it **better** by providing similar couplets as context. More couplets in RAG = richer, more accurate interpretations.

### Step-by-Step: Scrape → Convert → Embed

```powershell
cd ml-engine
.venv\Scripts\Activate.ps1

# 1. Scrape from Rekhta (20 ghazals per poet × 20 poets = ~400 ghazals, ~2000+ couplets)
python scraper/rekhta_scraper.py --poets-file scraper/poets.txt --max-ghazals 20

# 2. Convert raw scraped data to corpus format (deduplicates automatically)
python data/convert_scraped.py --input data/raw/rekhta_scraped.jsonl

# 3. Re-embed the full corpus into Supabase pgvector
python -m rag.embeddings
```

**Time estimate:** ~30-45 minutes for 400 ghazals (2-5s delay between requests to be respectful).

### Adding More Poets

Edit `ml-engine/scraper/poets.txt` — one slug per line from `rekhta.org/poets/SLUG/ghazals`:
```
mirza-ghalib
faiz-ahmad-faiz
ahmed-faraz
# ... add any poet slug
```

### How Songs Appear in the App

| Source | How it works | Needs scraping? |
|--------|-------------|-----------------|
| **Curated catalog** (5 ghazals) | Hardcoded in `ghazals.ts`, full structured data | No |
| **YT Music search** (infinite) | User searches, plays via YouTube | No |
| **AI meanings** | Works on ANY couplet via `/api/meaning` | No (but RAG makes it better) |
| **RAG context** | Scraped couplets enrich AI responses | Yes — run scraper |

### The Key Insight

You don't need to "add songs" — YT Music already gives you infinite playback. What scraping does is make the **AI meaning engine smarter** by giving it more reference material. The more couplets in your vector DB, the better the LLM interprets unfamiliar verses.

---

## Deploying to Production

Shama does not fit on one host. The frontend is a static Next build and goes to
Vercel; the other three services each need a process that stays up — `backend`
holds a WebSocket upgrade for Listen Together, and the Python services carry
caches and a model. Those three go to Render, declared in the root
`render.yaml`.

The two halves reference each other, so the order matters:

**1. Render first** — dashboard → New → Blueprint → this repo. It reads
`render.yaml` and creates `shama-yt-service`, `shama-ml-engine` and
`shama-api`, prompting for the secrets (copy them from the root `.env`).
Leave `FRONTEND_URL` blank for now. Once the two Python services are live,
set on `shama-api`:

```
YT_SERVICE_URL=https://shama-yt-service.onrender.com
ML_ENGINE_URL=https://shama-ml-engine.onrender.com
```

(Use whatever URLs Render actually assigned — it appends a suffix if a name
is taken.)

**2. Vercel second** — import the repo, set **Root Directory** to `frontend`,
and add one environment variable:

```
NEXT_PUBLIC_API_BASE=https://shama-api.onrender.com
```

`useMehfilJam` derives the mehfil socket from that value, so `https` becomes
`wss` on its own. Nothing else needs configuring.

**3. Back to Render** — set `FRONTEND_URL` on `shama-api` to the Vercel domain
(`https://your-app.vercel.app`). It is the CORS allowlist: until it is right,
every call from the browser is rejected. Multiple origins are comma-separated.

### What to expect on the free tier

- Instances sleep after 15 minutes idle. The first listener of the evening
  waits 30–60s while all three wake; guests joining an active mehfil don't.
- The ML engine imports torch lazily, so it boots small. The first RAG lookup
  loads the model, and that is where 512MB is most likely to run out. If
  `/api/meaning` starts failing in production, that is the reason.
- The YT bridge scrapes an unofficial API. A datacenter IP draws rate limits
  much sooner than a home one — if search dies in production but works
  locally, this is why, not your code.
