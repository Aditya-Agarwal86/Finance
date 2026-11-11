"""
Corporate Event Miner - runs the full pipeline:
  (a) crawl  ->  (b) classify  ->  (c) extract event info  ->  (d) company/subsidiary tree  ->  (e) executive dashboard  ->  (f) database persistence

Usage:
  python main.py --mode sample          # offline demo with bundled articles
  python main.py --mode live            # crawl real RSS feeds (needs internet)
  python main.py --mode live --per-feed 5
  python main.py --mode sample --retrain
  python main.py --serve                # launch Flask web application
  python main.py --query --company Zenith
  python main.py --query --min-val 1000
"""
import argparse
import csv
import json
import os
import sys
import time

# Ensure UTF-8 output on Windows console
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

from src import classifier, crawler, extractor, dashboard, db
from src.company_tree import CompanyGraph

OUT = "output"


def handle_query_mode(args):
    """Handles terminal-based SQL queries on the historical SQLite database."""
    db_path = f"{OUT}/corporate_events.db"
    if not os.path.exists(db_path):
        print(f"[!] Database not found at {db_path}. Please run 'python main.py --mode sample' first.")
        return

    print(f"\n=======================================================")
    print(f"  🔍 SQL HISTORICAL TIMELINE QUERY RUNNER")
    print(f"  Database: {db_path}")
    print(f"=======================================================\n")

    results = db.query_events(
        company=args.company,
        event_type=args.event_type,
        min_value_usd_m=args.min_val,
        max_value_usd_m=args.max_val,
        status=args.status,
        keyword=args.keyword,
        db_path=db_path
    )

    if not results:
        print("No matching events found in historical database.")
        return

    print(f"Found {len(results)} matching records:\n")
    for r in results:
        val_str = f" | Val: ${r['numeric_value_usd_m']}M ({r['deal_value']})" if r.get('deal_value') else ""
        print(f"• [{r['event_type']}] {r['title']}")
        print(f"   Date: {r.get('event_date')} | Status: {r.get('status')}{val_str}")
        print(f"   Brief: {r.get('event_brief')}\n")

    stats = db.get_db_stats(db_path)
    print(f"Total database footprint: {stats['total_events']} events | {stats['database_size_kb']} KB")


