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
import time
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
import asyncio  # noqa: E402
from starlette.concurrency import run_in_threadpool  # noqa: E402

from api.llm_client import (  # noqa: E402
    LLMRouter,
    AllProvidersFailed,
    MalformedLLMResponse,
)
from api.cache import MeaningCache, CACHE_DEPTH  # noqa: E402
from api.prompts import SYSTEM_PROMPT, build_prompt  # noqa: E402
from api.couplet_detector import detect_couplets  # noqa: E402
from api.aligner import align_couplets, map_occurrences  # noqa: E402
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
    # The cache WRITES, and RLS grants writes to service_role only — the anon
    # key gets 42501 "permission denied" on this table, which is why caching
    # has silently never worked. Fall back to anon so a service-role-less
    # deployment still degrades rather than crashing.
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")

    # Initialize LLM router
    try:
        llm_router = LLMRouter(groq_api_key=groq_key, gemini_api_key=gemini_key)
        logger.info("✓ LLM Router initialized: %s", llm_router.status)
    except ValueError as e:
        logger.error("✗ LLM Router failed: %s", e)
        llm_router = None

    # Initialize meaning cache and prove it is actually usable.
    cache = MeaningCache(supabase_url=supabase_url, supabase_key=supabase_key)
    if cache.enabled and not cache.verify():
        logger.error("✗ Meaning cache unreachable: %s", cache.last_error)
    logger.info("✓ Meaning cache: %s", "reachable" if cache.reachable else "unavailable")

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
RAG_ENABLED = os.getenv("RAG_ENABLED", "1") not in ("0", "false", "False")
_rag_last_error: str | None = None


def _retrieve_rag_context(couplet: str, top_k: int = 3) -> list[str]:
    """Retrieve similar couplets from Supabase pgvector. Graceful on failure."""
    global _rag_last_error
    if not RAG_ENABLED:
        return []
    try:
        from rag import retrieve_similar_couplets
        matches = retrieve_similar_couplets(couplet, match_count=top_k)
        _rag_last_error = None
        return [m.as_context_str() for m in matches]
    except Exception as e:
        _rag_last_error = str(e)[:200]
        logger.warning("RAG retrieval unavailable (non-fatal): %s", e)
        return []


def _rag_status() -> tuple[bool, str]:
    """Report whether retrieval actually returns rows (for /health).

    "The RPC didn't throw" is not the same as "retrieval works" — the old
    `match_couplets` name failed loudly, but an empty result set would look
    identical to a healthy one. So report the count.
    """
    if not RAG_ENABLED:
        return False, "disabled via RAG_ENABLED"
    try:
        from rag import retrieve_similar_couplets
        rows = retrieve_similar_couplets("dil-e-nadaan tujhe hua kya hai", match_count=3)
        return bool(rows), f"{len(rows)} rows for a known-corpus couplet"
    except Exception as e:
        return False, str(e)[:200]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.get("/health")
async def health():
    """Health check that proves reachability rather than reporting env vars.

    The previous version reported `cache_enabled: True` whenever credentials
    existed, even while every query was returning 42501.
    """
    cache_ok = await run_in_threadpool(cache.verify) if cache else False
    rag_ok, rag_detail = await run_in_threadpool(_rag_status)

    healthy = bool(llm_router)
    return {
        "status": "healthy" if healthy else "degraded",
        "service": "shama-ml-engine",
        "llm": {
            "available": llm_router is not None,
            "providers": llm_router.status_now() if llm_router else {},
        },
        "cache": {
            "enabled": cache.enabled if cache else False,
            "reachable": cache_ok,
            "error": cache.last_error if cache else "not initialized",
        },
        "rag": {"available": rag_ok, "detail": rag_detail},
        "elevenlabs_configured": bool(os.getenv("ELEVENLABS_API_KEY")),
    }


# Coalesces concurrent requests for the same couplet so N listeners viewing the
# same sher trigger one LLM call, not N.
_inflight: dict[str, asyncio.Future] = {}
_inflight_lock = asyncio.Lock()


def _generate_meaning_sync(couplet: str, poet: str | None, language: str) -> dict:
    """All the blocking work, run off the event loop in one hop.

    Phase timings are logged because "the meaning is slow" has several very
    different causes (cold embedding model, retrieval, generation) and they
    need telling apart.
    """
    t0 = time.perf_counter()
    rag_context = _retrieve_rag_context(couplet)
    t_rag = time.perf_counter() - t0

    user_prompt = build_prompt(
        couplet=couplet,
        poet=poet,
        language=language,
        rag_context=rag_context or None,
    )

    t1 = time.perf_counter()
    meaning = llm_router.generate(SYSTEM_PROMPT, user_prompt)
    t_llm = time.perf_counter() - t1

    logger.info(
        "meaning timing: rag=%.2fs llm=%.2fs (%s) total=%.2fs",
        t_rag, t_llm, llm_router.last_model, time.perf_counter() - t0,
    )
    return _normalize_meaning(meaning)


