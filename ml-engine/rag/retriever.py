"""
Shama RAG — Retriever
Takes a query couplet in any script (Urdu, Hindi, Roman Urdu, English),
generates an embedding locally, and retrieves the top-N most similar
couplets from Supabase to provide context for the LLM.

Usage:
    from rag.retriever import retrieve_similar_couplets
    results = retrieve_similar_couplets("dil-e-nadaan tujhe hua kya hai")
"""

from __future__ import annotations

import threading
from dataclasses import dataclass
from typing import Any

import numpy as np
from sentence_transformers import SentenceTransformer
from supabase import create_client, Client, ClientOptions

from .config import (
    SUPABASE_URL,
    SUPABASE_READ_KEY,
    EMBEDDING_MODEL,
    DEFAULT_MATCH_COUNT,
    MATCH_THRESHOLD,
)


@dataclass
class CoupletMatch:
    """A single retrieval result."""
    id: int
    couplet_text: str
    poet: str | None
    metadata: dict[str, Any]
    similarity: float

    def as_context_str(self) -> str:
        """Format this match as a context string for LLM prompting.

        Deliberately terse: a raw `Similarity: 0.8123` float is noise to the
        model, and dumping every metadata key pasted whole corpus records
        (including their own `detailed` readings) into the prompt.
        """
        parts = [f"Couplet: {self.couplet_text}"]
        if self.poet:
            parts.append(f"Poet: {self.poet}")
        ghazal = self.metadata.get("ghazal") if self.metadata else None
        if ghazal:
            parts.append(f"From: {ghazal}")
        return "\n".join(parts)


class ShameRetriever:
    """Semantic retriever backed by Supabase pgvector."""

    def __init__(
        self,
        supabase_url: str = SUPABASE_URL,
        supabase_key: str = SUPABASE_READ_KEY,
        model_name: str = EMBEDDING_MODEL,
    ):
        if not supabase_url or not supabase_key:
            raise ValueError(
                "SUPABASE_URL and SUPABASE_READ_KEY must be set in environment."
            )
        # Retrieval is optional context: a short timeout keeps a stalled RPC
        # from outlasting the gateway's 60s (supabase-py defaults to 120s).
        self._supabase: Client = create_client(
            supabase_url, supabase_key, options=ClientOptions(postgrest_client_timeout=5)
        )
        self._model = SentenceTransformer(model_name)

    def _embed(self, text: str) -> list[float]:
        """Generate a normalized embedding for a single text."""
        embedding = self._model.encode(
            text, normalize_embeddings=True, show_progress_bar=False
        )
        return np.asarray(embedding).tolist()

    def retrieve(
        self,
        query: str,
        match_count: int = DEFAULT_MATCH_COUNT,
    ) -> list[CoupletMatch]:
        """
        Retrieve the top-N most similar couplets for a given query.

        Args:
            query: The couplet or phrase to search (any script).
            match_count: Number of results to return (default 5).

        Returns:
            List of CoupletMatch objects sorted by descending similarity.
        """
        query_embedding = self._embed(query)

        # The deployed function is `search_couplets` (001_initial.sql); the old
        # `match_couplets` name has never existed on this project, so every
        # retrieval was silently returning [].
        response = self._supabase.rpc(
            "search_couplets",
            {
                "query_embedding": query_embedding,
                "match_threshold": MATCH_THRESHOLD,
                "match_count": match_count,
            },
        ).execute()

        results: list[CoupletMatch] = []
        for row in response.data or []:
            results.append(
                CoupletMatch(
                    id=row["id"],
                    couplet_text=row["couplet_text"],
                    poet=row.get("artist") or row.get("poet"),
                    metadata={"ghazal": row["ghazal_title"]} if row.get("ghazal_title") else {},
                    similarity=row.get("similarity", 0.0),
                )
            )

        return results

    def retrieve_as_context(
        self,
        query: str,
        match_count: int = DEFAULT_MATCH_COUNT,
    ) -> str:
        """
        Retrieve similar couplets and format them as a context block
        ready to inject into an LLM prompt.
        """
        matches = self.retrieve(query, match_count)
        if not matches:
            return "No similar couplets found in the knowledge base."

        sections = []
        for i, match in enumerate(matches, start=1):
            sections.append(f"--- Match {i} (similarity: {match.similarity:.4f}) ---")
            sections.append(match.as_context_str())
            sections.append("")

        return "\n".join(sections)


# Module-level convenience function.
# The lock matters: two concurrent cold requests would otherwise both see None
# and each construct a SentenceTransformer (~90MB) on a 512MB box.
_retriever: ShameRetriever | None = None
_retriever_lock = threading.Lock()


def _get_retriever() -> ShameRetriever:
    global _retriever
    if _retriever is None:
        with _retriever_lock:
            if _retriever is None:
                _retriever = ShameRetriever()
    return _retriever


def retrieve_similar_couplets(
    query: str,
    match_count: int = DEFAULT_MATCH_COUNT,
) -> list[CoupletMatch]:
    """Convenience function — initializes retriever on first call."""
    return _get_retriever().retrieve(query, match_count)


def retrieve_context_for_llm(
    query: str,
    match_count: int = DEFAULT_MATCH_COUNT,
) -> str:
    """Convenience function — returns formatted context string for LLM."""
    return _get_retriever().retrieve_as_context(query, match_count)


if __name__ == "__main__":
    import sys

    query = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else "dil-e-nadaan tujhe hua kya hai"
    print(f"[QUERY] {query}\n")
    context = retrieve_context_for_llm(query)
    print(context)
