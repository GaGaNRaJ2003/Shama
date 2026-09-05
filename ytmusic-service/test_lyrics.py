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

from main import _parse_lrc, _score_candidate, _norm_text, _similarity, _score_recording, _RESOLVE_FLOOR

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

print()
if FAILURES:
    print(f"{len(FAILURES)} FAILED: {FAILURES}")
    sys.exit(1)
print("All lyric-sync tests passed.")
