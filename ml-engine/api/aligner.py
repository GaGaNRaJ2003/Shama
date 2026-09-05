"""
Align a ghazal's couplets to time-synced lyric lines.

This is what replaces asking a human to tap every couplet as it is sung.

Given the couplets we already hold (in Urdu, Devanagari and Roman) and the
time-stamped lines LRCLIB returns for the matched recording, we recover a start
time per couplet automatically.

Two details make it work where the obvious approach fails:

1. **Script.** LRCLIB serves these lyrics in Devanagari far more often than in
   Roman, so comparing against the Roman transliteration alone scores near zero.
   Every couplet is therefore offered as several variants and each is compared
   in its own script.

2. **Monotonicity.** A ghazal's radif repeats, so an independent best-match per
   couplet happily assigns couplet 2 a timestamp from the final refrain. Matching
   is done with a Needleman-Wunsch style DP that forces couplet order to agree
   with time order.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from difflib import SequenceMatcher

# Combining marks, ZWJ/ZWNJ and the like differ between sources for identical
# words, so they are folded away before comparison.
_MARKS = re.compile(r"[ؐ-ًؚ-ٰٟۖ-़ۭ॑-॔‌‍]")
_DEVANAGARI = re.compile(r"[ऀ-ॿ]")
_ARABIC = re.compile(r"[؀-ۿ]")


def _script_of(text: str) -> str:
    if _DEVANAGARI.search(text):
        return "deva"
    if _ARABIC.search(text):
        return "arab"
    return "latin"


def normalize(text: str) -> str:
    """Fold a line to a comparable skeleton, preserving its script."""
    if not text:
        return ""
    text = unicodedata.normalize("NFC", text)
    text = _MARKS.sub("", text)
    script = _script_of(text)
    if script == "latin":
        text = text.lower().replace("-", " ")
        text = re.sub(r"[^a-z0-9\s]", " ", text)
    else:
        # Keep only letters of that script; drop punctuation and Latin noise
        # such as "-uploadedbyXYZ" credits that LRC files often carry.
        keep = _DEVANAGARI if script == "deva" else _ARABIC
        text = "".join(ch if keep.match(ch) or ch.isspace() else " " for ch in text)
    return re.sub(r"\s+", " ", text).strip()


def similarity(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    if _script_of(a) != _script_of(b):
        return 0.0  # comparing Devanagari to Roman is meaningless noise
    return SequenceMatcher(None, a, b).ratio()


@dataclass
class Alignment:
    index: int
    time: float | None
    confidence: float


@dataclass
class Occurrence:
    """One moment in the performance: what is sung, and which couplet it is."""

    time: float
    couplet: int | None
    confidence: float
    text: str


def map_occurrences(
    couplet_variants: list[list[str]],
    lines: list[dict],
    min_confidence: float = 0.5,
) -> list[Occurrence]:
    """Label every timed line with the couplet it belongs to.

    A ghazal is built on return: the matla comes back seventeen times in a
    seven-minute performance, and each return is the singer dwelling on it.
    Mapping a couplet to its first occurrence alone therefore describes only
    the opening minute and leaves the rest of the recording blank.

    Unlike `align_couplets`, this is deliberately NOT monotonic — a line is the
    couplet it is, whenever it is sung. Lines we hold no couplet for are still
    returned (with `couplet=None`), because the listener is hearing them and
    the words are worth showing.
    """
    variants = [[normalize(v) for v in group if v and v.strip()] for group in couplet_variants]

    out: list[Occurrence] = []
    for line in lines:
        text = (line.get("text") or "").strip()
        if not text:
            continue
        norm_line = normalize(text)
        if not norm_line:
            continue

        best_idx, best_score = None, 0.0
        for i, group in enumerate(variants):
            score = max((similarity(v, norm_line) for v in group), default=0.0)
            if score > best_score:
                best_idx, best_score = i, score

        out.append(
            Occurrence(
                time=round(line["time_ms"] / 1000.0, 2),
                couplet=best_idx if best_score >= min_confidence else None,
                confidence=round(best_score, 3),
                text=text,
            )
        )

    out.sort(key=lambda o: o.time)
    return out


def align_couplets(
    couplet_variants: list[list[str]],
    lines: list[dict],
    min_confidence: float = 0.5,
) -> list[Alignment]:
    """Assign a start time to each couplet.

    Args:
        couplet_variants: per couplet, its text in every script we hold.
        lines: [{"time_ms": int, "text": str}], ascending by time.
        min_confidence: below this a couplet is left unaligned rather than guessed.

    Returns one Alignment per couplet, in order, with strictly increasing times
    for those that matched.
    """
    variants = [[normalize(v) for v in group if v and v.strip()] for group in couplet_variants]
    timed = [(l["time_ms"] / 1000.0, normalize(l.get("text", ""))) for l in lines if l.get("text", "").strip()]

    n, m = len(variants), len(timed)
    if n == 0 or m == 0:
        return [Alignment(i, None, 0.0) for i in range(n)]

    def score(i: int, j: int) -> float:
        return max((similarity(v, timed[j][1]) for v in variants[i]), default=0.0)

    # dp[i][j] = best total score aligning the first i couplets within the
    # first j lines. Couplets may only ever move forward through the lines,
    # which is what stops a repeated refrain from scrambling the order.
    NEG = float("-inf")
    dp = [[NEG] * (m + 1) for _ in range(n + 1)]
    back = [[None] * (m + 1) for _ in range(n + 1)]
    for j in range(m + 1):
        dp[0][j] = 0.0

    for i in range(1, n + 1):
        for j in range(1, m + 1):
            if dp[i][j - 1] > dp[i][j]:  # skip this line
                dp[i][j] = dp[i][j - 1]
                back[i][j] = "skip"
            cand = dp[i - 1][j - 1] + score(i - 1, j - 1)
            if cand > dp[i][j]:
                dp[i][j] = cand
                back[i][j] = "match"

    matched: dict[int, int] = {}
    i, j = n, m
    while i > 0 and j > 0:
        if back[i][j] == "match":
            matched[i - 1] = j - 1
            i -= 1
            j -= 1
        else:
            j -= 1

    out: list[Alignment] = []
    for idx in range(n):
        j = matched.get(idx)
        if j is None:
            out.append(Alignment(idx, None, 0.0))
            continue
        conf = score(idx, j)
        if conf < min_confidence:
            # Better to leave a couplet untimed than to point the listener at
            # the wrong line — the UI degrades to tap-to-jump for that couplet.
            out.append(Alignment(idx, None, round(conf, 3)))
        else:
            out.append(Alignment(idx, round(timed[j][0], 2), round(conf, 3)))
    return out
