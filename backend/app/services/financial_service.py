"""Financial figures derived from stored deal values (normalized by src.db.parse_numeric_usd_m).

Missing values are reported as null (never 0). Non-USD currencies are converted using
the original project's fixed rates (INR 1 crore = USD 0.12M, EUR 1.08, GBP 1.28).
"""
from collections import defaultdict

from .company_service import CompanyService


class FinancialService:
    def __init__(self, companies: CompanyService):
        self.companies = companies

    def company_financials(self, company_id: str):
        c = self.companies.get(company_id)
        if c is None:
            return None
        deals = []
        as_acq = as_tgt = 0.0
        for e in c["events"]:
            v = e.get("numeric_value_usd_m")
            role = ("acquirer" if e.get("acquirer") and company_id == self._slug(e["acquirer"]) else
                    "target" if e.get("target") and company_id == self._slug(e["target"]) else
                    "seller" if e.get("seller") and company_id == self._slug(e["seller"]) else
                    "buyer" if e.get("buyer") and company_id == self._slug(e["buyer"]) else "mentioned")
            if v is not None:
                if role in ("acquirer", "buyer"):
                    as_acq += v
                elif role in ("target", "seller"):
                    as_tgt += v
            deals.append({
                "event_id": e["id"], "title": e["title"], "event_type": e["event_type"],
                "role": role, "date": e.get("event_date"), "date_iso": e.get("event_date_iso"),
                "status": e.get("status"), "deal_value_raw": e.get("deal_value"),
                "value_usd_m": v, "deal_structure": e.get("deal_structure"),
            })
        valued = [d for d in deals if d["value_usd_m"] is not None]
        return {
            "company_id": company_id,
            "company_name": c["name"],
            "total_deal_value_usd_m": c["total_deal_value_usd_m"],
            "capital_deployed_usd_m": round(as_acq, 2) if any(d["role"] in ("acquirer", "buyer") and d["value_usd_m"] is not None for d in deals) else None,
            "capital_received_usd_m": round(as_tgt, 2) if any(d["role"] in ("target", "seller") and d["value_usd_m"] is not None for d in deals) else None,
            "deal_count": len(deals),
            "deals_with_disclosed_value": len(valued),
            "largest_deal_usd_m": max((d["value_usd_m"] for d in valued), default=None),
            "deals": deals,
            "note": "Values are extracted from news text; deals without a disclosed value are null, not zero. "
                    "No market data (revenue, EPS, prices) exists in this pipeline.",
        }

    @staticmethod
    def _slug(n):
        from .company_service import slugify
        return slugify(n)

    def capital_by_type(self):
        agg = defaultdict(lambda: {"count": 0, "valued": 0, "total_usd_m": 0.0})
        for e in self.companies.repo.all_events():
            a = agg[e["event_type"]]
            a["count"] += 1
            if e.get("numeric_value_usd_m") is not None:
                a["valued"] += 1
                a["total_usd_m"] += e["numeric_value_usd_m"]
        return [{"event_type": k, **{**v, "total_usd_m": round(v["total_usd_m"], 2) if v["valued"] else None}}
                for k, v in sorted(agg.items())]
