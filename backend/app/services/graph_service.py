"""Relationship graph.

The original pipeline rewrites output/company_graph.json from only the *latest* run, while the SQLite
`company_hierarchy` table accumulates across runs. We serve the latest graph file merged with every
hierarchy link stored in the DB, so relationships from earlier runs are not lost.
"""
from typing import Optional

from .company_service import slugify
from ..repositories.event_repository import EventRepository

EVIDENCE = {
    "completed_acquisition": "Completed Acquisition", "proposed_acquisition": "Proposed Acquisition (Pending Closing)",
    "contested_takeover": "Contested Takeover Bid", "merger_partnership": "Proposed Merger Agreement",
    "subsidiary": "Documented Ownership", "stake": "Equity Stake",
}


class GraphService:
    def __init__(self, repo: EventRepository):
        self.repo = repo

    def full_graph(self) -> dict:
        g = self.repo.read_json("company_graph.json") or {"nodes": [], "edges": []}
        edges = [{**e, "source_company_id": slugify(e["source_name"]), "target_company_id": slugify(e["target_name"])}
                 for e in g["edges"]]
        names = {slugify(n["name"]): n["name"] for n in g["nodes"]}
        seen = {(e["source_company_id"], e["target_company_id"]) for e in edges}
        for h in self.repo.hierarchy():
            s, t = slugify(h["parent_company"]), slugify(h["child_company"])
            if s == t or (s, t) in seen or (t, s) in seen:
                continue
            seen.add((s, t))
            names.setdefault(s, h["parent_company"])
            names.setdefault(t, h["child_company"])
            rel = h["relation"]
            pct = h.get("stake_pct")
            edges.append({
                "source": s, "target": t, "source_name": h["parent_company"], "target_name": h["child_company"],
                "source_company_id": s, "target_company_id": t, "relation": rel,
                "evidence": f"Equity Stake ({pct:g}%)" if pct else EVIDENCE.get(rel, rel),
                "deal_status": None, "deal_value": None, "former_parent": h.get("former_parent"),
                "pct": f"{pct:g}" if pct else None, "url": None, "event_title": None,
            })
        # rebuild nodes with degrees from the merged edge set
        nodes = []
        for cid, name in sorted(names.items(), key=lambda x: x[1]):
            ins = [e for e in edges if e["target_company_id"] == cid]
            outs = [e for e in edges if e["source_company_id"] == cid]
            if not ins and not outs:
                continue
            rels = {e["relation"] for e in ins}
            if not ins:
                typ = "Holding Parent"
            elif "completed_acquisition" in rels:
                typ = "Acquired Company"
            elif "proposed_acquisition" in rels:
                typ = "Target Entity (Pending)"
            elif "contested_takeover" in rels:
                typ = "Contested Target"
            elif "merger_partnership" in rels:
                typ = "Merger Partner"
            else:
                typ = "Operating Subsidiary"
            nodes.append({"id": cid, "company_id": cid, "name": name, "type": typ,
                          "in_degree": len(ins), "out_degree": len(outs),
                          "parents": [e["source_name"] for e in ins], "subsidiaries": [e["target_name"] for e in outs]})
        return {"nodes": nodes, "edges": edges}

    def company_graph(self, company_id: str, depth: int = 1) -> Optional[dict]:
        g = self.full_graph()
        ids = {n["company_id"]: n for n in g["nodes"]}
        if company_id not in ids:
            return None
        keep = {company_id}
        frontier = {company_id}
        for _ in range(max(depth, 1)):
            nxt = set()
            for e in g["edges"]:
                if e["source_company_id"] in frontier:
                    nxt.add(e["target_company_id"])
                if e["target_company_id"] in frontier:
                    nxt.add(e["source_company_id"])
            keep |= nxt
            frontier = nxt
        return {
            "center": company_id,
            "nodes": [n for n in g["nodes"] if n["company_id"] in keep],
            "edges": [e for e in g["edges"] if e["source_company_id"] in keep and e["target_company_id"] in keep],
        }
