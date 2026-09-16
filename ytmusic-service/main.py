"""
Shama · YT Music bridge service
--------------------------------
A thin FastAPI wrapper around the unofficial `ytmusicapi` library
(https://ytmusicapi.readthedocs.io/en/stable/).

It exposes just what the Shama console needs:
  GET /health            -> liveness probe
  GET /search?q=&limit=  -> normalized song results (videoId, title, artists, thumbnail, duration)
  GET /lyrics/{video_id} -> time-unsynced lyrics + source, when YouTube Music has them

Playback itself happens in the browser via the YouTube IFrame Player API
(using the `videoId` returned here), so we never proxy audio streams.

Run:  uvicorn main:app --port 8000   (or: python main.py)
"""
from __future__ import annotations

import os
import re
import time
from functools import lru_cache
from typing import Any, Optional

import requests
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from ytmusicapi import YTMusic

app = FastAPI(title="Shama YT Music Bridge", version="1.0.0")

# The Express backend proxies these routes, but we allow direct browser access
# too (handy for debugging) — hence permissive CORS on this internal service.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@lru_cache(maxsize=1)
def get_client() -> YTMusic:
    """Lazily construct a single unauthenticated YTMusic client.

    Unauthenticated access is enough for search + public lyrics. If a
    `browser.json` / `oauth.json` header file is present next to this script,
    we use it so region/age-gated results resolve too.
    """
    here = os.path.dirname(os.path.abspath(__file__))
    for candidate in ("browser.json", "oauth.json", "headers_auth.json"):
        path = os.path.join(here, candidate)
        if os.path.exists(path):
            try:
                return YTMusic(path)
            except Exception as exc:
                # A header file ytmusicapi rejects (it raises on an oauth.json
                # passed as a path) must not take every route down with it.
                print(f"[yt] ignoring {candidate} ({type(exc).__name__}); using the unauthenticated client")
                return YTMusic()
    return YTMusic()


def _best_thumbnail(thumbnails: Optional[list[dict[str, Any]]]) -> Optional[str]:
    if not thumbnails:
        return None
    # ytmusicapi returns thumbnails ascending by size; the last is the largest.
    return thumbnails[-1].get("url")


def _normalize_song(item: dict[str, Any]) -> Optional[dict[str, Any]]:
    video_id = item.get("videoId")
    if not video_id:
        return None
    artists = [a.get("name") for a in (item.get("artists") or []) if a.get("name")]
    album = item.get("album")
    return {
        "videoId": video_id,
        "title": item.get("title"),
        "artists": artists,
        "artist": ", ".join(artists) if artists else "Unknown Artist",
        "album": album.get("name") if isinstance(album, dict) else album,
        "duration": item.get("duration"),
        "durationSeconds": item.get("duration_seconds"),
        "thumbnail": _best_thumbnail(item.get("thumbnails")),
        "source": "youtube",
    }


@app.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "service": "shama-ytmusic"}


@app.get("/search")
def search(
    q: str = Query(..., min_length=1, description="Search query"),
    limit: int = Query(20, ge=1, le=40),
    filter: str = Query("songs", description="songs | videos | albums | community_playlists"),
) -> dict[str, Any]:
    try:
        raw = get_client().search(q, filter=filter, limit=limit)
    except Exception as exc:  # network / parse errors from the unofficial API
        print(f"[yt] search failed for {q!r}: {exc}")
        raise HTTPException(status_code=502, detail="Search is unavailable right now.")

    # ytmusicapi treats `limit` as a floor (it paginates past it), so slice hard.
    results = [song for item in raw if (song := _normalize_song(item))][:limit]
    return {"query": q, "count": len(results), "results": results}


# A resolution we are willing to play without asking.
_RESOLVE_FLOOR = 0.62


def _score_recording(song: dict[str, Any], title: str, artist: str) -> float:
    """How likely is this search result to BE the ghazal we asked for?

    Title dominates deliberately: the wrong song by the right singer is still
    the wrong song, and that is the failure this exists to prevent.
    """
    title_sim = _similarity(song.get("title", ""), title)
    artist_sim = _similarity(song.get("artist", ""), artist) if artist else 0.5
    return round(0.72 * title_sim + 0.28 * artist_sim, 3)


