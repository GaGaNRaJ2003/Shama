"""
LLM client abstraction with Groq (primary) and Gemini (fallback).
Handles rate limiting and automatic fallback between providers.
"""

import json
import logging
import time
from abc import ABC, abstractmethod

from groq import Groq, RateLimitError as GroqRateLimitError, APIStatusError as GroqAPIStatusError
import google.generativeai as genai

logger = logging.getLogger(__name__)


class LLMClient(ABC):
    """Abstract base class for LLM clients."""

    @abstractmethod
    def generate(self, system_prompt: str, user_prompt: str) -> dict:
        """Generate a response and return parsed JSON dict."""
        ...

    def _parse_json_response(self, text: str) -> dict:
        """Parse JSON from LLM response, handling common formatting issues."""
        # Strip markdown code fences if present
        cleaned = text.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        elif cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

        try:
            return json.loads(cleaned)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse LLM JSON response: {e}")
            logger.debug(f"Raw response: {text[:500]}")
            # Return a minimal valid structure
            return {
                "translation": "Error parsing response. Please try again.",
                "simple": "The AI response could not be parsed correctly.",
                "detailed": f"Raw response parsing failed. First 200 chars: {text[:200]}",
                "vocabulary": [],
                "literary_devices": [],
                "mood": "unknown",
            }


class GroqClient(LLMClient):
    """Groq API client using llama-3.3-70b-versatile (free tier)."""

    MODEL = "llama-3.3-70b-versatile"
    # Free tier limits: 30 req/min, 14,400 req/day
    MAX_RETRIES = 2
    RETRY_DELAY = 2.0  # seconds

    def __init__(self, api_key: str):
        self.client = Groq(api_key=api_key)
        self._last_request_time = 0.0
        self._min_interval = 2.1  # ~28 req/min to stay under 30/min limit

    def generate(self, system_prompt: str, user_prompt: str) -> dict:
        """Generate completion via Groq. Raises GroqRateLimitError if rate limited."""
        # Simple rate limiting
        elapsed = time.time() - self._last_request_time
        if elapsed < self._min_interval:
            time.sleep(self._min_interval - elapsed)

        for attempt in range(self.MAX_RETRIES + 1):
            try:
                self._last_request_time = time.time()
                response = self.client.chat.completions.create(
                    model=self.MODEL,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    temperature=0.7,
                    max_tokens=2048,
                    response_format={"type": "json_object"},
                )
                content = response.choices[0].message.content
                logger.info(f"Groq response received (attempt {attempt + 1})")
                return self._parse_json_response(content)

            except GroqRateLimitError:
                logger.warning(f"Groq rate limited (attempt {attempt + 1})")
                if attempt < self.MAX_RETRIES:
                    time.sleep(self.RETRY_DELAY * (attempt + 1))
                else:
                    raise  # Let the fallback handler catch this

            except GroqAPIStatusError as e:
                logger.error(f"Groq API error: {e.status_code} - {e.message}")
                if attempt < self.MAX_RETRIES and e.status_code >= 500:
                    time.sleep(self.RETRY_DELAY)
                else:
                    raise


class GeminiClient(LLMClient):
    """Google Gemini 2.0 Flash client (free tier fallback)."""

    MODEL = "gemini-2.0-flash"
    MAX_RETRIES = 2
    RETRY_DELAY = 1.5

    def __init__(self, api_key: str):
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel(
            self.MODEL,
            generation_config=genai.GenerationConfig(
                temperature=0.7,
                max_output_tokens=2048,
                response_mime_type="application/json",
            ),
        )

    def generate(self, system_prompt: str, user_prompt: str) -> dict:
        """Generate completion via Gemini."""
        full_prompt = f"{system_prompt}\n\n{user_prompt}"

        for attempt in range(self.MAX_RETRIES + 1):
            try:
                response = self.model.generate_content(full_prompt)
                content = response.text
                logger.info(f"Gemini response received (attempt {attempt + 1})")
                return self._parse_json_response(content)

            except Exception as e:
                logger.error(f"Gemini error (attempt {attempt + 1}): {e}")
                if attempt < self.MAX_RETRIES:
                    time.sleep(self.RETRY_DELAY * (attempt + 1))
                else:
                    raise


class LLMRouter:
    """Routes requests to Groq (primary) with Gemini fallback."""

    def __init__(self, groq_api_key: str | None, gemini_api_key: str | None):
        self.groq_client: GroqClient | None = None
        self.gemini_client: GeminiClient | None = None

        if groq_api_key:
            self.groq_client = GroqClient(groq_api_key)
            logger.info("Groq client initialized (primary)")

        if gemini_api_key:
            self.gemini_client = GeminiClient(gemini_api_key)
            logger.info("Gemini client initialized (fallback)")

        if not self.groq_client and not self.gemini_client:
            raise ValueError("At least one LLM API key must be provided (GROQ_API_KEY or GEMINI_API_KEY)")

    def generate(self, system_prompt: str, user_prompt: str) -> dict:
        """
        Try Groq first, fall back to Gemini on rate limit or failure.
        Returns parsed JSON dict.
        """
        errors = []

        # Try Groq (primary)
        if self.groq_client:
            try:
                return self.groq_client.generate(system_prompt, user_prompt)
            except GroqRateLimitError:
                logger.warning("Groq rate limited, falling back to Gemini")
                errors.append("Groq: rate limited")
            except Exception as e:
                logger.error(f"Groq failed: {e}")
                errors.append(f"Groq: {str(e)[:100]}")

        # Try Gemini (fallback)
        if self.gemini_client:
            try:
                return self.gemini_client.generate(system_prompt, user_prompt)
            except Exception as e:
                logger.error(f"Gemini failed: {e}")
                errors.append(f"Gemini: {str(e)[:100]}")

        # Both failed
        error_msg = "; ".join(errors)
        logger.critical(f"All LLM providers failed: {error_msg}")
        return {
            "translation": "Service temporarily unavailable. Please try again in a moment.",
            "simple": f"All AI providers are currently unavailable. Errors: {error_msg}",
            "detailed": "The system could not generate an interpretation at this time. This is usually due to rate limiting on free-tier APIs. Please wait a minute and try again.",
            "vocabulary": [],
            "literary_devices": [],
            "mood": "unavailable",
        }
