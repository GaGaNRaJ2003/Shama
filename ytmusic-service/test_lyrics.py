"""
Tests for LRC parsing and LRCLIB candidate scoring.

Run:  python test_lyrics.py

These cover the defects that made lyrics fail to sync:
  * multi-timestamp lines losing their repeats (and leaking "[01:20.00]" on screen)
  * [mm:ss] / single-digit-minute files parsing to nothing at all
  * unsorted output freezing the highlight
  * "first result with any syncedLyrics" picking a different recording
"""

import sys

from main import _parse_lrc, _score_candidate, _norm_text, _similarity, _score_recording, _RESOLVE_FLOOR, _is_confident

FAILURES: list[str] = []


def check(name: str, got, want):
    if got == want:
        print(f"  PASS  {name}")
    else:
        print(f"  FAIL  {name}\n          got  {got!r}\n          want {want!r}")
        FAILURES.append(name)


def check_true(name: str, cond, detail=""):
    if cond:
        print(f"  PASS  {name}")
    else:
        print(f"  FAIL  {name} {detail}")
        FAILURES.append(name)


print("\n-- LRC parser ------------------------------------------------------")

lines, stamped = _parse_lrc("[00:12.34]first\n[00:15.00]second")
check("basic 2-digit fraction", [l["time_ms"] for l in lines], [12340, 15000])

# Previously: kept 12000 and rendered "[01:20.00]repeat" as the lyric text.
lines, _ = _parse_lrc("[00:12.00][01:20.00]repeat")
check("multi-stamp yields both times", [l["time_ms"] for l in lines], [12000, 80000])
check("multi-stamp text is clean", {l["text"] for l in lines}, {"repeat"})

# Previously: dropped entirely, so the whole file parsed to [].
lines, stamped = _parse_lrc("[00:12]no fraction\n[1:05]single digit minute")
check("no-fraction and 1-digit minute", [l["time_ms"] for l in lines], [12000, 65000])
check_true("stamped count non-zero", stamped == 2, f"(got {stamped})")

lines, _ = _parse_lrc("[00:12.5]tenths")
check("1-digit fraction is tenths", [l["time_ms"] for l in lines], [12500])

lines, _ = _parse_lrc("[00:12.345]millis")
check("3-digit fraction is millis", [l["time_ms"] for l in lines], [12345])

# Previously unparsed, so every line was systematically misaligned.
lines, _ = _parse_lrc("[offset:+250]\n[00:10.00]shifted")
check("positive offset shifts earlier", [l["time_ms"] for l in lines], [9750])

lines, _ = _parse_lrc("[ar:Farida Khanum]\n[ti:Aaj Jaane]\n[al:X]\n[00:05.00]real")
check("metadata tags ignored", [l["time_ms"] for l in lines], [5000])

# Previously: `else break` in the consumer truncated at the first inversion.
lines, _ = _parse_lrc("[00:30.00]late\n[00:10.00]early")
check("output is sorted", [l["time_ms"] for l in lines], [10000, 30000])

lines, stamped = _parse_lrc("la la la\nno timestamps here")
check_true("unparseable file reports stamped==0", stamped == 0 and lines == [])

lines, _ = _parse_lrc("[00:20.00]")
check("instrumental marker kept with empty text", lines, [{"time_ms": 20000, "text": ""}])


print("\n-- Query normalisation ---------------------------------------------")

# The live cause of zero LRCLIB results for the flagship ghazal.
check("hyphens folded", _norm_text("Dil-e-Nadaan"), "dil e nadaan")
check("(Live) stripped", _norm_text("Ranjish Hi Sahi (Live)"), "ranjish hi sahi")
check("[Remastered] stripped", _norm_text("Gulon Mein Rang Bhare [Remastered 2019]"),
      "gulon mein rang bhare")
check_true("containment scores high",
           _similarity("Aaj Jaane Ki Zid Na Karo",
                       "Aaj Jaane Ki Zid Na Karo (Live at Royal Albert Hall)") >= 0.85)


print("\n-- Candidate scoring -----------------------------------------------")

