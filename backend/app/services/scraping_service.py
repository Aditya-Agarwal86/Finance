"""Runs the ORIGINAL pipeline (main.py) as a background job and tracks status.

The pipeline is executed unchanged as a subprocess (same as the original Flask app did), so
scraping / classification / extraction / graph logic is exactly the original code.
Single-process in-memory job registry; one job at a time.
"""
import logging
import os
import subprocess
import sys
import threading
import time
import urllib.robotparser
import uuid
from urllib.parse import urlparse

from ..core.config import settings

log = logging.getLogger("scraping")

STAGE_MARKERS = [
    ("(a) CRAWL", "ingest"), ("(b) CLASSIFY", "classify"), ("(c) EXTRACT", "extract"),
    ("(d) TREE", "graph"), ("(e) DASHBOARD", "compile"), ("(f) DATABASE", "persist"),
]
STAGES = [("ingest", "Article Ingestion"), ("classify", "Classification"), ("extract", "Event Extraction"),
          ("graph", "Relationship Mapping"), ("compile", "Output Generation"), ("persist", "Database Persistence")]


class JobConflict(Exception):
    pass


class ScrapingService:
    def __init__(self):
        self.jobs = {}
        self._lock = threading.Lock()

    def active(self):
        return next((j for j in self.jobs.values() if j["status"] in ("queued", "running")), None)

    def start(self, mode: str, per_feed: int, retrain: bool) -> dict:
        with self._lock:
            if self.active():
                raise JobConflict("A pipeline job is already running")
            job_id = uuid.uuid4().hex[:12]
            job = {
                "job_id": job_id, "status": "queued", "mode": mode, "per_feed": per_feed, "retrain": retrain,
                "created_at": time.time(), "started_at": None, "finished_at": None,
                "current_stage": None, "completed_stages": [],
                "stages": [{"id": i, "name": n, "status": "pending"} for i, n in STAGES],
                "logs": [], "error": None, "return_code": None,
            }
            self.jobs[job_id] = job
        threading.Thread(target=self._run, args=(job,), daemon=True).start()
        return job

    def _set_stage(self, job, stage_id):
        for s in job["stages"]:
            if s["id"] == job["current_stage"] and s["status"] == "running":
                s["status"] = "completed"
        job["current_stage"] = stage_id
        for s in job["stages"]:
            if s["id"] == stage_id:
                s["status"] = "running"

    def _run(self, job):
        cmd = [sys.executable, "main.py", "--mode", job["mode"], "--per-feed", str(job["per_feed"])]
        if job["retrain"]:
            cmd.append("--retrain")
        job["status"], job["started_at"] = "running", time.time()
        job["current_stage"] = "ingest"
        job["stages"][0]["status"] = "running"
        log.info("job %s: %s", job["job_id"], " ".join(cmd))
        try:
            env = {**os.environ, "PYTHONWARNINGS": "ignore", "PYTHONUNBUFFERED": "1", "PYTHONIOENCODING": "utf-8", "MPLBACKEND": "Agg"}
            proc = subprocess.Popen(cmd, cwd=str(settings.repo_root), env=env, stdout=subprocess.PIPE,
                                    stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace")
            deadline = time.time() + settings.pipeline_timeout_sec
            timer = threading.Timer(settings.pipeline_timeout_sec, proc.kill)
            timer.start()
            for line in proc.stdout:
                line = line.rstrip()
                if not line.strip() or set(line.strip()) == {"="}:
                    continue
                level = "ERROR" if ("Traceback" in line or "Error" in line or "! " in line) else "INFO"
                job["logs"].append({"t": time.strftime("%H:%M:%S"), "level": level, "message": line[:300]})
                job["logs"] = job["logs"][-400:]
                for marker, sid in STAGE_MARKERS:
                    if marker in line:
                        # marker lines are printed AFTER the stage finishes -> mark it done, start next
                        for s in job["stages"]:
                            if s["id"] == sid:
                                s["status"] = "completed"
                        idx = [i for i, _ in STAGES].index(sid)
                        if idx + 1 < len(STAGES):
                            nxt = STAGES[idx + 1][0]
                            job["current_stage"] = nxt
                            job["stages"][idx + 1]["status"] = "running"
            proc.wait()
            timer.cancel()
            job["return_code"] = proc.returncode
            if proc.returncode == 0:
                job["status"] = "completed"
                job["current_stage"] = None
                for s in job["stages"]:
                    s["status"] = "completed"
            else:
                job["status"] = "failed"
                job["error"] = f"Pipeline exited with code {proc.returncode}" + (
                    " (timeout)" if time.time() > deadline else "")
                for s in job["stages"]:
                    if s["status"] == "running":
                        s["status"] = "failed"
        except Exception as exc:  # noqa
            log.exception("job failed")
            job["status"], job["error"] = "failed", str(exc)
        finally:
            job["finished_at"] = time.time()

    def get(self, job_id):
        return self.jobs.get(job_id)

    def list(self):
        return sorted(self.jobs.values(), key=lambda j: j["created_at"], reverse=True)

    def check_sources(self):
        """Same checks as the original /api/health/check-sources (robots.txt + HTTP + RSS parse)."""
        import feedparser
        import requests
        from src import crawler

        results = []
        for name, url in crawler.FEEDS.items():
            r = {"name": name, "url": url, "http_status": None, "reachable": False,
                 "articles_available": 0, "robots": "unknown", "error": None}
            try:
                parts = urlparse(url)
                rp = urllib.robotparser.RobotFileParser()
                rp.set_url(f"{parts.scheme}://{parts.netloc}/robots.txt")
                rp.read()
                r["robots"] = "allowed" if rp.can_fetch(crawler.USER_AGENT, url) else "disallowed"
            except Exception:
                r["robots"] = "unknown"
            try:
                resp = requests.get(url, headers=crawler.HEADERS, timeout=6)
                r["http_status"] = resp.status_code
                if resp.status_code == 200:
                    r["reachable"] = True
                    r["articles_available"] = len(feedparser.parse(resp.content).entries)
                else:
                    r["error"] = f"HTTP {resp.status_code}"
            except Exception as exc:  # noqa
                r["error"] = str(exc)[:200]
            results.append(r)
        return results
