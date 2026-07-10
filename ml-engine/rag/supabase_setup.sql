-- ============================================================
-- Shama RAG: Supabase pgvector setup
-- Run this migration in the Supabase SQL Editor (Dashboard > SQL)
-- ============================================================

-- 1. Enable the pgvector extension
create extension if not exists vector with schema extensions;

-- 2. Create the couplet_embeddings table
create table if not exists public.couplet_embeddings (
    id bigint generated always as identity primary key,
    couplet_text text not null,
    poet text,
    embedding extensions.vector(384) not null,
    metadata jsonb default '{}'::jsonb,
    created_at timestamptz default now()
);

-- Add a comment for documentation
comment on table public.couplet_embeddings is
    'Stores ghazal/qawwali couplet embeddings for semantic similarity search (Shama RAG)';

-- 3. Create an IVFFlat index for fast approximate nearest-neighbor search
--    lists = 100 is a good starting point; increase as row count grows.
--    The index uses cosine distance (vector_cosine_ops).
create index if not exists idx_couplet_embeddings_ivfflat
    on public.couplet_embeddings
    using ivfflat (embedding extensions.vector_cosine_ops)
    with (lists = 100);

-- 4. RPC function: match_couplets
--    Performs cosine similarity search and returns the top N matches.
create or replace function public.match_couplets(
    query_embedding extensions.vector(384),
    match_count int default 5
)
returns table (
    id bigint,
    couplet_text text,
    poet text,
    metadata jsonb,
    similarity float
)
language plpgsql
stable
as $$
begin
    return query
    select
        ce.id,
        ce.couplet_text,
        ce.poet,
        ce.metadata,
        1 - (ce.embedding <=> query_embedding) as similarity
    from public.couplet_embeddings ce
    order by ce.embedding <=> query_embedding
    limit match_count;
end;
$$;

-- Grant access so the anon/authenticated roles can call the function
grant execute on function public.match_couplets(extensions.vector(384), int) to anon, authenticated;
grant select on public.couplet_embeddings to anon, authenticated;
