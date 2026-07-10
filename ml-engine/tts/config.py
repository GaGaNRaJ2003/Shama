"""
TTS Configuration for Shama — The Ghazal & Qawwali Meaning Companion.

ElevenLabs free tier constraints:
  - 10,000 characters/month
  - 3 custom voices
  - Standard latency models only

All secrets are loaded from environment variables.
"""

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class TTSConfig:
    # ElevenLabs
    elevenlabs_api_key: str
    monthly_char_limit: int
    char_warning_threshold: float  # fraction (0.0–1.0), warn when usage exceeds this

    # Pre-made multilingual voice IDs (ElevenLabs free tier includes these)
    # "Daniel" — warm male, multilingual v2
    voice_male_warm: str
    # "Charlotte" — calm female, multilingual v2
    voice_female_calm: str

    # ElevenLabs model for multilingual support (Hindi, Urdu, English)
    model_id: str

    # Supabase Storage
    supabase_url: str
    supabase_key: str
    supabase_bucket: str

    # Rate limiting
    rate_limit_requests: int  # max requests per window
    rate_limit_window_seconds: int


def load_config() -> TTSConfig:
    """Load TTS configuration from environment variables."""
    return TTSConfig(
        elevenlabs_api_key=os.environ.get("ELEVENLABS_API_KEY", ""),
        monthly_char_limit=int(os.environ.get("TTS_MONTHLY_CHAR_LIMIT", "10000")),
        char_warning_threshold=float(os.environ.get("TTS_CHAR_WARNING_THRESHOLD", "0.8")),
        # ElevenLabs pre-made multilingual voices
        voice_male_warm=os.environ.get(
            "ELEVENLABS_VOICE_MALE", "onwK4e9ZLuTAKqWW03F9"  # Daniel
        ),
        voice_female_calm=os.environ.get(
            "ELEVENLABS_VOICE_FEMALE", "XB0fDUnXU5powFXDhCwa"  # Charlotte
        ),
        model_id=os.environ.get(
            "ELEVENLABS_MODEL_ID", "eleven_multilingual_v2"
        ),
        supabase_url=os.environ.get("SUPABASE_URL", ""),
        supabase_key=os.environ.get("SUPABASE_ANON_KEY", ""),
        supabase_bucket=os.environ.get("SUPABASE_BUCKET", "tts-audio"),
        rate_limit_requests=int(os.environ.get("TTS_RATE_LIMIT_REQUESTS", "5")),
        rate_limit_window_seconds=int(os.environ.get("TTS_RATE_LIMIT_WINDOW", "60")),
    )


# Convenience constants for voice selection
VOICE_MALE_WARM = "male"
VOICE_FEMALE_CALM = "female"
