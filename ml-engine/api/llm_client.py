"""
LLM client abstraction with configurable provider order and fallback.

Two rules this module exists to enforce:

1. **Nothing internal ever reaches the caller.** Provider names, model ids and raw
   SDK exception text are logged here and never placed in a field the reader can
   see. Total failure raises `AllProvidersFailed`; it does NOT return a
   plausible-looking dict, because callers cache what they are handed.
2. **Model ids are configuration, not code.** Providers decommission models
   without notice (that is exactly how `gemini-2.0-flash` and
   `llama-3.3-70b-versatile` broke). Every id can be overridden by env var.
"""

import json
import logging
import os
import time
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)

# SDKs are optional: a missing package disables that provider rather than
# crashing the service at import time.
try:
    from groq import (
        Groq,
        RateLimitError as GroqRateLimitError,
        APIStatusError as GroqAPIStatusError,
    )
except Exception:  # pragma: no cover - exercised only when groq isn't installed
    Groq = None

    class GroqRateLimitError(Exception):
        ...

    class GroqAPIStatusError(Exception):
        ...

try:
    import google.generativeai as genai
except Exception:  # pragma: no cover
    genai = None


# Verified against this account's model list. No llama models are available to
# it — `llama-3.3-70b-versatile` returned 404 model_not_found, which is the
# original outage. Override with GROQ_MODEL.
DEFAULT_GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
# A rolling alias rather than a pinned id, deliberately. This project has now
# lost service twice to silent decommissioning (`gemini-2.0-flash`, then
# `gemini-2.5-flash`, which ListModels still advertises but which 404s with
# "no longer available to new users"). The alias tracks the current flash
# model; pin GEMINI_MODEL if you ever need reproducible output.
DEFAULT_GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-flash-latest")
# Gemini is first by default: it is the provider whose credentials are known good.
DEFAULT_PROVIDER_ORDER = os.getenv("LLM_PROVIDER_ORDER", "gemini,groq")
# How long to stop asking a provider that just told us it is out of quota.
RATE_LIMIT_COOLDOWN = int(os.getenv("LLM_RATE_LIMIT_COOLDOWN", "300"))


class AllProvidersFailed(RuntimeError):
    """Every configured provider failed. `detail` is for logs only — never for users."""

    def __init__(self, detail: str):
        super().__init__("All LLM providers failed")
        self.detail = detail


class MalformedLLMResponse(RuntimeError):
    """The provider answered, but not with usable JSON."""


def _is_rate_limited(exc: Exception) -> bool:
    """Quota/rate-limit exhaustion, across SDKs that all spell it differently."""
    status = getattr(exc, "status_code", None)
    if status == 429:
        return True
    text = f"{type(exc).__name__} {exc}".lower()
    return any(k in text for k in ("429", "resourceexhausted", "rate limit", "ratelimit", "quota"))


def _is_retryable(exc: Exception) -> bool:
    """Only transient conditions deserve a retry.

    Retrying a 404 (decommissioned model) or a 401/403 (bad key) just adds
    seconds of blocking sleep to a request that was never going to succeed —
    which is what previously turned a dead model id into a ~10s hang.
    """
    status = getattr(exc, "status_code", None) or getattr(exc, "code", None)
    if callable(status):  # some SDKs expose code() as a method
        try:
            status = status()
        except Exception:
            status = None
    if isinstance(status, int):
        return status == 429 or status >= 500
    name = type(exc).__name__.lower()
    return any(k in name for k in ("timeout", "unavailable", "deadline", "connection", "ratelimit"))