# Autoplay also needs each half to hold up on its own. The weighted score alone
# let a different song by the right singer through (a 0.47 title match), and
# the right song by a different singer.
_RESOLVE_TITLE_FLOOR = 0.8
_RESOLVE_ARTIST_FLOOR = 0.6


def _is_confident(song: dict[str, Any], title: str, artist: str) -> bool:
    """Would we play this recording without asking?"""
    if _similarity(song.get("title", ""), title) < _RESOLVE_TITLE_FLOOR:
        return False
    if artist and _similarity(song.get("artist", ""), artist) < _RESOLVE_ARTIST_FLOOR:
        return False
    return _score_recording(song, title, artist) >= _RESOLVE_FLOOR


@app.get("/resolve")
def resolve(
    title: str = Query(..., min_length=1, description="Ghazal title we want"),
    artist: str = Query("", description="Preferred performer"),
    limit: int = Query(6, ge=1, le=12),
) -> dict[str, Any]:
    """Find the recording that actually *is* the requested ghazal.

    Search returns things ranked by YouTube's relevance, not by whether they are
    the song you asked for. Taking result #1 unchecked is how "Baat Karni Mujhe
    Mushkil" ended up playing "Muh Ki Baat" — and then, quite correctly, finding
    no lyrics for it. The reported miss was never a lyrics problem.

    Returns a `best` only when the match is confident; otherwise the caller gets
    `candidates` and should let a human choose rather than guess on their behalf.
    """
    primary_artist = re.split(r"[,&]| feat| ft\.", artist, maxsplit=1)[0].strip() if artist else ""
    query = f"{_norm_text(title)} {_norm_text(primary_artist)}".strip()

    try:
        raw = get_client().search(query, filter="songs", limit=limit * 2)
    except Exception as exc:
        print(f"[yt] resolve failed for {query!r}: {exc}")
        raise HTTPException(status_code=502, detail="Search is unavailable right now.")

    scored: list[tuple[float, dict[str, Any]]] = []
    for item in raw:
        song = _normalize_song(item)
        if not song:
            continue
        scored.append((_score_recording(song, title, artist), song))

    scored.sort(key=lambda pair: pair[0], reverse=True)
    scored = scored[:limit]
    if not scored:
        return {"best": None, "confidence": 0.0, "candidates": [], "query": query}

    top_score = scored[0][0]
    # The top score alone is not a licence to play: take the first candidate
    # that also clears the title and artist floors, or let a human choose.
    best_pair = next(((s, song) for s, song in scored if _is_confident(song, title, artist)), None)
    return {
        "best": best_pair[1] if best_pair else None,
        "confidence": best_pair[0] if best_pair else top_score,
        "candidates": [{**song, "confidence": score} for score, song in scored],
        "query": query,
    }


# ---------------------------------------------------------------------------
# LRCLIB — free synced lyrics provider (https://lrclib.net)
# MUST be defined before /lyrics/{video_id} to avoid route conflict
# ---------------------------------------------------------------------------

# One timestamp. A line may carry several, e.g. "[00:12.00][01:20.00]text",
# which is how LRC compresses a repeated refrain — very common in ghazal and
# qawwali. The old single-shot regex kept the first stamp and left the rest
# inside the lyric text, so refrains never highlighted on repeat and a raw
# "[01:20.00]" was rendered to the reader.
_LRC_STAMP_RE = re.compile(r"\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]")
_LRC_META_RE = re.compile(r"^\[(ar|ti|al|au|by|re|ve|length|offset|tool|id):", re.I)
_LRC_OFFSET_RE = re.compile(r"^\[offset:\s*([+-]?\d+)\s*\]", re.I)


