"""
Shama — Seed Corpus Generator
Converts the existing ghazals.ts gold-standard data into JSONL format
suitable for the RAG embedding pipeline.

Usage:
    cd ml-engine
    python data/seed_corpus.py

Output: ml-engine/data/training_corpus.jsonl
"""

import json
import re
import sys
from pathlib import Path


def extract_string_value(text: str, key: str) -> str:
    """
    Extract a string value for a given key from TS object text.
    Handles single-quoted values that may contain special characters.
    Looks for: key: 'value' pattern, handling escaped quotes.
    """
    # Match key: 'anything until unescaped closing quote'
    # Use a greedy approach: find the key, then grab everything between quotes
    pattern = rf"{key}:\s*'((?:[^'\\]|\\.)*)'"
    match = re.search(pattern, text)
    if match:
        return match.group(1).replace("\\'", "'")
    return ""


def parse_ghazals_ts(ts_path: str) -> list[dict]:
    """
    Parse ghazals.ts by splitting into line blocks and extracting fields.
    More robust than pure regex — handles special chars in values.
    """
    with open(ts_path, "r", encoding="utf-8") as f:
        content = f.read()

    couplets = []

    # Split into work-level blocks by looking for top-level objects in catalog
    # Each work starts with { id: '0X',
    work_blocks = re.split(r"\n  \{\s*\n\s*id:", content)

    for work_block in work_blocks[1:]:  # skip pre-catalog content
        # Extract work metadata
        poet = extract_string_value(work_block, "poet")
        title = extract_string_value(work_block, "title")

        # Split into individual line objects
        # Each line block starts with { id: 'L...'
        line_blocks = re.split(r"\{\s*\n\s*id:", work_block)

        for line_block in line_blocks[1:]:  # skip the work header part
            line_id = extract_string_value("id:" + line_block, "id")
            if not line_id.startswith("L"):
                continue

            roman = extract_string_value(line_block, "roman")
            urdu = extract_string_value(line_block, "urdu")
            hindi = extract_string_value(line_block, "hindi")
            english = extract_string_value(line_block, "englishText")
            translation = extract_string_value(line_block, "translation")
            simple = extract_string_value(line_block, "simple")
            detailed = extract_string_value(line_block, "detailed")

            if not roman:
                continue

            couplet_record = {
                "couplet_text": roman,
                "couplet_urdu": urdu,
                "couplet_hindi": hindi,
                "poet": poet,
                "ghazal_title": title,
                "translation": translation,
                "simple": simple,
                "detailed": detailed,
                "line_id": line_id,
            }
            couplets.append(couplet_record)

    return couplets


def write_jsonl(records: list[dict], output_path: str) -> None:
    """Write records as JSONL."""
    with open(output_path, "w", encoding="utf-8") as f:
        for record in records:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")


def main():
    script_dir = Path(__file__).parent
    project_root = script_dir.parent.parent
    ghazals_path = project_root / "frontend" / "src" / "data" / "ghazals.ts"
    output_path = script_dir / "training_corpus.jsonl"

    if not ghazals_path.exists():
        print(f"[ERROR] ghazals.ts not found at: {ghazals_path}")
        sys.exit(1)

    print(f"[INFO] Parsing: {ghazals_path}")
    couplets = parse_ghazals_ts(str(ghazals_path))
    print(f"[INFO] Extracted {len(couplets)} couplets")

    if not couplets:
        print("[WARN] No couplets extracted. Check ghazals.ts format.")
        sys.exit(1)

    write_jsonl(couplets, str(output_path))
    print(f"[DONE] Written to: {output_path}")
    print(f"[INFO] Next: python -m rag.embeddings")


if __name__ == "__main__":
    main()
