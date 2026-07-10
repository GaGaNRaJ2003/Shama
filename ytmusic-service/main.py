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
        raise HTTPException(status_code=502, detail=f"YT Music search failed: {exc}")

    # ytmusicapi treats `limit` as a floor (it paginates past it), so slice hard.
    results = [song for item in raw if (song := _normalize_song(item))][:limit]
    return {"query": q, "count": len(results), "results": results}


# ---------------------------------------------------------------------------
# LRCLIB — free synced lyrics provider (https://lrclib.net)
# MUST be defined before /lyrics/{video_id} to avoid route conflict
# ---------------------------------------------------------------------------

_LRC_LINE_RE = re.compile(r"\[(\d{2}):(\d{2})\.(\d{2,3})\]\s?(.*)")


def _parse_lrc(synced_lyrics: str) -> list[dict[str, Any]]:
    """Parse LRC-formatted synced lyrics into a list of {time_ms, text} dicts."""
    lines: list[dict[str, Any]] = []
    for raw_line in synced_lyrics.splitlines():
        m = _LRC_LINE_RE.match(raw_line)
        if m:
            minutes, seconds, frac, text = m.groups()
            ms_frac = int(frac) * (10 if len(frac) == 2 else 1)
            time_ms = int(minutes) * 60_000 + int(seconds) * 1_000 + ms_frac
            lines.append({"time_ms": time_ms, "text": text})
    return lines


@app.get("/lyrics/search")
def lyrics_search(
    title: str = Query("", description="Track title"),
    artist: str = Query("", description="Artist name"),
) -> dict[str, Any]:
    """Search LRCLIB for synced/plain lyrics by title and artist."""
    query = f"{title} {artist}".strip()
    if not query:
        raise HTTPException(status_code=400, detail="Provide at least title or artist.")

    try:
        resp = requests.get(
            "https://lrclib.net/api/search",
            params={"q": query},
            headers={"User-Agent": "Shama/1.0"},
            timeout=30,
        )
        resp.raise_for_status()
        results: list[dict[str, Any]] = resp.json()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LRCLIB request failed: {exc}")

    if not results:
        return {"hasLyrics": False, "lyrics": None, "syncedLines": [], "source": None}

    # Pick best match: prefer first result with syncedLyrics, else first with plainLyrics
    best = None
    for item in results:
        if item.get("syncedLyrics"):
            best = item
            break
    if best is None:
        for item in results:
            if item.get("plainLyrics"):
                best = item
                break
    if best is None:
        return {"hasLyrics": False, "lyrics": None, "syncedLines": [], "source": None}

    synced_lines = _parse_lrc(best["syncedLyrics"]) if best.get("syncedLyrics") else []
    plain = best.get("plainLyrics") or ""

    return {
        "hasLyrics": True,
        "lyrics": plain,
        "syncedLines": synced_lines,
        "source": "lrclib",
        "trackName": best.get("trackName", ""),
        "artistName": best.get("artistName", ""),
    }


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
        return {
            "videoId": video_id,
            "hasLyrics": False,
            "lyrics": None,
            "source": None,
            "error": str(exc),
        }


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run(app, host="127.0.0.1", port=port)
