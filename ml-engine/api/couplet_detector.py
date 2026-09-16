"""
Shama — Intelligent Couplet Detection Engine
=============================================
Converts raw ghazal/qawwali lyrics into properly segmented couplets (sher)
using pattern recognition:

1. Blank-line grouping (lyrics often separate shers with blank lines)
2. Radif/Qafia detection (common ending words/rhyme patterns)  
3. Refrain collapsing (repeated chorus lines grouped separately)
4. Misra pairing (two lines = one sher when no blank-line structure)

Works for ALL songs with lyrics — not just curated ones.

Usage:
    from api.couplet_detector import detect_couplets
    result = detect_couplets(lyrics_text, title, artist)
"""

import re
from dataclasses import dataclass, asdict, field
from typing import Optional


# ---------------------------------------------------------------------------
# Noise patterns
# ---------------------------------------------------------------------------

NOISE_PATTERNS = [
    re.compile(r"^\s*[\[\(]?\s*(music|interlude|intro|outro|instrumental|sitar|tabla|harmonium)\s*[\]\)]?\s*$", re.I),
    re.compile(r"^\s*[\[\(]\s*\d{1,2}:\d{2}(\.\d+)?\s*[\]\)]\s*$"),
    re.compile(r"^\s*[\[\(]?\s*(verse|chorus|stanza|refrain|bridge|hook|mukhda|antara)\s*\d*\s*[\]\)]?\s*$", re.I),
    re.compile(r"^[\.\-\—\–\s…*_~#×x]+$"),
    re.compile(r"^\s*\(.*waah.*\)\s*$", re.I),
    re.compile(r"^\s*[\[\(].*[\]\)]\s*$"),  # Any [bracketed] line
]

INLINE_TIMESTAMP = re.compile(r"^\s*[\[\(]\s*\d{1,2}:\d{2}(\.\d+)?\s*[\]\)]\s*")

# A trailing "(waah waah)" / "[waah]" aside. The bracket contents may not hold
# brackets, which keeps the match linear: the old lazy `.*?` form rescanned to
# the end of the line from every "(" and took ~20s on one 49k-char line.
_TRAILING_WAAH = re.compile(r"\s*[\(\[][^()\[\]]*waah[^()\[\]]*[\)\]]\s*$", re.I)

# Filler words that aren't meaningful lyrics
FILLER_PATTERN = re.compile(
    r"^(aa+|oh+|hmm+|ha+|la+ la+|na na+|ooh+|ahh*|hey+|wah+|waah+)\s*[,.]?\s*$",
    re.I,
)


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class DetectedCouplet:
    index: int
    line1: str
    line2: Optional[str]
    combined_text: str
    is_refrain: bool
    confidence: float  # 0.0 - 1.0, how confident we are this is a proper sher
    group_type: str  # 'sher', 'refrain', 'mukhda', 'filler', 'solo'


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def clean_line(line: str) -> str:
    """Strip timestamps, whitespace, trailing punctuation."""
    # No misra runs to 500 characters; the cap bounds every pattern run below.
    line = line.strip()[:500]
    line = INLINE_TIMESTAMP.sub("", line).strip()
    line = line.strip("-–—").strip()
    # Remove trailing filler like ", aa" or "(waah waah)"
    line = _TRAILING_WAAH.sub("", line).strip()
    return line


def is_noise(line: str) -> bool:
    """Is this line noise (not poetry)?"""
    if not line or len(line.strip()) < 3:
        return True
    for pat in NOISE_PATTERNS:
        if pat.match(line):
            return True
    if FILLER_PATTERN.match(line.strip()):
        return True
    return False


def normalize(text: str) -> str:
    """Normalize for comparison (lowercase, strip punctuation, collapse spaces)."""
    t = text.lower().strip()
    t = re.sub(r"[^\w\s]", "", t)
    t = re.sub(r"\s+", " ", t)
    return t


def get_ending(line: str, n_words: int = 2) -> str:
    """Get the last n words of a line (for radif/qafia detection)."""
    words = normalize(line).split()
    return " ".join(words[-n_words:]) if len(words) >= n_words else normalize(line)


def get_last_word(line: str) -> str:
    """Get the last word (for rhyme detection)."""
    words = normalize(line).split()
    return words[-1] if words else ""


# ---------------------------------------------------------------------------
# Grouping strategies
# ---------------------------------------------------------------------------

