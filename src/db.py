"""
Database Persistence & Historical Timeline Query Engine for Corporate Event Miner.

Provides:
  - SQLite Database schema with WAL (Write-Ahead Logging) mode and foreign keys.
  - Idempotent event upserting with SHA-256 deduplication.
  - Normalized numeric financial valuations ($ USD Millions) for SQL range filtering.
  - Corporate hierarchy relations and historical provenance storage.
  - Execution run audit trail (pipeline_runs).
  - Flexible parameterized queries (company, date range, valuation thresholds, status).
  - Historical timeline aggregation (deals per month/year & capital time-series).
  - Database export to CSV and JSON.
"""
import hashlib
import json
import os
import re
import sqlite3
from datetime import datetime

DEFAULT_DB_PATH = "output/corporate_events.db"


def parse_numeric_usd_m(val_str):
    """
    Normalizes multi-currency financial valuations into USD Millions for SQL numeric queries.
    Examples:
      '$2.1 billion'   -> 2100.0
      '$450 million'   -> 450.0
      'Rs 3,500 crore' -> 420.0 (using standard conversion ~ $120k per crore)
      '₹2,400 crore'   -> 288.0
      'EUR 600 million'-> 650.0
      '£350 million'   -> 440.0
    """
    if not val_str:
        return None
    v = val_str.replace(",", "").strip().lower()

    # USD Billions
    m_usd_b = re.search(r"(?:\$|usd|us\$)\s*(\d+(?:\.\d+)?)\s*(?:billion|bn)", v)
    if m_usd_b:
        return round(float(m_usd_b.group(1)) * 1000.0, 2)

    # USD Millions
    m_usd_m = re.search(r"(?:\$|usd|us\$)\s*(\d+(?:\.\d+)?)\s*(?:million|mn)", v)
    if m_usd_m:
        return round(float(m_usd_m.group(1)), 2)

    # INR Crores
    m_inr_cr = re.search(r"(?:rs\.?|₹|inr)\s*(\d+(?:\.\d+)?)\s*(?:crore|cr)", v)
    if m_inr_cr:
        return round(float(m_inr_cr.group(1)) * 0.12, 2)

    # EUR Millions
    m_eur_m = re.search(r"(?:eur|€)\s*(\d+(?:\.\d+)?)\s*(?:million|mn)", v)
    if m_eur_m:
        return round(float(m_eur_m.group(1)) * 1.08, 2)

    # GBP Millions
    m_gbp_m = re.search(r"(?:gbp|£)\s*(\d+(?:\.\d+)?)\s*(?:million|mn)", v)
    if m_gbp_m:
        return round(float(m_gbp_m.group(1)) * 1.28, 2)

    return None


def compute_event_hash(event):
    """Generates a stable unique hash to prevent duplicate entries on successive crawls."""
    title = (event.get("title") or "").strip().lower()
    etype = (event.get("event_type") or "").strip().lower()
    date_str = (event.get("event_date") or "").strip().lower()
    key = f"{etype}::{title}::{date_str}"
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def get_connection(db_path=DEFAULT_DB_PATH):
    """Establishes SQLite connection with WAL mode and row dictionary support."""
    os.makedirs(os.path.dirname(db_path) if os.path.dirname(db_path) else ".", exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def init_db(db_path=DEFAULT_DB_PATH):
    """Initializes tables, unique constraints, and search indexes."""
    with get_connection(db_path) as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_hash TEXT UNIQUE NOT NULL,
                event_type TEXT NOT NULL,
                event_subtype TEXT,
                title TEXT NOT NULL,
                acquirer TEXT,
                target TEXT,
                seller TEXT,
                buyer TEXT,
                deal_value TEXT,
                numeric_value_usd_m REAL,
                deal_structure TEXT,
                event_date TEXT,
                effective_timeline TEXT,
                status TEXT,
                confidence REAL,
                event_brief TEXT,
                key_highlights TEXT,
                companies TEXT,
                people TEXT,
                raw_text_snippet TEXT,
                source TEXT,
                url TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
            CREATE INDEX IF NOT EXISTS idx_events_val ON events(numeric_value_usd_m);
            CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);
            CREATE INDEX IF NOT EXISTS idx_events_acq ON events(acquirer);
            CREATE INDEX IF NOT EXISTS idx_events_tgt ON events(target);
            CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);

            CREATE TABLE IF NOT EXISTS company_hierarchy (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                parent_company TEXT NOT NULL,
                child_company TEXT NOT NULL,
                relation TEXT NOT NULL,
                stake_pct REAL,
                former_parent TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(parent_company, child_company, relation)
            );

            CREATE INDEX IF NOT EXISTS idx_hier_parent ON company_hierarchy(parent_company);
            CREATE INDEX IF NOT EXISTS idx_hier_child ON company_hierarchy(child_company);

            CREATE TABLE IF NOT EXISTS pipeline_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                mode TEXT NOT NULL,
                articles_count INTEGER DEFAULT 0,
                events_count INTEGER DEFAULT 0,
                duration_sec REAL,
                status TEXT,
                log_snippet TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
    return db_path


