# Shama ML Engine — Data Pipeline

Data collection, validation, and corpus-building pipeline for training (or RAG-feeding) the Shama couplet meaning engine.

## Overview

```
┌─────────────┐     ┌────────────────┐     ┌──────────────────┐
│ Rekhta.org  │────▶│ rekhta_scraper │────▶│ raw JSONL         │
│ (website)   │     │ (respectful)   │     │ data/raw/*.jsonl  │
└─────────────┘     └────────────────┘     └────────┬─────────┘
                                                     │
                    ┌────────────────┐               │
                    │ ghazals.ts     │───┐           │
                    │ (30 gold std)  │   │           ▼
                    └────────────────┘   │  ┌───────────────────┐
                                         └─▶│  corpus_builder   │
                                            │  (dedup+validate) │
                                            └────────┬──────────┘
                                                     │
                                                     ▼
                                            ┌───────────────────┐
                                            │ training corpus   │
                                            │ data/training/    │
                                            │   corpus.jsonl    │
                                            └───────────────────┘
```

## Setup

```bash
cd ml-engine/scraper
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
# source .venv/bin/activate

pip install -r requirements.txt
```

Requires **Python 3.11+**.

## Components

### 1. `schema.py` — Training Data Schema

Pydantic models defining the canonical data format:

| Model | Purpose |
|-------|---------|
| `CoupletInput` | Raw couplet text (roman, urdu, hindi) + metadata (poet, title, position) |
| `CoupletOutput` | AI-generated meaning layers: translation, simple, detailed, vocabulary, literary devices, mood |
| `TrainingExample` | Input + Output pair — one training record |

### 2. `rekhta_scraper.py` — Web Scraper

Respectfully scrapes ghazal data from Rekhta.org.

**Features:**
- Extracts couplets in all three scripts (Urdu, Hindi, Roman)
- Captures English translations and tafseer/meanings when available
- Handles pagination across poet listing pages
- Rate-limited with random jitter (2–5s between requests)
- Automatic retry with exponential backoff on transient errors
- Outputs one ghazal per line as JSONL

**Usage:**

```bash
# Single poet
python rekhta_scraper.py --poet mirza-ghalib --output data/raw/ghalib.jsonl

# Multiple poets from file
python rekhta_scraper.py --poets-file poets.txt --output data/raw/all.jsonl

# Test run (limit pages and ghazals)
python rekhta_scraper.py --poet mirza-ghalib --max-pages 2 --max-ghazals 5 --verbose
```

**Arguments:**

| Flag | Description | Default |
|------|-------------|---------|
| `--poet` | Rekhta poet URL slug (e.g. `mirza-ghalib`) | — |
| `--poets-file` | Text file with one slug per line | — |
| `--output` | Output JSONL path | `data/raw/rekhta_scraped.jsonl` |
| `--max-pages` | Max listing pages per poet | 10 |
| `--max-ghazals` | Max ghazals per poet (for testing) | unlimited |
| `--verbose` | Debug logging | off |

**Poet slugs** — find them in Rekhta URLs, e.g.:
- `https://www.rekhta.org/poets/mirza-ghalib` → `mirza-ghalib`
- `https://www.rekhta.org/poets/faiz-ahmed-faiz` → `faiz-ahmed-faiz`
- `https://www.rekhta.org/poets/ahmed-faraz` → `ahmed-faraz`

### 3. `corpus_builder.py` — Corpus Builder

Transforms raw scraped data into clean, validated training examples.

**Pipeline steps:**
1. Load gold-standard examples from `ghazals.ts` (5 ghazals, ~30 couplets)
2. Load raw scraped JSONL
3. Merge (gold-standard has priority in deduplication)
4. Deduplicate by normalized Roman text fingerprint
5. Validate every example against Pydantic schema
6. Write clean JSONL + statistics

**Usage:**

```bash
# Default paths (run from ml-engine/scraper/)
python corpus_builder.py

# Custom paths
python corpus_builder.py \
    --raw data/raw/rekhta_scraped.jsonl \
    --gold ../../frontend/src/data/ghazals.ts \
    --output data/training/corpus.jsonl

# Without gold-standard enrichment
python corpus_builder.py --raw data/raw/all.jsonl --no-gold --output data/training/raw_only.jsonl
```

**Output files:**
- `data/training/corpus.jsonl` — One `TrainingExample` per line
- `data/training/corpus.stats.json` — Corpus statistics (counts, poets, etc.)

## Data Format

Each line in the training JSONL:

```json
{
  "input": {
    "couplet_roman": "dil-e-nadaan tujhe hua kya hai",
    "couplet_urdu": "دلِ ناداں تجھے ہوا کیا ہے",
    "couplet_hindi": "दिल-ए-नादाँ तुझे हुआ क्या है",
    "poet": "Mirza Ghalib",
    "ghazal_title": "Dil-e-Nadaan Tujhe Hua Kya Hai",
    "position_in_ghazal": 1
  },
  "output": {
    "translation": "O naive heart, what is it that has come over you?",
    "simple": "Ghalib turns inward and questions his own foolish heart.",
    "detailed": "The address to 'dil-e-nadaan' sets up the whole ghazal as a dialogue between reason and a heart that will not listen.",
    "vocabulary": [
      {"term": "Dil-e-nadaan", "meaning": "Innocent / naive heart"}
    ],
    "literary_devices": [
      {"device": "Personification", "explanation": "The heart is addressed as a separate entity."}
    ],
    "mood": "Wonder & Restlessness"
  }
}
```

## Ethical Scraping

The scraper is designed to be respectful:

- **Rate limiting**: 2–5 second random delay between every request
- **User-Agent**: Identifies as a standard browser
- **Retries**: Exponential backoff on failures (not hammering)
- **Pagination limits**: Won't crawl indefinitely
- **robots.txt**: Please check Rekhta's robots.txt and ToS before running at scale

> ⚠️ This tool is intended for personal research and building a non-commercial educational tool. Always respect website terms of service.

## Directory Structure

```
ml-engine/
├── README.md              ← You are here
└── scraper/
    ├── __init__.py
    ├── requirements.txt   ← Python dependencies
    ├── schema.py          ← Pydantic data models
    ├── rekhta_scraper.py  ← Web scraper
    ├── corpus_builder.py  ← Corpus builder
    └── data/
        ├── raw/           ← Scraped JSONL (gitignored)
        └── training/      ← Clean training data (gitignored)
```

## Next Steps

1. Run the scraper for 5–10 key poets to build the initial corpus
2. Manually review and enrich a subset with `literary_devices` and `mood`
3. Use the corpus for fine-tuning or as RAG context for the meaning engine
4. Add more sources (e.g. Urdu Poetry Archive, kavitakosh.org)