def group_by_blank_lines(lines: list[str]) -> list[list[str]]:
    """
    Split lines into groups using blank lines as separators.
    This is the most reliable signal — most lyrics use blank lines between stanzas.
    """
    groups: list[list[str]] = []
    current: list[str] = []

    for line in lines:
        if not line.strip():
            if current:
                groups.append(current)
                current = []
        else:
            cleaned = clean_line(line)
            if not is_noise(cleaned):
                current.append(cleaned)

    if current:
        groups.append(current)

    return groups


def detect_radif(lines: list[str]) -> Optional[str]:
    """
    Detect the radif (recurring ending phrase) in a ghazal.
    If > 40% of lines end with the same word(s), that's likely the radif.
    """
    if len(lines) < 4:
        return None

    # Check last 1 word
    endings_1 = [get_last_word(l) for l in lines if l.strip()]
    for ending in set(endings_1):
        if ending and endings_1.count(ending) >= len(lines) * 0.3:
            return ending

    # Check last 2 words
    endings_2 = [get_ending(l, 2) for l in lines if l.strip()]
    for ending in set(endings_2):
        if ending and len(ending.split()) == 2 and endings_2.count(ending) >= len(lines) * 0.3:
            return ending

    return None


def find_refrains(lines: list[str]) -> set[str]:
    """Find lines that repeat 3+ times (likely chorus/refrain)."""
    counts: dict[str, int] = {}
    for line in lines:
        n = normalize(line)
        if n and len(n) > 5:
            counts[n] = counts.get(n, 0) + 1
    return {n for n, c in counts.items() if c >= 3}


# ---------------------------------------------------------------------------
# Main detection logic
# ---------------------------------------------------------------------------

def detect_couplets(
    lyrics_text: str,
    title: Optional[str] = None,
    artist: Optional[str] = None,
) -> dict:
    """
    Intelligently detect and segment couplets from raw lyrics.

    Strategy:
    1. If lyrics have blank-line groups of 2 lines → those are shers
    2. If lyrics have blank-line groups of 4+ lines → split into pairs
    3. If no blank lines → use radif/rhyme detection to find sher boundaries
    4. Fallback → simple consecutive pairing

    Returns:
        {
            "couplets": [...],
            "total_couplets": int,
            "radif": str | null,
            "detection_method": str,
            "song_structure": "ghazal" | "geet" | "qawwali" | "unknown"
        }
    """
    if not lyrics_text or not lyrics_text.strip():
        return {"couplets": [], "total_couplets": 0, "radif": None,
                "detection_method": "none", "song_structure": "unknown"}

    raw_lines = lyrics_text.split("\n")

    # Clean all lines first
    all_clean = [clean_line(l) for l in raw_lines]
    meaningful = [l for l in all_clean if not is_noise(l)]

    if not meaningful:
        return {"couplets": [], "total_couplets": 0, "radif": None,
                "detection_method": "none", "song_structure": "unknown"}

    # Detect refrains (repeated 3+ times)
    refrains = find_refrains(meaningful)

    # Detect radif
    radif = detect_radif(meaningful)

    # Strategy 1: Blank-line grouping
    groups = group_by_blank_lines(raw_lines)

    if len(groups) >= 3:
        # We have structure! Use blank-line groups
        couplets = _couplets_from_groups(groups, refrains, radif)
        method = "blank_line_groups"
    else:
        # No blank-line structure — use pairing with intelligence
        couplets = _couplets_from_flat(meaningful, refrains, radif)
        method = "intelligent_pairing"

    # Determine song structure
    structure = _detect_structure(meaningful, radif, refrains, len(couplets))

    return {
        "couplets": [asdict(c) for c in couplets],
        "total_couplets": len(couplets),
        "radif": radif,
        "detection_method": method,
        "song_structure": structure,
    }