def main():
    start_time = time.time()
    ap = argparse.ArgumentParser(description="Corporate Event Miner - AI-Powered Financial Event Detection")
    ap.add_argument("--mode", choices=["sample", "live"], default="sample")
    ap.add_argument("--per-feed", type=int, default=10)
    ap.add_argument("--retrain", action="store_true", help="retrain classifier")
    ap.add_argument("--serve", action="store_true", help="launch interactive dashboard web app")
    
    # Database query arguments
    ap.add_argument("--query", action="store_true", help="execute SQL query against historical database")
    ap.add_argument("--company", type=str, help="filter by company name")
    ap.add_argument("--event-type", type=str, help="filter by event type (ACQUISITION, MERGER, etc.)")
    ap.add_argument("--min-val", type=float, help="filter by minimum USD valuation in Millions (e.g. 500 for $500M)")
    ap.add_argument("--max-val", type=float, help="filter by maximum USD valuation in Millions")
    ap.add_argument("--status", type=str, help="filter by status (Announced, Completed, Contested)")
    ap.add_argument("--keyword", type=str, help="keyword search across title and brief")
    ap.add_argument("--export-db", action="store_true", help="export database to JSON")
    args = ap.parse_args()

    if args.serve:
        import app as dashboard_app
        dashboard_app.start_server()
        return

    if args.query:
        handle_query_mode(args)
        return

    if args.export_db:
        exp = db.export_to_json(f"{OUT}/events_db_export.json")
        print(f"Exported database to {exp}")
        return

    os.makedirs(OUT, exist_ok=True)

    # (a) crawl
    if args.mode == "live":
        articles = crawler.crawl(per_feed=args.per_feed)
    else:
        articles = crawler.load_sample()
    crawler.save_articles(articles, f"{OUT}/articles_raw.json")
    print(f"\n=======================================================")
    print(f"(a) CRAWL: {len(articles)} articles ingested")
    print(f"=======================================================")

    # (b) classify
    model = classifier.train() if args.retrain or not os.path.exists(classifier.MODEL_PATH) \
        else classifier.load_model()
    articles = classifier.classify(articles, model)
    n_events = sum(a["is_corporate_event"] for a in articles)
    print(f"\n=======================================================")
    print(f"(b) CLASSIFY: {n_events} of {len(articles)} articles classified as corporate events")
    print(f"=======================================================")
    for a in articles:
        if a["is_corporate_event"]:
            print(f"    [EVENT] {a['event_type']:<17} (conf: {a['confidence']:.2f}) | {a['title'][:85]}")

    # (c) extract
    events = extractor.extract_all(articles)
    with open(f"{OUT}/events.json", "w", encoding="utf-8") as f:
        json.dump(events, f, indent=2, ensure_ascii=False)
    
    cols = [
        "event_type", "event_subtype", "acquirer", "target", "seller", "buyer",
        "deal_value", "deal_structure", "event_date", "effective_timeline", "status",
        "event_brief", "companies", "people", "title", "source", "url", "confidence"
    ]

    target_csv = f"{OUT}/events.csv"
    try:
        with open(target_csv, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
            w.writeheader()
            for e in events:
                row = dict(e)
                row["companies"] = "; ".join(c for c in e.get("companies", []) if c)
                row["people"] = "; ".join(f"{p['name']} ({p['change']} {p['role'] or ''})".strip()
                                          for p in e.get("people", []))
                w.writerow(row)
    except PermissionError:
        alt_csv = f"{OUT}/events_latest.csv"
        with open(alt_csv, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
            w.writeheader()
            for e in events:
                row = dict(e)
                row["companies"] = "; ".join(c for c in e.get("companies", []) if c)
                row["people"] = "; ".join(f"{p['name']} ({p['change']} {p['role'] or ''})".strip()
                                          for p in e.get("people", []))
                w.writerow(row)
        target_csv = alt_csv
    
    print(f"\n=======================================================")
    print(f"(c) EXTRACT: {len(events)} structured events extracted -> {target_csv}")
    print(f"=======================================================")
    for e in events:
        who = e["acquirer"] or e["seller"] or (e["companies"][0] if e["companies"] else "N/A")
        tgt = e["target"] or e["buyer"] or ""
        flow = f"{who} -> {tgt}" if tgt else who
        print(f"\n  • [{e['event_type']}: {e['event_subtype']}]")
        print(f"    Parties   : {flow}")
        print(f"    Terms     : {e['deal_value'] or 'N/A'} ({e['deal_structure']})")
        print(f"    Timeline  : Date: {e['event_date']} | Status: {e['status']} | Expected: {e['effective_timeline']}")
        print(f"    Brief     : {e['event_brief']}")

    # (d) tree
    graph = CompanyGraph()
    graph.add_from_articles(articles, events)
    graph.save(OUT)
    print(f"\n=======================================================")
    print(f"(d) TREE: Company / subsidiary hierarchy generated")
    print(f"=======================================================")
    try:
        print(graph.to_text())
    except UnicodeEncodeError:
        print(graph.to_text(ascii_only=True))

    # (e) dashboard
    dash_path = dashboard.generate(articles, events, graph, f"{OUT}/dashboard.html")
    print(f"\n=======================================================")
    print(f"(e) DASHBOARD: Interactive presentation dashboard built")
    print(f"    👉 file:///{os.path.abspath(dash_path).replace(os.sep, '/')}")
    print(f"=======================================================")

    # (f) database persistence
    db_path = f"{OUT}/corporate_events.db"
    ins, upd = db.save_events(events, db_path)
    hier_count = db.save_hierarchy(graph, db_path)
    duration = round(time.time() - start_time, 2)
    db.record_pipeline_run(args.mode, len(articles), len(events), duration, "SUCCESS", db_path=db_path)
    print(f"\n=======================================================")
    print(f"(f) DATABASE: Persisted to SQLite ({ins} new, {upd} updated events | {hier_count} hierarchy links)")
    print(f"    👉 {os.path.abspath(db_path).replace(os.sep, '/')}")
    print(f"=======================================================")

    print(f"\nAll outputs successfully saved to ./{OUT}/ (Duration: {duration}s)")


if __name__ == "__main__":
    main()
