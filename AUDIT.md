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

---

## 8. Second pass: a team of agents (2026-09-12)

A second audit, run by a team of agents. Every finding was checked against the
code before anyone edited anything. The fixes landed in four batches that
touched no file in common, and then went through an integration gate. It was
committed on 2026-09-17, in `b2e5e39` (backend, YT bridge, ML engine) and
`9a57d73` (frontend).

**Legend (this section)**: 🔧 fixed · ✅ proven against the running services ·
🖥 proven in a browser · 🧪 proven by an offline test or harness · 👁 code review
only · ⏳ open

| Role | What it did |
|---|---|
| 5 bug hunters (frontend core, frontend components, backend, YT bridge, ML engine) | Read-only sweep: **53 raw findings** |
| Bug_Triage_Lead | Checked each finding against the code: **42 confirmed**, 10 duplicates, 1 deferred, 0 rejected. Planned 4 fix batches with no shared files |
| Engg_Manager | Approved the plan. Added live evidence that works 07, 09 and 10 auto-play the wrong recording. Later ran the integration gate |
| 4 fixers (B1–B4) | **37 fixes**, all reported fixed, each with its own tests |
| reviewer, product_designer, ui_ux_designer | Stopped during the reviewer's audit on 2026-09-12, at the owner's request. No design edits were made then |
| reviewer, designer, Engg_Manager (2026-09-17) | A lean design pass: **10 presentation-only changes**, signed off, and a final gate with **0 regressions** (see 8.8) |

### 8.1 Ambient tanpura (new feature)

The idle room now has a soft tanpura drone, with a distant bansuri-like voice
wandering through Raag Yaman. It is synthesised live with Web Audio, so there
is no audio file to ship or license. It is deliberately quiet: the measured
peak is about −20 dBFS.

- **When it starts:** on arrival, where the browser allows autoplay; otherwise
  on the first tap or key.
- **When it steps aside:** while a recording, the archive audio or narration
  plays, while a recording is being looked up, and while a guest's join prompt
  is showing. It returns about 2.5 s after they end. It sleeps while the tab is
  hidden.
- **Controls:** a header toggle, **Ambience**, remembered in `shama.ambience`.
  The footer reads "Tanpura, softly" while it plays.
- **Files:** `frontend/src/audio/ambientEngine.ts`, `frontend/src/audio/useAmbience.ts`,
  `frontend/src/components/aesthetic/AmbienceToggle.tsx`, plus the hook, toggle
  and footer in `App.tsx` and the `.ambience-*` rules in `App.css`.
- **Verified 🖥:** sounds on load, is silent while a recording plays (the audio
  context is suspended), and returns after pause. Re-checked after all four
  batches landed.
- **Open ⏳:** the "first tap" path is untested live, because both automation
  browsers allowed autoplay. Nobody has listened to it yet.

### 8.2 Fixes

**B1: App, player, sheets** (`App.tsx`, `YouTubePlayer.tsx`, `RecordingSheet.tsx`, `MehfilQueue.tsx`)

| # | Fix | Status |
|---|---|---|
| B1-F1 | Playback progress is tagged with its video. The host no longer broadcasts, and timings are no longer derived from, the previous recording's duration. Recording lyrics are re-queried with the real duration | 🔧 🖥 (the host-track-change half is 👁) |
| B1-F2 | Reopening a curated ghazal after a searched recording resets the transport | 🔧 🖥 |
| B1-F3 | The recording lookup can be cancelled, and returns its candidates instead of reading stale state | 🔧 🖥 |
| B1-F4 | Derived couplet timings are used only for the recording they came from | 🔧 🖥 |
| B1-F5 | Timing derivation drops superseded results and no longer overwrites other works' cached timings | 🔧 🖥 🧪 |
| B1-F6 | Meaning requests ignore out-of-order answers, clear a stale meaning on failure, and no longer send the singer as the poet | 🔧 🖥 |
| B1-F7 | The player applies settings that arrived before it was ready, and reports player errors ("This recording can't be played here…") | 🔧 🖥 |
| B1-F8 | The lyric offset applies to tap-to-seek and to the timeline ticks | 🔧 🖥 |
| B1-F9 | The line being explained is cleared when the recording changes | 🔧 👁 |
| B1-F10 | Guests are read-only (App and queue). "Play next" works when nothing is current | 🔧 🖥 |
| B1-F11 | Explore search reports server failures as failures | 🔧 🖥 |

