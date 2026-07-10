"""
Edge TTS Client for Shama.

Uses Microsoft Edge's neural TTS voices — free, no API key, no rate limits.
Supports Hindi, Urdu, and English with natural-sounding voices.

Voices used:
  - Male (English): en-US-GuyNeural (warm, narrative)
  - Female (English): en-US-AriaNeural (calm, expressive)
  - Male (Hindi): hi-IN-MadhurNeural
  - Female (Hindi): hi-IN-SwaraNeural
  - Male (Urdu): ur-PK-AsadNeural
  - Female (Urdu): ur-PK-UzmaNeural
"""

import asyncio
import io
import logging
from pathlib import Path
from typing import Optional

import edge_tts

logger = logging.getLogger(__name__)

# Voice mapping: (language, gender) → Edge TTS voice name
VOICE_MAP = {
    ("en", "male"): "en-US-GuyNeural",
    ("en", "female"): "en-US-AriaNeural",
    ("hi", "male"): "hi-IN-MadhurNeural",
    ("hi", "female"): "hi-IN-SwaraNeural",
    ("ur", "male"): "ur-PK-AsadNeural",
    ("ur", "female"): "ur-PK-UzmaNeural",
}

# Fallback voice
DEFAULT_VOICE = "en-US-GuyNeural"


def resolve_voice(voice: str = "male", language: str = "en") -> str:
    """Map voice + language to an Edge TTS voice name."""
    return VOICE_MAP.get((language, voice), DEFAULT_VOICE)


async def _generate_audio_async(text: str, voice: str, rate: str = "-5%") -> bytes:
    """Generate TTS audio bytes (MP3) using edge-tts."""
    communicate = edge_tts.Communicate(text=text, voice=voice, rate=rate)
    buffer = io.BytesIO()

    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            buffer.write(chunk["data"])

    audio_bytes = buffer.getvalue()
    logger.info("Edge TTS generated %d bytes of audio (voice=%s)", len(audio_bytes), voice)
    return audio_bytes


def generate_narration(text: str, voice: str = "male", language: str = "en") -> bytes:
    """
    Generate TTS audio (MP3) synchronously.

    Args:
        text: Text to narrate.
        voice: 'male' or 'female'
        language: 'en', 'hi', or 'ur'

    Returns:
        MP3 audio bytes.
    """
    voice_name = resolve_voice(voice, language)
    logger.info("Generating Edge TTS: %d chars, voice=%s, lang=%s", len(text), voice_name, language)

    # Run async edge-tts in a sync context
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # We're inside an async context (FastAPI), use a new thread
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                future = pool.submit(asyncio.run, _generate_audio_async(text, voice_name))
                return future.result(timeout=30)
        else:
            return loop.run_until_complete(_generate_audio_async(text, voice_name))
    except RuntimeError:
        # No event loop exists
        return asyncio.run(_generate_audio_async(text, voice_name))
