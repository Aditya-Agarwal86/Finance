"""Data access: wraps the original src.db SQLite layer and pipeline output files."""
import json
import os
from typing import Optional

from src import db

from ..core.config import settings


class EventRepository:
    def __init__(self, db_path: str = None, output_dir=None):
        self.db_path = db_path or settings.db_path
        self.output_dir = output_dir or settings.output_dir

    # --- events -------------------------------------------------------
    def query_events(self, **kw) -> list:
        if not os.path.exists(self.db_path):
            return []
        return db.query_events(db_path=self.db_path, **kw)

    def all_events(self) -> list:
        return self.query_events(limit=100000, sort_by="id_desc")

    def stats(self) -> Optional[dict]:
        if not os.path.exists(self.db_path):
            return None
        return db.get_db_stats(self.db_path)

    def timeline(self) -> dict:
        if not os.path.exists(self.db_path):
            return {"summary": {}, "timeline": []}
        return db.get_historical_timeline(self.db_path)

    def pipeline_runs(self, limit: int = 20) -> list:
        if not os.path.exists(self.db_path):
            return []
        with db.get_connection(self.db_path) as conn:
            rows = conn.execute("SELECT * FROM pipeline_runs ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
        return [dict(r) for r in rows]

    def hierarchy(self) -> list:
        if not os.path.exists(self.db_path):
            return []
        with db.get_connection(self.db_path) as conn:
            rows = conn.execute("SELECT * FROM company_hierarchy").fetchall()
        return [dict(r) for r in rows]

    # --- pipeline output files ---------------------------------------
    def read_json(self, name: str):
        p = os.path.join(self.output_dir, name)
        if not os.path.exists(p):
            return None
        with open(p, encoding="utf-8") as f:
            return json.load(f)

    def output_files(self) -> list:
        out = []
        for name in ["articles_raw.json", "events.json", "events.csv", "company_tree.json",
                     "company_graph.json", "company_tree.png", "dashboard.html",
                     "corporate_events.db", "event_classifier.joblib"]:
            p = os.path.join(self.output_dir, name)
            ex = os.path.exists(p)
            out.append({"name": name, "exists": ex,
                        "size_kb": round(os.path.getsize(p) / 1024, 1) if ex else None,
                        "modified": os.path.getmtime(p) if ex else None})
        return out
