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

from dataclasses import dataclass
from typing import Any

import numpy as np
from sentence_transformers import SentenceTransformer
from supabase import create_client, Client

from .config import (
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    EMBEDDING_MODEL,
    DEFAULT_MATCH_COUNT,
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
        """Format this match as a context string for LLM prompting."""
        parts = [f"Couplet: {self.couplet_text}"]
        if self.poet:
            parts.append(f"Poet: {self.poet}")
        if self.metadata:
            for key, value in self.metadata.items():
                parts.append(f"{key}: {value}")
        parts.append(f"Similarity: {self.similarity:.4f}")
        return "\n".join(parts)


class ShameRetriever:
    """Semantic retriever backed by Supabase pgvector."""

    def __init__(
        self,
        supabase_url: str = SUPABASE_URL,
        supabase_key: str = SUPABASE_ANON_KEY,
        model_name: str = EMBEDDING_MODEL,
    ):
        if not supabase_url or not supabase_key:
            raise ValueError(
                "SUPABASE_URL and SUPABASE_ANON_KEY must be set in environment."
            )
        self._supabase: Client = create_client(supabase_url, supabase_key)
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

        response = self._supabase.rpc(
            "match_couplets",
            {
                "query_embedding": query_embedding,
                "match_count": match_count,
            },
        ).execute()

        results: list[CoupletMatch] = []
        for row in response.data or []:
            results.append(
                CoupletMatch(
                    id=row["id"],
                    couplet_text=row["couplet_text"],
                    poet=row.get("poet"),
                    metadata=row.get("metadata", {}),
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


# Module-level convenience function
_retriever: ShameRetriever | None = None


def retrieve_similar_couplets(
    query: str,
    match_count: int = DEFAULT_MATCH_COUNT,
) -> list[CoupletMatch]:
    """Convenience function — initializes retriever on first call."""
    global _retriever
    if _retriever is None:
        _retriever = ShameRetriever()
    return _retriever.retrieve(query, match_count)


def retrieve_context_for_llm(
    query: str,
    match_count: int = DEFAULT_MATCH_COUNT,
) -> str:
    """Convenience function — returns formatted context string for LLM."""
    global _retriever
    if _retriever is None:
        _retriever = ShameRetriever()
    return _retriever.retrieve_as_context(query, match_count)


if __name__ == "__main__":
    import sys

    query = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else "dil-e-nadaan tujhe hua kya hai"
    print(f"[QUERY] {query}\n")
    context = retrieve_context_for_llm(query)
    print(context)
