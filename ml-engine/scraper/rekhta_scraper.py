"""
Shama — Rekhta Ghazal Scraper (v2)
====================================
Extracts couplets from Rekhta.org ghazal pages using their actual page structure.

Rekhta renders couplets as plain text lines. This scraper:
1. Fetches the ghazal page
2. Extracts the Roman-script couplet text (always present)
3. Fetches the Hindi and Urdu versions via the &lang=hi / &lang=ur variants
4. Outputs structured JSONL

Usage:
    cd ml-engine
    python scraper/rekhta_scraper.py --poets-file scraper/poets.txt --max-ghazals 20
"""

from __future__ import annotations

import argparse
import json
import logging
import random
import re
import sys
import time
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

import requests
from bs4 import BeautifulSoup
from tqdm import tqdm

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
BASE_URL = "https://www.rekhta.org"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
)
HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
}
MIN_DELAY = 2.0
MAX_DELAY = 4.0

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("rekhta")


def _delay():
    time.sleep(random.uniform(MIN_DELAY, MAX_DELAY))


def _fetch(url: str, session: requests.Session) -> str:
    """Fetch URL text with delay and retry."""
    _delay()
    for attempt in range(3):
        try:
            r = session.get(url, headers=HEADERS, timeout=30)
            r.raise_for_status()
            return r.text
        except requests.RequestException as e:
            if attempt < 2:
                time.sleep(5 * (attempt + 1))
            else:
                raise
    return ""


# ---------------------------------------------------------------------------
# Couplet extraction
# ---------------------------------------------------------------------------

def extract_couplets_from_page(html: str) -> list[str]:
    """
    Extract Roman-transliterated couplet lines from a Rekhta ghazal page.
    
    Rekhta stores couplets as <span data-m='...'> elements inside <p> tags.
    We extract these and join the words back into full lines.
    """
    # Find all <p> blocks containing data-m spans (this is where couplets live)
    p_blocks = re.findall(
        r'<p[^>]*>((?:<span data-m=[^>]*>[^<]*</span>)+)</p>',
        html
    )

    lines = []
    for p in p_blocks:
        # Extract text from each span within the paragraph
        words = re.findall(r'>([^<]+)<', p)
        line = ''.join(words).strip()
        if line and len(line) > 10:
            lines.append(line)

    # Rekhta shows couplets twice: once with diacritics, once without.
    # The diacritic version comes first and is higher quality. 
    # Deduplicate by taking only unique lines (first occurrence wins).
    if not lines:
        return []

    # Also skip the first 2 lines if they look like a generic site couplet
    # (Rekhta shows "aaj ik aur baras biit gaya..." as a header on every page)
    SITE_HEADERS = ["aaj ik aur baras", "jis ke hote hue hote the"]
    lines = [l for l in lines if not any(h in l.lower() for h in SITE_HEADERS)]

    return _drop_transliteration_echo(lines)


def _fold(text: str) -> str:
    """ASCII skeleton of a Roman line, for comparing transliteration variants."""
    decomposed = unicodedata.normalize("NFKD", text.lower())
    stripped = "".join(c for c in decomposed if not unicodedata.combining(c))
    return re.sub(r"[^a-z]", "", stripped)


