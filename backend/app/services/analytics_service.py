from collections import Counter, defaultdict

from .company_service import CompanyService, parse_date
from .financial_service import FinancialService


class AnalyticsService:
    def __init__(self, companies: CompanyService, financials: FinancialService):
        self.companies = companies
        self.financials = financials

    def overview(self) -> dict:
        repo = self.companies.repo
        events = repo.all_events()
        idx = self.companies.build_index()
        valued = [e for e in events if e.get("numeric_value_usd_m") is not None]
        by_month = defaultdict(lambda: {"count": 0, "value_usd_m": 0.0, "valued": 0})
        undated = 0
        for e in events:
            d = parse_date(e.get("event_date"))
            if not d:
                undated += 1
                continue
            m = by_month[d[:7]]
            m["count"] += 1
            if e.get("numeric_value_usd_m") is not None:
                m["value_usd_m"] += e["numeric_value_usd_m"]
                m["valued"] += 1
        top = sorted(idx.values(), key=lambda c: -c["event_count"])[:10]
        leaders = []
        for c in idx.values():
            deployed = sum(e["numeric_value_usd_m"] for e in c["_events"]
                           if e.get("numeric_value_usd_m") is not None and e.get("acquirer")
                           and e["acquirer"] and self._same(c["name"], e["acquirer"]))
            if deployed:
                leaders.append({"company_id": c["id"], "name": c["name"], "capital_deployed_usd_m": round(deployed, 2)})
        leaders.sort(key=lambda x: -x["capital_deployed_usd_m"])
        recent = sorted(events, key=lambda e: (parse_date(e.get("event_date")) or "", e["id"]), reverse=True)[:8]
        from .graph_service import GraphService
        graph = GraphService(repo).full_graph()
        return {
            "totals": {
                "companies": len(idx), "events": len(events), "events_with_disclosed_value": len(valued),
                "total_disclosed_value_usd_m": round(sum(e["numeric_value_usd_m"] for e in valued), 2) if valued else None,
                "relationships": len(graph["edges"]), "undated_events": undated,
            },
            "events_by_type": dict(Counter(e["event_type"] for e in events)),
            "events_by_status": dict(Counter(e.get("status") or "Unknown" for e in events)),
            "events_by_source": dict(Counter(e.get("source") or "Unknown" for e in events)),
            "capital_by_type": self.financials.capital_by_type(),
            "timeline": [{"month": k, "count": v["count"], "value_usd_m": round(v["value_usd_m"], 2) if v["valued"] else None}
                         for k, v in sorted(by_month.items())],
            "most_active_companies": [{"company_id": c["id"], "name": c["name"], "event_count": c["event_count"]} for c in top],
            "top_capital_deployers": leaders[:10],
            "recent_events": [{"id": e["id"], "title": e["title"], "event_type": e["event_type"],
                               "date": e.get("event_date"), "value": e.get("deal_value"), "source": e.get("source")} for e in recent],
            "recent_pipeline_runs": repo.pipeline_runs(5),
            "data_provenance": sorted({e.get("source") or "Unknown" for e in events}),
        }

    @staticmethod
    def _same(a, b):
        from .company_service import slugify
        return slugify(a) == slugify(b)
