# Shama — Production Architecture

## System Diagram

```
+-------------------------------------------------------------------------+
|                              USERS                                        |
|                    (Browser / Mobile / PWA)                               |
+------------------------------------+------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
|                     VERCEL (Frontend — Free Tier)                         |
|                                                                          |
|  +------------------------------------------------------------------+   |
|  |  Next.js App                                                      |   |
|  |  - SSR/ISR pages                                                  |   |
|  |  - Static assets via CDN                                          |   |
|  |  - Rewrites: /api/* --> Render backend                            |   |
|  +------------------------------------------------------------------+   |
|                                                                          |
|  Limits: 100GB bandwidth, 1000 serverless fn invocations/day            |
+------------------------------------+------------------------------------+
                                     | HTTPS (rewrites)
                                     v
+-------------------------------------------------------------------------+
|                  RENDER (ML Engine — Free Tier)                           |
|                                                                          |
|  +------------------------------------------------------------------+   |
|  |  FastAPI Application (uvicorn, 1 worker)                          |   |
|  |                                                                    |   |
|  |  Endpoints:                                                        |   |
|  |  - GET  /health              --> liveness probe                    |   |
|  |  - POST /api/meaning/couplet --> AI-powered meaning                |   |
|  |  - POST /api/tts/generate    --> text-to-speech                    |   |
|  |  - POST /api/search/semantic --> vector similarity search          |   |
|  |                                                                    |   |
|  |  In-Memory:                                                        |   |
|  |  - sentence-transformers model (all-MiniLM-L6-v2, ~90MB)          |   |
|  |  - LRU cache for hot responses                                     |   |
|  +------------------------------------------------------------------+   |
|                                                                          |
|  Limits: 750 hrs/month, 512MB RAM, spins down after 15min idle          |
|  WARNING: Cold start ~30s (model reload + dependencies)                  |
+--------------+-------------------------------+--------------------------+
               |                               |
               v                               v
+--------------------------+   +------------------------------------------+
|   External LLM APIs      |   |        SUPABASE (Free Tier)               |
|                          |   |                                           |
|  - Groq (Llama 3)       |   |  +-------------------------------------+ |
|    30 req/min free       |   |  | PostgreSQL + pgvector                | |
|                          |   |  | - couplet_embeddings (RAG vectors)  | |
|  - Gemini 1.5 Flash     |   |  | - couplet_meanings (LLM cache)      | |
|    15 req/min free       |   |  | - tts_cache (audio metadata)        | |
|                          |   |  +-------------------------------------+ |
|  - ElevenLabs TTS       |   |                                           |
|    10K chars/month free  |   |  +-------------------------------------+ |
+--------------------------+   |  | Storage (S3-compatible)               | |
                               |  | - TTS audio files (MP3, ~50KB each) | |
                               |  | - 1GB limit on free tier             | |
                               |  +-------------------------------------+ |
                               |                                           |
                               |  +-------------------------------------+ |
                               |  | Auth (GoTrue)                        | |
                               |  | - Anonymous sessions                 | |
                               |  | - 50K MAU free                       | |
                               |  +-------------------------------------+ |
                               |                                           |
                               |  Limits: 500MB DB, 1GB storage, 2GB xfer |
                               +-------------------------------------------+
```

---

## Free Tier Limits and Budget Strategy

| Service        | Resource          | Free Limit        | Our Strategy                                   |
|----------------|-------------------|-------------------|------------------------------------------------|
| Vercel         | Bandwidth         | 100 GB/month      | Static assets cached at edge; API calls proxied|
| Vercel         | Serverless Fn     | 100 GB-hrs        | Minimal serverless; mostly static/ISR          |
| Vercel         | Builds            | 6000 min/month    | Auto-deploy on push to main                    |
| Render         | Compute           | 750 hrs/month     | Single service, always within budget           |
| Render         | RAM               | 512 MB            | CPU-only torch + small model (~250MB used)     |
| Render         | Bandwidth         | 100 GB/month      | JSON responses small; audio from Supabase      |
| Render         | Sleep             | After 15min idle  | Accept cold starts; warm with cron ping        |
| Supabase       | Database          | 500 MB            | Aggressive caching reduces writes              |
| Supabase       | Storage           | 1 GB              | TTS MP3 ~50KB each = ~20K files max            |
| Supabase       | MAU               | 50,000            | Anonymous auth, no signup required             |
| Groq           | Requests          | 30/min, 14.4K tok | Cache all responses in Supabase                |
| Gemini         | Requests          | 15/min, 1M tok/day| Fallback LLM when Groq rate-limited            |
| ElevenLabs     | Characters        | 10,000/month      | Cache aggressively; serve from Supabase storage|