class LLMClient(ABC):
    """Abstract base class for LLM clients."""

    name = "llm"

    @abstractmethod
    def generate(
        self, system_prompt: str, user_prompt: str, retry_rate_limits: bool = True
    ) -> dict:
        """Generate a response and return parsed JSON dict."""
        ...

    def _parse_json_response(self, text: str) -> dict:
        """Parse JSON from an LLM response, tolerating code fences and preamble."""
        cleaned = (text or "").strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        elif cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError:
            # Last resort: pull the outermost {...} out of a chatty response.
            start, end = cleaned.find("{"), cleaned.rfind("}")
            if start != -1 and end > start:
                try:
                    parsed = json.loads(cleaned[start : end + 1])
                except json.JSONDecodeError:
                    logger.error("LLM returned unparseable JSON: %s", cleaned[:500])
                    raise MalformedLLMResponse("response was not valid JSON")
            else:
                logger.error("LLM returned unparseable JSON: %s", cleaned[:500])
                raise MalformedLLMResponse("response was not valid JSON")

        # A JSON array or bare string is not a meaning; treating it as one used
        # to surface as an HTTP 500 further down the handler.
        if not isinstance(parsed, dict):
            logger.error("LLM returned %s, expected object", type(parsed).__name__)
            raise MalformedLLMResponse("response was not a JSON object")
        return parsed


class GroqClient(LLMClient):
    """Groq API client (free tier)."""

    name = "groq"
    MAX_RETRIES = 2
    RETRY_DELAY = 2.0

    def __init__(self, api_key: str, model: str | None = None):
        if Groq is None:
            raise RuntimeError("groq SDK is not installed")
        self.model_id = model or DEFAULT_GROQ_MODEL
        self.client = Groq(api_key=api_key, timeout=25.0, max_retries=0)
        self._last_request_time = 0.0
        # ~28 req/min, under the 30/min free-tier ceiling.
        self._min_interval = float(os.getenv("GROQ_MIN_INTERVAL", "2.1"))

    def generate(self, system_prompt: str, user_prompt: str, retry_rate_limits: bool = True) -> dict:
        elapsed = time.time() - self._last_request_time
        if elapsed < self._min_interval:
            time.sleep(self._min_interval - elapsed)

        last: Exception | None = None
        for attempt in range(self.MAX_RETRIES + 1):
            try:
                self._last_request_time = time.time()
                response = self.client.chat.completions.create(
                    model=self.model_id,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    temperature=0.7,
                    max_tokens=int(os.getenv("LLM_MAX_TOKENS", "3072")),
                    response_format={"type": "json_object"},
                )
                logger.info("groq: response received (attempt %d)", attempt + 1)
                return self._parse_json_response(response.choices[0].message.content)

            except MalformedLLMResponse:
                raise
            except Exception as e:
                last = e
                logger.warning("groq: attempt %d failed: %s", attempt + 1, e)
                if _is_rate_limited(e) and not retry_rate_limits:
                    raise
                if attempt < self.MAX_RETRIES and _is_retryable(e):
                    time.sleep(self.RETRY_DELAY * (attempt + 1))
                    continue
                raise
        raise last or RuntimeError("groq: exhausted retries")


class GeminiClient(LLMClient):
    """Google Gemini client."""

    name = "gemini"
    MAX_RETRIES = 2
    RETRY_DELAY = 1.5

    def __init__(self, api_key: str, model: str | None = None):
        if genai is None:
            raise RuntimeError("google-generativeai SDK is not installed")
        self.model_id = model or DEFAULT_GEMINI_MODEL
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel(
            self.model_id,
            generation_config=genai.GenerationConfig(
                temperature=0.7,
                max_output_tokens=int(os.getenv("LLM_MAX_TOKENS", "3072")),
                response_mime_type="application/json",
            ),
        )

    def generate(self, system_prompt: str, user_prompt: str, retry_rate_limits: bool = True) -> dict:
        full_prompt = f"{system_prompt}\n\n{user_prompt}"

        last: Exception | None = None
        for attempt in range(self.MAX_RETRIES + 1):
            try:
                response = self.model.generate_content(
                    full_prompt, request_options={"timeout": 25}
                )
                logger.info("gemini: response received (attempt %d)", attempt + 1)
                return self._parse_json_response(response.text)

            except MalformedLLMResponse:
                raise
            except Exception as e:
                last = e
                logger.warning("gemini: attempt %d failed: %s", attempt + 1, e)
                # Sitting out a quota error costs ~4.5s of blocking sleep for a
                # request that a healthy provider could already have served.
                if _is_rate_limited(e) and not retry_rate_limits:
                    raise
                # Previously this retried *everything*, so a permanent 404 cost
                # ~4.5s of blocking sleep on every single request.
                if attempt < self.MAX_RETRIES and _is_retryable(e):
                    time.sleep(self.RETRY_DELAY * (attempt + 1))
                    continue
                raise
        raise last or RuntimeError("gemini: exhausted retries")


