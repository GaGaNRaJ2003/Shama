"""
Shama Inference API — Ghazal & Qawwali Meaning Engine

FastAPI service that takes a couplet and returns rich meaning/interpretation
using RAG context + free-tier LLMs (Groq llama-3.3-70b / Gemini 2.0 Flash).

Run:
    cd ml-engine/api
    uvicorn main:app --reload --port 8001
"""

import logging
import os
from contextlib import asynccontextmanager
from enum import Enum

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .cache import MeaningCache
from .llm_client import LLMRouter
from .prompts import SYSTEM_PROMPT, build_prompt

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


# --- Configuration ---
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")


# --- Globals (initialized at startup) ---
llm_router: LLMRouter | None = None
cache: MeaningCache | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize services on startup."""
    global llm_router, cache

    # Initialize LLM router
    llm_router = LLMRouter(
        groq_api_key=GROQ_API_KEY,
        gemini_api_key=GEMINI_API_KEY,
    )

    # Initialize cache
    cache = MeaningCache(
        supabase_url=SUPABASE_URL,
        supabase_key=SUPABASE_KEY,
    )

    logger.info("Shama Inference API started")
    yield
    logger.info("Shama Inference API shutting down")


# --- App ---
app = FastAPI(
    title="Shama Inference API",
    description="Ghazal & Qawwali meaning engine powered by RAG + free-tier LLMs",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Models ---
class Language(str, Enum):
    roman = "roman"
    urdu = "urdu"
    hindi = "hindi"
    english = "english"


class Depth(str, Enum):
    simple = "simple"
    detailed = "detailed"


class MeaningRequest(BaseModel):
    couplet: str = Field(..., min_length=3, max_length=1000, description="The ghazal/qawwali couplet to interpret")
    poet: str | None = Field(None, max_length=200, description="Poet name (optional, helps context)")
    language: Language = Field(Language.roman, description="Response language")
    depth: Depth = Field(Depth.simple, description="Interpretation depth")


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


# --- RAG Retriever ---
def retrieve_similar_couplets_for_context(couplet: str, top_k: int = 3) -> list[str]:
    """
    Retrieve similar couplets from the existing RAG module (Supabase pgvector).
    Gracefully returns empty list if the RAG service is unavailable.
    """
    try:
        import sys
        import os

        # Add parent directory to path so we can import the rag module
        parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        if parent_dir not in sys.path:
            sys.path.insert(0, parent_dir)

        from rag import retrieve_similar_couplets as rag_retrieve

        matches = rag_retrieve(couplet, match_count=top_k)
        return [match.as_context_str() for match in matches]
    except ImportError:
        logger.warning("RAG module not available — running without retrieval context")
        return []
    except Exception as e:
        logger.warning(f"RAG retrieval failed (non-fatal): {e}")
        return []


# --- Endpoints ---
@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "groq_configured": bool(GROQ_API_KEY),
        "gemini_configured": bool(GEMINI_API_KEY),
        "cache_enabled": cache.enabled if cache else False,
    }


@app.post("/api/meaning", response_model=MeaningResponse)
async def get_meaning(request: MeaningRequest):
    """
    Generate rich meaning/interpretation for a ghazal couplet.

    Flow:
    1. Check cache (Supabase) for existing interpretation
    2. If miss: retrieve RAG context → build prompt → call LLM
    3. Cache the result and return
    """
    if not llm_router:
        raise HTTPException(status_code=503, detail="LLM service not initialized")

    couplet = request.couplet.strip()
    language = request.language.value
    depth = request.depth.value
    poet = request.poet

    # 1. Check cache
    if cache:
        cached_meaning = cache.get(couplet, language, depth)
        if cached_meaning:
            logger.info(f"Returning cached meaning for: {couplet[:40]}...")
            return MeaningResponse(**cached_meaning, cached=True)

    # 2. Retrieve RAG context
    rag_context = retrieve_similar_couplets_for_context(couplet)

    # 3. Build prompt
    user_prompt = build_prompt(
        couplet=couplet,
        poet=poet,
        language=language,
        depth=depth,
        rag_context=rag_context if rag_context else None,
    )

    # 4. Call LLM (with auto-fallback)
    try:
        meaning = llm_router.generate(SYSTEM_PROMPT, user_prompt)
    except Exception as e:
        logger.error(f"LLM generation failed completely: {e}")
        raise HTTPException(
            status_code=503,
            detail="AI service temporarily unavailable. Please try again shortly.",
        )

    # 5. Validate and normalize response
    meaning = _normalize_meaning(meaning)

    # 6. Cache the result (fire-and-forget, non-blocking)
    if cache:
        cache.store(couplet, poet, language, depth, meaning)

    return MeaningResponse(**meaning, cached=False)


def _normalize_meaning(meaning: dict) -> dict:
    """Ensure meaning dict has all required fields with proper types."""
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

    # Normalize vocabulary items
    normalized_vocab = []
    for item in meaning.get("vocabulary", []):
        if isinstance(item, dict):
            normalized_vocab.append({
                "term": item.get("term", ""),
                "meaning": item.get("meaning", ""),
                "script": item.get("script", ""),
            })
    meaning["vocabulary"] = normalized_vocab

    # Normalize literary devices
    normalized_devices = []
    for item in meaning.get("literary_devices", []):
        if isinstance(item, dict):
            normalized_devices.append({
                "device": item.get("device", ""),
                "english_name": item.get("english_name", ""),
                "explanation": item.get("explanation", ""),
            })
    meaning["literary_devices"] = normalized_devices

    return meaning


# --- Run directly ---
if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