---

## Caching Strategy

### Layer 1: In-Memory LRU (Render)

- LRU Cache: maxsize=200, ~50MB
- Key: hash(couplet_text + language)
- Value: meaning JSON
- TTL: until service restarts (cleared on cold start, acceptable since L2 exists)
- Hit ratio target: 60%+ for hot content

### Layer 2: Supabase PostgreSQL (Persistent)

- Table: couplet_meanings
- Key: couplet_hash + language + depth
- Value: full meaning response JSON
- TTL: 30 days (via expires_at column)
- Hit ratio target: 90%+
- Before calling any LLM, check Supabase cache
- Same couplet in different sessions = cache hit

### Layer 3: Supabase Storage (TTS Audio)

- Bucket: tts-audio
- Key: hash(text + voice_id + language)
- Value: MP3 file in Supabase Storage
- TTL: indefinite (LRU eviction at 900MB)
- ElevenLabs free = 10K chars/month, so everything must be cached
- Audio served directly from Supabase CDN

### Cache Flow

```
Request --> L1 (memory) HIT? --> return
                        MISS --> L2 (Supabase) HIT? --> populate L1, return
                                                MISS --> call LLM --> store L2 --> populate L1 --> return
```

---

## Cold Start Mitigation

Render free tier spins down after 15 minutes of inactivity.
Cold start takes approximately 30 seconds:
- ~10s: container spin-up
- ~15s: Python + dependencies load
- ~5s: sentence-transformers model load from disk

### Mitigations

1. **Cron Ping**: Use UptimeRobot (free, 5-min intervals) to ping /health
   - Keeps service warm during peak hours
   - May still sleep during low-traffic night hours
   - UptimeRobot free tier: 50 monitors, 5-min intervals

2. **Frontend Loading State**: Show "lighting the shama..." animation during cold start
   - User sees beautiful animation, not a broken page
   - Set fetch timeout to 45s with progressive UI feedback

3. **Pre-warm on Navigation**: When user opens a ghazal page, fire a lightweight
   request to /health immediately to wake the backend

4. **Model Pre-loading**: sentence-transformers model baked into Docker image
   (downloaded at build time, not runtime)


---

## Scaling Path

### Phase 1: Free Tier (0-500 users/month) — $0/month

Current architecture. Accept cold starts and rate limits.

### Phase 2: Light Paid (500-1K users) — ~$7/month

| Upgrade            | Cost   | Benefit                           |
|--------------------|--------|-----------------------------------|
| Render Starter     | $7/mo  | No sleep, 512MB RAM, always-on    |

### Phase 3: Growth (1K-10K users) — ~$30-55/month

| Upgrade            | Cost   | Benefit                           |
|--------------------|--------|-----------------------------------|
| Render Standard    | $25/mo | 2GB RAM, multiple workers         |
| Supabase Pro       | $25/mo | 8GB DB, 100GB storage, backups    |
| ElevenLabs Starter | $5/mo  | 30K chars/month                   |

### Phase 4: Scale (10K+ users) — ~$100-200/month

| Upgrade            | Cost   | Benefit                           |
|--------------------|--------|-----------------------------------|
| Render Pro         | $85/mo | 4GB RAM, auto-scaling, multi-region|
| Supabase Pro       | $25/mo | Same as above                     |
| Redis (Upstash)    | $10/mo | Fast distributed cache            |
| CDN (CloudFlare R2)| $20/mo | Global audio delivery             |
| Groq paid          | ~$5/mo | Remove rate limits                |

### What to Upgrade First (priority order)

1. **Render** — eliminate cold starts (biggest UX impact)
2. **ElevenLabs** — more TTS capacity (most visible limitation)
3. **Supabase storage** — more audio cache (extends TTS budget)
4. **Supabase DB** — more vectors and backups (only at 500MB)

---

## Cost Estimates

### Free Tier ($0/month) — up to ~500 users

