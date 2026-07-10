# Shama: The Ghazal & Qawwali Meaning Companion

> *"From the shama to the parwana — guided by meaning."*

An immersive web app that helps users understand the poetic depth of Ghazals and Qawwalis in real-time. Play any song, see synced lyrics scroll by, click any couplet, and get AI-generated literary analysis — all narrated in a warm voice.

---

## Demo

Play any ghazal from YouTube Music → lyrics auto-sync → click a couplet → AI explains it.

```
┌──────────────────────────────────────────────────────────────────────┐
│  [01] LISTENING DECK    [02] CATALOG    [03] PICKS    [04] YT MUSIC  │
├──────────┬───────────────────────────────┬───────────────────────────┤
│ Catalog  │ ▶ Vinyl + Candle Animation    │ AI Meaning Panel          │
│ 10 Ghaz. │                               │                           │
│          │ "ranjish hi sahi dil hi        │ SIMPLE: He tells the      │
│ • Ghalib │  dukhaane ke liye aa"         │ beloved: come for any     │
│ • Faiz   │                               │ reason, even to hurt me.  │
│ • Mir    │ ♪ Synced lyrics scrolling...   │                           │
│ • Faraz  │                               │ LITERARY: "Ranjish hi     │
│          │ [00:59] رنجش ہی سہی ←active   │ sahi" concedes the quarrel│
│          │ [01:09] آ فر سے مجھے           │ just to win the visit...  │
│          │                               │                           │
│          │ 🔊 NARRATE  ♡ ADD TO CATALOG  │ Mood: Heartbreak & Reunion│
└──────────┴───────────────────────────────┴───────────────────────────┘
```

---

## Features

