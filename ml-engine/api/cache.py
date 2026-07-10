"""
Supabase caching layer for couplet meanings.

Table schema (create in Supabase dashboard):
    CREATE TABLE couplet_meanings (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        couplet_hash TEXT NOT NULL,
        couplet_text TEXT NOT NULL,
        poet TEXT,
        language TEXT NOT NULL DEFAULT 'roman',
        depth TEXT NOT NULL DEFAULT 'simple',
        meaning_json JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE INDEX idx_couplet_hash ON couplet_meanings(couplet_hash);
    CREATE UNIQUE INDEX idx_couplet_unique ON couplet_meanings(couplet_hash, language, depth);
"""

import hashlib
import json
import logging
from datetime import datetime, timezone

from supabase import create_client, Client

logger = logging.getLogger(__name__)


class MeaningCache:
    """Cache layer backed by Supabase for storing/retrieving couplet meanings."""

    TABLE = "couplet_meanings"

    def __init__(self, supabase_url: str | None, supabase_key: str | None):
        self.enabled = bool(supabase_url and supabase_key)
        self.client: Client | None = None

        if self.enabled:
            try:
                self.client = create_client(supabase_url, supabase_key)
                logger.info("Supabase cache initialized")
            except Exception as e:
                logger.warning(f"Supabase initialization failed, caching disabled: {e}")
                self.enabled = False
        else:
            logger.info("Supabase credentials not provided, caching disabled")

    @staticmethod
    def _hash_couplet(couplet: str) -> str:
        """Create a stable hash for the couplet text (normalized)."""
        normalized = couplet.strip().lower()
        return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:32]

    def get(self, couplet: str, language: str, depth: str) -> dict | None:
        """
        Check cache for existing meaning.
        Returns meaning_json dict if found, None otherwise.
        """
        if not self.enabled:
            return None

        couplet_hash = self._hash_couplet(couplet)

        try:
            response = (
                self.client.table(self.TABLE)
                .select("meaning_json")
                .eq("couplet_hash", couplet_hash)
                .eq("language", language)
                .eq("depth", depth)
                .limit(1)
                .execute()
            )

            if response.data:
                logger.info(f"Cache HIT for couplet hash: {couplet_hash[:8]}...")
                meaning = response.data[0]["meaning_json"]
                # Handle case where meaning_json is stored as string
                if isinstance(meaning, str):
                    return json.loads(meaning)
                return meaning

            logger.debug(f"Cache MISS for couplet hash: {couplet_hash[:8]}...")
            return None

        except Exception as e:
            logger.warning(f"Cache lookup failed (non-fatal): {e}")
            return None

    def store(
        self,
        couplet: str,
        poet: str | None,
        language: str,
        depth: str,
        meaning: dict,
    ) -> bool:
        """
        Store a generated meaning in cache.
        Returns True if stored successfully, False otherwise.
        """
        if not self.enabled:
            return False

        couplet_hash = self._hash_couplet(couplet)

        try:
            row = {
                "couplet_hash": couplet_hash,
                "couplet_text": couplet.strip(),
                "poet": poet,
                "language": language,
                "depth": depth,
                "meaning_json": meaning,
            }

            self.client.table(self.TABLE).upsert(
                row, on_conflict="couplet_hash,language,depth"
            ).execute()

            logger.info(f"Cached meaning for couplet hash: {couplet_hash[:8]}...")
            return True

        except Exception as e:
            logger.warning(f"Cache store failed (non-fatal): {e}")
            return False
