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
            return YTMusic(path)
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

    top_score, top = scored[0]
    confident = top_score >= _RESOLVE_FLOOR
    return {
        "best": top if confident else None,
        "confidence": top_score,
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


def _similarity(a: str, b: str) -> float:
    from difflib import SequenceMatcher

    na, nb = _norm_text(a), _norm_text(b)
    if not na or not nb:
        return 0.0
    ratio = SequenceMatcher(None, na, nb).ratio()
    # Containment counts: "aaj jaane ki zid na karo" inside a longer official
    # title should not be punished for the extra words.
    if na in nb or nb in na:
        ratio = max(ratio, 0.9)
    return ratio


# A candidate must at least plausibly be the same poem.
_TITLE_FLOOR = 0.60
# And the combined evidence has to clear a bar too, so we never hand back the
# words of an unrelated song just because nothing better turned up.
_SCORE_FLOOR = 0.45


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

    # The artist arrives comma-joined ("A, B & C"); the leading name is the
    # useful search token and the rest is noise to a fuzzy index.
    primary_artist = re.split(r"[,&]| feat| ft\.", artist, maxsplit=1)[0].strip() if artist else ""
    queries = [
        f"{_norm_text(title)} {_norm_text(primary_artist)}".strip(),
        _norm_text(title),
    ]

    results: list[dict[str, Any]] = []
    seen: set[Any] = set()
    for q in [q for q in dict.fromkeys(queries) if q]:
        try:
            resp = requests.get(
                "https://lrclib.net/api/search",
                params={"q": q},
                headers={"User-Agent": "Shama/1.0 (https://github.com/shama)"},
                timeout=20,
            )
            resp.raise_for_status()
            for item in resp.json() or []:
                if item.get("id") not in seen:
                    seen.add(item.get("id"))
                    results.append(item)
        except Exception as exc:
            # Log-only: a failed variant shouldn't kill the whole lookup.
            print(f"[lrclib] query {q!r} failed: {exc}")
        if results and len(results) >= 10:
            break

    if not results:
        return _no_lyrics(_other_renditions(title, artist))

    dur = duration or None
    scored = sorted(
        ((_score_candidate(i, title, artist, dur), i) for i in results),
        key=lambda pair: pair[0],
        reverse=True,
    )
    scored = [(s, i) for s, i in scored if s >= _SCORE_FLOOR]
    if not scored:
        # Nothing clears the bar for THIS recording — but the poem may still be
        # available through another singer.
        return _no_lyrics(_other_renditions(title, artist))

    # Prefer the best-scoring candidate that actually has synced lyrics; fall
    # back to the best plain-lyrics one rather than accepting a poor sync.
    best_synced = next((pair for pair in scored if pair[1].get("syncedLyrics")), None)
    best_any = scored[0]
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
        "otherRenditions": _other_renditions(title, artist) if not synced_lines else [],
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


def _other_renditions(title: str, exclude_artist: str = "", limit: int = 5) -> list[dict[str, Any]]:
    """Recordings of the SAME song, by anyone, that do have words.

    A ghazal is a poem: every singer performs the same verse. So when this
    particular recording has no lyrics, another rendition's words are still the
    right words — only the timings belong to that other performance. Offering
    them beats a dead end, as long as we are honest about the swap.
    """
    q = _norm_text(title)
    if not q:
        return []
    try:
        resp = requests.get(
            "https://lrclib.net/api/search",
            params={"q": q},
            headers={"User-Agent": "Shama/1.0 (https://github.com/shama)"},
            timeout=15,
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
    client = get_client()
    try:
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