| Feature | Status |
|---------|--------|
| 🎵 Play any ghazal via YouTube Music | ✅ |
| 📜 Time-synced lyrics (LRCLIB + YT Music fallback) | ✅ |
| 🤖 AI-powered couplet meanings (Groq/Gemini) | ✅ |
| 📖 Literary device identification (tashbih, isti'ara, etc.) | ✅ |
| 🔊 Voice narration (Edge TTS — natural Hindi/Urdu/English) | ✅ |
| 🕯️ Immersive UI (vinyl turntable, diya animation, moths) | ✅ |
| 📚 10 curated ghazals with hand-written meanings | ✅ |
| ❤️ Personal catalog (add/remove songs, persists locally) | ✅ |
| 🔍 RAG-enhanced meanings (2000+ couplets in vector DB) | ✅ |
| 🌐 Multilingual (Urdu, Hindi, Roman, English) | ✅ |

---

## Architecture

```
Frontend (Next.js :3000)
    │
    ▼ all /api/* calls
Node Backend (Express :5000)
    ├── /api/works         → Curated catalog
    ├── /api/meaning       → proxies to ML Engine
    ├── /api/tts           → proxies to ML Engine
    ├── /api/split-lyrics  → proxies to ML Engine
    └── /api/yt/*          → proxies to YT Music Bridge
              │                        │
    ┌─────────▼──────────┐   ┌────────▼──────────┐
    │ ML Engine (:8001)  │   │ YT Bridge (:8000) │
    │ FastAPI/Python     │   │ ytmusicapi +       │
    │ • Groq (Llama 3.3) │   │ LRCLIB lyrics     │
    │ • Gemini fallback   │   └───────────────────┘
    │ • Edge TTS          │
    │ • RAG (pgvector)    │
    └─────────────────────┘
              │
    ┌─────────▼──────────┐
    │ Supabase (free)    │
    │ • pgvector (RAG)   │
    │ • Meaning cache    │
    │ • TTS audio cache  │
    └────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React 19, Three.js, Framer Motion, Tailwind |
| Backend | Express.js (API gateway), FastAPI (ML engine) |
| LLM | Groq (Llama 3.3 70B) → Gemini 2.0 Flash fallback |
| TTS | Edge TTS (Microsoft neural voices — free, unlimited) |
| Lyrics | LRCLIB (primary, synced) → YouTube Music (fallback) |
| Database | Supabase (pgvector for RAG, caching) |
| Embeddings | sentence-transformers/all-MiniLM-L6-v2 (local CPU) |
| Scraping | Rekhta.org (2000+ couplets for RAG context) |

**Total cost: $0/month** (all free tiers)

---

## Running Locally (4 processes)

### Prerequisites
- Node.js 18+, Python 3.11+, pip
- Free API keys: [Groq](https://console.groq.com), [Gemini](https://aistudio.google.com/apikey), [Supabase](https://supabase.com)

### Setup

```bash
# 1. Clone and configure
git clone https://github.com/GaGaNRaJ2003/Shama.git
cd Shama
cp ml-engine/deploy/env.example .env
# Edit .env with your API keys

# 2. ML Engine (Python)
cd ml-engine && python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt --extra-index-url https://download.pytorch.org/whl/cpu
python main.py                                    # → http://127.0.0.1:8001

# 3. YT Music Bridge (Python)
cd ytmusic-service && python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt
python main.py                                    # → http://127.0.0.1:8000

# 4. Node Backend
cd backend && npm install && npm run dev          # → http://localhost:5000

# 5. Frontend
cd frontend && npm install && npm run dev         # → http://localhost:3000
```

See **[SETUP.md](./SETUP.md)** for detailed step-by-step instructions including Supabase setup.

---

## How It Works

1. **User plays a song** → YouTube Music IFrame player streams audio
2. **Lyrics auto-fetch** → LRCLIB provides time-synced lyrics (LRC format); YouTube Music as fallback
3. **Lyrics scroll in real-time** → Active line highlights and auto-scrolls as song plays
4. **User clicks a couplet** → Frontend sends `POST /api/meaning` with the couplet text
5. **RAG retrieval** → Similar couplets from Supabase pgvector enrich the LLM prompt
6. **LLM generates meaning** → Groq (Llama 3.3 70B) produces translation, simple/detailed meaning, vocabulary, literary devices, mood
7. **Response cached** → Same couplet never re-generated (instant on repeat)
8. **Voice narration** → Edge TTS reads the meaning aloud in warm Hindi/Urdu/English

---

## Curated Catalog (10 Ghazals)

| # | Title | Poet | Artist |
|---|-------|------|--------|
| 01 | Dil-e-Nadaan Tujhe Hua Kya Hai | Mirza Ghalib | Jagjit & Chitra Singh |
| 02 | Aaj Jaane Ki Zid Na Karo | Fayyaz Hashmi | Farida Khanum |
| 03 | Gulon Mein Rang Bhare | Faiz Ahmed Faiz | Mehdi Hassan |
| 04 | Ranjish Hi Sahi | Ahmed Faraz | Mehdi Hassan |
| 05 | Chupke Chupke Raat Din | Hasrat Mohani | Ghulam Ali |
| 06 | Hazaaron Khwahishein Aisi | Mirza Ghalib | Jagjit Singh |
| 07 | Koi Umeed Bar Nahin Aati | Mirza Ghalib | Mehdi Hassan |
| 08 | Mujhse Pehli Si Mohabbat | Faiz Ahmed Faiz | Noor Jehan |
| 09 | Wo Jo Hum Mein Tum Mein Qarar Tha | Faiz Ahmed Faiz | Abida Parveen |
| 10 | Tujhe Yaad Na Meri Aayi | Mir Taqi Mir | Mehdi Hassan |

Plus **infinite songs** via YT Music search — AI meanings work for all of them.

---

## Project Structure

```
Shama/
├── frontend/          # Next.js 15 + React 19
├── backend/           # Express API gateway (proxies all services)
├── ml-engine/         # Python ML service (meanings, TTS, RAG)
│   ├── api/           # /api/meaning, /api/split-lyrics
│   ├── tts/           # Edge TTS voice narration
│   ├── rag/           # pgvector embeddings + retrieval
│   ├── scraper/       # Rekhta.org ghazal scraper
│   └── deploy/        # Render, Vercel, Docker configs
├── ytmusic-service/   # YT Music search + LRCLIB synced lyrics
├── SETUP.md           # Detailed setup guide
└── .env               # API keys (gitignored)
```

---

## Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

---

## License

This project is for educational and cultural preservation purposes.

---

*Shama celebrates the soul of Indo-Persian poetry with modern AI. It's more than a translator — it's a cultural bridge, an emotional companion, and a poetic mentor.*
