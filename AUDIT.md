# SHAMA — backend audit

Findings from a full read of `backend/`, `ytmusic-service/`, `ml-engine/` and the
frontend's data path, plus live probes against LRCLIB, Groq, Gemini and Supabase.

**Legend** — ✅ verified by a live probe · 🔧 fixed in this pass · ⏳ still open (needs you)

---

## 1. Why lyrics never synced

The pipeline had **no notion that the LRC file and the audio must be the same
recording**. Everything else was secondary.

| # | Finding | Status |
|---|---|---|
| 1 | `lyrics_search` sent free-text `q="{title} {artist}"` to LRCLIB `/api/search` and took the **first result with any `syncedLyrics`**, inspecting no other field. A 9-minute live qawwali got the 5-minute studio cut's timings. | 🔧 |
| 2 | `durationSeconds` was computed at `ytmusic-service/main.py:77` and had **zero consumers repo-wide** — dropped in the frontend mapper, absent from `YtTrack`, from `fetchYtLyrics`, from the Express route and from the FastAPI signature. This is what *enabled* #1. | 🔧 |
| 3 | ✅ Hyphens silently killed the query. `q="Dil-e-nadan…"` → **0 results**; `q="Dil E Nadan…"` → **5**. The catalogue's `ytQuery` values are hyphenated, so the flagship ghazal could never find lyrics. | 🔧 |
| 4 | Multi-timestamp lines (`[00:12.00][01:20.00]text`) lost the repeat **and rendered `[01:20.00]` on screen as lyric text**. Refrain-dense forms are the worst case. | 🔧 |
| 5 | `[mm:ss]` (no fraction) and `[m:ss.xx]` (1-digit minute) matched nothing, so whole files parsed to `[]` while still reporting `hasLyrics: true` — indistinguishable from "this song has no synced lyrics". | 🔧 |
| 6 | `[offset:±ms]` was never parsed, and there was no user-facing nudge. A wrong match was both undetected *and* uncorrectable. | 🔧 |
| 7 | Output was never sorted; the consumer's `else break` truncated at the first inversion, freezing the highlight for the rest of the song. | 🔧 |
| 8 | Blank/instrumental lines rendered without `data-line-index`, so the scroll `querySelector` returned null and aborted — the sheet froze mid-song. *(This was the open issue in commit `0a1ce15`.)* | 🔧 |
| 9 | `fetchYtLyrics` had no `AbortController`; switching tracks quickly painted track A's lyrics over track B. | 🔧 |
| 10 | The final line stuck as "singing" through the entire outro — the index only ever increased. | 🔧 |
| 11 | The synced path lacked the `+150ms` lead the curated path already had, so every highlight landed systematically late on top of the 250ms poll. | 🔧 |

✅ **Scale of the problem, measured.** For *Aaj Jaane Ki Zid Na Karo* our YouTube
stream is **453s**; LRCLIB offers 432s, 415s, 463s and **241s** — and the old code
took whichever came first.

**How it works now:** candidates are scored `0.55·title + 0.20·artist + 0.25·duration`
with a hard title floor of 0.6. On the real data this ranks the correct ghazal at
**0.825** and rejects *Uzr Aane Mein Bhi* (0.608) and *Main Ne Pairon Mein Payal*
(0.380) — both of which duration-alone would have chosen. When the best match is
still >8s off, the UI says so and offers a nudge instead of pretending.

---

## 2. The meaning chain

| # | Finding | Status |
|---|---|---|
| 12 | ✅ **The Groq model id was wrong — the key is fine.** `llama-3.3-70b-versatile` returns `404 model_not_found`; this account has no llama models at all. (An earlier raw-HTTP probe of mine returned 403/Cloudflare, which I initially misread as a dead key — the SDK reaches the API without trouble.) Default is now `openai/gpt-oss-120b`, verified working with `response_format: json_object`. | 🔧 |
| 13 | ✅ `gemini-2.0-flash` is decommissioned. So is `gemini-2.5-flash` — it is still advertised by ListModels but 404s with *"no longer available to new users"*. Model ids were hardcoded with no env override. | 🔧 |
| 14 | **Failures were cached forever.** `generate()` returned an error-shaped dict instead of raising, and the handler cached it with no TTL. | 🔧 |
| 15 | Provider names, model ids and raw SDK exception text were spliced into the user-visible `simple` field and returned as **HTTP 200**. | 🔧 |
| 16 | ✅ **The cache never worked.** It read/wrote `meaning_json` and `poet`; the deployed table has `meaning_response` and **no `poet` column**. It also held the **anon** key, which gets `42501 permission denied` on this table. Both failures were swallowed as "non-fatal". | 🔧 |
| 17 | ✅ **RAG returned `[]` on every request.** `retriever.py` called RPC `match_couplets`; only `search_couplets` exists. It also held the anon key, which is denied on `couplet_embeddings`. The corpus *was* ingested — 4,879 couplets — so this was pure waste: a cold 90MB model load for nothing. ✅ Now verified returning **3 rows** for a known-corpus couplet (`/health` reports the count, not just "no exception"). | 🔧 |
| 18 | Every I/O call was synchronous inside `async def` on a single worker, including a `time.sleep()` of up to **2.1s** per request that froze `/health` and `/api/tts` too. | 🔧 |
| 19 | Gemini retried **everything**, including permanent 404s — ~4.5s of blocking sleep added to every failing request. | 🔧 |
| 20 | The client made **two LLM calls for one payload**: `depth` was in the effect deps, but the single response already contained both `simple` and `detailed`. | 🔧 |
| 21 | `CACHE_TTL_SECONDS`, `EMBEDDING_MODEL`, `MAX_CONCURRENT_REQUESTS` were in `.env` and **read by nothing**. TTL is now wired and ✅ observed (24h expiry on a real row). `EMBEDDING_MODEL` now reads the env var, but I did not test a non-default value. `MAX_CONCURRENT_REQUESTS` remains unread. | 🔧 partial |
| 22 | A JSON array or bare string from the model caused an uncaught `TypeError` → HTTP 500. No `isinstance` guard. | 🔧 |
| 23 | `FEW_SHOT_EXAMPLES` — a hand-written Ghalib exemplar — was defined and **never used**. | 🔧 wired in |
| 24 | No request coalescing: N listeners on the same couplet meant N LLM calls. | 🔧 |
| 25 | `ml-engine/api/main.py` is a dead 272-line duplicate app; `lyrics_splitter.py` is orphaned. | ⏳ safe to delete |

