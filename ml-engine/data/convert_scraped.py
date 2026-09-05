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
import re
import sys
import unicodedata
from pathlib import Path


def fold(text: str) -> str:
    """ASCII skeleton of a Roman couplet.

    Rekhta prints two transliterations of the same verse ("bāteñ" / "baaten"),
    so a raw lowercase key treats them as different couplets. Folding to
    letters-only makes the two collapse onto one record.
    """
    decomposed = unicodedata.normalize("NFKD", (text or "").lower())
    stripped = "".join(c for c in decomposed if not unicodedata.combining(c))
    return re.sub(r"[^a-z]", "", stripped)


def load_existing_corpus(corpus_path: Path) -> dict[str, dict]:
    """Existing couplets, keyed by folded Roman skeleton."""
    existing: dict[str, dict] = {}
    if corpus_path.exists():
        with open(corpus_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    record = json.loads(line)
                except json.JSONDecodeError:
                    continue
                key = fold(record.get("couplet_text", ""))
                if key:
                    existing[key] = record
    return existing


def convert_scraped(input_path: Path, corpus_path: Path) -> int:
    """Convert raw scraped JSONL to corpus format.

    Records are keyed by folded Roman skeleton, and a couplet we already hold
    is UPGRADED when the new scrape carries scripts it was missing. Re-running
    a scrape therefore improves the corpus in place — the previous behaviour
    skipped every known couplet, so a corpus that was 99% Roman-only could
    never gain the Urdu and Devanagari that alignment and display depend on.
    """
    existing = load_existing_corpus(corpus_path)
    initial_count = len(existing)
    new_records = []
    upgraded = 0

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

                key = fold(roman)
                prior = existing.get(key)
                if prior is not None:
                    # Fill in only what is missing; never overwrite real content.
                    changed = False
                    for field, value in (
                        ("couplet_urdu", couplet.get("urdu", "")),
                        ("couplet_hindi", couplet.get("hindi", "")),
                    ):
                        if value.strip() and not (prior.get(field) or "").strip():
                            prior[field] = value
                            changed = True
                    if changed:
                        upgraded += 1
                    continue

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
                existing[key] = record
                new_records.append(record)

    # Rewritten in full rather than appended: upgrades modify rows already in
    # the file, so an append-only write would discard every script we just
    # filled in.
    if new_records or upgraded:
        tmp = corpus_path.with_suffix(".jsonl.tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            for record in existing.values():
                f.write(json.dumps(record, ensure_ascii=False) + "\n")
        tmp.replace(corpus_path)

    with_script = sum(1 for r in existing.values() if (r.get("couplet_urdu") or "").strip())
    print(f"[INFO] Existing corpus: {initial_count} couplets")
    print(f"[INFO] New couplets added: {len(new_records)}")
    print(f"[INFO] Existing couplets upgraded with scripts: {upgraded}")
    print(f"[INFO] Total corpus now: {len(existing)} ({with_script} with Urdu/Hindi)")
    return len(new_records) + upgraded


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