TITLE, ARTIST, OUR_DURATION = "Aaj Jaane Ki Zid Na Karo", "Farida Khanum", 453.0

# Real shapes returned by LRCLIB for this query.
candidates = [
    {"trackName": "Aaj Jaane Ki Zid Na Karo", "artistName": "Farida Khanum", "duration": 432.0},
    {"trackName": "Aaj Jaane Ki Zid Na Karo", "artistName": "Farida Khanum", "duration": 415.0},
    {"trackName": "Uzr Aane Mein Bhi", "artistName": "Farida Khanum", "duration": 463.0},
    {"trackName": "Main Ne Pairon Mein Payal", "artistName": "Farida Khanum", "duration": 241.0},
]
scored = sorted(
    ((_score_candidate(c, TITLE, ARTIST, OUR_DURATION), c) for c in candidates),
    key=lambda p: p[0], reverse=True,
)
best = scored[0][1]
check("best candidate is the right ghazal", best["trackName"], "Aaj Jaane Ki Zid Na Karo")

# Duration alone would have picked this one (463 vs our 453) — a different song.
uzr = next(s for s, c in scored if c["trackName"] == "Uzr Aane Mein Bhi")
check_true("wrong-title candidate rejected by the title floor", uzr < 0,
           f"(scored {uzr:.3f}, expected < 0)")
payal = next(s for s, c in scored if c["trackName"].startswith("Main Ne"))
check_true("unrelated candidate rejected", payal < 0, f"(scored {payal:.3f})")

# Of two correct-title candidates, the closer duration must win.
a = _score_candidate(candidates[0], TITLE, ARTIST, OUR_DURATION)  # 432 -> 21s off
b = _score_candidate(candidates[1], TITLE, ARTIST, OUR_DURATION)  # 415 -> 38s off
check_true("closer duration ranks higher", a > b, f"({a:.3f} vs {b:.3f})")

# With no duration known we must still pick sanely rather than crash.
check_true("scores without duration", _score_candidate(candidates[0], TITLE, ARTIST, None) > 0)


# An unrelated song must fall below the combined floor, not merely the title one.
from main import _SCORE_FLOOR
unrelated = {"trackName": "Some Other Song Entirely", "artistName": "Someone Else", "duration": 200.0}
check_true("unrelated candidate is below the score floor",
           _score_candidate(unrelated, TITLE, ARTIST, OUR_DURATION) < _SCORE_FLOOR)
check_true("the correct candidate clears the score floor",
           _score_candidate(candidates[0], TITLE, ARTIST, OUR_DURATION) >= _SCORE_FLOOR)

print("\n-- Track resolution ------------------------------------------------")

# The real failure this prevents: searching for one ghazal and being handed
# another, which then (correctly) has no lyrics.
WANT_T, WANT_A = "Baat Karni Mujhe Mushkil", "Mehdi Hassan"
right = {"title": "Baat Karni Mujhe Mushkil", "artist": "Mehdi Hassan"}
wrong = {"title": "Muh Ki Baat", "artist": "Jagjit Singh"}
junk = {"title": "Spongebob Squarepants (TikTok Remix)", "artist": "Sleazy Stereo"}

check_true("correct recording clears the autoplay floor",
           _score_recording(right, WANT_T, WANT_A) >= _RESOLVE_FLOOR,
           f"(scored {_score_recording(right, WANT_T, WANT_A)})")
check_true("a different song is NOT autoplayed",
           _score_recording(wrong, WANT_T, WANT_A) < _RESOLVE_FLOOR,
           f"(scored {_score_recording(wrong, WANT_T, WANT_A)})")
check_true("unrelated result is NOT autoplayed",
           _score_recording(junk, WANT_T, WANT_A) < _RESOLVE_FLOOR,
           f"(scored {_score_recording(junk, WANT_T, WANT_A)})")

# The wrong song by the right singer must still lose to the right song.
check_true("title outweighs artist",
           _score_recording(right, WANT_T, WANT_A) > _score_recording(wrong, WANT_T, WANT_A))