| Item           | Cost |
|----------------|------|
| Vercel         | $0   |
| Render         | $0   |
| Supabase       | $0   |
| Groq API       | $0   |
| Gemini API     | $0   |
| ElevenLabs     | $0   |
| UptimeRobot    | $0   |
| **Total**      | **$0** |

### ~1,000 Users/month (~$7-12/month)

| Item               | Cost   | Notes                          |
|--------------------|--------|--------------------------------|
| Render Starter     | $7     | Always-on, no cold starts      |
| Supabase           | $0     | Still within free limits       |
| ElevenLabs Starter | $5     | 30K chars (if cache not enough)|
| **Total**          | **$7-12** |                             |

### ~10,000 Users/month (~$55-60/month)

| Item               | Cost   | Notes                          |
|--------------------|--------|--------------------------------|
| Render Standard    | $25    | 2GB RAM, 2 workers             |
| Supabase Pro       | $25    | 8GB DB, 100GB storage          |
| ElevenLabs Starter | $5     | Cached audio reduces need      |
| Groq (overflow)    | ~$5    | Beyond free tier               |
| **Total**          | **$55-60** |                            |

---

## Monitoring and Observability

### Health Checks

| Check                 | Endpoint      | Frequency | Alert       |
|-----------------------|---------------|-----------|-------------|
| ML Engine liveness    | GET /health   | 5 min     | UptimeRobot |
| Supabase connectivity | Internal      | Per-req   | Log + fallback |
| LLM API availability  | Internal      | Per-req   | Fallback chain |

### /health Response Schema

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime_seconds": 3600,
  "checks": {
    "supabase": "connected",
    "embedding_model": "loaded",
    "memory_mb": 320
  }
}
```

### Error Tracking

- **Sentry** (free tier: 5K events/month)
  - Capture unhandled exceptions
  - Track LLM API failures and rate limits
  - Performance monitoring (cold start duration)

### Logging

- Structured JSON logs via `structlog`
- Log levels: ERROR to Sentry, WARN review weekly, INFO debug only
- Key events: cache hits/misses, LLM latency, TTS generation, cold starts

### Key Metrics to Track

| Metric                     | Target     | Action if exceeded            |
|----------------------------|------------|-------------------------------|
| Cache hit ratio (meanings) | > 85%      | Pre-populate popular content  |
| Avg response (cached)      | < 200ms    | Check Supabase latency        |
| Avg response (uncached)    | < 3s       | Check LLM provider            |
| Memory usage               | < 450MB    | Reduce LRU cache size         |
| ElevenLabs chars used      | < 8K/month | Increase cache aggression     |
| Supabase storage used      | < 800MB    | Evict old TTS files           |
| Error rate                 | < 1%       | Investigate via Sentry        |

---

## Security Considerations

1. **API Keys**: All secrets in Render environment variables (never in code)
2. **CORS**: Strict origin whitelist (only Vercel frontend domain)
3. **Rate Limiting**: Application-level rate limit (10 req/min per IP)
4. **RLS**: Supabase Row Level Security on all tables
5. **Input Validation**: Pydantic models validate all request bodies
6. **No PII**: No user data stored; anonymous sessions only

---

## Deployment Workflow

```
Developer pushes to main
        |
        +---> Vercel auto-deploys frontend (< 1 min)
        |
        +---> Render auto-deploys ML engine (< 5 min)
                |
                +---> Health check passes --> traffic routed
                      Health check fails  --> rollback to previous
```

### Database Migrations

```bash
# Apply via Supabase CLI
supabase db push --db-url $SUPABASE_DB_URL

# Or paste SQL into Supabase Dashboard > SQL Editor
```

---

## Key Tradeoffs (Free Tier)

| Tradeoff                    | Impact                              | Mitigation                        |
|-----------------------------|-------------------------------------|-----------------------------------|
| Render cold starts (~30s)   | First user after idle waits         | UptimeRobot ping + loading animation |
| ElevenLabs 10K chars/month  | Limited fresh TTS generation        | Aggressive caching in Supabase    |
| 512MB RAM limit             | Cannot load large models            | CPU-only torch + MiniLM-L6-v2    |
| Supabase 500MB DB           | Limited vector storage              | ~130K couplets with 384-dim vectors |
| Supabase 1GB storage        | ~20K audio files max                | LRU eviction at 900MB            |
| No Redis                    | Cache lost on cold start            | Supabase as persistent L2 cache   |
