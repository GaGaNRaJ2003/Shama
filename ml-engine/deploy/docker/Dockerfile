# Shama ML Engine — Lightweight Docker Image
# Optimized for Render free tier (512MB RAM, CPU-only)

FROM python:3.11-slim AS base

# Prevent Python from buffering stdout/stderr
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    TORCH_CPU_ONLY=1 \
    TRANSFORMERS_CACHE=/app/.cache/huggingface \
    HF_HOME=/app/.cache/huggingface

# Install minimal system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies layer (cached unless requirements change)
COPY requirements.txt .

# Install CPU-only PyTorch first (saves ~1.5GB vs full CUDA build)
RUN pip install --no-cache-dir \
        torch --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir -r requirements.txt

# Pre-download sentence-transformers model at build time (~90MB)
# all-MiniLM-L6-v2: small, fast, good quality for semantic search
# Avoids cold-start downloads at runtime
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"

# Application code
COPY . .

# Create non-root user for security
RUN adduser --disabled-password --gecos '' appuser && \
    chown -R appuser:appuser /app
USER appuser

# Render injects $PORT at runtime (usually 10000)
EXPOSE 10000

# Health check for container orchestration
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:${PORT:-10000}/health || exit 1

# Start the application
CMD ["sh", "-c", "uvicorn ml-engine.api.main:app --host 0.0.0.0 --port ${PORT:-10000} --workers 1 --limit-concurrency 10"]
