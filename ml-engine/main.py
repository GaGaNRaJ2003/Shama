"""
Shama ML Engine — Unified Service
==================================
Single FastAPI app combining:
  - POST /api/meaning  → Ghazal/Qawwali couplet interpretation (RAG + Groq/Gemini)
  - POST /api/tts      → ElevenLabs voice narration with caching
  - GET  /health       → Service health check

Run:
    cd ml-engine
    pip install -r requirements.txt
    python main.py

Serves at: http://127.0.0.1:8001
"""

import logging
import os
import sys
from contextlib import asynccontextmanager

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load .env from project root first, then ml-engine local
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"), override=True)

# Ensure ml-engine is on sys.path for internal imports
ML_ENGINE_DIR = os.path.dirname(os.path.abspath(__file__))
if ML_ENGINE_DIR not in sys.path:
    sys.path.insert(0, ML_ENGINE_DIR)

# Configure logging
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("shama.ml-engine")

# ---------------------------------------------------------------------------
# Lazy imports of sub-modules (after .env is loaded and sys.path is set)
# ---------------------------------------------------------------------------
from api.llm_client import LLMRouter  # noqa: E402
from api.cache import MeaningCache  # noqa: E402
from api.prompts import SYSTEM_PROMPT, build_prompt  # noqa: E402
from api.lyrics_splitter import split_lyrics  # noqa: E402
from tts.router import router as tts_router  # noqa: E402


