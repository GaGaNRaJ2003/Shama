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
import time
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


class AlignmentBudgetExceeded(RuntimeError):
    """Matching ran past the caller's deadline."""


def _check_deadline(deadline: float | None) -> None:
    # SequenceMatcher is super-quadratic on low-entropy text ("abab..."), so
    # what a request costs cannot be read off its lengths alone. A deadline
    # (a time.monotonic() value) is what finally bounds the work.
    if deadline is not None and time.monotonic() > deadline:
        raise AlignmentBudgetExceeded("alignment deadline passed")


def map_occurrences(
    couplet_variants: list[list[str]],
    lines: list[dict],
    min_confidence: float = 0.5,
    deadline: float | None = None,
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

    Past `deadline` (a time.monotonic() value) it raises AlignmentBudgetExceeded.
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
            _check_deadline(deadline)
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
    deadline: float | None = None,
) -> list[Alignment]:
    """Assign a start time to each couplet.

    Args:
        couplet_variants: per couplet, its text in every script we hold.
        lines: [{"time_ms": int, "text": str}], ascending by time.
        min_confidence: below this a couplet is left unaligned rather than guessed.
        deadline: a time.monotonic() value; past it, AlignmentBudgetExceeded.

    Returns one Alignment per couplet, in order, with strictly increasing times
    for those that matched.
    """
    variants = [[normalize(v) for v in group if v and v.strip()] for group in couplet_variants]
    timed = [(l["time_ms"] / 1000.0, normalize(l.get("text", ""))) for l in lines if l.get("text", "").strip()]

    n, m = len(variants), len(timed)
    if n == 0 or m == 0:
        return [Alignment(i, None, 0.0) for i in range(n)]

    def best_of(i: int, text: str) -> float:
        _check_deadline(deadline)
        return max((similarity(v, text) for v in variants[i]), default=0.0)

    # A couplet against one line, and against two adjacent lines joined: LRC
    # files often split a misra across two stamps.
    single = [[best_of(i, timed[j][1]) for j in range(m)] for i in range(n)]
    joined = [f"{timed[j][1]} {timed[j + 1][1]}".strip() for j in range(m - 1)]
    pair = [[best_of(i, joined[j]) for j in range(m - 1)] for i in range(n)]

    # dp[i][j] = best total score aligning the first i couplets within the
    # first j lines. Couplets may only ever move forward through the lines,
    # which is what stops a repeated refrain from scrambling the order. A
    # couplet can also be dropped without using up a line: singers leave shers
    # out, and a forced match would steal a line that belongs to another sher.
    NEG = float("-inf")
    dp = [[NEG] * (m + 1) for _ in range(n + 1)]
    back = [[None] * (m + 1) for _ in range(n + 1)]
    for j in range(m + 1):
        dp[0][j] = 0.0

    for i in range(1, n + 1):
        dp[i][0] = dp[i - 1][0]
        back[i][0] = "drop"
        for j in range(1, m + 1):
            # Each later option wins only when strictly greater, so ties keep
            # the earliest occurrence of a repeated line.
            best, how = dp[i - 1][j], "drop"  # leave couplet i-1 untimed
            if dp[i][j - 1] > best:  # skip line j-1
                best, how = dp[i][j - 1], "skip"
            # Better to leave a couplet untimed than to point the listener at
            # the wrong line, so a match has to clear min_confidence.
            s = single[i - 1][j - 1]
            if s >= min_confidence and dp[i - 1][j - 1] + s > best:
                best, how = dp[i - 1][j - 1] + s, "match"
            if j >= 2:  # couplet i-1 sung across lines j-2 and j-1
                p2 = pair[i - 1][j - 2]
                if (p2 >= min_confidence and p2 > single[i - 1][j - 2]
                        and dp[i - 1][j - 2] + p2 > best):
                    best, how = dp[i - 1][j - 2] + p2, "pair"
            dp[i][j] = best
            back[i][j] = how

    matched: dict[int, tuple[int, float]] = {}
    i, j = n, m
    while i > 0:
        how = back[i][j]
        if how == "match":
            matched[i - 1] = (j - 1, single[i - 1][j - 1])
            i -= 1
            j -= 1
        elif how == "pair":
            # A split couplet starts where its first half is sung.
            matched[i - 1] = (j - 2, pair[i - 1][j - 2])
            i -= 1
            j -= 2
        elif how == "skip":
            j -= 1
        else:  # drop
            i -= 1

    out: list[Alignment] = []
    for idx in range(n):
        hit = matched.get(idx)
        if hit is None:
            # Untimed: the UI degrades to tap-to-jump for that couplet.
            out.append(Alignment(idx, None, 0.0))
        else:
            j, conf = hit
            out.append(Alignment(idx, round(timed[j][0], 2), round(conf, 3)))
    return out