**B2: jam client, stage, catalogue** (`useMehfilJam.ts`, `MehfilJamBar.tsx`, `ListeningStage.tsx`, `PoetryTimeline.tsx`, `SherSheet.tsx`, `MehfilScene.tsx`, `readiness.ts`, `meaning.ts`, `ghazals.ts`, `App.css`)

| # | Fix | Status |
|---|---|---|
| B2-F1 | The jam client retries with backoff, notices a mehfil that has ended, and asks for the join tap only once | 🔧 🖥 |
| B2-F2 | Guests are told when the host has left. A failed start is reported. The share link is shown when the clipboard is blocked | 🔧 🖥 |
| B2-F3 | The stage is read-only for guests: turntable, loop button, timeline | 🔧 🖥 |
| B2-F4 | The vinyl label texture ignores stale loads and disposes replaced textures | 🔧 👁 |
| B2-F5 | Unreliable timings can no longer reach the top readiness tier | 🔧 🖥 |
| B2-F6 | The meaning leak filter no longer blanks ordinary interpretive prose | 🔧 🧪 |
| B2-F7 | Catalogue text fixes, including two Cyrillic letters inside a Roman line | 🔧 🧪 |
| B2-F8 | SherSheet no longer promises a seek that can't happen | 🔧 🖥 |
| B2-F9 | Queue remove and reorder controls are visible on touch screens | 🔧 🖥 |

**B3: gateway, YT bridge, TTS** (`server.ts`, `jam.ts`, `ytmusic-service/main.py`, `tts/router.py`, `tts/edge_tts_client.py`)

| # | Fix | Status |
|---|---|---|
| B3-F1 | WebSocket upgrades on other paths are refused, not abandoned | 🔧 ✅ |
| B3-F2 | The rate limiter keys by route, not by raw path spelling. `/api/yt/lyrics/:videoId` is limited | 🔧 ✅ |
| B3-F3 | `/api/yt/thumb` caps bytes while reading, not after buffering | 🔧 ✅ |
| B3-F4 | The TTS limiter keys on the real client behind the gateway (`X-Forwarded-For`, trusted only from localhost) | 🔧 🧪 👁 |
| B3-F5 | TTS generation no longer blocks the ML engine's event loop, and its 30 s timeout is real | 🔧 🧪 👁 |
| B3-F6 | `/resolve` no longer auto-plays a different recording (see 8.4) | 🔧 ✅ |
| B3-F7 | Lyric search never picks a row without words, and never lets a different synced song beat the right song's plain lyrics | 🔧 🧪 |
| B3-F8 | LRCLIB queries are no longer repeated, and the total stays under the gateway's 30 s | 🔧 🧪 |
| B3-F9 | A present `oauth.json` no longer breaks every YT route. `/lyrics/{id}` no longer returns 500 | 🔧 🧪 |

**B4: ML engine** (`main.py`, `api/aligner.py`, `api/couplet_detector.py`, `api/cache.py`, `api/llm_client.py`, `rag/retriever.py`)

| # | Fix | Status |
|---|---|---|
| B4-F1 | **The Supabase service-role key is no longer written to logs** at `LOG_LEVEL=debug` (the chatty HTTP loggers are pinned to WARNING) | 🔧 ✅ |
| B4-F2 | `/api/split-lyrics`: linear-time regex, bounded lines, work moved off the event loop. The old regex took 2.4 s on a 20k-character line | 🔧 ✅ |
| B4-F3 | The aligner lets a couplet go untimed without consuming a line, and matches a misra split across two LRC lines (the split couplet now lands at 60.54 s, not 64.22 s) | 🔧 ✅ |
| B4-F4 | A meaning is validated before caching, and an invalid cached row counts as a miss | 🔧 🧪 |
| B4-F5 | `/api/align-couplets` work is bounded | 🔧 ✅ |
| B4-F6 | The RAG model loads at startup, not on the first `/health` or meaning request. The first `/health` used to take ~30 s | 🔧 ✅ |
| B4-F7 | `/api/meaning` stays inside the gateway's 60 s, with an overall LLM deadline and short Supabase timeouts | 🔧 🧪 |
| B4-F8 | The poet is part of the meaning cache key. Requests without a poet keep the old key | 🔧 ✅ |