**Measured result:** cold generation **10.7–11.4s**, cached **245–466ms** — a 23–46×
speedup on a cache that had never once worked. Verified through the full stack
(browser → Express → ML engine → Supabase), including a real Gemini-quota failure
where Groq took over and the reader saw nothing amiss.

---

## 3. Security and cost

| # | Finding | Status |
|---|---|---|
| 26 | **SSRF in `/api/yt/thumb`.** `[a-z0-9.-]*(ytimg\.com…)` matched by *substring*, so `https://evil-ytimg.com/payload` passed — then was fetched with no timeout, buffered unbounded into memory, and re-served from our origin with `ACAO: *` and a default `image/jpeg` content-type. | 🔧 |
| 27 | **No rate limiting, wildcard CORS** on `/api/meaning`, `/api/tts` (ElevenLabs: **10k chars/month**) and `/api/yt/*` (unofficial API — gets the host IP banned). Any web page could drain them from a visitor's browser. | 🔧 |
| 28 | **No timeouts on any of the 8 outbound fetches.** undici applies none by default. | 🔧 |
| 29 | ✅ **The backend never loaded `.env` at all.** Bare `dotenv.config()` resolves `cwd/.env`, but the documented start is `cd backend && npm run dev` and there is no `backend/.env`. `isDbConfigured` was therefore *always* false. | 🔧 |
| 30 | The obvious fix was a trap: root `.env` sets `PORT=8000`, which would have moved Express onto the YT bridge's port. Now reads `BACKEND_PORT`. | 🔧 |
| 31 | `express.json()` had no size limit; `/api/yt/lyrics/:videoId` had no id validation. | 🔧 (limit) |
| 32 | No 404 handler and no error middleware — an unknown path returned Express's HTML to an all-JSON API. No `EADDRINUSE` handler. No gateway `/health` (only `/api/ml/health`, which probes a *different* service). | 🔧 |
| 33 | `str(exc)` leaked to callers from the YT service's search and lyrics handlers; Express returned literal shell commands (`cd ml-engine && python main.py`) in error bodies. | 🔧 |

---

## 4. Still open — your call

- ⏳ **Gemini's free tier hit its quota during testing** (`429 ResourceExhausted`). This is
  now survivable rather than fatal: Groq picked up transparently and the reader saw a
  normal meaning. Worth knowing the ceiling exists. Provider order is configurable via
  `LLM_PROVIDER_ORDER` (default `gemini,groq`).
- ⏳ **`google.generativeai` is end-of-life.** It warns on import: *"All support for
  this package has ended… switch to `google.genai`."* Still functional; worth a
  migration before it stops being.
- ⏳ **`works` table doesn't exist** in Supabase (`PGRST205`). `backend/schema.sql`
  defines it but is referenced by no migration or script, so `/api/works` will always
  serve the mock catalog. Either run that schema or delete the file.
- ⏳ **Dead code**: `ml-engine/api/main.py`, `ml-engine/api/lyrics_splitter.py`.
- ⏳ **`seed.ts` reports success unconditionally** — it prints "completed successfully!"
  even when every insert failed, and `seed()` is called with no `.catch()`.
- ⏳ **Data defect**: the `hindi` field contains Urdu script in several mock/seed rows
  (`server.ts:50,93,137`, `seed.ts:32,102,119`), so the Hindi toggle would show Urdu.
- ⏳ **Unpinned Python deps**, including the unofficial `ytmusicapi>=1.7.0` whose
  upstream breaks routinely. Three `requirements.txt` files disagree (`supabase==2.11.0`
  vs `2.15.0`).