def _parse_lrc(synced_lyrics: str) -> tuple[list[dict[str, Any]], int]:
    """Parse LRC synced lyrics into [{time_ms, text}], sorted by time.

    Returns (lines, stamped_line_count). A zero count when the input was
    non-empty means the file used a form we could not read — the caller needs
    that to distinguish "no synced lyrics" from "we failed to parse them".

    Handles: multi-stamp lines, [mm:ss] with no fraction, single-digit minutes,
    2- or 3-digit fractions, [offset:±ms], and metadata tags.
    """
    lines: list[dict[str, Any]] = []
    offset_ms = 0
    stamped = 0

    for raw_line in synced_lyrics.splitlines():
        line = raw_line.rstrip()
        if not line:
            continue

        off = _LRC_OFFSET_RE.match(line.strip())
        if off:
            # Positive offset means the lyrics should appear *earlier*.
            offset_ms = -int(off.group(1))
            continue

        stamps = list(_LRC_STAMP_RE.finditer(line))
        if not stamps:
            continue
        if _LRC_META_RE.match(line.strip()) and len(stamps) == 0:
            continue

        text = line[stamps[-1].end():].strip()
        stamped += 1
        for m in stamps:
            minutes, seconds, frac = m.group(1), m.group(2), m.group(3)
            if frac is None:
                ms_frac = 0
            elif len(frac) == 1:
                ms_frac = int(frac) * 100
            elif len(frac) == 2:
                ms_frac = int(frac) * 10
            else:
                ms_frac = int(frac)
            time_ms = int(minutes) * 60_000 + int(seconds) * 1_000 + ms_frac + offset_ms
            lines.append({"time_ms": max(0, time_ms), "text": text})

    # The consumer scans forward and stops at the first future stamp, so order
    # is load-bearing: one out-of-order entry used to freeze the highlight.
    lines.sort(key=lambda item: item["time_ms"])
    return lines, stamped


_NOISE_RE = re.compile(
    r"\((?:live|remaster(?:ed)?[^)]*|audio|video|hd|full song|lyrical|official[^)]*)\)"
    r"|\[(?:live|remaster(?:ed)?[^\]]*|hd|official[^\]]*)\]",
    re.I,
)


def _norm_text(s: str) -> str:
    """Fold a title/artist to a comparable skeleton.

    Hyphens matter enormously here: LRCLIB's index tokenises on them, so
    "Dil-e-nadan ..." returns zero results while "Dil E Nadan ..." returns five.
    """
    s = (s or "").lower()
    s = _NOISE_RE.sub(" ", s)
    s = s.replace("-", " ").replace("_", " ")
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


# Containment only counts when the shorter side is substantial: at least three
# words, or at least this share of the longer side's words.
_CONTAIN_MIN_COVERAGE = 0.5


def _similarity(a: str, b: str) -> float:
    from difflib import SequenceMatcher

    na, nb = _norm_text(a), _norm_text(b)
    if not na or not nb:
        return 0.0
    ratio = SequenceMatcher(None, na, nb).ratio()
    # Containment counts: "aaj jaane ki zid na karo" inside a longer official
    # title should not be punished for the extra words. On whole words, though:
    # a raw substring test scored "aa" (inside "aaj") or a lone "karo" at 0.9.
    ta, tb = na.split(), nb.split()
    short, long_ = (ta, tb) if len(ta) <= len(tb) else (tb, ta)
    n = len(short)
    contained = any(long_[k:k + n] == short for k in range(len(long_) - n + 1))
    if contained and (n >= 3 or n / len(long_) >= _CONTAIN_MIN_COVERAGE):
        ratio = max(ratio, 0.9)
    return ratio


# A candidate must at least plausibly be the same poem.
_TITLE_FLOOR = 0.60
# And the combined evidence has to clear a bar too, so we never hand back the
# words of an unrelated song just because nothing better turned up.
_SCORE_FLOOR = 0.45
# Synced lyrics win only from the same song: a synced row must be within this
# much title similarity of the best row to be preferred over it.
_SAME_SONG_MARGIN = 0.05


def _score_candidate(item: dict[str, Any], title: str, artist: str, duration: float | None) -> float:
    title_sim = _similarity(item.get("trackName", ""), title) if title else 0.5
    artist_sim = _similarity(item.get("artistName", ""), artist) if artist else 0.5
    if title and title_sim < _TITLE_FLOOR:
        return -1.0
    if duration and item.get("duration"):
        delta = abs(float(item["duration"]) - float(duration))
        # Full credit within a few seconds, nothing beyond ~30s: a 5-minute
        # studio LRC applied to a 9-minute live take is the whole bug.
        dur_score = max(0.0, 1.0 - delta / 30.0)
    else:
        dur_score = 0.35  # unknown duration: neither reward nor heavily punish
    return 0.55 * title_sim + 0.20 * artist_sim + 0.25 * dur_score


