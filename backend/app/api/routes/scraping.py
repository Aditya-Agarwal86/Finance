from fastapi import APIRouter, Depends, HTTPException

from ...schemas import ScrapeRequest
from ...services.scraping_service import JobConflict, ScrapingService
from ..deps import get_scraping

router = APIRouter(prefix="/scraping", tags=["scraping"])


@router.post("/run", status_code=202)
def run(req: ScrapeRequest, svc: ScrapingService = Depends(get_scraping)):
    try:
        return svc.start(req.mode, req.per_feed, req.retrain)
    except JobConflict as e:
        raise HTTPException(status_code=409, detail={"code": "job_running", "message": str(e)})


@router.get("/status/{job_id}")
def status(job_id: str, svc: ScrapingService = Depends(get_scraping)):
    j = svc.get(job_id)
    if not j:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": f"Job '{job_id}' not found"})
    return j


@router.get("/jobs")
def jobs(svc: ScrapingService = Depends(get_scraping)):
    return {"items": svc.list()}


@router.get("/feeds")
def feeds():
    """Static, read-only list of configured news sources and crawler policy (no network calls)."""
    from urllib.parse import urlparse
    from src import crawler
    return {
        "sources": [{"name": n, "url": u, "domain": urlparse(u).netloc, "type": "RSS feed + article page"}
                    for n, u in crawler.FEEDS.items()],
        "policy": {"respects_robots_txt": True, "delay_between_articles_sec": 1.0,
                   "user_agent": crawler.USER_AGENT, "fallback": "RSS summary if the article page cannot be downloaded"},
    }


@router.get("/sources")
def sources(svc: ScrapingService = Depends(get_scraping)):
    """Live connectivity + robots.txt check of all configured news feeds (real network calls)."""
    return {"sources": svc.check_sources()}
