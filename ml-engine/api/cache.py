"""
Supabase caching layer for couplet meanings.

Written against the schema that is actually deployed (verified via PostgREST):

    couplet_meanings(
        id uuid, couplet_hash text, couplet_text text,
        language text, depth text,
        meaning_response jsonb,
        llm_provider text, llm_model text, tokens_used int,
        created_at timestamptz, updated_at timestamptz, expires_at timestamptz
    )

Two things this module previously got wrong, both of which failed silently:
  * it read/wrote `meaning_json` (no such column) and wrote `poet` (no such
    column), so every store was rejected;
  * it was handed the anon key, which has no privileges here — anon SELECT
    returns 42501 "permission denied". Writes need the service-role key.

`expires_at` is honoured, so CACHE_TTL_SECONDS finally means something.
"""

import hashlib
import json
import logging
import os
from datetime import datetime, timedelta, timezone

from supabase import create_client, Client, ClientOptions

logger = logging.getLogger(__name__)

DEFAULT_TTL_SECONDS = int(os.getenv("CACHE_TTL_SECONDS", "2592000"))  # 30 days

# One generated response serves the Meaning, Words and Context tabs alike, so
# every row is stored under a single depth. This keeps the deployed
# UNIQUE(couplet_hash, language, depth) constraint usable while giving us one
# row (and one LLM call) per couplet instead of one per tab.
CACHE_DEPTH = "full"


class MeaningCache:
    """Cache layer backed by Supabase for storing/retrieving couplet meanings."""

    TABLE = "couplet_meanings"

    def __init__(self, supabase_url: str | None, supabase_key: str | None):
        self.enabled = bool(supabase_url and supabase_key)
        self.client: Client | None = None
        # Set once a real query succeeds, so /health can report reachability
        # rather than merely "credentials were present".
        self.reachable: bool | None = None
        self.last_error: str | None = None

        if self.enabled:
            try:
                # The cache is optional: a short timeout keeps a stalled query
                # from outlasting the gateway's 60s (supabase-py defaults to 120s).
                self.client = create_client(
                    supabase_url, supabase_key, options=ClientOptions(postgrest_client_timeout=5)
                )
                logger.info("Supabase cache initialized")
            except Exception as e:
                logger.warning("Supabase initialization failed, caching disabled: %s", e)
                self.enabled = False
                self.last_error = str(e)[:200]
        else:
            logger.info("Supabase credentials not provided, caching disabled")

    @staticmethod
    def _hash_couplet(couplet: str, language: str, poet: str | None = None) -> str:
        """Stable key for a couplet, as asked about a given poet.

        Whitespace is collapsed so that "dil-e-nadaan  tujhe" and
        "dil-e-nadaan tujhe" share a row instead of paying for two LLM calls.
        The poet goes into the prompt, so it is part of the key; without it the
        first caller's poet decided the reading everyone got. With no poet the
        key is exactly the old one, so existing rows stay valid.
        """
        normalized = " ".join(couplet.strip().lower().split())
        normalized_poet = " ".join((poet or "").strip().lower().split())
        key = f"{normalized}|{language}|{normalized_poet}" if normalized_poet else f"{normalized}|{language}"
        return hashlib.sha256(key.encode("utf-8")).hexdigest()[:32]

    def verify(self) -> bool:
        """Prove the table is actually readable. Used by /health."""
        if not self.enabled or not self.client:
            self.reachable = False
            return False
        try:
            self.client.table(self.TABLE).select("couplet_hash").limit(1).execute()
            self.reachable = True
            self.last_error = None
        except Exception as e:
            self.reachable = False
            self.last_error = str(e)[:200]
            logger.warning("cache verify failed: %s", e)
        return bool(self.reachable)

    def get(
        self,
        couplet: str,
        language: str,
        depth: str = CACHE_DEPTH,
        poet: str | None = None,
    ) -> dict | None:
        """Return the cached meaning, or None on miss/expiry/error."""
        if not self.enabled:
            return None

        couplet_hash = self._hash_couplet(couplet, language, poet)

        try:
            response = (
                self.client.table(self.TABLE)
                .select("meaning_response, expires_at")
                .eq("couplet_hash", couplet_hash)
                .eq("language", language)
                .eq("depth", depth)
                .limit(1)
                .execute()
            )
            self.reachable = True

            if not response.data:
                logger.debug("cache MISS %s", couplet_hash[:8])
                return None

            row = response.data[0]
            expires_at = row.get("expires_at")
            if expires_at:
                try:
                    exp = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
                    if exp <= datetime.now(timezone.utc):
                        logger.info("cache EXPIRED %s", couplet_hash[:8])
                        return None
                except ValueError:
                    pass  # unparseable expiry: treat the row as live

            meaning = row.get("meaning_response")
            if isinstance(meaning, str):
                meaning = json.loads(meaning)
            if not isinstance(meaning, dict) or not meaning:
                return None

            logger.info("cache HIT %s", couplet_hash[:8])
            return meaning

        except Exception as e:
            self.reachable = False
            self.last_error = str(e)[:200]
            logger.warning("cache lookup failed (non-fatal): %s", e)
            return None

    def store(
        self,
        couplet: str,
        poet: str | None,
        language: str,
        meaning: dict,
        depth: str = CACHE_DEPTH,
        provider: str | None = None,
        model: str | None = None,
    ) -> bool:
        """Store a generated meaning. Only ever called with a real result.

        Callers must never pass a degraded/error payload here: rows are keyed
        only by couplet, language and poet, and would otherwise mask the real
        meaning for as long as they live.
        """
        if not self.enabled:
            return False

        couplet_hash = self._hash_couplet(couplet, language, poet)
        expires = datetime.now(timezone.utc) + timedelta(seconds=DEFAULT_TTL_SECONDS)

        try:
            row = {
                "couplet_hash": couplet_hash,
                "couplet_text": couplet.strip(),
                "language": language,
                "depth": depth,
                "meaning_response": meaning,
                "llm_provider": provider,
                "llm_model": model,
                "expires_at": expires.isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }

            # Matches the deployed UNIQUE(couplet_hash, language, depth). Since
            # one response now serves every reading depth, `depth` is the
            # constant CACHE_DEPTH — so there is exactly one row per couplet.
            self.client.table(self.TABLE).upsert(
                row, on_conflict="couplet_hash,language,depth"
            ).execute()
            self.reachable = True
            logger.info("cached meaning %s", couplet_hash[:8])
            return True

        except Exception as e:
            self.reachable = False
            self.last_error = str(e)[:200]
            logger.warning("cache store failed (non-fatal): %s", e)
            return False
