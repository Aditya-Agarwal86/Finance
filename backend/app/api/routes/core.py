"""Health, companies, search, financials, relationships, analysis, analytics, events."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from ...core.config import settings
from ...schemas import AnalyzeTextRequest, HealthResponse, SearchRequest
from ...services.analytics_service import AnalyticsService
from ...services.company_service import CompanyService
from ...services.financial_service import FinancialService
from ...services.graph_service import GraphService
from ...services.nlp_service import NlpService
from ...services.scraping_service import ScrapingService
from ..deps import (get_analytics, get_companies, get_financials, get_graph, get_nlp,
                    get_repo, get_scraping)

router = APIRouter()


def _404(what, id_):
    raise HTTPException(status_code=404, detail={"code": "not_found", "message": f"{what} '{id_}' not found"})


# ---- health --------------------------------------------------------
@router.get("/health", response_model=HealthResponse, tags=["health"])
def health(repo=Depends(get_repo), scraping: ScrapingService = Depends(get_scraping)):
    stats = repo.stats()
    return HealthResponse(status="ok", version=settings.version, database_available=stats is not None,
                          events=stats["total_events"] if stats else 0, pipeline_busy=scraping.active() is not None)


@router.get("/system/status", tags=["health"])
def system_status(repo=Depends(get_repo)):
    return {"database": repo.stats(), "output_files": repo.output_files(),
            "engine": "TF-IDF + Balanced Logistic Regression + NetworkX DiGraph + SQLite WAL"}


@router.get("/system/model-evaluation", tags=["health"])
def model_evaluation(nlp: NlpService = Depends(get_nlp)):
    return nlp.evaluate_model()


# ---- companies -----------------------------------------------------
@router.get("/companies", tags=["companies"])
def list_companies(q: Optional[str] = None, event_type: Optional[str] = None, status: Optional[str] = None,
                   min_value_usd_m: Optional[float] = Query(None, ge=0), max_value_usd_m: Optional[float] = Query(None, ge=0),
                   sort: str = Query("events", pattern="^(events|value|name|recent)$"),
                   limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
                   svc: CompanyService = Depends(get_companies)):
    total, items = svc.list(q, event_type, status, min_value_usd_m, max_value_usd_m, sort, limit, offset)
    return {"total": total, "limit": limit, "offset": offset, "items": items}


@router.get("/companies/{company_id}", tags=["companies"])
def get_company(company_id: str, svc: CompanyService = Depends(get_companies)):
    c = svc.get(company_id)
    if not c:
        _404("Company", company_id)
    return c


@router.get("/companies/{company_id}/financials", tags=["companies"])
def company_financials(company_id: str, svc: FinancialService = Depends(get_financials)):
    f = svc.company_financials(company_id)
    if not f:
        _404("Company", company_id)
    return f


@router.get("/companies/{company_id}/relationships", tags=["companies"])
def company_relationships(company_id: str, depth: int = Query(1, ge=1, le=3), svc: GraphService = Depends(get_graph)):
    g = svc.company_graph(company_id, depth)
    if g is None:
        # company may exist without any relationship
        return {"center": company_id, "nodes": [], "edges": []}
    return g


@router.get("/companies/{company_id}/analysis", tags=["companies"])
def company_analysis(company_id: str, svc: CompanyService = Depends(get_companies)):
    c = svc.get(company_id)
    if not c:
        _404("Company", company_id)
    return {
        "company_id": company_id, "company_name": c["name"],
        "event_count": c["event_count"], "event_types": c["event_types"], "roles": c["roles"],
        "analyses": [{
            "event_id": e["id"], "title": e["title"], "event_type": e["event_type"],
            "event_subtype": e.get("event_subtype"), "classifier_confidence": e.get("confidence"),
            "status": e.get("status"), "date": e.get("event_date"), "effective_timeline": e.get("effective_timeline"),
            "brief": e.get("event_brief"), "key_highlights": e.get("key_highlights") or [],
            "people": e.get("people") or [], "source": e.get("source"), "url": e.get("url"),
            "snippet": e.get("raw_text_snippet"),
        } for e in c["events"]],
    }


# ---- graph ---------------------------------------------------------
@router.get("/relationships", tags=["relationships"])
def full_graph(svc: GraphService = Depends(get_graph)):
    return svc.full_graph()


# ---- search --------------------------------------------------------
@router.post("/search", tags=["search"])
def search(req: SearchRequest, companies: CompanyService = Depends(get_companies), repo=Depends(get_repo)):
    total, items = companies.list(req.query, req.event_type, req.status, req.min_value_usd_m, req.max_value_usd_m,
                                  req.sort, req.limit, req.offset)
    events = repo.query_events(company=req.query, event_type=req.event_type, status=req.status,
                               min_value_usd_m=req.min_value_usd_m, max_value_usd_m=req.max_value_usd_m,
                               limit=req.limit, offset=0, sort_by="date_desc") if req.query or req.event_type or req.status else []
    return {"query": req.query, "companies": {"total": total, "items": items}, "events": events}


# ---- events --------------------------------------------------------
@router.get("/events", tags=["events"])
def list_events(company: Optional[str] = None, event_type: Optional[str] = None, status: Optional[str] = None,
                keyword: Optional[str] = None, min_value_usd_m: Optional[float] = None,
                max_value_usd_m: Optional[float] = None,
                sort: str = Query("date_desc", pattern="^(val_desc|val_asc|conf_desc|date_desc|id_desc)$"),
                limit: int = Query(50, ge=1, le=500), offset: int = Query(0, ge=0), repo=Depends(get_repo)):
    items = repo.query_events(company=company, event_type=event_type, status=status, keyword=keyword,
                              min_value_usd_m=min_value_usd_m, max_value_usd_m=max_value_usd_m,
                              sort_by=sort, limit=100000, offset=0)
    if sort == "date_desc":  # event_date is free text in the DB; order by parsed date, undated last
        from ...services.company_service import parse_date
        items.sort(key=lambda e: (parse_date(e.get("event_date")) or "", e["id"]), reverse=True)
    return {"limit": limit, "offset": offset, "total": len(items), "items": items[offset:offset + limit]}


# ---- analytics -----------------------------------------------------
@router.get("/analytics/overview", tags=["analytics"])
def analytics_overview(svc: AnalyticsService = Depends(get_analytics)):
    return svc.overview()


# ---- NLP -----------------------------------------------------------
@router.post("/analysis/text", tags=["analysis"])
def analyze_text(req: AnalyzeTextRequest, nlp: NlpService = Depends(get_nlp)):
    """Runs the original classifier + extractor + relationship miner on supplied text."""
    return nlp.analyze_text(req.title, req.text or req.title)
