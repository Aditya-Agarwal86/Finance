# Demo Guide

Video walkthrough: _YouTube link coming soon_ (see README).

Pre-generated sample output is committed in `output/`, so everything is populated on first start. News Feed and Settings (data sources) pages are included in the tour below.

1. Start: `.\start-backend.cmd` (wait for “Application startup complete”), then `.\start-frontend.cmd`; open http://localhost:5173. The sidebar shows **API online**.
2. **Dashboard** – totals, event mix, recent events.3. **Companies** – search “Atlas”; try filters (event type, ≥ $500M); open **Atlas Logistics**.
4. **Profile** – deal chart, NLP brief/highlights/confidence, and the ownership ego-graph (click nodes).
5. **Relationship Graph** – click a node, read evidence in the side panel; scroll to zoom.
6. **Analytics** – capital by type, comparison, monthly activity, classifier metrics (undisclosed values are excluded, not zero).
7. **Scrape & Analyze** – *Run pipeline* (Sample) and watch stages/logs; *Check live feeds* (real network); paste a headline into *Analyze an article*, e.g.
   “Acme Corp to acquire Beta Ltd for $500 million”.
8. Live mode (optional): reliability depends on external sites; expect few events.

Tips: run the sample pipeline once before recording to warm the classifier. Restore sample data with `git checkout output` if a live run replaced it.
API docs: http://localhost:8000/docs.

Pipeline jobs run on the backend: you can leave the Scrape & Analyze tab (a 'Running' badge shows in the sidebar) and return later; the page re-attaches to the job.