- ⏳ **Documentation drift**: TECH_STACK.md calls the frontend Vite (it's Next.js 15) and
  the backend "empty" (384 lines); Readme claims Edge TTS (it's ElevenLabs) and 10
  curated ghazals (the mock catalog has 3); SETUP.md documents `PORT=5000` while `.env`
  says 8000.

---

## 5. New capabilities added

- **Automatic couplet timings** — `POST /api/align-couplets` aligns the catalogue's
  couplets to the recording's synced lyrics with a monotonic DP, matching in whichever
  script the source uses. Verified 6/6 on real data, strictly increasing. The manual
  "mark timings" tool is gone.
- **Mehfil Jam** — `POST /api/mehfil` + `ws://…/ws/mehfil?token=…`. No accounts; the host
  shares a link and guests follow. Rooms are in-memory and expire 30 min after the last
  listener leaves.

## 6. Tests

| File | Covers |
|---|---|
| `ytmusic-service/test_lyrics.py` | 22 checks — LRC parser edge cases, query normalisation, candidate scoring |
| `ml-engine/test_aligner.py` | 14 checks — script handling, monotonic alignment, graceful degradation |
| `backend/test-jam.mjs` | 16 checks — room lifecycle, host/guest roles, server-clock stamping, guests cannot hijack |

---

## 7. The Rekhta corpus

Found while extending it. All ✅ verified against live pages.

| # | Finding | Status |
|---|---|---|
| 34 | ✅ **99.4% of the corpus was Roman-only.** Only 28 of 4,879 couplets had Urdu or Devanagari — and those 28 came from the hand-written catalogue, not the scraper. Couplet↔recording alignment matches in the lyric source's script (LRCLIB serves these in Devanagari), so the scraped corpus could not be aligned or displayed at all. | 🔧 |
| 35 | ✅ **The scraper never fetched the script variants.** Its docstring claimed it fetched `?lang=hi` / `?lang=ur`; no code did. The variants do exist — but the ghazal URLs already carry `?sort=year-asc`, so `lang` has to be merged into the query. Appending a second `?` silently returns the Roman page. | 🔧 |
| 36 | ✅ **Every ghazal was stored twice.** Rekhta prints each poem in two transliterations — `tum apne shikve kī bāteñ` and `tum apne shikwe ki baaten`. Dedup compared raw strings, so both survived and each ghazal was double length (222 duplicate verses; a 14-couplet ghazal is really 7). Now folded to an ASCII skeleton before comparison. | 🔧 |
| 37 | ✅ **Four of sixteen poet slugs were wrong**, and a wrong slug returns HTTP 200 with zero links — indistinguishable from a poet with no ghazals. A quarter of every harvest was skipped in silence: `mir-taqi-mir`→`meer-taqi-meer`, `ahmed-faraz`→`ahmad-faraz`, `jaun-elia`→`jaun-eliya`, `wali-dakhani`→`wali-mohammad-wali`. Now corrected, and an empty listing logs an error naming the URL to check. | 🔧 |
| 38 | **Re-running a scrape could never improve the corpus.** The converter skipped any couplet whose Roman text it already held, so a Roman-only corpus stayed Roman-only forever. It now upgrades rows in place, filling in missing scripts without overwriting real content. | 🔧 |

| 39 | **Poet names differ between the catalogue and Rekhta**, so one poet becomes two: `Faiz Ahmad Faiz` (70 couplets) vs `Faiz Ahmed Faiz` (5), `Ahmad Faraz` (84) vs `Ahmed Faraz` (5). The smaller counts are the hand-written catalogue's spelling. Poet grouping, the "explore this poet" link and RAG attribution all split on this. Needs a canonical-name map. | ⏳ |

**Measured effect of two re-scrape batches (52 ghazals, 5 poets):**

| | before | after |
|---|---|---|
| couplets | 4,879 | 4,953 |
| carrying Urdu + Devanagari | 28 (0.6%) | **475 (9.6%)** |
| duplicate transliterations | 222 | **0** |
| ghazals / poets | 305 / 18 | 335 / 21 |

Verified: 0 rows carry wrong-script content, and roman/Devanagari/Urdu are the same
verse line-for-line.

⏳ **Still to do:** the full harvest. At roughly 11s per ghazal (three page fetches
with a polite 2–4s delay) the 305 known ghazals take about an hour:

```
cd ml-engine
python scraper/rekhta_scraper.py --poets-file scraper/poets.txt --max-ghazals 40
python data/convert_scraped.py --input data/raw/rekhta_scraped.jsonl
python data/check_corpus.py          # confirm scripts went from 4% toward 100%
python -m rag.embeddings             # re-embed; 222 stale duplicate rows remain otherwise
```

**Licensing note:** `robots.txt` disallows only `/home/`, `/fonts/` and `/uploads/`,
so the ghazal pages are not excluded, and the scraper keeps a 2–4s delay. Copyright in
the individual poems is a separate question from robots policy — most of the poets in
`poets.txt` are long out of copyright (Ghalib, Mir, Momin, Dagh, Iqbal, Wali), but
several are not (Faiz d.1984, Faraz d.2008, Jaun Elia d.2002, Parveen Shakir d.1994,
Gulzar living). Worth a decision before publishing rather than before indexing.
