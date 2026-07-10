"""
ElevenLabs TTS Client for Shama.

Generates warm, poetic narrations of ghazal meanings using the ElevenLabs
multilingual v2 model. Designed around the free-tier constraint of 10,000
characters/month with aggressive budget tracking.
"""

from __future__ import annotations

import io
import logging
import threading
from datetime import datetime, timezone
from typing import Optional

from elevenlabs import ElevenLabs

from .config import TTSConfig, load_config

logger = logging.getLogger(__name__)


class CharacterBudgetExhausted(Exception):
    """Raised when the monthly character budget would be exceeded."""
    pass


class CharacterBudgetTracker:
    """
    Thread-safe monthly character budget tracker.

    Persists usage count in-memory (resets on process restart at month boundary).
    For production, swap with a database-backed counter.
    """

    def __init__(self, monthly_limit: int, warning_threshold: float = 0.8):
        self._lock = threading.Lock()
        self._monthly_limit = monthly_limit
        self._warning_threshold = warning_threshold
        self._chars_used = 0
        self._current_month: str = self._month_key()

    @staticmethod
    def _month_key() -> str:
        return datetime.now(timezone.utc).strftime("%Y-%m")

    def _maybe_reset(self) -> None:
        """Reset counter if we've rolled into a new month."""
        key = self._month_key()
        if key != self._current_month:
            logger.info("New month detected (%s → %s). Resetting character budget.", self._current_month, key)
            self._chars_used = 0
            self._current_month = key

    @property
    def chars_remaining(self) -> int:
        with self._lock:
            self._maybe_reset()
            return max(0, self._monthly_limit - self._chars_used)

    @property
    def is_warning(self) -> bool:
        """True when usage has exceeded the warning threshold."""
        with self._lock:
            self._maybe_reset()
            return self._chars_used >= (self._monthly_limit * self._warning_threshold)

    @property
    def is_exhausted(self) -> bool:
        with self._lock:
            self._maybe_reset()
            return self._chars_used >= self._monthly_limit

    def consume(self, char_count: int) -> int:
        """
        Record character usage. Returns remaining budget after consumption.
        Raises CharacterBudgetExhausted if budget would be exceeded.
        """
        with self._lock:
            self._maybe_reset()
            if self._chars_used + char_count > self._monthly_limit:
                raise CharacterBudgetExhausted(
                    f"Budget exceeded: {self._chars_used}/{self._monthly_limit} used, "
                    f"requested {char_count} more characters."
                )
            self._chars_used += char_count
            remaining = self._monthly_limit - self._chars_used
            if self._chars_used >= (self._monthly_limit * self._warning_threshold):
                logger.warning(
                    "⚠️  TTS character budget at %.0f%% (%d/%d). Consider caching more aggressively.",
                    (self._chars_used / self._monthly_limit) * 100,
                    self._chars_used,
                    self._monthly_limit,
                )
            return remaining


# ---------------------------------------------------------------------------
# Module-level singleton instances
# ---------------------------------------------------------------------------

_config: Optional[TTSConfig] = None
_client: Optional[ElevenLabs] = None
_budget: Optional[CharacterBudgetTracker] = None


def _ensure_initialized() -> tuple[TTSConfig, ElevenLabs, CharacterBudgetTracker]:
    global _config, _client, _budget
    if _config is None:
        _config = load_config()
    if _client is None:
        _client = ElevenLabs(api_key=_config.elevenlabs_api_key)
    if _budget is None:
        _budget = CharacterBudgetTracker(
            monthly_limit=_config.monthly_char_limit,
            warning_threshold=_config.char_warning_threshold,
        )
    return _config, _client, _budget


def get_budget_tracker() -> CharacterBudgetTracker:
    """Return the singleton budget tracker (initializes if needed)."""
    _, _, budget = _ensure_initialized()
    return budget


def resolve_voice_id(voice: str) -> str:
    """Map 'male'/'female' to the configured ElevenLabs voice ID."""
    config, _, _ = _ensure_initialized()
    mapping = {
        "male": config.voice_male_warm,
        "female": config.voice_female_calm,
    }
    return mapping.get(voice, config.voice_male_warm)


def generate_narration(
    text: str,
    voice_id: str,
    language: str = "en",
) -> bytes:
    """
    Generate TTS audio bytes (MP3) via ElevenLabs.

    Args:
        text: The text to narrate.
        voice_id: ElevenLabs voice ID (use resolve_voice_id for preset mapping).
        language: Language hint ('en', 'hi', 'ur'). The multilingual v2 model
                  handles this automatically but the hint helps pronunciation.

    Returns:
        MP3 audio bytes.

    Raises:
        CharacterBudgetExhausted: If monthly budget would be exceeded.
    """
    config, client, budget = _ensure_initialized()

    char_count = len(text)
    # Pre-check budget before calling API
    budget.consume(char_count)

    logger.info(
        "Generating TTS: %d chars, voice=%s, lang=%s", char_count, voice_id, language
    )

    # Use streaming for all requests to handle long texts efficiently
    audio_stream = client.text_to_speech.convert(
        voice_id=voice_id,
        text=text,
        model_id=config.model_id,
        output_format="mp3_44100_128",
    )

    # Collect streamed chunks into a single bytes buffer
    buffer = io.BytesIO()
    for chunk in audio_stream:
        buffer.write(chunk)

    audio_bytes = buffer.getvalue()
    logger.info("TTS generation complete: %d bytes of audio.", len(audio_bytes))
    return audio_bytes


def generate_narration_streaming(
    text: str,
    voice_id: str,
    language: str = "en",
):
    """
    Generator that yields MP3 audio chunks for streaming playback.

    Useful for long explanations where you want to start playback before
    the full audio is ready.

    Yields:
        bytes: Chunks of MP3 audio data.
    """
    config, client, budget = _ensure_initialized()

    char_count = len(text)
    budget.consume(char_count)

    logger.info(
        "Streaming TTS: %d chars, voice=%s, lang=%s", char_count, voice_id, language
    )

    audio_stream = client.text_to_speech.convert(
        voice_id=voice_id,
        text=text,
        model_id=config.model_id,
        output_format="mp3_44100_128",
    )

    for chunk in audio_stream:
        yield chunk
