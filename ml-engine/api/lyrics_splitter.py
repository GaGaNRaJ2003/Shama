"""
Lyrics Splitter — Intelligent Ghazal/Qawwali Couplet Segmentation
==================================================================
Takes raw lyrics text (typically from YouTube Music) and splits it into
structured couplets (sher). Each couplet = 2 meaningful lines of poetry.

Handles:
  - Empty lines, whitespace normalization
  - Instrumental markers: [Music], [Interlude], [Intro], etc.
  - Timestamps like (0:00), [01:23], etc.
  - Section headers: Verse 1, Chorus, Stanza, etc.
  - Repeated lines detection (refrain / mukarrar)
  - Odd number of lines (last line treated as solo)
"""

import re
from dataclasses import dataclass, asdict
from typing import Optional


# ---------------------------------------------------------------------------
# Patterns to strip or ignore
# ---------------------------------------------------------------------------

# Matches [Music], [Interlude], [Intro], [Outro], [Instrumental], etc.
INSTRUMENTAL_PATTERN = re.compile(
    r"^\s*[\[\(]?\s*(music|interlude|intro|outro|instrumental|sitar|tabla|harmonium|flute|sarangi)\s*[\]\)]?\s*$",
    re.IGNORECASE,
)

# Matches timestamps like (0:00), [01:23], 1:45, etc.
TIMESTAMP_PATTERN = re.compile(
    r"^\s*[\[\(]?\s*\d{1,2}:\d{2}\s*[\]\)]?\s*$"
)

# Matches inline timestamps at the start of a line: "[01:23] dil-e-nadaan..."
INLINE_TIMESTAMP_PATTERN = re.compile(
    r"^\s*[\[\(]\s*\d{1,2}:\d{2}\s*[\]\)]\s*"
)

# Section headers like "Verse 1", "Chorus", "Stanza 2", "[Verse]", etc.
SECTION_HEADER_PATTERN = re.compile(
    r"^\s*[\[\(]?\s*(verse|chorus|stanza|refrain|bridge|hook|pre-chorus|post-chorus|mukhda|antara|sher)\s*\d*\s*[\]\)]?\s*$",
    re.IGNORECASE,
)

# Very short lines that are likely not poetry (< 3 chars after stripping)
MIN_LINE_LENGTH = 3


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class Couplet:
    index: int
    line1: str
    line2: Optional[str]
    combined_text: str
    is_refrain: bool


# ---------------------------------------------------------------------------
# Core logic
# ---------------------------------------------------------------------------

def clean_line(line: str) -> str:
    """Clean a single line: strip whitespace, remove inline timestamps."""
    line = line.strip()
    # Remove inline timestamps at the start
    line = INLINE_TIMESTAMP_PATTERN.sub("", line).strip()
    # Remove trailing/leading dashes used as separators
    line = line.strip("-–—").strip()
    return line


def is_noise_line(line: str) -> bool:
    """Return True if the line should be discarded (not poetry)."""
    if not line or len(line) < MIN_LINE_LENGTH:
        return True
    if INSTRUMENTAL_PATTERN.match(line):
        return True
    if TIMESTAMP_PATTERN.match(line):
        return True
    if SECTION_HEADER_PATTERN.match(line):
        return True
    # Lines that are just punctuation or dots
    if re.match(r"^[\.\-\—\–\s…*_~#]+$", line):
        return True
    return False


def normalize_for_comparison(text: str) -> str:
    """Normalize text for refrain/repeat detection."""
    # Lowercase, strip punctuation, collapse whitespace
    text = text.lower().strip()
    text = re.sub(r"[^\w\s]", "", text)
    text = re.sub(r"\s+", " ", text)
    return text


def detect_refrains(lines: list[str], threshold: int = 2) -> set[str]:
    """
    Detect lines that appear multiple times (refrains / mukarrar).
    Returns a set of normalized forms that appear >= threshold times.
    """
    counts: dict[str, int] = {}
    for line in lines:
        normalized = normalize_for_comparison(line)
        if normalized:
            counts[normalized] = counts.get(normalized, 0) + 1

    return {norm for norm, count in counts.items() if count >= threshold}


def split_lyrics(
    lyrics_text: str,
    title: Optional[str] = None,
    artist: Optional[str] = None,
) -> list[dict]:
    """
    Split raw lyrics text into structured couplets.

    Args:
        lyrics_text: Raw lyrics text (newline-separated)
        title: Optional song title (for future context-aware splitting)
        artist: Optional artist name (for future context-aware splitting)

    Returns:
        List of couplet dictionaries with keys:
            index, line1, line2, combined_text, is_refrain
    """
    if not lyrics_text or not lyrics_text.strip():
        return []

    # Step 1: Split into individual lines
    raw_lines = lyrics_text.split("\n")

    # Step 2: Clean each line and filter noise
    meaningful_lines: list[str] = []
    for raw in raw_lines:
        cleaned = clean_line(raw)
        if not is_noise_line(cleaned):
            meaningful_lines.append(cleaned)

    if not meaningful_lines:
        return []

    # Step 3: Detect refrains (lines that repeat >= 2 times)
    refrain_norms = detect_refrains(meaningful_lines)

    # Step 4: Pair lines into couplets (every 2 lines = 1 sher)
    couplets: list[Couplet] = []
    i = 0
    couplet_index = 0

    while i < len(meaningful_lines):
        line1 = meaningful_lines[i]

        if i + 1 < len(meaningful_lines):
            line2 = meaningful_lines[i + 1]
            combined = f"{line1}\n{line2}"

            # A couplet is a refrain if BOTH lines are refrains
            is_refrain = (
                normalize_for_comparison(line1) in refrain_norms
                and normalize_for_comparison(line2) in refrain_norms
            )

            couplets.append(Couplet(
                index=couplet_index,
                line1=line1,
                line2=line2,
                combined_text=combined,
                is_refrain=is_refrain,
            ))
            i += 2
        else:
            # Odd line at the end — solo line
            is_refrain = normalize_for_comparison(line1) in refrain_norms
            couplets.append(Couplet(
                index=couplet_index,
                line1=line1,
                line2=None,
                combined_text=line1,
                is_refrain=is_refrain,
            ))
            i += 1

        couplet_index += 1

    return [asdict(c) for c in couplets]