@app.get("/lyrics/search")
def lyrics_search(
    title: str = Query("", description="Track title"),
    artist: str = Query("", description="Artist name"),
    duration: float = Query(0, description="Track duration in seconds, for matching"),
    album: str = Query("", description="Album name, if known"),
) -> dict[str, Any]:
    """Find lyrics for a *specific recording* on LRCLIB.

    The previous implementation took the first result that had any synced
    lyrics at all, which is how a live qawwali ended up with the studio cut's
    timings. We now query with normalised text and rank candidates on title,
    artist and duration together.
    """
    if not title and not artist:
        raise HTTPException(status_code=400, detail="Provide at least title or artist.")

    # One budget for every LRCLIB call below, kept under the gateway's 30s: an
    # answer that arrives after the gateway has given up reaches nobody.
    deadline = time.monotonic() + 20

    # The artist arrives comma-joined ("A, B & C"); the leading name is the
    # useful search token and the rest is noise to a fuzzy index.
    primary_artist = re.split(r"[,&]| feat| ft\.", artist, maxsplit=1)[0].strip() if artist else ""
    queries = [
        f"{_norm_text(title)} {_norm_text(primary_artist)}".strip(),
        _norm_text(title),
    ]

    results: list[dict[str, Any]] = []
    seen: set[Any] = set()
    # Kept per query: the renditions lookup would ask LRCLIB the title-only
    # question again, so it reuses these rows instead.
    rows_by_query: dict[str, list[dict[str, Any]]] = {}
    for q in [q for q in dict.fromkeys(queries) if q]:
        if time.monotonic() >= deadline:
            break
        try:
            resp = requests.get(
                "https://lrclib.net/api/search",
                params={"q": q},
                headers={"User-Agent": "Shama/1.0 (https://github.com/shama)"},
                timeout=(3.05, max(1.0, min(8.0, deadline - time.monotonic()))),
            )
            resp.raise_for_status()
            rows = resp.json() or []
            rows_by_query[q] = rows
            for item in rows:
                if item.get("id") not in seen:
                    seen.add(item.get("id"))
                    results.append(item)
        except Exception as exc:
            # Log-only: a failed variant shouldn't kill the whole lookup.
            print(f"[lrclib] query {q!r} failed: {exc}")
        if results and len(results) >= 10:
            break

    title_rows = rows_by_query.get(_norm_text(title))
    if not results:
        return _no_lyrics(_other_renditions(title, artist, rows=title_rows, deadline=deadline))

    dur = duration or None
    scored = sorted(
        ((_score_candidate(i, title, artist, dur), i) for i in results),
        key=lambda pair: pair[0],
        reverse=True,
    )
    # A row with no words cannot be the answer: LRCLIB flags instrumentals, and
    # choosing one returned hasLyrics with nothing to read, which also kept the
    # client from falling back to YouTube Music's lyrics.
    scored = [
        (s, i) for s, i in scored
        if s >= _SCORE_FLOOR and not i.get("instrumental")
        and (i.get("syncedLyrics") or i.get("plainLyrics"))
    ]
    if not scored:
        # Nothing clears the bar for THIS recording — but the poem may still be
        # available through another singer.
        return _no_lyrics(_other_renditions(title, artist, rows=title_rows, deadline=deadline))

    # Prefer the best-scoring candidate that actually has synced lyrics; fall
    # back to the best plain-lyrics one rather than accepting a poor sync. Only
    # a synced row of the same song counts: a different, shorter title that
    # happens to be synced must not beat the right song's plain words.
    best_any = scored[0]
    best_title = _similarity(best_any[1].get("trackName", ""), title) if title else 0.5
    best_synced = next(
        (pair for pair in scored if pair[1].get("syncedLyrics")
         and (not title or _similarity(pair[1].get("trackName", ""), title) >= best_title - _SAME_SONG_MARGIN)),
        None,
    )
    score, best = best_synced or best_any

    synced_lines: list[dict[str, Any]] = []
    stamped = 0
    if best.get("syncedLyrics"):
        synced_lines, stamped = _parse_lrc(best["syncedLyrics"])

    matched_duration = best.get("duration")
    duration_delta = (
        abs(float(matched_duration) - float(dur)) if (matched_duration and dur) else None
    )
    # Beyond this, the timings belong to a different rendition: still worth
    # reading, not worth trusting to the millisecond.
    timing_reliable = bool(synced_lines) and (duration_delta is None or duration_delta <= 8)

    return {
        "hasLyrics": True,
        "lyrics": best.get("plainLyrics") or "",
        "syncedLines": synced_lines,
        # When this recording has no usable timings, point at renditions that do.
        "otherRenditions": _other_renditions(title, artist, rows=title_rows, deadline=deadline) if not synced_lines else [],
        "source": "lrclib",
        "trackName": best.get("trackName", ""),
        "artistName": best.get("artistName", ""),
        "matchScore": round(score, 3),
        "matchedDuration": matched_duration,
        "durationDelta": duration_delta,
        "timingReliable": timing_reliable,
        # True when the file had synced lyrics we could not read — the caller
        # must not report this as "this song has no synced lyrics".
        "syncParseFailed": bool(best.get("syncedLyrics")) and stamped == 0,
    }


