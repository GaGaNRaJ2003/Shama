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
SUPABASE_SERVICE_ROLE_KEY: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

# Retrieval runs server-side. RLS grants couplet_embeddings (and the
# search_couplets RPC) to service_role only — with the anon key every call
# returns 42501, which is why retrieval silently produced no context.
SUPABASE_READ_KEY: str = SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY

# Embedding model (runs locally on CPU, 384 dimensions, free)
EMBEDDING_MODEL: str = os.environ.get(
    "EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2"
)
EMBEDDING_DIM: int = 384

# Batching
UPSERT_BATCH_SIZE: int = 100

# Retrieval
DEFAULT_MATCH_COUNT: int = 5
# Without a floor the RPC always returns the top-k however unrelated they are,
# so an off-corpus couplet got three random ghazals injected as "context".
MATCH_THRESHOLD: float = float(os.environ.get("RAG_MATCH_THRESHOLD", "0.55"))

# Training corpus path (JSONL)
CORPUS_PATH: str = os.environ.get(
    "SHAMA_CORPUS_PATH",
    os.path.join(os.path.dirname(__file__), "..", "data", "training_corpus.jsonl"),
)
