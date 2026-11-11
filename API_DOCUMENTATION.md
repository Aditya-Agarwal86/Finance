# API (base `/api/v1`, interactive docs at `http://localhost:8000/docs`)

Errors: `{"error":{"code":"not_found|validation_error|job_running|internal_error|http_error","message":"…","details":…}}`
(404, 409, 422, 500).

| Method & path | Description |
|---|---|
| `GET /health` | `{status, version, database_available, events, pipeline_busy}` |
| `GET /system/status` | DB stats + output file inventory |
| `GET /system/model-evaluation` | Hold-out evaluation of the classifier (accuracy, P/R/F1, confusion matrix) |
| `GET /companies` | Query: `q, event_type, status, min_value_usd_m, max_value_usd_m, sort=events\|value\|name\|recent, limit(1-200), offset` → `{total, items[]}` |
| `GET /companies/{id}` | Aggregate + all events + people |
| `GET /companies/{id}/financials` | Deal list, capital deployed/received (null if undisclosed) |
| `GET /companies/{id}/analysis` | Per-event NLP output: subtype, confidence, brief, highlights, source |
| `GET /companies/{id}/relationships?depth=1-3` | Ego-graph `{center,nodes,edges}` |
| `GET /relationships` | Full company graph |
| `POST /search` | Body `{query, event_type, status, min_value_usd_m, max_value_usd_m, sort, limit, offset}` → matching companies + events |
| `GET /events` | Filter events (`company, event_type, status, keyword, min/max value, sort, limit, offset`) |
| `GET /analytics/overview` | Totals, by type/status/source, capital by type, monthly timeline, leaders, recent events & runs |
| `POST /analysis/text` | `{title, text}` → live classification + extracted event + mined relationships |
| `POST /scraping/run` | `{mode: sample\|live, per_feed(1-50), retrain}` → **202** job; 409 if one is running |
| `GET /scraping/status/{job_id}` | `{status: queued\|running\|completed\|failed, stages[], logs[], error}` |
| `GET /scraping/jobs` | Jobs in this process |
| `GET /scraping/sources` | Live robots.txt + HTTP + RSS check of each feed |

Example `GET /companies/atlas-logistics/financials` (sample data):
```json
{"company_id":"atlas-logistics","total_deal_value_usd_m":95.0,"capital_deployed_usd_m":95.0,"capital_received_usd_m":null,
 "deal_count":1,"deals_with_disclosed_value":1,"deals":[{"title":"Atlas Logistics completes acquisition of Harbor Shipping","role":"acquirer","value_usd_m":95.0,"status":"Completed"}]}
```
Values are USD millions; INR crore→×0.12, EUR→×1.08, GBP→×1.28 (original fixed rates).

Note: GET /events returns {total, limit, offset, items}; sort=date_desc orders by parsed date (undated last).
