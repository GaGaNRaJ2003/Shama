"""
Audio Cache for Shama TTS.

Aggressively caches generated audio in Supabase Storage to stay within
the ElevenLabs free-tier limit of 10,000 characters/month.

Strategy:
  1. Hash (text + voice_id) → deterministic cache key.
  2. Check if the file already exists in Supabase Storage bucket 'tts-audio'.
  3. If yes → return the public URL immediately (zero ElevenLabs chars consumed).
  4. If no → generate via ElevenLabs, upload to Supabase, return new URL.
"""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass
from typing import Optional

from supabase import create_client, Client

from .config import TTSConfig, load_config
from .edge_tts_client import generate_narration, resolve_voice

logger = logging.getLogger(__name__)


@dataclass
class CacheResult:
    """Result from cache lookup/generation."""
    audio_url: str
    cached: bool  # True if served from cache, False if freshly generated


# ---------------------------------------------------------------------------
# Supabase client singleton
# ---------------------------------------------------------------------------

_supabase: Optional[Client] = None
_config: Optional[TTSConfig] = None


def _get_supabase() -> tuple[Client, TTSConfig]:
    global _supabase, _config
    if _config is None:
        _config = load_config()
    if _supabase is None:
        _supabase = create_client(_config.supabase_url, _config.supabase_key)
    return _supabase, _config


# ---------------------------------------------------------------------------
# Cache key generation
# ---------------------------------------------------------------------------

def _cache_key(text: str, voice_id: str) -> str:
    """
    Generate a deterministic cache key from text content and voice.

    Uses SHA-256 truncated to 32 hex chars — collision-safe for our scale
    and keeps file paths short.
    """
    raw = f"{voice_id}::{text}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_cached_audio(text: str, voice: str, language: str = "en") -> Optional[str]:
    """
    Check if audio for this text+voice already exists in cache.

    Returns:
        Public URL string if cached, None otherwise.
    """
    voice_name = resolve_voice(voice, language)
    key = _cache_key(text, voice_name)
    file_path = f"{language}/{key}.mp3"

    sb, config = _get_supabase()

    try:
        # Try to get public URL — if the file doesn't exist, this will
        # still return a URL but a HEAD request would 404. We list to confirm.
        result = sb.storage.from_(config.supabase_bucket).list(
            path=language,
            options={"search": f"{key}.mp3", "limit": 1},
        )
        if result and any(f.get("name") == f"{key}.mp3" for f in result):
            public_url = sb.storage.from_(config.supabase_bucket).get_public_url(file_path)
            logger.info("Cache HIT: %s", file_path)
            return public_url
    except Exception as e:
        logger.warning("Cache lookup failed (will regenerate): %s", e)

    return None


def get_or_generate_audio(text: str, voice: str, language: str = "en") -> CacheResult:
    """
    Retrieve audio from cache or generate fresh via ElevenLabs.

    This is the primary entry point for the TTS router. It ensures we never
    pay ElevenLabs chars for the same text+voice combination twice.

    Args:
        text: Text to narrate.
        voice: 'male' or 'female'.
        language: 'en', 'hi', or 'ur'.

    Returns:
        CacheResult with audio_url and cached flag.
    """
    voice_name = resolve_voice(voice, language)
    key = _cache_key(text, voice_name)
    file_path = f"{language}/{key}.mp3"

    # 1. Check cache
    cached_url = get_cached_audio(text, voice, language)
    if cached_url:
        return CacheResult(audio_url=cached_url, cached=True)

    # 2. Generate fresh audio via Edge TTS (free, no limits)
    logger.info("Cache MISS: generating audio for %d chars", len(text))
    audio_bytes = generate_narration(text, voice, language)

    # 3. Upload to Supabase Storage
    sb, config = _get_supabase()
    try:
        sb.storage.from_(config.supabase_bucket).upload(
            path=file_path,
            file=audio_bytes,
            file_options={"content-type": "audio/mpeg", "upsert": "true"},
        )
        public_url = sb.storage.from_(config.supabase_bucket).get_public_url(file_path)
        logger.info("Uploaded to cache: %s", file_path)
    except Exception as e:
        logger.error("Failed to upload audio to Supabase: %s", e)
        # Fallback: return a data URI so the user still gets audio even if
        # caching fails (they can play it, we just can't cache it)
        import base64
        data_uri = f"data:audio/mpeg;base64,{base64.b64encode(audio_bytes).decode()}"
        return CacheResult(audio_url=data_uri, cached=False)

    return CacheResult(audio_url=public_url, cached=False)
