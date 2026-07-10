"""
Shama ML Engine — Corpus Builder
==================================
Takes raw scraped JSONL from the Rekhta scraper, deduplicates, validates
against the Pydantic schema, enriches with gold-standard examples from the
project's ghazals.ts seed file, and outputs clean training data as JSONL.

Usage:
    python corpus_builder.py \
        --raw data/raw/rekhta_scraped.jsonl \
        --gold ../frontend/src/data/ghazals.ts \
        --output data/training/corpus.jsonl
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import re
import sys
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from schema import (
    CoupletInput,
    CoupletOutput,
    LiteraryDevice,
    TrainingExample,
    VocabularyEntry,
)

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("corpus_builder")


# ---------------------------------------------------------------------------
# Deduplication
# ---------------------------------------------------------------------------


def couplet_fingerprint(roman: str) -> str:
    """
    Create a normalized fingerprint for deduplication.
    Strips punctuation, lowercases, collapses whitespace.
    """
    normalized = roman.lower().strip()
    normalized = re.sub(r"[^a-z0-9\s]", "", normalized)
    normalized = re.sub(r"\s+", " ", normalized)
    return hashlib.md5(normalized.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# Gold-Standard Parser (ghazals.ts → TrainingExample[])
# ---------------------------------------------------------------------------


def parse_ghazals_ts(ts_path: Path) -> list[TrainingExample]:
    """
    Parse the TypeScript seed catalog (ghazals.ts) into TrainingExamples.
    Uses regex extraction — the file is structured enough for this to work
    reliably without a full TS parser.
    """
    if not ts_path.exists():
        logger.warning("Gold-standard file not found: %s", ts_path)
        return []

    content = ts_path.read_text(encoding="utf-8")
    examples: list[TrainingExample] = []

    # Extract each work block
    # Each work has: title, poet, mood, and lines[]
    # We'll use a JSON-ish extraction approach by finding object patterns.

    # Strategy: find all works by splitting on the top-level array elements
    work_pattern = re.compile(
        r"\{\s*id:\s*['\"](\d+)['\"].*?lines:\s*\[(.*?)\]\s*\}",
        re.DOTALL,
    )

    for work_match in work_pattern.finditer(content):
        work_block = work_match.group(0)

        # Extract work-level metadata
        title = _extract_ts_string(work_block, "title") or ""
        poet = _extract_ts_string(work_block, "poet") or ""
        mood = _extract_ts_string(work_block, "mood") or ""

        # Extract individual lines
        lines_block = work_match.group(2)
        line_pattern = re.compile(r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}", re.DOTALL)

        for position, line_match in enumerate(
            line_pattern.finditer(lines_block), start=1
        ):
            line_block = line_match.group(0)

            urdu = _extract_ts_string(line_block, "urdu") or ""
            hindi = _extract_ts_string(line_block, "hindi") or ""
            roman = _extract_ts_string(line_block, "roman") or ""
            translation = _extract_ts_string(line_block, "translation") or ""
            simple = _extract_ts_string(line_block, "simple") or ""
            detailed = _extract_ts_string(line_block, "detailed") or ""

            # Extract vocabulary array
            vocabulary = _extract_vocabulary(line_block)

            if not roman:
                continue

            try:
                example = TrainingExample(
                    input=CoupletInput(
                        couplet_roman=roman,
                        couplet_urdu=urdu,
                        couplet_hindi=hindi,
                        poet=poet,
                        ghazal_title=title,
                        position_in_ghazal=position,
                    ),
                    output=CoupletOutput(
                        translation=translation,
                        simple=simple,
                        detailed=detailed,
                        vocabulary=vocabulary,
                        literary_devices=[],
                        mood=mood,
                    ),
                )
                examples.append(example)
            except ValidationError as e:
                logger.warning("Validation error for gold line '%s': %s", roman[:30], e)

    logger.info("Parsed %d gold-standard examples from %s", len(examples), ts_path)
    return examples


def _extract_ts_string(block: str, key: str) -> str | None:
    """Extract a string value for a given key from a TS/JS object literal."""
    # Match: key: 'value' or key: "value"
    pattern = re.compile(
        rf"{key}:\s*['\"](.+?)['\"]",
        re.DOTALL,
    )
    # Try single-line match first
    single = re.search(rf"{key}:\s*'([^']*)'", block)
    if single:
        return single.group(1).replace("\\'", "'")

    single_dq = re.search(rf'{key}:\s*"([^"]*)"', block)
    if single_dq:
        return single_dq.group(1).replace('\\"', '"')

    # Multi-line template literal
    template = re.search(rf"{key}:\s*`([^`]*)`", block)
    if template:
        return template.group(1).strip()

    return None


def _extract_vocabulary(line_block: str) -> list[VocabularyEntry]:
    """Extract vocabulary entries from a line block."""
    vocab: list[VocabularyEntry] = []
    # Match { term: '...', meaning: '...' } patterns
    vocab_pattern = re.compile(
        r"\{\s*term:\s*['\"](.+?)['\"],\s*meaning:\s*['\"](.+?)['\"]\s*\}",
        re.DOTALL,
    )
    for m in vocab_pattern.finditer(line_block):
        vocab.append(VocabularyEntry(term=m.group(1), meaning=m.group(2)))
    return vocab


# ---------------------------------------------------------------------------
# Raw JSONL → TrainingExample conversion
# ---------------------------------------------------------------------------


def raw_to_training_examples(raw_path: Path) -> list[TrainingExample]:
    """Convert raw scraped JSONL ghazals into TrainingExamples."""
    examples: list[TrainingExample] = []

    if not raw_path.exists():
        logger.warning("Raw JSONL not found: %s", raw_path)
        return examples

    with open(raw_path, "r", encoding="utf-8") as f:
        for line_num, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                ghazal_data: dict[str, Any] = json.loads(line)
            except json.JSONDecodeError as e:
                logger.warning("JSON decode error on line %d: %s", line_num, e)
                continue

            poet = ghazal_data.get("poet", "Unknown")
            title = ghazal_data.get("title", "")
            couplets = ghazal_data.get("couplets", [])

            for couplet in couplets:
                roman = couplet.get("roman", "").strip()
                if not roman:
                    continue  # Skip empty couplets

                try:
                    example = TrainingExample(
                        input=CoupletInput(
                            couplet_roman=roman,
                            couplet_urdu=couplet.get("urdu", ""),
                            couplet_hindi=couplet.get("hindi", ""),
                            poet=poet,
                            ghazal_title=title,
                            position_in_ghazal=couplet.get("position", 1),
                        ),
                        output=CoupletOutput(
                            translation=couplet.get("english_translation", ""),
                            simple=couplet.get("tafseer", ""),
                            detailed="",
                            vocabulary=[],
                            literary_devices=[],
                            mood="",
                        ),
                    )
                    examples.append(example)
                except ValidationError as e:
                    logger.warning(
                        "Validation error (line %d, couplet %d): %s",
                        line_num,
                        couplet.get("position", "?"),
                        e,
                    )

    logger.info("Converted %d examples from raw JSONL", len(examples))
    return examples


# ---------------------------------------------------------------------------
# Deduplication & Merge
# ---------------------------------------------------------------------------


def deduplicate(examples: list[TrainingExample]) -> list[TrainingExample]:
    """
    Remove duplicate couplets. Gold-standard examples take priority
    (they appear first in the input list).
    """
    seen: set[str] = set()
    unique: list[TrainingExample] = []

    for ex in examples:
        fp = couplet_fingerprint(ex.input.couplet_roman)
        if fp not in seen:
            seen.add(fp)
            unique.append(ex)
        else:
            logger.debug("Dedup: skipping '%s'", ex.input.couplet_roman[:40])

    removed = len(examples) - len(unique)
    if removed:
        logger.info("Deduplication removed %d duplicates", removed)
    return unique


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------


def write_training_jsonl(examples: list[TrainingExample], output_path: Path) -> None:
    """Write validated training examples to JSONL."""
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as f:
        for ex in examples:
            f.write(ex.model_dump_json() + "\n")

    logger.info("Wrote %d training examples to %s", len(examples), output_path)


def write_stats(examples: list[TrainingExample], output_path: Path) -> None:
    """Write corpus statistics alongside the training data."""
    poets = set(ex.input.poet for ex in examples)
    ghazals = set(ex.input.ghazal_title for ex in examples)
    has_translation = sum(1 for ex in examples if ex.output.translation)
    has_detailed = sum(1 for ex in examples if ex.output.detailed)

    stats = {
        "total_couplets": len(examples),
        "unique_poets": len(poets),
        "unique_ghazals": len(ghazals),
        "with_translation": has_translation,
        "with_detailed_meaning": has_detailed,
        "poets": sorted(poets),
    }

    stats_path = output_path.with_suffix(".stats.json")
    with open(stats_path, "w", encoding="utf-8") as f:
        json.dump(stats, f, indent=2, ensure_ascii=False)

    logger.info("Stats: %d couplets, %d poets, %d ghazals", *list(stats.values())[:3])


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build clean training corpus from raw scraped data + gold examples"
    )
    parser.add_argument(
        "--raw",
        type=Path,
        default=Path("data/raw/rekhta_scraped.jsonl"),
        help="Path to raw scraped JSONL from rekhta_scraper.py",
    )
    parser.add_argument(
        "--gold",
        type=Path,
        default=Path("../../frontend/src/data/ghazals.ts"),
        help="Path to the ghazals.ts gold-standard seed file",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/training/corpus.jsonl"),
        help="Output path for clean training JSONL",
    )
    parser.add_argument(
        "--no-gold",
        action="store_true",
        help="Skip enrichment with gold-standard examples",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable debug logging",
    )
    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    # --- Step 1: Load gold-standard examples (priority) ---
    gold_examples: list[TrainingExample] = []
    if not args.no_gold:
        gold_examples = parse_ghazals_ts(args.gold)

    # --- Step 2: Load raw scraped examples ---
    raw_examples = raw_to_training_examples(args.raw)

    # --- Step 3: Merge (gold first for dedup priority) & deduplicate ---
    all_examples = gold_examples + raw_examples
    logger.info(
        "Merged: %d gold + %d raw = %d total (before dedup)",
        len(gold_examples),
        len(raw_examples),
        len(all_examples),
    )
    clean_examples = deduplicate(all_examples)

    # --- Step 4: Validate all pass schema ---
    valid: list[TrainingExample] = []
    for ex in clean_examples:
        try:
            # Re-validate by round-tripping
            validated = TrainingExample.model_validate(ex.model_dump())
            valid.append(validated)
        except ValidationError as e:
            logger.warning("Final validation failed: %s", e)

    # --- Step 5: Write output ---
    write_training_jsonl(valid, args.output)
    write_stats(valid, args.output)

    logger.info(
        "✓ Corpus build complete: %d valid examples → %s", len(valid), args.output
    )


if __name__ == "__main__":
    main()
