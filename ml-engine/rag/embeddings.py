"""
Shama RAG — Embedding Generator & Upserter
Reads the training corpus JSONL, generates embeddings with all-MiniLM-L6-v2,
and upserts them into the Supabase couplet_embeddings table in batches.

Usage:
    python -m rag.embeddings          (from ml-engine/)
    python embeddings.py              (from ml-engine/rag/)
"""

import json
import os
import sys
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

# Load .env from project root and ml-engine directory
load_dotenv(Path(__file__).parent.parent.parent / ".env")
load_dotenv(Path(__file__).parent.parent / ".env", override=True)

import numpy as np
from sentence_transformers import SentenceTransformer
from supabase import create_client, Client

from .config import (
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    EMBEDDING_MODEL,
    UPSERT_BATCH_SIZE,
    CORPUS_PATH,
)


def load_corpus(path: str) -> list[dict[str, Any]]:
    """Load JSONL corpus. Each line must have at least `couplet_text`."""
    records: list[dict[str, Any]] = []
    corpus_path = Path(path)
    if not corpus_path.exists():
        print(f"[ERROR] Corpus file not found: {corpus_path}")
        sys.exit(1)

    with open(corpus_path, "r", encoding="utf-8") as f:
        for line_no, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError as e:
                print(f"[WARN] Skipping malformed line {line_no}: {e}")
                continue
            if "couplet_text" not in record:
                print(f"[WARN] Skipping line {line_no}: missing 'couplet_text'")
                continue
            records.append(record)

    print(f"[INFO] Loaded {len(records)} couplets from {corpus_path}")
    return records


def generate_embeddings(model: SentenceTransformer, texts: list[str]) -> np.ndarray:
    """Generate embeddings for a list of texts."""
    embeddings = model.encode(texts, show_progress_bar=True, normalize_embeddings=True)
    return np.asarray(embeddings)


def upsert_batch(
    supabase: Client,
    records: list[dict[str, Any]],
    embeddings: np.ndarray,
) -> None:
    """Upsert a batch of records with their embeddings into Supabase."""
    rows = []
    for record, embedding in zip(records, embeddings):
        # Build metadata from all fields except couplet_text, poet
        metadata = {
            k: v for k, v in record.items() if k not in ("couplet_text", "poet", "ghazal_title")
        }
        rows.append(
            {
                "couplet_text": record["couplet_text"],
                "couplet_text_normalized": record["couplet_text"].strip().lower(),
                "artist": record.get("poet", None),
                "ghazal_title": record.get("ghazal_title", None),
                "embedding": embedding.tolist(),
                "metadata": metadata,
            }
        )

    # Upsert (insert; on conflict do nothing since we use generated id)
    response = supabase.table("couplet_embeddings").insert(rows).execute()
    return response


def main() -> None:
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        print("[ERROR] Set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.")
        sys.exit(1)

    # Initialize clients
    print(f"[INFO] Loading embedding model: {EMBEDDING_MODEL}")
    model = SentenceTransformer(EMBEDDING_MODEL)

    # Use service_role key for write access (anon key is read-only).
    # Fail loudly rather than silently falling back to the anon key, which
    # would produce a confusing "permission denied" at insert time.
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not service_key:
        print(
            "[ERROR] SUPABASE_SERVICE_ROLE_KEY is not set. Writing embeddings "
            "requires the service_role key (the anon key is read-only)."
        )
        sys.exit(1)
    supabase: Client = create_client(SUPABASE_URL, service_key)

    # Load corpus
    records = load_corpus(CORPUS_PATH)
    if not records:
        print("[ERROR] No records to process.")
        sys.exit(1)

    # Process in batches
    total = len(records)
    for start in range(0, total, UPSERT_BATCH_SIZE):
        end = min(start + UPSERT_BATCH_SIZE, total)
        batch = records[start:end]
        texts = [r["couplet_text"] for r in batch]

        print(f"[INFO] Embedding batch {start // UPSERT_BATCH_SIZE + 1} "
              f"({start + 1}–{end} of {total})")
        embeddings = generate_embeddings(model, texts)

        print(f"[INFO] Upserting batch to Supabase...")
        upsert_batch(supabase, batch, embeddings)
        print(f"[INFO] ✓ Batch upserted successfully.")

    print(f"\n[DONE] All {total} couplets embedded and stored in Supabase.")


if __name__ == "__main__":
    main()