def save_events(events, db_path=DEFAULT_DB_PATH):
    """
    Inserts or updates events into the database.
    Returns (inserted_count, updated_count).
    """
    init_db(db_path)
    inserted = 0
    updated = 0

    with get_connection(db_path) as conn:
        cur = conn.cursor()
        for e in events:
            h = compute_event_hash(e)
            num_val = parse_numeric_usd_m(e.get("deal_value"))
            companies_json = json.dumps(e.get("companies") or [], ensure_ascii=False)
            people_json = json.dumps(e.get("people") or [], ensure_ascii=False)
            highlights_json = json.dumps(e.get("key_highlights") or [], ensure_ascii=False)

            # Check if exists
            cur.execute("SELECT id FROM events WHERE event_hash = ?", (h,))
            row = cur.fetchone()

            if row:
                cur.execute("""
                    UPDATE events SET
                        event_type = ?, event_subtype = ?, title = ?,
                        acquirer = ?, target = ?, seller = ?, buyer = ?,
                        deal_value = ?, numeric_value_usd_m = ?, deal_structure = ?,
                        event_date = ?, effective_timeline = ?, status = ?,
                        confidence = ?, event_brief = ?, key_highlights = ?,
                        companies = ?, people = ?, raw_text_snippet = ?,
                        source = ?, url = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE event_hash = ?
                """, (
                    e.get("event_type"), e.get("event_subtype"), e.get("title"),
                    e.get("acquirer"), e.get("target"), e.get("seller"), e.get("buyer"),
                    e.get("deal_value"), num_val, e.get("deal_structure"),
                    e.get("event_date"), e.get("effective_timeline"), e.get("status"),
                    e.get("confidence"), e.get("event_brief") or e.get("summary"),
                    highlights_json, companies_json, people_json,
                    e.get("raw_text_snippet"), e.get("source"), e.get("url"), h
                ))
                updated += 1
            else:
                cur.execute("""
                    INSERT INTO events (
                        event_hash, event_type, event_subtype, title,
                        acquirer, target, seller, buyer,
                        deal_value, numeric_value_usd_m, deal_structure,
                        event_date, effective_timeline, status,
                        confidence, event_brief, key_highlights,
                        companies, people, raw_text_snippet,
                        source, url
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    h, e.get("event_type"), e.get("event_subtype"), e.get("title"),
                    e.get("acquirer"), e.get("target"), e.get("seller"), e.get("buyer"),
                    e.get("deal_value"), num_val, e.get("deal_structure"),
                    e.get("event_date"), e.get("effective_timeline"), e.get("status"),
                    e.get("confidence"), e.get("event_brief") or e.get("summary"),
                    highlights_json, companies_json, people_json,
                    e.get("raw_text_snippet"), e.get("source"), e.get("url")
                ))
                inserted += 1

        conn.commit()

    return inserted, updated


def save_hierarchy(graph_or_tree_json, db_path=DEFAULT_DB_PATH):
    """Saves parent-child subsidiary ownership links and historical provenance."""
    init_db(db_path)
    count = 0

    tree_data = graph_or_tree_json if isinstance(graph_or_tree_json, list) else graph_or_tree_json.to_json()

    with get_connection(db_path) as conn:
        cur = conn.cursor()
        for root in tree_data:
            parent_name = root.get("company")
            for sub in root.get("subsidiaries") or []:
                child_name = sub.get("company")
                rel = sub.get("relation") or "subsidiary"
                pct = float(sub.get("pct")) if sub.get("pct") else None
                former = sub.get("former_parent")

                cur.execute("""
                    INSERT INTO company_hierarchy (parent_company, child_company, relation, stake_pct, former_parent, updated_at)
                    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(parent_company, child_company, relation) DO UPDATE SET
                        stake_pct = excluded.stake_pct,
                        former_parent = excluded.former_parent,
                        updated_at = CURRENT_TIMESTAMP
                """, (parent_name, child_name, rel, pct, former))
                count += 1
        conn.commit()

    return count


def record_pipeline_run(mode, articles_count, events_count, duration_sec, status="SUCCESS", log="", db_path=DEFAULT_DB_PATH):
    """Logs pipeline execution telemetry for auditability."""
    init_db(db_path)
    with get_connection(db_path) as conn:
        conn.execute("""
            INSERT INTO pipeline_runs (mode, articles_count, events_count, duration_sec, status, log_snippet)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (mode, articles_count, events_count, duration_sec, status, log[:1000] if log else ""))
        conn.commit()