### 8.3 Integration gate (Engg_Manager)

- **Suites:** frontend and backend `tsc` pass. `readiness.test.mjs` 17/17,
  `test_lyrics.py` 67/67 (39 new), `test_aligner.py` 26/26 (5 new),
  `test_scraper.py` 16/16, `backend/test-jam.mjs` 17/17 against the live
  backend, `py_compile` 11/11.
- **Contracts between batches:** all consistent. That covers the jam handle,
  `X-Forwarded-For`, the meaning cache key, the player callbacks and the
  readiness tiers.
- **Browser checks:** 17 passed, including a two-tab Mehfil Jam session. 4 were
  not testable within the rules: TTS (a metered call), a host changing track
  with a guest attached, GPU texture disposal, and a malformed or stalled LLM
  provider.
- **Result:** **0 regressions.** 29 files changed, +1266 / −251.
- **Side effect of the gate's own testing:** one junk row in `couplet_meanings`,
  `couplet_hash = aa2ddc4b567fbb30337e3a324d58b8db`. Only the fake text
  "gate line 4" can ever hit it. Deleted by the owner on 2026-09-12.

### 8.4 Behaviour changes you will notice

- **Works 07, 09 and 10 no longer auto-play.** They show the "which
  recording?" picker. Resolve used to play the wrong recording for each: 07
  *Koi Umeed Bar Nahin Aati* played Noor Jehan instead of Mehdi Hassan, 09
  *Wo Jo Hum Mein Tum Mein Qarar Tha* played Ustad Ahmed Hussain instead of
  Abida Parveen, and 10 *Tujhe Yaad Na Meri Aayi* played *Mujhe Kar Dena
  Deewana*. For 07 and 09, none of the top candidates is by the catalogue's
  singer.
- **An uncertain match shows the picker** instead of falling back to the
  archive.org MP3.
- **Replaying a recording re-queries its lyrics once**, with the player's real
  duration. The words panel may briefly say "Preparing" again.
- **Library readiness labels for 07, 09 and 10** were measured against the
  wrong recordings (`shama.readiness`). They refresh only when each is played
  again.

### 8.5 Incidents during the run

- **Service-role key in logs.** The ML engine at `LOG_LEVEL=debug` wrote the
  Supabase service-role key into its log, through the HTTP/2 library's debug
  output. The affected local log was deleted and B4-F1 stops new leaks.
  Rotating the key is still owed (8.6).
- **ML engine auto-reload hangs on Windows** when it is started from a
  background shell with no console. It logs "Reloading…" and keeps serving the
  old code. Run it as
  `python -m uvicorn main:app --host 127.0.0.1 --port 8001` from `ml-engine/`
  and restart it by hand after edits. The YT bridge never auto-reloads.
- **`next dev` served 404s for its own chunks** after files were added during
  the run, leaving a blank page (`curl /` still returned 200). Recovery: stop
  dev, delete `frontend/.next`, restart.

### 8.6 Still open: your call ⏳

1. **Finish retiring the leaked service-role key.** Done on 2026-09-12:
   - The app now uses the new publishable and secret keys.
   - The ML engine's Supabase library is upgraded from 2.11.0 to 2.31.0,
     because 2.11.0 rejects the new key format with "Invalid API key".
     Pydantic goes from 2.10.4 to 2.13.5 with it. The pins in
     `ml-engine/**/requirements.txt` are updated to match.
   - Verified: cache, RAG and the backend database all work on the new keys.

   Still to do:
   - Deactivate the legacy `anon` and `service_role` keys in the dashboard.
   - Optionally, revoke the legacy JWT secret.
   - Delete any old dev logs that may contain the key.
   - Update any deployed environment that still uses the old keys.
