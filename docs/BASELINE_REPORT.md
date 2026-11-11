# Baseline Report (before any change)

**Stack:** Python 3.13, Flask, scikit-learn, NetworkX, feedparser/BeautifulSoup, SQLite (WAL), matplotlib. Dashboard is a
~220 KB generated, self-contained HTML (`src/dashboard.py`) served by Flask (`app.py`). Pipeline CLI: `main.py`.

**Pipeline:** crawl (5 RSS feeds + article text, robots.txt-aware) → classify (TF-IDF+LR + headline rules/guards, 7 classes) →
extract (regex NLP: parties, value, date, timeline, executives, brief) → `CompanyGraph` (NetworkX ownership patterns + deal events) →
dashboard HTML / PNG / JSON / CSV → SQLite (`events`, `company_hierarchy`, `pipeline_runs`).

**Original Flask routes:** `/`, static `output/*`, `GET /api/health`, `/api/health/check-sources`, `/api/health/evaluate-model`, `POST /api/run`.
**CLI:** `--mode sample|live`, `--per-feed`, `--retrain`, `--serve`, `--query` filters, `--export-db`.
**Env vars:** none used by the project.

**Results:** deps installed OK; `test_pipeline.py` 7/7 pass; `main.py --mode sample` → 24 articles, 20 events, 11 hierarchy links, 8.6 s.
All 5 RSS feeds reachable at test time (SEC robots.txt disallows the feed path).

**Pre-existing limitations (not regressions):**
- Data is event-centric; there are no per-company market financials (revenue, EPS, price). Only deal values extracted from text.
- Live crawl yields few events with false positives: in a live test of 15 articles, 1 was flagged as DIVESTITURE for a headline about a stock “Sell” recommendation (headline rule in `classifier.py`).
- `src/dashboard.py` emits `SyntaxWarning: invalid escape sequence '\$'` (harmless).
- 11/20 sample events have no extractable date (“2026” only or absent); the extractor’s dates are free text.
- Original `/api/run` blocked the request until the pipeline finished (180 s timeout).