# A live upload of the right ghazal should still play without nagging.
live = {"title": "Baat Karni Mujhe Mushkil (Live)", "artist": "Mehdi Hassan"}
check_true("a live upload of the right ghazal still autoplays",
           _score_recording(live, WANT_T, WANT_A) >= _RESOLVE_FLOOR,
           f"(scored {_score_recording(live, WANT_T, WANT_A)})")

print("\n-- Resolve gate ----------------------------------------------------")

# Autoplay needs the title AND the singer to hold up on their own; a good
# weighted score is not enough. The last two are live results for catalogue
# works 07 and 09: the right ghazal, sung by someone else.
NOT_CONFIDENT = [
    ("Mujhe Kar Dena Deewana", "Mehdi Hassan", "Tujhe Yaad Na Meri Aayi", "Mehdi Hassan"),
    ("Tujhe Yaad Na Meri Ayee - 2", "B Praak, Jaani, Jatin-Lalit", "Tujhe Yaad Na Meri Aayi", "Mehdi Hassan"),
    ("Mushkil", "Arijit Singh", "Baat Karni Mujhe Mushkil", "Mehdi Hassan"),
    ("Aa", "Some Artist", "Aaj Jaane Ki Zid Na Karo", "Farida Khanum"),
    ("Karo", "Some Artist", "Aaj Jaane Ki Zid Na Karo", "Farida Khanum"),
    ("Tu Meri Zindagi He", "Mehdi Hassan", "Gulon Mein Rang Bhare", "Mehdi Hassan"),
    ("Chupke Chupke", "Other Singer", "Chupke Chupke Raat Din", "Ghulam Ali"),
    ("Koi Umeed Bar Nahin Aati", "Noor Jehan", "Koi Umeed Bar Nahin Aati", "Mehdi Hassan"),
    ("Who Jo Hum Mein Tum Mein Qarar Tha", "Ustad Ahmed Hussain", "Wo Jo Hum Mein Tum Mein Qarar Tha", "Abida Parveen"),
]
for got_t, got_a, want_t, want_a in NOT_CONFIDENT:
    check_true(f"not autoplayed: {got_t!r} / {got_a!r} for {want_t!r}",
               not _is_confident({"title": got_t, "artist": got_a}, want_t, want_a))

# The right recording must still play without asking: exact titles, live
# uploads, and the spellings YouTube Music really returns (the last three were
# captured from the live service).
CONFIDENT = [
    ("Tujhe Yaad Na Meri Aayi", "Mehdi Hassan", "Tujhe Yaad Na Meri Aayi", "Mehdi Hassan"),
    ("Baat Karni Mujhe Mushkil", "Mehdi Hassan", "Baat Karni Mujhe Mushkil", "Mehdi Hassan"),
    ("Aaj Jaane Ki Zid Na Karo", "Farida Khanum", "Aaj Jaane Ki Zid Na Karo", "Farida Khanum"),
    ("Gulon Mein Rang Bhare", "Mehdi Hassan", "Gulon Mein Rang Bhare", "Mehdi Hassan"),
    ("Chupke Chupke Raat Din", "Ghulam Ali", "Chupke Chupke Raat Din", "Ghulam Ali"),
    ("Koi Umeed Bar Nahin Aati", "Mehdi Hassan", "Koi Umeed Bar Nahin Aati", "Mehdi Hassan"),
    ("Wo Jo Hum Mein Tum Mein Qarar Tha", "Abida Parveen", "Wo Jo Hum Mein Tum Mein Qarar Tha", "Abida Parveen"),
    ("Baat Karni Mujhe Mushkil (Live)", "Mehdi Hassan", "Baat Karni Mujhe Mushkil", "Mehdi Hassan"),
    ("Aaj Jaane Ki Zid Na Karo (Live at Royal Albert Hall)", "Farida Khanum", "Aaj Jaane Ki Zid Na Karo", "Farida Khanum"),
    ("Dil-E-Nadaan Tujhe Hua Kya Hai", "Jagjit Singh, Chitra Singh", "Dil-e-Nadaan Tujhe Hua Kya Hai", "Jagjit & Chitra Singh"),
    ("Hazaron Khwahishen Aisi", "Jagjit Singh", "Hazaaron Khwahishein Aisi", "Jagjit Singh"),
    ("Mujh Se Pehli Si Mohabbat", "Noor Jahan", "Mujhse Pehli Si Mohabbat", "Noor Jehan"),
    ("Ranjish Hi Sahi", "Mehdi Hassan, Ahmad Faraz", "Ranjish Hi Sahi", "Mehdi Hassan"),
    ("Dil-e-naadaan Tujhe Hua Kya Hai", "Jagjit Singh, Chitra Singh", "Dil-e-Nadaan Tujhe Hua Kya Hai", "Jagjit & Chitra Singh"),
    ("Aaj Jane Ki Zid Na Karo", "Farida Khanum", "Aaj Jaane Ki Zid Na Karo", "Farida Khanum"),
    ("Hazaaron Khwaahishein Aisi", "Jagjit Singh", "Hazaaron Khwahishein Aisi", "Jagjit Singh"),
]
for got_t, got_a, want_t, want_a in CONFIDENT:
    check_true(f"autoplayed: {got_t!r} / {got_a!r} for {want_t!r}",
               _is_confident({"title": got_t, "artist": got_a}, want_t, want_a))

