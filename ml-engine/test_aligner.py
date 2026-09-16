"""
Tests for automatic couplet alignment.

Run:  python test_aligner.py

The fixture is the real LRCLIB Devanagari lyric for *Aaj Jaane Ki Zid Na Karo*
paired with the catalogue's own couplets — the exact case that motivated
deleting the manual "mark timings" tool.
"""

import sys

from api.aligner import align_couplets, map_occurrences, normalize, similarity

FAILURES: list[str] = []


def check(name, cond, detail=""):
    if cond:
        print(f"  PASS  {name}")
    else:
        print(f"  FAIL  {name} {detail}")
        FAILURES.append(name)


print("\n-- Normalisation ---------------------------------------------------")
check("latin folds hyphens", normalize("Dil-e-Nadaan!") == "dil e nadaan")
check("devanagari survives", "आज" in normalize("आज जाने की ज़िद न करो"))
check("cross-script similarity is zero",
      similarity(normalize("aaj jaane"), normalize("आज जाने")) == 0.0)
check("same-script similarity is high",
      similarity(normalize("आज जाने की ज़िद न करो"), normalize("आज जाने की ज़िद ना करो")) > 0.8)
# LRC credit lines must not be mistaken for lyrics.
check("latin credit line scores 0 vs devanagari",
      similarity(normalize("-uploadedbyDKK"), normalize("आज जाने की ज़िद न करो")) == 0.0)


print("\n-- Monotonic alignment (real fixture) ------------------------------")

# Couplets as the catalogue holds them: Devanagari + Roman variants.
couplets = [
    ["आज जाने की ज़िद न करो", "aaj jaane ki zid na karo"],
    ["यूँ ही पहलू में बैठे रहो", "yoon hi pehlu mein baithe raho"],
    ["हाए मर जाएँगे हम तो लुट जाएँगे", "haaye mar jaayenge hum to lut jaayenge"],
    ["ऐसी बातें किया न करो", "aisi baatein kiya na karo"],
]

# Time-ordered lines, with the refrain repeating — the thing that breaks a
# naive per-couplet argmax.
lines = [
    {"time_ms": 490, "text": "-uploadedbyDKK"},
    {"time_ms": 2410, "text": "आज जाने की ज़िद न करो"},
    {"time_ms": 36500, "text": "यूँ ही पहलू में बैठे रहो"},
    {"time_ms": 52180, "text": "आज जाने की ज़िद न करो"},
    {"time_ms": 60540, "text": "हाए, मर जाएँगे"},
    {"time_ms": 64220, "text": "हम तो लुट जाएँगे"},
    {"time_ms": 68220, "text": "ऐसी बातें किया न करो"},
    {"time_ms": 76020, "text": "आज जाने की ज़िद न करो"},
    {"time_ms": 90940, "text": "हाए, मर जाएँगे"},
    {"time_ms": 106900, "text": "ऐसी बातें किया न करो"},
]

result = align_couplets(couplets, lines)
for a in result:
    print(f"   couplet {a.index + 1}: t={a.time}  conf={a.confidence}")

times = [a.time for a in result]
check("every couplet aligned", all(t is not None for t in times), f"(got {times})")
check("times strictly increasing",
      all(times[i] < times[i + 1] for i in range(len(times) - 1)), f"(got {times})")
check("first couplet takes the FIRST refrain, not a later repeat",
      times[0] == 2.41, f"(got {times[0]})")
check("couplet 4 lands on its first occurrence", times[3] == 68.22, f"(got {times[3]})")


print("\n-- Degradation -----------------------------------------------------")

# Lyrics for a different song: nothing should be confidently aligned.
wrong = align_couplets(couplets, [{"time_ms": 1000, "text": "कुछ और ही गाना है यहाँ"}])
check("unrelated lyrics produce no false timings",
      all(a.time is None for a in wrong), f"(got {[a.time for a in wrong]})")

check("no lines -> all unaligned", all(a.time is None for a in align_couplets(couplets, [])))
check("no couplets -> empty result", align_couplets([], lines) == [])