def _drop_transliteration_echo(lines: list[str]) -> list[str]:
    """Remove Rekhta's second copy of the same poem.

    The Roman page prints every ghazal twice — once with diacritics
    ("tum apne shikve kī bāteñ"), once without ("tum apne shikwe ki baaten").
    Deduplicating on the raw string never catches this because the two spellings
    genuinely differ, so each ghazal was stored at double length. Compare the
    two halves on an ASCII skeleton instead, and keep the diacritic copy.
    """
    n = len(lines)
    if n < 4 or n % 2:
        return lines

    first, second = lines[: n // 2], lines[n // 2 :]

    pairs = [(_fold(a), _fold(b)) for a, b in zip(first, second)]
    # Only Roman pages carry the echo. Devanagari and Urdu fold to empty
    # skeletons, and comparing "" with "" scores a perfect match — which would
    # silently halve every non-Latin page.
    if any(not a or not b for a, b in pairs):
        return lines

    matches = sum(1 for a, b in pairs if SequenceMatcher(None, a, b).ratio() >= 0.82)
    if matches >= len(first) * 0.8:
        return first
    return lines


def extract_poet_and_title(html: str) -> tuple[str, str]:
    """Extract poet name and ghazal title from page."""
    soup = BeautifulSoup(html, "lxml")
    
    poet = ""
    title = ""
    
    # Title is usually in h1 or the page title
    h1 = soup.find("h1")
    if h1:
        title = h1.get_text(strip=True)
    
    # Poet: look for links to poet pages
    for a in soup.find_all("a", href=True):
        if "/poets/" in a.get("href", "") and a.get_text(strip=True):
            poet = a.get_text(strip=True)
            break
    
    # Fallback: meta tags
    if not poet:
        meta = soup.find("meta", {"name": "author"})
        if meta:
            poet = meta.get("content", "")
    
    return poet, title


def pair_into_couplets(lines: list[str]) -> list[tuple[str, str]]:
    """
    Pair consecutive lines into couplets (sher = 2 lines).
    Removes duplicates (Rekhta sometimes shows the same ghazal twice).
    """
    # Deduplicate while preserving order
    seen = set()
    unique_lines = []
    for line in lines:
        normalized = line.strip().lower()
        if normalized not in seen:
            seen.add(normalized)
            unique_lines.append(line)
    
    # Pair into couplets
    couplets = []
    for i in range(0, len(unique_lines) - 1, 2):
        couplets.append((unique_lines[i], unique_lines[i + 1]))
    
    return couplets


# ---------------------------------------------------------------------------
# Listing pages
# ---------------------------------------------------------------------------

def get_ghazal_links(poet_slug: str, session: requests.Session, max_pages: int = 5) -> list[str]:
    """Get ghazal URLs from a poet's listing page."""
    links = []
    
    for page in range(1, max_pages + 1):
        url = f"{BASE_URL}/poets/{poet_slug}/ghazals?page={page}"
        logger.info("Listing page %d for '%s'", page, poet_slug)
        
        try:
            html = _fetch(url, session)
        except Exception as e:
            logger.warning("Failed to fetch listing page %d: %s", page, e)
            break
        
        soup = BeautifulSoup(html, "lxml")
        found = 0
        
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if "/ghazals/" in href and poet_slug in href and href not in links:
                # Skip listing pages themselves
                if "?page=" in href:
                    continue
                full_url = href if href.startswith("http") else BASE_URL + href
                links.append(full_url)
                found += 1
        
        if found == 0:
            break

    if not links:
        # A wrong slug still returns HTTP 200 with a "poet not found" page, so
        # this looks identical to a poet who simply has no ghazals. Four slugs
        # in poets.txt were wrong this way and a quarter of every harvest was
        # silently skipped — say so loudly.
        logger.error(
            "No ghazals found for '%s'. The slug is probably wrong — open "
            "%s/poets/%s/ghazals and check the URL.",
            poet_slug, BASE_URL, poet_slug,
        )
    else:
        logger.info("Found %d ghazal links for '%s'", len(links), poet_slug)
    return links


# ---------------------------------------------------------------------------
# Main scrape logic
# ---------------------------------------------------------------------------

def _with_lang(url: str, lang: str) -> str:
    """Rekhta serves each script as a `lang` query parameter on the same page.

    Must be merged into the existing query — these URLs usually already carry
    `?sort=year-asc`, and appending a second `?` yields a malformed request that
    silently returns the Roman page.
    """
    parts = urlparse(url)
    query = parse_qs(parts.query)
    query["lang"] = [lang]
    return urlunparse(parts._replace(query=urlencode(query, doseq=True)))


def _couplets_in_script(url: str, lang: str, session: requests.Session) -> list[tuple[str, str]]:
    """Fetch one script variant and pair its lines into couplets."""
    try:
        html = _fetch(_with_lang(url, lang), session)
    except Exception as e:
        logger.warning("Could not fetch %s variant of %s: %s", lang, url, e)
        return []
    return pair_into_couplets(extract_couplets_from_page(html))


def scrape_ghazal(url: str, session: requests.Session) -> dict | None:
    """Scrape a single ghazal in all three scripts and return structured data."""
    try:
        html = _fetch(url, session)
    except Exception as e:
        logger.error("Failed to fetch %s: %s", url, e)
        return None

    poet, title = extract_poet_and_title(html)
    lines = extract_couplets_from_page(html)

    if len(lines) < 2:
        return None

    couplets = pair_into_couplets(lines)
    if not couplets:
        return None

    # Devanagari and Urdu matter well beyond display: couplet-to-recording
    # alignment matches in the lyric source's own script, and LRCLIB serves
    # these ghazals in Devanagari. A Roman-only corpus cannot be aligned.
    hindi = _couplets_in_script(url, "hi", session)
    urdu = _couplets_in_script(url, "ur", session)

    # Only merge a variant that lines up couplet-for-couplet. A length mismatch
    # means the pages disagree about structure, and zipping anyway would attach
    # the wrong Urdu to a verse — worse than leaving it blank.
    if len(hindi) != len(couplets):
        if hindi:
            logger.warning("hindi variant of %s has %d couplets, roman has %d — skipping",
                           url, len(hindi), len(couplets))
        hindi = []
    if len(urdu) != len(couplets):
        if urdu:
            logger.warning("urdu variant of %s has %d couplets, roman has %d — skipping",
                           url, len(urdu), len(couplets))
        urdu = []

    ghazal_data = {
        "url": url,
        "poet": poet,
        "title": title or (couplets[0][0] if couplets else ""),
        "couplets": [
            {
                "position": i + 1,
                "roman": f"{line1} {line2}",
                "roman_line1": line1,
                "roman_line2": line2,
                "urdu": " ".join(urdu[i]).strip() if i < len(urdu) else "",
                "urdu_line1": urdu[i][0] if i < len(urdu) else "",
                "urdu_line2": urdu[i][1] if i < len(urdu) else "",
                "hindi": " ".join(hindi[i]).strip() if i < len(hindi) else "",
                "hindi_line1": hindi[i][0] if i < len(hindi) else "",
                "hindi_line2": hindi[i][1] if i < len(hindi) else "",
            }
            for i, (line1, line2) in enumerate(couplets)
        ],
    }

    return ghazal_data


def scrape_poet(
    poet_slug: str,
    session: requests.Session,
    max_pages: int = 5,
    max_ghazals: int | None = None,
) -> list[dict]:
    """Scrape all ghazals for a poet."""
    links = get_ghazal_links(poet_slug, session, max_pages=max_pages)
    
    if max_ghazals:
        links = links[:max_ghazals]
    
    results = []
    for link in tqdm(links, desc=f"Scraping {poet_slug}", unit="ghazal"):
        ghazal = scrape_ghazal(link, session)
        if ghazal and ghazal["couplets"]:
            results.append(ghazal)
            logger.info("✓ %s — %d couplets", ghazal["title"][:40], len(ghazal["couplets"]))
    
    return results


def save_jsonl(ghazals: list[dict], output_path: Path) -> None:
    """Save ghazals as JSONL."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "a", encoding="utf-8") as f:
        for g in ghazals:
            f.write(json.dumps(g, ensure_ascii=False) + "\n")
    logger.info("Wrote %d ghazals to %s", len(ghazals), output_path)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Scrape ghazals from Rekhta.org")
    parser.add_argument("--poet", type=str, help="Single poet slug")
    parser.add_argument("--poets-file", type=Path, help="File with poet slugs")
    # Anchored to the repo, not the shell's cwd. A bare relative default meant
    # running from ml-engine/scraper wrote to scraper/data/raw/ — a full
    # 726-ghazal harvest silently landed somewhere nobody looks.
    default_output = Path(__file__).resolve().parent.parent / "data" / "raw" / "rekhta_scraped.jsonl"
    parser.add_argument("--output", type=Path, default=default_output)
    parser.add_argument("--max-pages", type=int, default=5)
    parser.add_argument("--max-ghazals", type=int, default=None)
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    poets = []
    if args.poet:
        poets.append(args.poet)
    if args.poets_file:
        if not args.poets_file.exists():
            print(f"[ERROR] File not found: {args.poets_file}")
            sys.exit(1)
        poets.extend(
            l.strip() for l in args.poets_file.read_text().splitlines()
            if l.strip() and not l.startswith("#")
        )

    if not poets:
        print("[ERROR] Specify --poet or --poets-file")
        sys.exit(1)

    # Clear output file for fresh run
    args.output.parent.mkdir(parents=True, exist_ok=True)
    if args.output.exists():
        args.output.unlink()

    logger.info("Scraping %d poet(s): %s", len(poets), ", ".join(poets[:5]))
    
    session = requests.Session()
    total = 0

    for poet_slug in poets:
        ghazals = scrape_poet(poet_slug, session, args.max_pages, args.max_ghazals)
        if ghazals:
            save_jsonl(ghazals, args.output)
            total += len(ghazals)

    logger.info("═══════════════════════════════════")
    logger.info("Done. Total ghazals: %d → %s", total, args.output)
    logger.info("═══════════════════════════════════")
    logger.info("Next: python data/convert_scraped.py")


if __name__ == "__main__":
    main()