def query_events(
    company=None,
    event_type=None,
    min_value_usd_m=None,
    max_value_usd_m=None,
    status=None,
    keyword=None,
    sort_by="val_desc",
    limit=100,
    offset=0,
    db_path=DEFAULT_DB_PATH
):
    """
    Executes flexible parameterized SQL queries with timeline & financial filtering.
    """
    init_db(db_path)
    sql = ["SELECT * FROM events WHERE 1=1"]
    params = []

    if company:
        sql.append("""
            AND (acquirer LIKE ? OR target LIKE ? OR seller LIKE ? OR buyer LIKE ? 
                 OR companies LIKE ?)
        """)
        c_param = f"%{company}%"
        params.extend([c_param, c_param, c_param, c_param, c_param])

    if event_type and event_type != "ALL":
        sql.append("AND event_type = ?")
        params.append(event_type)

    if min_value_usd_m is not None:
        sql.append("AND numeric_value_usd_m >= ?")
        params.append(float(min_value_usd_m))

    if max_value_usd_m is not None:
        sql.append("AND numeric_value_usd_m <= ?")
        params.append(float(max_value_usd_m))

    if status and status != "ALL":
        sql.append("AND status LIKE ?")
        params.append(f"%{status}%")

    if keyword:
        sql.append("""
            AND (title LIKE ? OR event_brief LIKE ? OR key_highlights LIKE ? 
                 OR raw_text_snippet LIKE ?)
        """)
        k_param = f"%{keyword}%"
        params.extend([k_param, k_param, k_param, k_param])

    # Sorting
    if sort_by == "val_desc":
        sql.append("ORDER BY numeric_value_usd_m DESC NULLS LAST, id DESC")
    elif sort_by == "val_asc":
        sql.append("ORDER BY numeric_value_usd_m ASC NULLS LAST, id DESC")
    elif sort_by == "conf_desc":
        sql.append("ORDER BY confidence DESC, id DESC")
    elif sort_by == "date_desc":
        sql.append("ORDER BY event_date DESC, id DESC")
    else:
        sql.append("ORDER BY id DESC")

    sql.append("LIMIT ? OFFSET ?")
    params.extend([limit, offset])

    full_query = " ".join(sql)

    with get_connection(db_path) as conn:
        rows = conn.execute(full_query, params).fetchall()
        results = []
        for r in rows:
            d = dict(r)
            d["companies"] = json.loads(d["companies"]) if d.get("companies") else []
            d["people"] = json.loads(d["people"]) if d.get("people") else []
            d["key_highlights"] = json.loads(d["key_highlights"]) if d.get("key_highlights") else []
            results.append(d)

    return results


def get_historical_timeline(db_path=DEFAULT_DB_PATH):
    """
    Aggregates historical time-series data for analytics charts and timeline inspection.
    """
    init_db(db_path)
    with get_connection(db_path) as conn:
        rows = conn.execute("""
            SELECT 
                COALESCE(event_date, 'Undated') AS timeline_period,
                event_type,
                COUNT(*) AS event_count,
                ROUND(SUM(COALESCE(numeric_value_usd_m, 0)), 2) AS total_val_usd_m
            FROM events
            GROUP BY timeline_period, event_type
            ORDER BY total_val_usd_m DESC
        """).fetchall()

        timeline = [dict(r) for r in rows]

        # Overall summary
        summary = conn.execute("""
            SELECT 
                COUNT(*) AS total_records,
                ROUND(SUM(COALESCE(numeric_value_usd_m, 0)), 2) AS total_capital_usd_m,
                COUNT(DISTINCT event_type) AS distinct_event_types,
                COUNT(DISTINCT acquirer) + COUNT(DISTINCT target) AS total_entity_roles
            FROM events
        """).fetchone()

    return {
        "summary": dict(summary) if summary else {},
        "timeline": timeline
    }


def get_db_stats(db_path=DEFAULT_DB_PATH):
    """Returns database telemetry and health stats."""
    init_db(db_path)
    with get_connection(db_path) as conn:
        events_count = conn.execute("SELECT COUNT(*) FROM events").fetchone()[0]
        hier_count = conn.execute("SELECT COUNT(*) FROM company_hierarchy").fetchone()[0]
        runs_count = conn.execute("SELECT COUNT(*) FROM pipeline_runs").fetchone()[0]
        total_cap = conn.execute("SELECT ROUND(SUM(COALESCE(numeric_value_usd_m, 0)), 1) FROM events").fetchone()[0] or 0.0

        latest_run = conn.execute("SELECT * FROM pipeline_runs ORDER BY id DESC LIMIT 1").fetchone()

        db_size_kb = round(os.path.getsize(db_path) / 1024, 2) if os.path.exists(db_path) else 0

    return {
        "database_file": db_path,
        "database_size_kb": db_size_kb,
        "total_events": events_count,
        "total_hierarchy_relations": hier_count,
        "total_capital_usd_m": total_cap,
        "total_pipeline_runs": runs_count,
        "latest_run": dict(latest_run) if latest_run else None
    }


def export_to_json(out_path="output/events_db_export.json", db_path=DEFAULT_DB_PATH):
    """Exports all stored database events to a portable JSON file."""
    events = query_events(limit=10000, db_path=db_path)
    os.makedirs(os.path.dirname(out_path) if os.path.dirname(out_path) else ".", exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(events, f, indent=2, ensure_ascii=False)
    return out_path