2. ~~Delete the junk cache row~~ `aa2ddc4b567fbb30337e3a324d58b8db`: done,
   deleted by the owner on 2026-09-12 (8.3).
3. **Deploy config runs dead code.** `ml-engine/deploy/render.yaml` and
   `docker/Dockerfile` start `uvicorn ml-engine.api.main:app`. That is the dead
   `api/main.py`, reached through an unimportable hyphenated path, so none of
   the ML engine fixes would be deployed. Point them at `main:app`.
4. **LAN exposure.** Express listens on all interfaces and `next dev`
   advertises a LAN URL, so the meaning, TTS and YT routes are reachable from
   the network behind per-IP rate limits only. Bind to 127.0.0.1 in dev, or
   add auth before exposing them.
5. **The aligner accepts radif-only matches** (was ml_engine-6). An unrelated
   misra that shares the radif scores 0.545, which mislabels shers and inflates
   coverage and readiness. Needs a matching heuristic: strip the radif/qafia
   before scoring, or require a margin over the runner-up.
6. **Works 07 and 09:** choose the right recording, since no top candidate is
   by the catalogue's singer.
7. **Product and wording decisions:**
   - whether `timingReliable` should be false when no duration is sent;
   - a "may drift" note and an offset nudge for curated ghazals with unreliable
     timings;
   - whether the queue should skip an unplayable item automatically;
   - whether a host refresh should restore the room (`hostKey` lives only in
     memory), and whether guests take over when the host leaves.
8. **TTS storage.** Every distinct text up to 5,000 characters is stored as an
   MP3 in `tts-audio` with no eviction. Needs a lifecycle rule and an input
   policy.
9. **`/api/yt/thumb` serves `image/svg+xml`** from any `*.googleusercontent.com`
   host with `ACAO: *`. Consider allowing raster types only.
10. **Not yet exercised live** (harness or code review only): B3-F4/F5, B4-F4/F7,
    B2-F4, the host-track-change half of B1-F1, and B3-F7/F8 against live
    LRCLIB.
11. **Ambience:** listen to it, and check the first-tap path in a normal
    browser profile.
12. The §4 items above are unchanged.

### 8.7 Resume here

- **State:** committed on `shama/redesign-sync-and-corpus` on 2026-09-17:
  - `b2e5e39`: the backend, YT bridge and ML engine fixes, with the 8.6 pins;
  - `9a57d73`: the frontend fixes, the ambience and the design pass (8.8).

  `9a57d73` also carries later work: the queue changes (+ from Explore,
  drag-to-reorder, an empty queue each visit), the fix for songs chosen from
  the queue not playing, and the first-visit opening with the painted diya.
  All suites were green at the final gate on 2026-09-17.
- **Done on 2026-09-17: the design phase**, run as the lean version: the
  reviewer, one designer and Engg_Manager, at medium effort. See 8.8.
  - **Scope rules (kept):** presentation only. No changes to playback, resolve,
    timing, meaning or jam logic, and no new, moved or renamed state, effects
    or handlers in `App.tsx`. The ambience wiring and the picker for 07, 09 and
    10 are unchanged.