class LLMRouter:
    """Tries each configured provider in order and raises if none succeed."""

    def __init__(self, groq_api_key: str | None, gemini_api_key: str | None):
        self.clients: list[LLMClient] = []
        self.status: dict[str, str] = {}
        self.last_provider: str | None = None
        self.last_model: str | None = None
        # provider name -> epoch seconds until which to skip it
        self._cooldown: dict[str, float] = {}

        builders = {
            "groq": (groq_api_key, GroqClient),
            "gemini": (gemini_api_key, GeminiClient),
        }
        order = [p.strip().lower() for p in DEFAULT_PROVIDER_ORDER.split(",") if p.strip()]

        for provider in order:
            if provider not in builders:
                logger.warning("unknown provider %r in LLM_PROVIDER_ORDER", provider)
                continue
            key, cls = builders[provider]
            if not key:
                self.status[provider] = "no api key"
                continue
            try:
                client = cls(key)
                self.clients.append(client)
                self.status[provider] = f"ready ({client.model_id})"
                logger.info("%s client initialized (model=%s)", provider, client.model_id)
            except Exception as e:
                self.status[provider] = "unavailable"
                logger.error("%s client failed to initialize: %s", provider, e)

        if not self.clients:
            raise ValueError(
                "At least one LLM provider must be configured (GROQ_API_KEY or GEMINI_API_KEY)"
            )

    @property
    def provider_names(self) -> list[str]:
        return [c.name for c in self.clients]

    def status_now(self) -> dict[str, str]:
        """Current status including any active rate-limit cooldown."""
        now = time.time()
        out = dict(self.status)
        for name, until in self._cooldown.items():
            if until > now:
                out[name] = f"rate limited, retrying in {int(until - now)}s"
        return out

    def generate(self, system_prompt: str, user_prompt: str) -> dict:
        """Return parsed JSON, or raise `AllProvidersFailed`.

        This deliberately never returns an error-shaped payload. The caller
        caches whatever it receives, and a returned error would be cached
        forever — which is precisely how the meaning cache got poisoned.
        """
        errors: list[str] = []
        now = time.time()

        # Skip providers we know are out of quota. Without this, an exhausted
        # free tier costs ~5s of retries on EVERY request before failing over
        # to the provider that was going to serve it anyway.
        available = [c for c in self.clients if self._cooldown.get(c.name, 0) <= now]
        if not available:
            # Everything is cooling down — better to try than to refuse.
            soonest = min(self._cooldown.get(c.name, 0) for c in self.clients)
            logger.warning(
                "all providers cooling down (next in %.0fs); trying anyway", soonest - now
            )
            available = list(self.clients)

        for i, client in enumerate(available):
            is_last = i == len(available) - 1
            try:
                # Only worth waiting out a rate limit if nobody else can serve.
                result = client.generate(system_prompt, user_prompt, retry_rate_limits=is_last)
                # Recorded so the cache row can say what produced it.
                self.last_provider = client.name
                self.last_model = client.model_id
                self._cooldown.pop(client.name, None)
                return result
            except Exception as e:
                if isinstance(e, GroqRateLimitError) or _is_rate_limited(e):
                    self._cooldown[client.name] = time.time() + RATE_LIMIT_COOLDOWN
                    logger.warning(
                        "%s rate limited; skipping it for %ds", client.name, RATE_LIMIT_COOLDOWN
                    )
                    errors.append(f"{client.name}: rate limited")
                else:
                    logger.error("%s failed: %s", client.name, e)
                    errors.append(f"{client.name}: {type(e).__name__}: {str(e)[:200]}")

        detail = "; ".join(errors) or "no providers configured"
        logger.critical("all LLM providers failed: %s", detail)
        raise AllProvidersFailed(detail)