def _no_lyrics(other_renditions: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    return {
        "hasLyrics": False,
        "lyrics": None,
        "syncedLines": [],
        "source": None,
        "matchScore": 0.0,
        "timingReliable": False,
        "syncParseFailed": False,
        "otherRenditions": other_renditions or [],
    }


def _other_renditions(title: str, exclude_artist: str = "", limit: int = 5,
                      rows: list[dict[str, Any]] | None = None,
                      deadline: float | None = None) -> list[dict[str, Any]]:
    """Recordings of the SAME song, by anyone, that do have words.

    A ghazal is a poem: every singer performs the same verse. So when this
    particular recording has no lyrics, another rendition's words are still the
    right words — only the timings belong to that other performance. Offering
    them beats a dead end, as long as we are honest about the swap.

    `rows` are LRCLIB results for this title that the caller already holds;
    LRCLIB is asked only without them. `deadline` (time.monotonic()) is the
    caller's budget and bounds that request the same way.
    """
    q = _norm_text(title)
    if not q:
        return []
    if rows is None:
        timeout = 15 if deadline is None else (3.05, max(1.0, min(8.0, deadline - time.monotonic())))
        try:
            resp = requests.get(
                "https://lrclib.net/api/search",
                params={"q": q},
                headers={"User-Agent": "Shama/1.0 (https://github.com/shama)"},
                timeout=timeout,
            )
            resp.raise_for_status()
            rows = resp.json() or []
        except Exception as exc:
            print(f"[lrclib] rendition lookup failed for {title!r}: {exc}")
            return []

    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in rows:
        if _similarity(item.get("trackName", ""), title) < _TITLE_FLOOR:
            continue
        if not (item.get("syncedLyrics") or item.get("plainLyrics")):
            continue
        artist = item.get("artistName", "")
        key = _norm_text(artist)
        # One entry per performer; several uploads of one rendition aren't choices.
        if not key or key in seen:
            continue
        seen.add(key)
        out.append({
            "trackName": item.get("trackName", ""),
            "artistName": artist,
            "duration": item.get("duration"),
            "hasSynced": bool(item.get("syncedLyrics")),
        })
        if len(out) >= limit:
            break
    # A different singer first: that is the point of the list.
    out.sort(key=lambda r: (_norm_text(r["artistName"]) == _norm_text(exclude_artist), not r["hasSynced"]))
    return out


@app.get("/lyrics/{video_id}")
def lyrics(video_id: str) -> dict[str, Any]:
    try:
        # Inside the try: a client that cannot be built is one more reason
        # there are no lyrics, not a bare 500.
        client = get_client()
        watch = client.get_watch_playlist(videoId=video_id)
        browse_id = watch.get("lyrics")
        if not browse_id:
            return {"videoId": video_id, "hasLyrics": False, "lyrics": None, "source": None}
        data = client.get_lyrics(browse_id)
        return {
            "videoId": video_id,
            "hasLyrics": bool(data.get("lyrics")),
            "lyrics": data.get("lyrics"),
            "source": data.get("source"),
        }
    except Exception as exc:
        # Lyrics are a nice-to-have; never hard-fail the listening experience.
        # The reason is logged, not returned: this body reaches the browser.
        print(f"[yt] lyrics lookup failed for {video_id}: {exc}")
        return {
            "videoId": video_id,
            "hasLyrics": False,
            "lyrics": None,
            "source": None,
        }


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run(app, host="127.0.0.1", port=port)
