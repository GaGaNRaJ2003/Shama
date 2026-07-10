"""
Shama RAG — Retrieval-Augmented Generation for Ghazal/Qawwali couplets.

Modules:
    config       — Environment-based configuration
    embeddings   — Batch embedding generation and Supabase upsert
    retriever    — Semantic similarity search at inference time
"""

from .retriever import retrieve_similar_couplets, retrieve_context_for_llm, ShameRetriever

__all__ = [
    "retrieve_similar_couplets",
    "retrieve_context_for_llm",
    "ShameRetriever",
]