print("\n-- LRCLIB selection ------------------------------------------------")

import main  # the module the names above came from; requests.get is swapped per call


class FakeResponse:
    def __init__(self, rows):
        self._rows = rows

    def raise_for_status(self):
        pass

    def json(self):
        return self._rows


def search_with(rows, title, artist, duration):
    """lyrics_search against canned LRCLIB rows, with no network.

    Every argument is passed explicitly: outside a request the parameter
    defaults are FastAPI Query objects, not values.
    """
    calls = []

    def fake_get(url, params=None, headers=None, timeout=None):
        calls.append({"q": (params or {}).get("q"), "timeout": timeout})
        return FakeResponse(rows)

    real_get = main.requests.get
    main.requests.get = fake_get
    try:
        return main.lyrics_search(title=title, artist=artist, duration=duration, album=""), calls
    finally:
        main.requests.get = real_get


INSTRUMENTAL = {"id": 1, "trackName": "Aashiq Ke Liye Yaksan", "artistName": "Farida Khanum",
                "duration": 316, "instrumental": True, "plainLyrics": None, "syncedLyrics": None}
PLAIN = {"id": 2, "trackName": "Aashiq Ke Liye Yaksan", "artistName": "Farida Khanum",
         "duration": 290, "instrumental": False, "plainLyrics": "the words", "syncedLyrics": None}

# Previously hasLyrics True with '' words, which also stopped the client from
# falling back to YouTube Music's lyrics.
r, calls = search_with([INSTRUMENTAL], "Aashiq Ke Liye Yaksan", "Farida Khanum", 316)
check("instrumental-only match is no lyrics", r["hasLyrics"], False)
check_true("... in 2 LRCLIB calls (the renditions lookup reuses the title query)",
           len(calls) == 2, f"(made {len(calls)})")

r, _ = search_with([INSTRUMENTAL, PLAIN], "Aashiq Ke Liye Yaksan", "Farida Khanum", 316)
check("instrumental outranking plain words yields the words", r["lyrics"], "the words")

# A different, shorter synced title must not beat the right song's plain words.
r, _ = search_with([
    {"id": 10, "trackName": "Chupke Chupke Raat Din", "artistName": "Ghulam Ali", "duration": None,
     "plainLyrics": "right words", "syncedLyrics": None},
    {"id": 11, "trackName": "Chupke Chupke", "artistName": "Other Singer", "duration": 200,
     "plainLyrics": "other words", "syncedLyrics": "[00:01.00]other words"},
], "Chupke Chupke Raat Din", "Ghulam Ali", 0)
check("different synced song loses to the right plain words",
      (r["artistName"], r["lyrics"], r["syncedLines"]), ("Ghulam Ali", "right words", []))