@app.post("/api/meaning", response_model=MeaningResponse)
async def get_meaning(request: MeaningRequest):
    """
    Generate a rich interpretation for a ghazal/qawwali couplet.

    Flow: cache → RAG → LLM → cache → response. One response carries both the
    plain and the close reading, so the UI never needs a second call.
    """
    if not llm_router:
        raise HTTPException(status_code=503, detail="The meaning service is not available.")

    couplet = request.couplet.strip()
    language = request.language.value
    poet = request.poet

    # 1. Cache (blocking client → threadpool)
    if cache and cache.enabled:
        cached = await run_in_threadpool(cache.get, couplet, language)
        if cached:
            return MeaningResponse(**cached, cached=True)

    # 2. Generate, coalescing duplicate concurrent work.
    key = f"{language}|{' '.join(couplet.lower().split())}"
    async with _inflight_lock:
        pending = _inflight.get(key)
        if pending is None:
            pending = asyncio.ensure_future(
                run_in_threadpool(_generate_meaning_sync, couplet, poet, language)
            )
            _inflight[key] = pending
            owner = True
        else:
            owner = False

    try:
        meaning = await asyncio.shield(pending)
    except AllProvidersFailed as e:
        logger.error("meaning generation failed: %s", e.detail)
        raise HTTPException(status_code=503, detail="The meaning service is busy. Please try again.")
    except MalformedLLMResponse as e:
        logger.error("meaning generation returned unusable output: %s", e)
        raise HTTPException(status_code=502, detail="The meaning could not be prepared.")
    except Exception as e:
        logger.exception("unexpected meaning failure: %s", e)
        raise HTTPException(status_code=503, detail="The meaning service is unavailable.")
    finally:
        if owner:
            async with _inflight_lock:
                _inflight.pop(key, None)

    # 3. Cache — only ever a real result. Errors raise above and are never
    #    written, so a bad provider day can't poison a couplet permanently.
    if owner and cache and cache.enabled:
        await run_in_threadpool(
            cache.store, couplet, poet, language, meaning, CACHE_DEPTH,
            llm_router.last_provider, llm_router.last_model,
        )

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
    confidence: float = 0.0
    group_type: str = "sher"


class SplitLyricsResponse(BaseModel):
    couplets: list[CoupletItem]
    total_couplets: int
    radif: str | None = None
    detection_method: str = "unknown"
    song_structure: str = "unknown"


@app.post("/api/split-lyrics", response_model=SplitLyricsResponse)
async def split_lyrics_endpoint(request: SplitLyricsRequest):
    """
    Intelligently detect and segment couplets from raw lyrics.

    Uses pattern recognition (blank-line grouping, radif/qafia detection,
    refrain collapsing) to produce proper sher pairs for any ghazal, geet,
    or qawwali. Works for the entire song — not just partial lyrics.
    """
    result = detect_couplets(
        lyrics_text=request.lyrics_text,
        title=request.title,
        artist=request.artist,
    )

    return SplitLyricsResponse(
        couplets=result["couplets"],
        total_couplets=result["total_couplets"],
        radif=result.get("radif"),
        detection_method=result.get("detection_method", "unknown"),
        song_structure=result.get("song_structure", "unknown"),
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Couplet alignment — derives couplet timings from synced lyrics so a listener
# never has to stamp them by hand.
# ---------------------------------------------------------------------------
class SyncedLineIn(BaseModel):
    time_ms: int
    text: str = ""


class AlignRequest(BaseModel):
    # Per couplet, the same words in every script we hold. Sending all of them
    # lets the matcher work in whichever script the lyric source used.
    couplets: list[list[str]] = Field(..., max_length=200)
    lines: list[SyncedLineIn] = Field(..., max_length=2000)
    min_confidence: float = Field(0.5, ge=0.0, le=1.0)


class AlignedCouplet(BaseModel):
    index: int
    time: float | None
    confidence: float


class OccurrenceItem(BaseModel):
    time: float
    # None = sung, but we hold no couplet for it. The words still matter.
    couplet: int | None
    confidence: float
    text: str


class AlignResponse(BaseModel):
    aligned: list[AlignedCouplet]
    # Every moment a couplet is sung, not just the first — a ghazal returns to
    # its lines constantly, and that repetition is most of the performance.
    occurrences: list[OccurrenceItem] = []
    matched: int
    total: int
    # Share of the recording's sung lines we can name a couplet for.
    coverage: float = 0.0


@app.post("/api/align-couplets", response_model=AlignResponse)
async def align_couplets_endpoint(request: AlignRequest):
    """Map couplets onto time-synced lyric lines, preserving couplet order."""
    payload = [l.model_dump() for l in request.lines]

    result = await run_in_threadpool(
        align_couplets, request.couplets, payload, request.min_confidence
    )
    occurrences = await run_in_threadpool(
        map_occurrences, request.couplets, payload, request.min_confidence
    )

    aligned = [AlignedCouplet(index=a.index, time=a.time, confidence=a.confidence) for a in result]
    named = sum(1 for o in occurrences if o.couplet is not None)
    return AlignResponse(
        aligned=aligned,
        occurrences=[
            OccurrenceItem(time=o.time, couplet=o.couplet, confidence=o.confidence, text=o.text)
            for o in occurrences
        ],
        matched=sum(1 for a in aligned if a.time is not None),
        total=len(aligned),
        coverage=round(named / len(occurrences), 3) if occurrences else 0.0,
    )


if __name__ == "__main__":
    port = int(os.getenv("ML_ENGINE_PORT", "8001"))
    uvicorn.run("main:app", host="127.0.0.1", port=port, reload=True)
