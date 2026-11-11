# Architecture

```
frontend/ (React 19, TS, Vite, Tailwind 4, Recharts, React Flow, TanStack Query, lucide)
   └─ src/lib/api.ts  ← single REST client (VITE_API_URL)
backend/app/ (FastAPI)
   ├─ main.py            app, CORS, uniform error handlers {error:{code,message,details}}
   ├─ api/routes/        core.py (health, companies, search, events, analytics, analysis), scraping.py
   ├─ api/deps.py        dependency injection (repo, services)
   ├─ services/          company, financial, graph, nlp, scraping (background jobs), analytics
   ├─ repositories/      EventRepository → wraps src.db + output/*.json
   ├─ schemas/           Pydantic request/response models
   └─ core/              config (env), logging
src/ + main.py           ORIGINAL pipeline, unchanged
output/                  SQLite DB, JSON/CSV artifacts, model (original locations)
```

**Key decisions**
- *Reuse, don't rewrite:* the pipeline runs as the original `main.py` subprocess (same as the old Flask `/api/run`) inside a
  background thread; stages are inferred from its stage markers. One job at a time (409 otherwise). No Redis/Celery.
- *Companies are derived:* the pipeline is event-centric, so `CompanyService` aggregates stored events by canonical company name
  (`src.extractor.canonical`). Nothing is stored or invented beyond the original DB.
- *Graph:* served from `output/company_graph.json` produced by the original `CompanyGraph`.
- *Financials:* from `numeric_value_usd_m` (original `parse_numeric_usd_m`, fixed FX rates). Undisclosed → `null`, shown as “Not disclosed”.
- *Job state* is in memory (lost on backend restart); pipeline history persists in `pipeline_runs`.
