"""
Shama — Convert raw Rekhta scraper output to RAG-ready JSONL.

Takes the raw scraped JSONL (one ghazal per line with nested couplets)
and flattens it into one-couplet-per-line format matching training_corpus.jsonl.

Usage:
    cd ml-engine
    python data/convert_scraped.py --input data/raw/rekhta_scraped.jsonl

This APPENDS to data/training_corpus.jsonl (deduplicates by roman text).
"""

import json
import sys
from pathlib import Path


def load_existing_corpus(corpus_path: Path) -> set[str]:
    """Load existing roman couplet texts to avoid duplicates."""
    existing = set()
    if corpus_path.exists():
        with open(corpus_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    record = json.loads(line)
                    text = record.get("couplet_text", "").strip().lower()
                    if text:
                        existing.add(text)
                except json.JSONDecodeError:
                    continue
    return existing


def convert_scraped(input_path: Path, corpus_path: Path) -> int:
    """Convert raw scraped JSONL to corpus format, appending new couplets."""
    existing = load_existing_corpus(corpus_path)
    initial_count = len(existing)
    new_records = []

    with open(input_path, "r", encoding="utf-8") as f:
        for line_no, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                ghazal = json.loads(line)
            except json.JSONDecodeError:
                print(f"[WARN] Skipping malformed line {line_no}")
                continue

            poet = ghazal.get("poet", "")
            title = ghazal.get("title", "")

            for couplet in ghazal.get("couplets", []):
                roman = couplet.get("roman", "").strip()
                if not roman:
                    # Try joining line1 + line2
                    l1 = couplet.get("roman_line1", "")
                    l2 = couplet.get("roman_line2", "")
                    roman = f"{l1} {l2}".strip() if l1 else ""
                if not roman:
                    continue

                # Deduplicate
                key = roman.lower()
                if key in existing:
                    continue
                existing.add(key)

                record = {
                    "couplet_text": roman,
                    "couplet_urdu": couplet.get("urdu", ""),
                    "couplet_hindi": couplet.get("hindi", ""),
                    "poet": poet,
                    "ghazal_title": title,
                    "translation": couplet.get("english_translation", ""),
                    "simple": couplet.get("tafseer", ""),
                    "detailed": "",
                    "line_id": f"scraped-{line_no}-{couplet.get('position', 0)}",
                }
                new_records.append(record)

    # Append to corpus
    if new_records:
        with open(corpus_path, "a", encoding="utf-8") as f:
            for record in new_records:
                f.write(json.dumps(record, ensure_ascii=False) + "\n")

    print(f"[INFO] Existing corpus: {initial_count} couplets")
    print(f"[INFO] New couplets added: {len(new_records)}")
    print(f"[INFO] Total corpus now: {initial_count + len(new_records)}")
    return len(new_records)


def main():
    script_dir = Path(__file__).parent
    default_input = script_dir / "raw" / "rekhta_scraped.jsonl"
    corpus_path = script_dir / "training_corpus.jsonl"

    import argparse
    parser = argparse.ArgumentParser(description="Convert scraped data to RAG corpus")
    parser.add_argument("--input", type=Path, default=default_input, help="Raw scraped JSONL")
    args = parser.parse_args()

    if not args.input.exists():
        print(f"[ERROR] Input file not found: {args.input}")
        print(f"[HINT] Run the scraper first:")
        print(f"  python scraper/rekhta_scraper.py --poets-file scraper/poets.txt")
        sys.exit(1)

    added = convert_scraped(args.input, corpus_path)
    if added > 0:
        print(f"\n[NEXT] Re-embed the corpus:")
        print(f"  python -m rag.embeddings")


if __name__ == "__main__":
    main()
