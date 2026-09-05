"""
Shama — corpus health check.

    cd ml-engine
    python data/check_corpus.py

Answers the questions that decide whether the corpus is usable for the product,
rather than merely large:

  * how many couplets carry Urdu and Devanagari — alignment matches in the
    lyric source's own script, so a Roman-only corpus cannot be aligned at all;
  * how many are duplicate transliterations of the same verse;
  * which ghazals are deep enough to cover a whole performance.
"""

from __future__ import annotations

import argparse
import collections
import json
import re
import unicodedata
from pathlib import Path


def fold(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", (text or "").lower())
    stripped = "".join(c for c in decomposed if not unicodedata.combining(c))
    return re.sub(r"[^a-z]", "", stripped)


def main() -> None:
    parser = argparse.ArgumentParser(description="Report on the RAG/meaning corpus")
    parser.add_argument(
        "--corpus",
        type=Path,
        default=Path(__file__).parent / "training_corpus.jsonl",
    )
    args = parser.parse_args()

    rows = [
        json.loads(line)
        for line in args.corpus.open(encoding="utf-8")
        if line.strip()
    ]
    if not rows:
        print("corpus is empty")
        return

    total = len(rows)
    urdu = sum(1 for r in rows if (r.get("couplet_urdu") or "").strip())
    hindi = sum(1 for r in rows if (r.get("couplet_hindi") or "").strip())
    meaning = sum(1 for r in rows if (r.get("simple") or "").strip())

    skeletons = collections.Counter(fold(r.get("couplet_text", "")) for r in rows)
    dupes = sum(count - 1 for count in skeletons.values() if count > 1)

    by_ghazal = collections.Counter(r.get("ghazal_title", "") for r in rows)
    poets = collections.Counter(r.get("poet", "") for r in rows)

    pct = lambda n: f"{100 * n / total:5.1f}%"
    print(f"couplets           {total}")
    print(f"  with Urdu        {urdu:6}  {pct(urdu)}   <- required for display")
    print(f"  with Devanagari  {hindi:6}  {pct(hindi)}   <- required for alignment")
    print(f"  with a meaning   {meaning:6}  {pct(meaning)}")
    print(f"  duplicate verses {dupes:6}  {pct(dupes)}")
    print()
    print(f"ghazals            {len([t for t in by_ghazal if t])}")
    print(f"poets              {len([p for p in poets if p])}")

    deep = sum(1 for t, n in by_ghazal.items() if t and n >= 7)
    print(f"  >= 7 couplets    {deep}   (deep enough to cover a full performance)")

    print("\ntop poets by couplets held:")
    for poet, n in poets.most_common(6):
        if poet:
            print(f"  {n:5}  {poet}")


if __name__ == "__main__":
    main()
