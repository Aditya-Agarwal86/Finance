# Event Miner — Financial Intelligence Platform

Corporate-event intelligence: news is crawled, classified (TF-IDF + Logistic Regression), structured by an NLP extractor
(acquirer/target/value/timeline/executives) and turned into a company ownership graph.
This version wraps the **original, unchanged pipeline** (`src/`, `main.py`) in a **FastAPI REST API** and a modern
**React + TypeScript** frontend. The original Flask dashboard (`app.py`) is kept for reference; see
[README_ORIGINAL.md](README_ORIGINAL.md).

```
React (Vite) ──REST──▶ FastAPI services ──▶ original src/ (crawler, classifier, extractor, company_tree, db) ──▶ SQLite + output/
```

## Requirements
Python 3.10+ (tested 3.13), Node 18+ (tested 24). No API keys or secrets are needed.

## Setup (once)
```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r backend\requirements.txt
cd frontend; npm install; cd ..
```

## Run (two terminals, from repo root)
```powershell
# Terminal 1 – backend  → http://localhost:8000  (Swagger: /docs)
.\start-backend.cmd
# Terminal 2 – frontend → http://localhost:5173
.\start-frontend.cmd
```
Equivalent manual commands: `python -m uvicorn app.main:app --app-dir backend --port 8000` and `cd frontend && npm run dev`.

## Configuration (all optional)
| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_URL` (frontend `.env`) | `http://localhost:8000` | Backend URL |
| `CEM_CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173` | Allowed origins |
| `CEM_OUTPUT_DIR` / `CEM_DB_PATH` | `output/` | Pipeline outputs / SQLite file |
| `CEM_PIPELINE_TIMEOUT` | `900` | Max seconds per pipeline job |
| `CEM_LOG_LEVEL` | `INFO` | Logging |

## Tests
```powershell
cd backend; ..\.venv\Scripts\python -m pytest tests -q   # 12 API tests (real data + real pipeline run)
cd ..; .\.venv\Scripts\python -m unittest test_pipeline  # 7 original tests
```

## Data note
“Live” mode crawls real RSS feeds (BBC, SEC, Economic Times, Moneycontrol, Livemint). “Offline” mode uses the
articles bundled in `data/`.

More: [ARCHITECTURE.md](ARCHITECTURE.md) · [API_DOCUMENTATION.md](API_DOCUMENTATION.md) · [MIGRATION_REPORT.md](MIGRATION_REPORT.md) · [FEATURE_PARITY.md](FEATURE_PARITY.md) · [DEMO_GUIDE.md](DEMO_GUIDE.md) · [BASELINE_REPORT.md](BASELINE_REPORT.md)