- **Next:** choose from 8.6 and 8.8's deferred list.
- **Saved locally, outside the repo**, under
  `~/.claude/projects/<this project>/swarm-2026-09-12/`:
  - every report: hunt, triage plan, fix reports, gate;
  - the workflow scripts, including the lean design pass that ran;
  - the partial design-audit screenshots, and the design pass's own
    screenshots and results (`design-pass-2026-09-17/`);
  - a post-fix snapshot of `frontend/src`, the baseline for the scope audit in
    8.8;
  - the live agent dashboard, which shows spend (`node control-room/server.mjs`
    → http://127.0.0.1:4747), and `measure-cost.mjs`.

### 8.8 Design pass (2026-09-17)

A lean, presentation-only pass, as planned in 8.7. The **reviewer** audited the app, reusing the saved screenshots, and wrote 10 instructions (D1–D10). **One designer** built them. The reviewer then signed off on all 10, and **Engg_Manager** ran the final gate below. Everyone worked at medium effort. Committed in `9a57d73` (see 8.7).

Only five files changed: `App.css`, `index.css`, `App.tsx`, `ListeningStage.tsx` and `MehfilQueue.tsx` (+86 / −48 against the post-fix snapshot). No file was added or deleted. No forbidden path was touched: backend, the YT bridge, the ML engine, `data/`, `audio/`, `YouTubePlayer.tsx` and `useMehfilJam.ts` are all unchanged. The ambience feature is untouched: the `useAmbience(...)` call, `<AmbienceToggle>` in `.room-actions`, and the footer line "Tanpura, softly".

| # | Change | Status |
|---|---|---|
| D1 | **"Which recording?" picker (07/09/10).** It now has a heading, "Which recording is this?". The singer's name leads each row in ivory, with the title and duration beneath it. Rows are left-aligned and ≥48px tall, and each has a label such as "Play the recording by Noor Jehan: Koi Umeed Bar Nahin Aati, 3:22". The picker still never auto-plays. | 🔧 🖥 |
| D2 | **Contrast.** `--color-text-faint` goes from α .55 (2.76:1) to .85 (4.94:1). Opacity dimming is lifted: `.sher` .8, `.sher--past` .6, `.lyric-line` .85, `.work-mood` .9, `.sher-tag` .9, `.sher-time--unset` .7. | 🔧 🖥 |
| D3 | **Phone artwork.** A CSS cascade bug meant the art filled the screen at 390px (339px wide). It is now 218px, and the poetry starts on the first screen. Quiet mode keeps its larger art (273px). | 🔧 🖥 |
| D4 | **Header Tab order matches the screen:** Listen, Library, Explore, Ambience, Listen together. Only the markup order changed, and the CSS `order` rules were removed. | 🔧 🖥 |
| D5 | **Touch targets (coarse pointer only).** Text controls get invisible ±12px hit areas. Icon buttons are 40px, queue buttons 33px, and the timeline has more padding. At ≤620px the queue actions sit on their own row, so titles keep their full width. | 🔧 🖥 (touch emulated) |
| D6 | **Space Mono size floor.** The smallest metadata was 0.5–0.6rem; it is now 0.6–0.64rem, and no visible metadata is under 10.2px. `.room-nav-count` was also raised to .64rem to meet the floor. | 🔧 🖥 |
| D7 | **Focus.** The ring is 2px instead of 1px. The search field shows a highlight border and underline when focused. The ring on sheet couplets sits inside the scroll box, so it is not clipped. | 🔧 🖥 |
| D8 | **Library rows say what a click does.** Row buttons are labelled "Listen to …, sung by …", and each "Read" button has a unique label, "Read … without playing". The Explore picks are labelled too. Hover now warms the title instead of fading the row. | 🔧 🖥 |
| D9 | **Desktop stage.** The art is pinned to the top of the column, and the Urdu hero line is left-aligned with the title. Quiet mode and phones stay centred. | 🔧 🖥 |
| D10 | **Copy.** The empty queue now reads "Nothing is queued yet. Choose ghazals from the Library". The nav count is neutral, and accent-coloured only on the active Listen tab. | 🔧 🖥 |

**Final gate (Engg_Manager).**

**Suites.** All match the 8.3 baseline:
- frontend and backend `tsc`: pass;
- `readiness.test.mjs`: 17/17;
- `test_lyrics.py`: 67/67;
- `test_aligner.py`: 26/26;
- `backend/test-jam.mjs`: 17/17 against the live backend.

**Scope audit.** In the `.tsx` diff:
- `App.tsx`: the header blocks are reordered, and `aria-label`/`title` are added to three buttons;
- `ListeningStage.tsx`: an eyebrow and new note copy, `aria-labelledby`, `aria-label`, and `c.artist`/`c.title` swap places;
- `MehfilQueue.tsx`: two strings.

No state, ref, effect, handler, condition or data flow was added, removed or renamed. `git status` lists the same entries as before the pass. The gate also saw the screenshot folder `.playwright-mcp/`, which was moved out of the repo afterwards; the diff is still 5 files, +86 / −48, after the post-gate fix below. Result: **0 regressions.**

**Browser checks** (1440 and 390), all 🖥:
- **Ambience** sounds while idle, gives way to "Playing" when a recording starts, and returns after pause.
- **Couplets follow the singer:** *Ranjish Hi Sahi* seeked to 4:56 activates couplet 03, and at 6:50 couplet 05 is active, with 4 couplets marked as sung (opacity 0.6).
- **Work 07** shows the picker with 5 rows, and nothing plays.
- **The meaning panel:** Meaning, Words and Context each switch and show content, and no new `/api/meaning` call was made.
- **Explore search** returns results.
- **Quiet mode** turns on (centred, 300px art) and off.
- **At 390:** no horizontal overflow, header rows at 26/87/125, picker left-aligned.
- **Keyboard:** every focus stop shows a 2px ring.
- **Console:** no uncaught errors and no `/_next` 404s, only the known `/favicon.ico`.

**Checked after the gate (orchestrator)** 🖥. These are the two items the gate could not open:
- **A searched recording's lyrics sheet.** Explore → "Mehdi Hassan" → *Bhare Jahan Mein* shows 4 couplets from its plain lyrics, with no page errors.
- **The D10 empty-queue copy.** A first-time visitor sees "Nothing is queued yet. Choose ghazals from the Library", and the button opens the Library.

**Fix after the gate (orchestrator)** 🔧 🖥 🧪. D1's button label named only the singer and the length. The picker's rows can be different songs, though: in one lookup, work 07's fifth row was Mehdi Hassan's *Hamen Koi Gham Nahin Tha*, and work 10's top match used to be a different song altogether (8.4). The label now reads "Play the recording by ‹singer›: ‹title›, ‹length›", which follows the visible text. It is one attribute string in `ListeningStage.tsx`. `tsc` and `readiness.test.mjs` pass, and the labels were checked live on work 07.

**Request budget exceeded.** The gate's budget was 10 `/api/yt/*` requests; the run made 27. Six were API calls (3 resolves, 2 lyric lookups, 1 search). The other 21 were thumbnail images that the page loads by itself when it shows search results and queue art. No TTS was called and no new meaning requests were made.

**Cost.** The four agents came to $10.38 at list prices (audit $2.92, build $2.95, sign-off $1.38, gate $3.13). For comparison, the audit stopped on 2026-09-12 cost $14.42 on its own, at max effort.

**Screenshots** are in the swarm kit, outside the repo, under `design-pass-2026-09-17/`.

**Deferred (need logic or a forbidden file)** ⏳
- **Technical readiness badges** ("words, not timed", "timings approximate"). The wording lives in `data/readiness.ts`.
- **The Library mood filter never renders** (`moods.length` is 0).
- **Play stays enabled while the picker waits for a choice.**
- **"Following the singer" shows before anything plays,** and when disabled it is very faint (opacity .35).
- **The meaning tabs use `role=tab` without arrow-key handling.**
- **The English line of already-sung couplets stays at about 3.1:1** on purpose, to keep the "already heard" signal.
- **The YouTube iframe takes the first two Tab stops,** ahead of the header.
- **With a mouse at 390, the Play button's top edge sits 9px off the other transport buttons,** though all share one centre line.
- **Favicon.** It would need a new file.

**For the owner** ⏳
1. ~~Commit the design files with the section 8 changes~~: done, in `9a57d73`.
2. **Seen during the gate, not caused by this pass:** work *Dil-e-Nadaan Tujhe Hua Kya Hai* resolved to a 61-second clip (`mBicZiHSPHk`). Its couplets have no timings, so couplet 01 stayed active and playback ended at 1:00. This is a recording-resolution matter, like 8.6 item 6.
3. **Decide on the deferred items above,** especially the readiness wording and the mood filter.
