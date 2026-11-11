# Migration Report

**Unchanged:** `src/*`, `main.py`, `app.py`, `test_pipeline.py`, `data/`, DB schema, all output formats.
**Added:** `backend/` (FastAPI), `frontend/` (React), `start-*.cmd`, docs. README renamed to `README_ORIGINAL.md`.
**Other:** `.gitignore` extended (node_modules, dist, SQLite WAL files). `output/corporate_events.db` was touched by baseline/test runs (idempotent upserts + `pipeline_runs` rows).

**Behavior changes**
- Pipeline execution is now asynchronous (job id + polling) instead of one blocking request.
- Errors use one JSON envelope; inputs validated with Pydantic.
- A “company” view is derived from events (new; the original had none).

**Not done / deliberately skipped:** shadcn/ui (custom Tailwind components used instead); Presentation Mode and raw-data workspaces (see FEATURE_PARITY.md); authentication; persistence of job state across restarts.

**Known limitations**
- No per-company market financials exist in the source pipeline; the UI shows only deal values extracted from text.
- Live crawl produces few events and some false positives (pre-existing classifier behavior; e.g. a stock “Sell” headline → DIVESTITURE).
- Frontend bundle is ~920 KB (275 KB gzip), not code-split.
- Frontend has no automated tests; it was verified manually in a browser (below).

**Verification performed**
- Original tests: 7/7 pass. Backend: 12/12 pass (includes a real sample pipeline job).
- Browser: dashboard, company search, company profile (charts, NLP analysis, ego-graph), full graph (click highlight), analytics, pipeline run via UI (all stages completed), live feed check (5/5 reachable), mobile layout of dashboard.
- Live scrape via API: completed, 15 articles → 1 event (false positive). `output/` was then restored to the sample dataset.
- Not browser-tested: the “Analyze an article” form UI (endpoint is API-tested) and the Live-mode toggle in the UI.
