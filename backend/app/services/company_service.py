"""Company-centric view derived from the event-centric pipeline output.

The original pipeline yields *events* (who acquired whom, for how much...).
A "company" here is any entity named in an extracted event. Nothing is invented:
every field is aggregated from stored events / hierarchy links.
"""
import re
from collections import Counter, defaultdict
from datetime import datetime
from typing import Optional

from src.extractor import canonical

from ..repositories.event_repository import EventRepository

ROLE_FIELDS = ("acquirer", "target", "seller", "buyer")


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", canonical(name)).strip("-") or "unknown"


def parse_date(s: Optional[str]) -> Optional[str]:
    """Best-effort ISO date from the extractor's free-text dates; None if unparseable."""
    if not s:
        return None
    for fmt in ("%d %B %Y", "%B %d, %Y", "%B %d %Y", "%B %Y", "%d %b %Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(s.strip(), fmt).date().isoformat()
        except ValueError:
            continue
    return None


class CompanyService:
    def __init__(self, repo: EventRepository):
        self.repo = repo

    def _event_view(self, e: dict) -> dict:
        e = dict(e)
        e["event_date_iso"] = parse_date(e.get("event_date"))
        return e

    def build_index(self) -> dict:
        """Returns {company_id: aggregate dict} computed from stored events."""
        events = [self._event_view(e) for e in self.repo.all_events()]
        names = defaultdict(Counter)
        agg = {}
        for e in events:
            involved = {}  # id -> set(roles)
            for role in ROLE_FIELDS:
                n = e.get(role)
                if n:
                    involved.setdefault(slugify(n), set()).add(role)
                    names[slugify(n)][n] += 1
            for n in e.get("companies") or []:
                if n:
                    involved.setdefault(slugify(n), set())
                    names[slugify(n)][n] += 1
            for p in e.get("people") or []:
                pass
            for cid, roles in involved.items():
                a = agg.setdefault(cid, {"id": cid, "events": [], "roles": Counter()})
                a["events"].append(e)
                a["roles"].update(roles)
        from .graph_service import GraphService
        graph = GraphService(self.repo).full_graph()
        node_by_id = {n["company_id"]: n for n in graph["nodes"]}
        out = {}
        for cid, a in agg.items():
            evs = a["events"]
            vals = [x["numeric_value_usd_m"] for x in evs if x.get("numeric_value_usd_m") is not None]
            dates = sorted(d for d in (x["event_date_iso"] for x in evs) if d)
            node = node_by_id.get(cid)
            out[cid] = {
                "id": cid,
                "name": names[cid].most_common(1)[0][0],
                "event_count": len(evs),
                "event_types": dict(Counter(x["event_type"] for x in evs)),
                "roles": dict(a["roles"]),
                "total_deal_value_usd_m": round(sum(vals), 2) if vals else None,
                "deals_with_value": len(vals),
                "latest_event_date": dates[-1] if dates else None,
                "entity_type": node["type"] if node else None,
                "parents": node["parents"] if node else [],
                "subsidiaries": node["subsidiaries"] if node else [],
                "_events": evs,
            }
        return out

    def list(self, q=None, event_type=None, status=None, min_value=None, max_value=None,
             sort="events", limit=50, offset=0):
        idx = self.build_index()
        rows = list(idx.values())
        if q:
            ql = q.lower()
            rows = [r for r in rows if ql in r["name"].lower()]
        if event_type:
            rows = [r for r in rows if event_type in r["event_types"]]
        if status:
            rows = [r for r in rows if any(status.lower() in (e.get("status") or "").lower() for e in r["_events"])]
        if min_value is not None:
            rows = [r for r in rows if (r["total_deal_value_usd_m"] or 0) >= min_value and r["total_deal_value_usd_m"] is not None]
        if max_value is not None:
            rows = [r for r in rows if r["total_deal_value_usd_m"] is not None and r["total_deal_value_usd_m"] <= max_value]
        keyf = {
            "events": lambda r: -r["event_count"],
            "value": lambda r: -(r["total_deal_value_usd_m"] or -1),
            "name": lambda r: r["name"].lower(),
            "recent": lambda r: r["latest_event_date"] and -int(r["latest_event_date"].replace("-", "")) or 0,
        }.get(sort, lambda r: -r["event_count"])
        rows.sort(key=keyf)
        total = len(rows)
        items = [{k: v for k, v in r.items() if k != "_events"} for r in rows[offset:offset + limit]]
        return total, items

    def get(self, company_id: str) -> Optional[dict]:
        idx = self.build_index()
        c = idx.get(company_id)
        if not c:
            return None
        out = {k: v for k, v in c.items() if k != "_events"}
        out["events"] = sorted(c["_events"], key=lambda e: e.get("event_date_iso") or "", reverse=True)
        people = {}
        for e in c["_events"]:
            for p in e.get("people") or []:
                people[(p.get("name"), p.get("change"), p.get("role"))] = {**p, "event_title": e["title"]}
        out["people"] = list(people.values())
        return out
