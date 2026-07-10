"""
Shama RAG — Configuration
Reads Supabase credentials from environment variables.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env from project root, then ml-engine local
_project_root = Path(__file__).parent.parent.parent
load_dotenv(_project_root / ".env")
load_dotenv(Path(__file__).parent.parent / ".env", override=True)

# Supabase
SUPABASE_URL: str = os.environ.get("SUPABASE_URL", "")
SUPABASE_ANON_KEY: str = os.environ.get("SUPABASE_ANON_KEY", "")

# Embedding model (runs locally on CPU, 384 dimensions, free)
EMBEDDING_MODEL: str = "sentence-transformers/all-MiniLM-L6-v2"
EMBEDDING_DIM: int = 384

# Batching
UPSERT_BATCH_SIZE: int = 100

# Retrieval
DEFAULT_MATCH_COUNT: int = 5

# Training corpus path (JSONL)
CORPUS_PATH: str = os.environ.get(
    "SHAMA_CORPUS_PATH",
    os.path.join(os.path.dirname(__file__), "..", "data", "training_corpus.jsonl"),
)
