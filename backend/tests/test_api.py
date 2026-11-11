"""API tests against the real project data (output/corporate_events.db) and real pipeline."""
import time

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
V = "/api/v1"


def test_health():
    r = client.get(f"{V}/health")
    assert r.status_code == 200
    b = r.json()
    assert b["status"] == "ok" and b["database_available"] and b["events"] > 0


def test_companies_list_and_search():
    r = client.get(f"{V}/companies?limit=5")
    assert r.status_code == 200 and r.json()["total"] > 0 and len(r.json()["items"]) <= 5
    r = client.get(f"{V}/companies?q=zenith")
    assert any("Zenith" in c["name"] for c in r.json()["items"])
    assert client.get(f"{V}/companies?limit=0").status_code == 422
    assert client.get(f"{V}/companies?sort=bogus").status_code == 422


def test_company_detail_financials_analysis_relationships():
    cid = client.get(f"{V}/companies?q=zenith").json()["items"][0]["id"]
    d = client.get(f"{V}/companies/{cid}").json()
    assert d["events"] and d["id"] == cid
    f = client.get(f"{V}/companies/{cid}/financials").json()
    assert f["deal_count"] == len(f["deals"])
    for deal in f["deals"]:  # missing value must be null, not 0
        assert deal["value_usd_m"] is None or deal["value_usd_m"] > 0
    a = client.get(f"{V}/companies/{cid}/analysis").json()
    assert a["analyses"][0]["brief"]
    g = client.get(f"{V}/companies/{cid}/relationships").json()
    assert "nodes" in g and "edges" in g


def test_company_404_consistent_error():
    r = client.get(f"{V}/companies/does-not-exist")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "not_found"
    assert client.get(f"{V}/companies/does-not-exist/financials").status_code == 404


def test_search_validation():
    assert client.post(f"{V}/search", json={"query": "x", "limit": 9999}).status_code == 422
    r = client.post(f"{V}/search", json={"query": "zenith"})
    assert r.status_code == 200 and r.json()["companies"]["total"] >= 1


def test_events_and_overview():
    assert client.get(f"{V}/events?limit=3").json()["items"]
    o = client.get(f"{V}/analytics/overview").json()
    assert o["totals"]["events"] > 0 and o["events_by_type"]


def test_full_graph_has_real_edges():
    g = client.get(f"{V}/relationships").json()
    assert g["nodes"] and g["edges"]
    ids = {n["company_id"] for n in g["nodes"]}
    for e in g["edges"]:
        assert e["source_company_id"] in ids and e["target_company_id"] in ids


def test_nlp_analyze_text():
    r = client.post(f"{V}/analysis/text", json={
        "title": "Zenith Motors to acquire Orion Steel for $2.1 billion",
        "text": "Zenith Motors agreed to acquire Orion Steel Corp for $2.1 billion on 14 March 2026."})
    assert r.status_code == 200
    b = r.json()
    assert b["classification"]["event_type"] == "ACQUISITION"
    assert b["events"][0]["deal_value"] == "$2.1 billion"
    assert client.post(f"{V}/analysis/text", json={"title": "x"}).status_code == 422


def test_non_event_text_suppressed():
    r = client.post(f"{V}/analysis/text", json={"title": "Sensex and Nifty rally 400 points",
                                                "text": "Indian equities rallied today."})
    assert r.json()["classification"]["is_corporate_event"] is False and r.json()["events"] == []


def test_model_evaluation():
    r = client.get(f"{V}/system/model-evaluation").json()
    assert r["status"] == "ok" and 0 < r["accuracy"] <= 1


def test_scraping_job_sample_mode_end_to_end():
    r = client.post(f"{V}/scraping/run", json={"mode": "sample"})
    assert r.status_code == 202
    job_id = r.json()["job_id"]
    # concurrent job rejected
    assert client.post(f"{V}/scraping/run", json={"mode": "sample"}).status_code in (409, 202)
    for _ in range(120):
        j = client.get(f"{V}/scraping/status/{job_id}").json()
        if j["status"] in ("completed", "failed"):
            break
        time.sleep(1)
    assert j["status"] == "completed", j
    assert all(s["status"] == "completed" for s in j["stages"])
    assert client.get(f"{V}/scraping/status/nope").status_code == 404


def test_scrape_validation():
    assert client.post(f"{V}/scraping/run", json={"mode": "bogus"}).status_code == 422
