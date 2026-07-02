# Shama · YT Music Bridge

A tiny [FastAPI](https://fastapi.tiangolo.com/) service that wraps the unofficial
[`ytmusicapi`](https://ytmusicapi.readthedocs.io/en/stable/) so the Shama console can
search YouTube Music and pull lyrics. Audio itself plays in the browser through the
YouTube IFrame Player API using the `videoId` we return — no streams are proxied.

## Run

```bash
cd ytmusic-service
python -m venv .venv
# Windows:  .venv\Scripts\activate
# macOS/Linux:  source .venv/bin/activate
pip install -r requirements.txt
python main.py          # -> http://127.0.0.1:8000
```

The Express backend proxies this service at `/api/yt/*`, so the frontend only ever
talks to `http://localhost:5000`. Override the location with `YT_SERVICE_URL` on the
backend if you run it elsewhere.

## Endpoints

| Method | Path                | Notes                                              |
| ------ | ------------------- | -------------------------------------------------- |
| GET    | `/health`           | Liveness probe                                     |
| GET    | `/search?q=&limit=` | Normalized songs: `videoId,title,artists,thumbnail,duration` |
| GET    | `/lyrics/{videoId}` | Unsynced lyrics + source when available            |

## Optional authentication

Search + public lyrics work unauthenticated. To resolve region/age-gated content,
drop a `browser.json` (or `oauth.json`) auth file next to `main.py` — see the
[ytmusicapi setup docs](https://ytmusicapi.readthedocs.io/en/stable/setup/index.html).
It is picked up automatically and is git-ignored.