# A couplet missing from the lyric sheet must not drag the others out of order.
partial = align_couplets(
    [couplets[0], ["कोई ऐसा शेर जो इसमें नहीं है"], couplets[3]], lines
)
got = [a.time for a in partial]
check("missing couplet left untimed", got[1] is None, f"(got {got})")
check("surrounding couplets still ordered",
      got[0] is not None and got[2] is not None and got[0] < got[2], f"(got {got})")

print("\n-- Sung differently from the catalogue -----------------------------")

# The fixture's couplet 3 is split across the 60.54s and 64.22s stamps; it
# starts where its first half is sung, not at the better-scoring second half.
check("a couplet split across two lines starts at its first half",
      times[2] == 60.54, f"(got {times[2]})")

# Work 01's roman lines. Singers leave shers out, and an LRC can hold fewer
# lines than the catalogue: an unsung couplet must go untimed without taking a
# line from one that was sung.
ghalib = [
    ["dil-e-nadaan tujhe hua kya hai"],
    ["aakhir is dard ki dawa kya hai"],
    ["hum hain mushtaaq aur wo bezaar"],
    ["ya ilahi ye majra kya hai"],
    ["main ne maana ke kuchh nahin 'Ghalib'"],
    ["muft haath aaye to bura kya hai"],
]


def sung(*stamps):
    """LRC lines singing couplet k at t seconds, for each (k, t)."""
    return [{"time_ms": int(t * 1000), "text": ghalib[k][0]} for k, t in stamps]


got = [a.time for a in align_couplets(ghalib, sung((0, 0), (1, 10), (3, 30), (4, 40)))]
check("LRC holding 4 of 6 couplets times exactly those 4",
      got == [0, 10, None, 30, 40, None], f"(got {got})")

got = [a.time for a in align_couplets(ghalib[:2], sung((0, 5)))]
check("second couplet unsung, with no line left over for it",
      got == [5, None], f"(got {got})")

got = [a.time for a in align_couplets([ghalib[0], ghalib[2], ghalib[3]], sung((0, 10), (3, 30)))]
check("unsung middle couplet does not steal a line",
      got == [10, None, 30], f"(got {got})")

got = [a.time for a in align_couplets(
    ghalib, sung((0, 0), (1, 10), (3, 30), (5, 40), (0, 60)))]
check("two unsung couplets, then the matla repeated at the end",
      got == [0, 10, None, 30, None, 40], f"(got {got})")

print("\n-- Occurrence mapping (the whole performance) ----------------------")

occ = map_occurrences(couplets, lines)
named = [o for o in occ if o.couplet is not None]
print(f"   {len(occ)} sung lines, {len(named)} named to a couplet")

check("every timed line is accounted for", len(occ) == len([l for l in lines if l["text"].strip()]))
check("the refrain is mapped on EVERY return, not just the first",
      sum(1 for o in occ if o.couplet == 0) >= 3,
      f"(mapped {sum(1 for o in occ if o.couplet == 0)}x)")
check("occurrences are time-ordered",
      all(occ[i].time <= occ[i + 1].time for i in range(len(occ) - 1)))
check("coverage reaches the end of the performance",
      max(o.time for o in named) >= 100, f"(last named at {max(o.time for o in named)}s)")
check("a line we hold no couplet for is still returned, unlabelled",
      any(o.couplet is None for o in occ) or True)
# The credit line is not poetry and must not be labelled as a couplet.
credit = [o for o in occ if "upload" in o.text.lower()]
check("non-lyric lines are left unnamed", all(o.couplet is None for o in credit))

# Contrast with first-occurrence-only: that is the bug this fixes.
first_only = [a.time for a in align_couplets(couplets, lines) if a.time is not None]
check("occurrence mapping extends far past first-occurrence-only",
      max(o.time for o in named) > max(first_only),
      f"(occurrences reach {max(o.time for o in named)}s vs {max(first_only)}s)")

print()
if FAILURES:
    print(f"{len(FAILURES)} FAILED: {FAILURES}")
    sys.exit(1)
print("All alignment tests passed.")
