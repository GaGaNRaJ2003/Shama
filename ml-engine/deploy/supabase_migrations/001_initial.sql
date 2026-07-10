-- =============================================================================
-- Shama — Initial Supabase Schema
-- Run via: Supabase SQL Editor or `supabase db push`
-- =============================================================================

-- Enable pgvector extension for embedding similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- =============================================================================
-- 1. Couplet Embeddings (for RAG / Semantic Search)
-- =============================================================================

CREATE TABLE IF NOT EXISTS couplet_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    couplet_text TEXT NOT NULL,
    couplet_text_normalized TEXT NOT NULL,
    artist TEXT,
    ghazal_title TEXT,
    language TEXT DEFAULT 'urdu',
    source TEXT,
    embedding vector(384) NOT NULL,  -- all-MiniLM-L6-v2 produces 384-dim vectors
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast vector similarity search (ivfflat for free tier performance)
CREATE INDEX IF NOT EXISTS idx_couplet_embeddings_vector
    ON couplet_embeddings
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 50);

-- Index for text lookups
CREATE INDEX IF NOT EXISTS idx_couplet_embeddings_text
    ON couplet_embeddings (couplet_text_normalized);

-- Index for filtering by artist
CREATE INDEX IF NOT EXISTS idx_couplet_embeddings_artist
    ON couplet_embeddings (artist);

-- =============================================================================
-- 2. Couplet Meanings Cache (LLM response cache)
-- =============================================================================

CREATE TABLE IF NOT EXISTS couplet_meanings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    couplet_hash TEXT NOT NULL,
    couplet_text TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'en',
    depth TEXT NOT NULL DEFAULT 'standard',
    meaning_response JSONB NOT NULL,
    llm_provider TEXT,
    llm_model TEXT,
    tokens_used INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '30 days'),
    UNIQUE(couplet_hash, language, depth)
);

-- Index for cache lookups (primary access pattern)
CREATE INDEX IF NOT EXISTS idx_couplet_meanings_lookup
    ON couplet_meanings (couplet_hash, language, depth);

-- Index for cache expiry cleanup
CREATE INDEX IF NOT EXISTS idx_couplet_meanings_expires
    ON couplet_meanings (expires_at);

-- =============================================================================
-- 3. TTS Cache (metadata for cached audio files in Supabase Storage)
-- =============================================================================

CREATE TABLE IF NOT EXISTS tts_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    text_hash TEXT NOT NULL,
    text_content TEXT NOT NULL,
    voice_id TEXT NOT NULL DEFAULT 'default',
    language TEXT NOT NULL DEFAULT 'ur',
    storage_path TEXT NOT NULL,
    storage_bucket TEXT NOT NULL DEFAULT 'tts-audio',
    file_size_bytes INTEGER NOT NULL DEFAULT 0,
    duration_seconds FLOAT,
    mime_type TEXT DEFAULT 'audio/mpeg',
    access_count INTEGER DEFAULT 0,
    last_accessed_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(text_hash, voice_id, language)
);

-- Index for cache lookups
CREATE INDEX IF NOT EXISTS idx_tts_cache_lookup
    ON tts_cache (text_hash, voice_id, language);

-- Index for LRU eviction (least recently accessed)
CREATE INDEX IF NOT EXISTS idx_tts_cache_lru
    ON tts_cache (last_accessed_at ASC);

-- Index for storage management
CREATE INDEX IF NOT EXISTS idx_tts_cache_size
    ON tts_cache (file_size_bytes DESC);

-- =============================================================================
-- 4. Row Level Security (RLS) Policies
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE couplet_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE couplet_meanings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tts_cache ENABLE ROW LEVEL SECURITY;

-- Anon users can READ embeddings (for search)
CREATE POLICY "anon_read_embeddings"
    ON couplet_embeddings
    FOR SELECT
    TO anon
    USING (true);

-- Anon users can READ cached meanings
CREATE POLICY "anon_read_meanings"
    ON couplet_meanings
    FOR SELECT
    TO anon
    USING (true);

-- Anon users can READ TTS cache metadata
CREATE POLICY "anon_read_tts_cache"
    ON tts_cache
    FOR SELECT
    TO anon
    USING (true);

-- Service role (backend) can do everything
CREATE POLICY "service_all_embeddings"
    ON couplet_embeddings
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "service_all_meanings"
    ON couplet_meanings
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "service_all_tts_cache"
    ON tts_cache
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- =============================================================================
-- 5. Helper Functions
-- =============================================================================

-- Function to search couplets by semantic similarity
CREATE OR REPLACE FUNCTION search_couplets(
    query_embedding vector(384),
    match_threshold FLOAT DEFAULT 0.7,
    match_count INT DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    couplet_text TEXT,
    artist TEXT,
    ghazal_title TEXT,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ce.id,
        ce.couplet_text,
        ce.artist,
        ce.ghazal_title,
        1 - (ce.embedding <=> query_embedding) AS similarity
    FROM couplet_embeddings ce
    WHERE 1 - (ce.embedding <=> query_embedding) > match_threshold
    ORDER BY ce.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Function to update TTS access count (for LRU tracking)
CREATE OR REPLACE FUNCTION touch_tts_cache(cache_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE tts_cache
    SET access_count = access_count + 1,
        last_accessed_at = now()
    WHERE id = cache_id;
END;
$$;

-- Function to get total TTS storage used (for eviction decisions)
CREATE OR REPLACE FUNCTION get_tts_storage_used()
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
    total BIGINT;
BEGIN
    SELECT COALESCE(SUM(file_size_bytes), 0) INTO total FROM tts_cache;
    RETURN total;
END;
$$;

-- =============================================================================
-- 6. Storage Bucket (run in Supabase Dashboard > Storage)
-- =============================================================================
-- Note: Storage bucket creation must be done via Dashboard or API:
--   Bucket name: tts-audio
--   Public: true (for direct CDN access)
--   File size limit: 500KB
--   Allowed MIME types: audio/mpeg, audio/wav