def _couplets_from_groups(
    groups: list[list[str]],
    refrains: set[str],
    radif: Optional[str],
) -> list[DetectedCouplet]:
    """Convert blank-line-separated groups into couplets."""
    couplets: list[DetectedCouplet] = []
    idx = 0

    for group in groups:
        if not group:
            continue

        # If the group is exactly 2 lines → perfect sher
        if len(group) == 2:
            is_ref = (normalize(group[0]) in refrains and normalize(group[1]) in refrains)
            couplets.append(DetectedCouplet(
                index=idx, line1=group[0], line2=group[1],
                combined_text=f"{group[0]}\n{group[1]}",
                is_refrain=is_ref, confidence=0.95,
                group_type="refrain" if is_ref else "sher",
            ))
            idx += 1

        # If 1 line → solo (likely refrain or title line)
        elif len(group) == 1:
            is_ref = normalize(group[0]) in refrains
            couplets.append(DetectedCouplet(
                index=idx, line1=group[0], line2=None,
                combined_text=group[0],
                is_refrain=is_ref, confidence=0.6,
                group_type="refrain" if is_ref else "solo",
            ))
            idx += 1

        # If 4+ lines → split into pairs
        else:
            for i in range(0, len(group) - 1, 2):
                l1 = group[i]
                l2 = group[i + 1] if i + 1 < len(group) else None
                combined = f"{l1}\n{l2}" if l2 else l1
                is_ref = (normalize(l1) in refrains and
                         (not l2 or normalize(l2) in refrains))
                couplets.append(DetectedCouplet(
                    index=idx, line1=l1, line2=l2,
                    combined_text=combined,
                    is_refrain=is_ref, confidence=0.8,
                    group_type="refrain" if is_ref else "sher",
                ))
                idx += 1

            # Handle odd last line
            if len(group) % 2 == 1:
                last = group[-1]
                is_ref = normalize(last) in refrains
                couplets.append(DetectedCouplet(
                    index=idx, line1=last, line2=None,
                    combined_text=last,
                    is_refrain=is_ref, confidence=0.5,
                    group_type="refrain" if is_ref else "solo",
                ))
                idx += 1

    return couplets


def _couplets_from_flat(
    lines: list[str],
    refrains: set[str],
    radif: Optional[str],
) -> list[DetectedCouplet]:
    """Pair lines into couplets using intelligent heuristics."""
    couplets: list[DetectedCouplet] = []
    idx = 0
    i = 0

    while i < len(lines):
        line1 = lines[i]

        # If this is a refrain line, check if next is also refrain → group them
        # If next is NOT refrain, treat this as a solo refrain marker
        if normalize(line1) in refrains:
            if i + 1 < len(lines) and normalize(lines[i + 1]) in refrains:
                # Both are refrain — group as refrain couplet
                couplets.append(DetectedCouplet(
                    index=idx, line1=line1, line2=lines[i + 1],
                    combined_text=f"{line1}\n{lines[i + 1]}",
                    is_refrain=True, confidence=0.85,
                    group_type="refrain",
                ))
                i += 2
            else:
                # Solo refrain
                couplets.append(DetectedCouplet(
                    index=idx, line1=line1, line2=None,
                    combined_text=line1,
                    is_refrain=True, confidence=0.7,
                    group_type="refrain",
                ))
                i += 1
            idx += 1
            continue

        # Normal pairing — take this line + next as a sher
        if i + 1 < len(lines):
            line2 = lines[i + 1]
            # Check if line2 is a refrain (shouldn't be paired with line1)
            if normalize(line2) in refrains:
                # line1 is solo, line2 is a refrain — don't pair
                couplets.append(DetectedCouplet(
                    index=idx, line1=line1, line2=None,
                    combined_text=line1,
                    is_refrain=False, confidence=0.5,
                    group_type="solo",
                ))
                i += 1
            else:
                # Normal pair
                confidence = 0.85
                # Boost confidence if both lines end with same word (radif match)
                if radif and get_last_word(line1) == radif and get_last_word(line2) == radif:
                    confidence = 0.95

                couplets.append(DetectedCouplet(
                    index=idx, line1=line1, line2=line2,
                    combined_text=f"{line1}\n{line2}",
                    is_refrain=False, confidence=confidence,
                    group_type="sher",
                ))
                i += 2
        else:
            # Last line solo
            couplets.append(DetectedCouplet(
                index=idx, line1=line1, line2=None,
                combined_text=line1,
                is_refrain=False, confidence=0.4,
                group_type="solo",
            ))
            i += 1

        idx += 1

    return couplets


def _detect_structure(
    lines: list[str],
    radif: Optional[str],
    refrains: set[str],
    couplet_count: int,
) -> str:
    """Guess the song structure: ghazal, geet, qawwali, or unknown."""
    refrain_ratio = len(refrains) / max(len(lines), 1)

    # Ghazal: has radif, minimal repetition, 5-15 shers
    if radif and refrain_ratio < 0.2 and 4 <= couplet_count <= 20:
        return "ghazal"

    # Qawwali: lots of repetition, longer
    if refrain_ratio > 0.3 and couplet_count > 10:
        return "qawwali"

    # Geet: moderate repetition (chorus), shorter
    if refrain_ratio > 0.15 and couplet_count <= 15:
        return "geet"

    return "unknown"