# ---------------------------------------------------------------------------
# Globals
# ---------------------------------------------------------------------------
llm_router: LLMRouter | None = None
cache: MeaningCache | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize services on startup, cleanup on shutdown."""
    global llm_router, cache

    groq_key = os.getenv("GROQ_API_KEY")
    gemini_key = os.getenv("GEMINI_API_KEY")
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_ANON_KEY")

    # Initialize LLM router
    try:
        llm_router = LLMRouter(groq_api_key=groq_key, gemini_api_key=gemini_key)
        logger.info("✓ LLM Router initialized (Groq=%s, Gemini=%s)",
                    "ON" if groq_key else "OFF",
                    "ON" if gemini_key else "OFF")
    except ValueError as e:
        logger.error("✗ LLM Router failed: %s", e)
        llm_router = None

    # Initialize meaning cache
    cache = MeaningCache(supabase_url=supabase_url, supabase_key=supabase_key)
    logger.info("✓ Meaning cache: %s", "enabled" if cache.enabled else "disabled (no Supabase)")

    logger.info("═══════════════════════════════════════════")
    logger.info("  Shama ML Engine running at :8001")
    logger.info("  Endpoints: /api/meaning, /api/tts, /api/split-lyrics, /health")
    logger.info("═══════════════════════════════════════════")

    yield

    logger.info("Shama ML Engine shutting down")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Shama ML Engine",
    description="AI-powered Ghazal & Qawwali meaning + voice narration",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow frontend + backend origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5000",
        os.getenv("FRONTEND_URL", ""),
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount TTS router
app.include_router(tts_router)


# ---------------------------------------------------------------------------
# Meaning endpoint models
# ---------------------------------------------------------------------------
from enum import Enum  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402
from fastapi import HTTPException  # noqa: E402


class Language(str, Enum):
    roman = "roman"
    urdu = "urdu"
    hindi = "hindi"
    english = "english"


class Depth(str, Enum):
    simple = "simple"
    detailed = "detailed"


class MeaningRequest(BaseModel):
    couplet: str = Field(..., min_length=3, max_length=1000)
    poet: str | None = Field(None, max_length=200)
    language: Language = Field(Language.roman)
    depth: Depth = Field(Depth.simple)


class VocabularyItem(BaseModel):
    term: str
    meaning: str
    script: str = ""


class LiteraryDevice(BaseModel):
    device: str
    english_name: str
    explanation: str


class MeaningResponse(BaseModel):
    translation: str
    simple: str
    detailed: str
    vocabulary: list[VocabularyItem] = []
    literary_devices: list[LiteraryDevice] = []
    mood: str
    cached: bool = False


# ---------------------------------------------------------------------------
# RAG retrieval helper
# ---------------------------------------------------------------------------
def _retrieve_rag_context(couplet: str, top_k: int = 3) -> list[str]:
    """Retrieve similar couplets from Supabase pgvector. Graceful on failure."""
    try:
        from rag import retrieve_similar_couplets
        matches = retrieve_similar_couplets(couplet, match_count=top_k)
        return [m.as_context_str() for m in matches]
    except Exception as e:
        logger.warning("RAG retrieval unavailable (non-fatal): %s", e)
        return []


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.get("/health")
async def health():
    """Service health check."""
    return {
        "status": "healthy",
        "service": "shama-ml-engine",
        "llm_available": llm_router is not None,
        "cache_enabled": cache.enabled if cache else False,
        "groq_configured": bool(os.getenv("GROQ_API_KEY")),
        "gemini_configured": bool(os.getenv("GEMINI_API_KEY")),
        "elevenlabs_configured": bool(os.getenv("ELEVENLABS_API_KEY")),
    }


@app.post("/api/meaning", response_model=MeaningResponse)
async def get_meaning(request: MeaningRequest):
    """
    Generate rich meaning/interpretation for a ghazal/qawwali couplet.

    Flow: Cache check → RAG retrieval → LLM generation → Cache store → Response
    """
    if not llm_router:
        raise HTTPException(status_code=503, detail="LLM service not initialized. Check API keys.")

    couplet = request.couplet.strip()
    language = request.language.value
    depth = request.depth.value
    poet = request.poet

    # 1. Check cache
    if cache and cache.enabled:
        cached = cache.get(couplet, language, depth)
        if cached:
            logger.info("Cache HIT: %s...", couplet[:40])
            return MeaningResponse(**cached, cached=True)

    # 2. RAG context
    rag_context = _retrieve_rag_context(couplet)

    # 3. Build prompt & call LLM
    user_prompt = build_prompt(
        couplet=couplet,
        poet=poet,
        language=language,
        depth=depth,
        rag_context=rag_context if rag_context else None,
    )

    try:
        meaning = llm_router.generate(SYSTEM_PROMPT, user_prompt)
    except Exception as e:
        logger.error("LLM generation failed: %s", e)
        raise HTTPException(status_code=503, detail="AI service temporarily unavailable.")

    # 4. Normalize response
    meaning = _normalize_meaning(meaning)

    # 5. Cache result
    if cache and cache.enabled:
        cache.store(couplet, poet, language, depth, meaning)

    return MeaningResponse(**meaning, cached=False)


def _normalize_meaning(meaning: dict) -> dict:
    """Ensure all required fields exist with proper types."""
    defaults = {
        "translation": "",
        "simple": "",
        "detailed": "",
        "vocabulary": [],
        "literary_devices": [],
        "mood": "unknown",
    }
    for key, default in defaults.items():
        if key not in meaning or meaning[key] is None:
            meaning[key] = default

    # Normalize vocabulary
    meaning["vocabulary"] = [
        {"term": v.get("term", ""), "meaning": v.get("meaning", ""), "script": v.get("script", "")}
        for v in meaning.get("vocabulary", []) if isinstance(v, dict)
    ]

    # Normalize literary devices
    meaning["literary_devices"] = [
        {"device": d.get("device", ""), "english_name": d.get("english_name", ""), "explanation": d.get("explanation", "")}
        for d in meaning.get("literary_devices", []) if isinstance(d, dict)
    ]

    return meaning


# ---------------------------------------------------------------------------
# Lyrics Splitter endpoint
# ---------------------------------------------------------------------------

class SplitLyricsRequest(BaseModel):
    lyrics_text: str = Field(..., min_length=1, max_length=50000)
    title: str | None = Field(None, max_length=500)
    artist: str | None = Field(None, max_length=500)


class CoupletItem(BaseModel):
    index: int
    line1: str
    line2: str | None
    combined_text: str
    is_refrain: bool


class SplitLyricsResponse(BaseModel):
    couplets: list[CoupletItem]
    total_couplets: int


@app.post("/api/split-lyrics", response_model=SplitLyricsResponse)
async def split_lyrics_endpoint(request: SplitLyricsRequest):
    """
    Split raw lyrics text into structured couplets (sher).

    Takes raw lyrics (typically from YouTube Music) and intelligently segments
    them into pairs of lines, handling instrumental markers, timestamps,
    section headers, and refrain detection.
    """
    couplets = split_lyrics(
        lyrics_text=request.lyrics_text,
        title=request.title,
        artist=request.artist,
    )

    return SplitLyricsResponse(
        couplets=couplets,
        total_couplets=len(couplets),
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    port = int(os.getenv("ML_ENGINE_PORT", "8001"))
    uvicorn.run("main:app", host="127.0.0.1", port=port, reload=True)