# One word of the title is not the title.
r, _ = search_with([
    {"id": 20, "trackName": "Karo", "artistName": "Another Artist", "duration": 120,
     "plainLyrics": "x", "syncedLyrics": "[00:01.00]x"},
    {"id": 21, "trackName": "Zid", "artistName": "Another Artist", "duration": 120,
     "plainLyrics": "y", "syncedLyrics": "[00:01.00]y"},
], "Aaj Jaane Ki Zid Na Karo", "Farida Khanum", 453)
check("one-word titles inside the ghazal's name are not it", r["hasLyrics"], False)

# The same song's synced rendition still wins, but its timings are not trusted.
r, _ = search_with([
    {"id": 40, "trackName": "Ranjish Hi Sahi", "artistName": "Mehdi Hassan", "duration": 372,
     "plainLyrics": "plain", "syncedLyrics": None},
    {"id": 41, "trackName": "Ranjish Hi Sahi", "artistName": "Mehdi Hassan", "duration": 559,
     "plainLyrics": "synced", "syncedLyrics": "[00:01.00]synced"},
], "Ranjish Hi Sahi", "Mehdi Hassan", 372)
check("same song's synced rendition is still preferred",
      (bool(r["syncedLines"]), r["matchedDuration"]), (True, 559))
check("... with timingReliable False", r["timingReliable"], False)

# Previously 3 calls: the renditions lookup re-ran the title-only query.
r, calls = search_with([], "Nothing Like This", "Nobody", 300)
check("total miss is no lyrics", r["hasLyrics"], False)
check_true("total miss makes 2 LRCLIB calls, not 3", len(calls) == 2,
           f"(made {len(calls)}: {[c['q'] for c in calls]})")
check_true("each call has a (connect, read) timeout within the budget",
           all(isinstance(c["timeout"], tuple) and c["timeout"][1] <= 8.0 for c in calls),
           f"({[c['timeout'] for c in calls]})")


# The shared deadline: a first query that eats the budget stops the loop, and
# the renditions lookup after it gets only the 1s read floor, which keeps the
# total under the gateway's 30s.
class FakeClock:
    now = 1000.0

    def monotonic(self):
        return self.now


clock = FakeClock()
slow_calls = []


def slow_get(url, params=None, headers=None, timeout=None):
    slow_calls.append(timeout)
    clock.now += 25  # this request "took" 25s, then failed
    raise main.requests.Timeout("simulated")


real_get, real_time = main.requests.get, main.time
main.requests.get, main.time = slow_get, clock
try:
    r = main.lyrics_search(title="Ranjish Hi Sahi", artist="Mehdi Hassan", duration=372, album="")
finally:
    main.requests.get, main.time = real_get, real_time
check("past the deadline: no second query, renditions lookup on the 1s floor",
      slow_calls, [(3.05, 8.0), (3.05, 1.0)])
check("... and the answer is still a clean no-lyrics", r["hasLyrics"], False)

print("\n-- YT client resilience --------------------------------------------")


# A header file ytmusicapi rejects must fall back to the unauthenticated
# client instead of breaking every route.
class FakeYTMusic:
    def __init__(self, auth=None):
        if auth is not None:
            raise ValueError("unsupported header file")
        self.auth = auth


real_ytmusic, real_exists = main.YTMusic, main.os.path.exists
main.YTMusic = FakeYTMusic
main.os.path.exists = lambda p: p.endswith("oauth.json")
try:
    client = main.get_client.__wrapped__()  # bypass lru_cache so nothing fake is memoised
finally:
    main.YTMusic, main.os.path.exists = real_ytmusic, real_exists
check_true("a rejected header file falls back to the unauthenticated client",
           isinstance(client, FakeYTMusic) and client.auth is None)


def broken_client():
    raise RuntimeError("no client")


real_get_client = main.get_client
main.get_client = broken_client
try:
    r = main.lyrics("dQw4w9WgXcQ")
finally:
    main.get_client = real_get_client
check("a client that cannot be built is no lyrics, not a 500", r["hasLyrics"], False)

print()
if FAILURES:
    print(f"{len(FAILURES)} FAILED: {FAILURES}")
    sys.exit(1)
print("All lyric-sync tests passed.")
