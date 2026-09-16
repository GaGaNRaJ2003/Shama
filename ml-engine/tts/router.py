"""
FastAPI Router for Shama TTS (Edge TTS — free, unlimited).

Endpoint:
  POST /api/tts
    Body: { "text": str, "voice": "male"|"female", "language": "en"|"hi"|"ur" }
    Response: { "audio_url": str, "cached": bool, "use_browser_tts": bool }

Rate limited to 5 requests/minute per client IP.
Uses Microsoft Edge neural voices — no API key, no monthly limits.
"""

from __future__ import annotations

import logging
import time
from collections import defaultdict
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from .audio_cache import get_or_generate_audio

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["tts"])

# ---------------------------------------------------------------------------
# Rate limiter (in-memory, per-IP)
# ---------------------------------------------------------------------------

_rate_limit_store: dict[str, list[float]] = defaultdict(list)
RATE_LIMIT_REQUESTS = 5
RATE_LIMIT_WINDOW = 60  # seconds


def _check_rate_limit(client_ip: str) -> None:
    """Simple sliding-window rate limiter."""
    now = time.time()
    timestamps = _rate_limit_store[client_ip]
    _rate_limit_store[client_ip] = [ts for ts in timestamps if now - ts < RATE_LIMIT_WINDOW]

    if len(_rate_limit_store[client_ip]) >= RATE_LIMIT_REQUESTS:
        raise HTTPException(
            status_code=429,
            detail={
                "error": "rate_limit_exceeded",
                "message": f"Maximum {RATE_LIMIT_REQUESTS} TTS requests per {RATE_LIMIT_WINDOW}s.",
                "retry_after_seconds": RATE_LIMIT_WINDOW,
            },
        )
    _rate_limit_store[client_ip].append(now)


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000, description="Text to narrate")
    voice: Literal["male", "female"] = Field(default="male", description="Voice preset")
    language: Literal["en", "hi", "ur"] = Field(default="en", description="Language")


class TTSResponse(BaseModel):
    audio_url: str = Field(..., description="URL or data URI of the audio")
    cached: bool = Field(..., description="Whether served from cache")
    use_browser_tts: bool = Field(default=False, description="Fallback flag")


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post("/tts", response_model=TTSResponse)
async def text_to_speech(request: Request, body: TTSRequest):
    """
    Generate TTS audio using Microsoft Edge neural voices.
    Free, unlimited, no API key required.
    """
    peer = request.client.host if request.client else "unknown"
    # Behind the gateway every call arrives from loopback, which made this one
    # bucket shared by every listener. Only a loopback peer is trusted to name
    # the real client; anyone else could simply write the header themselves.
    client_ip = peer
    if peer in ("127.0.0.1", "::1"):
        client_ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or peer
    _check_rate_limit(client_ip)

    try:
        # Off the event loop: generation blocks on Supabase and edge-tts, and
        # every other request (health, meaning) used to wait behind it.
        result = await run_in_threadpool(get_or_generate_audio, body.text, body.voice, body.language)
    except Exception as e:
        logger.error("TTS generation failed: %s", e, exc_info=True)
        # Signal frontend to use browser TTS as last resort
        return TTSResponse(audio_url="", cached=False, use_browser_tts=True)

    return TTSResponse(
        audio_url=result.audio_url,
        cached=result.cached,
        use_browser_tts=False,
    )
