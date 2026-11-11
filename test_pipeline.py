"""
Corporate Event Miner - Automated Regression Test Suite.
Tests core functionality across:
  - Document categorization & heuristic guards (classifier.py)
  - Information Extraction for counterparties & financial terms (extractor.py)
  - Relationship Graph construction & topological ordering (company_tree.py)
  - SQLite persistence & query API (db.py)
  - Output files and Presentation Mode markup integrity (dashboard.py)
"""
import csv
import json
import os
import unittest

from src import classifier, extractor, company_tree, db


class TestCorporateEventMiner(unittest.TestCase):

    def test_classifier_single_and_batch(self):
        articles = [
            {
                "title": "Zenith Motors to acquire Orion Steel for $2.1 billion",
                "text": "Zenith Motors agreed to acquire Orion Steel Corp for $2.1 billion on 14 March 2026."
            },
            {
                "title": "Stock market update: Sensex and Nifty rally 400 points",
                "text": "Indian equities rallied today led by banking and IT stocks amidst positive global cues."
            }
        ]
        classified = classifier.classify(articles)
        self.assertEqual(len(classified), 2)
        
        # Article 1: Real Acquisition Event
        self.assertEqual(classified[0]["event_type"], "ACQUISITION")
        self.assertTrue(classified[0]["is_corporate_event"])
        self.assertGreater(classified[0]["confidence"], 0.5)

        # Article 2: Non-Event Market Prose Suppressed
        self.assertEqual(classified[1]["event_type"], "NO_EVENT")
        self.assertFalse(classified[1]["is_corporate_event"])

    def test_classifier_hostile_takeover_heuristic(self):
        articles = [
            {
                "title": "Bluewave Telecom mounts hostile bid for Crescent Textiles",
                "text": "Bluewave Telecom launched an unsolicited tender offer directly to shareholders. Crescent Textiles' board adopted a poison pill defense to fend off the takeover approach."
            }
        ]
        classified = classifier.classify(articles)
        self.assertEqual(classified[0]["event_type"], "HOSTILE_TAKEOVER")
        self.assertTrue(classified[0]["is_corporate_event"])

    def test_extractor_counterparties_and_terms(self):
        art = {
            "title": "Zenith Motors to acquire Orion Steel for $2.1 billion",
            "text": "Zenith Motors agreed to acquire Orion Steel Corp for $2.1 billion on 14 March 2026.",
            "event_type": "ACQUISITION",
            "event_subtype": "Completed Acquisition",
            "confidence": 0.95,
            "source": "Financial Wire",
            "url": "http://example.com/zenith"
        }
        event = extractor.extract_event(art)
        self.assertEqual(event["acquirer"], "Zenith Motors")
        self.assertEqual(event["target"], "Orion Steel")
        self.assertEqual(event["deal_value"], "$2.1 billion")
        self.assertEqual(event["event_date"], "14 March 2026")
        self.assertIn("Zenith Motors", event["event_brief"])

    def test_extractor_executive_change(self):
        art = {
            "title": "Falcon Airlines appoints Priya Nair as CEO",
            "text": "Falcon Airlines announced that Priya Nair has been appointed Chief Executive Officer, while Rahul Mehta stepped down as CEO.",
            "event_type": "EXECUTIVE_CHANGE",
            "event_subtype": "Executive Leadership Appointment",
            "confidence": 0.98,
            "source": "Aviation Daily",
            "url": "http://example.com/falcon"
        }
        event = extractor.extract_event(art)
        self.assertEqual(event["event_type"], "EXECUTIVE_CHANGE")
        self.assertIn("Priya Nair", event["event_brief"])

    def test_company_graph_topological_mapping(self):
        cg = company_tree.CompanyGraph()
        cg.add("Titan Chemicals Corp", "Orion Steel Corp", "subsidiary", "seed")
        roots = cg.roots()
        self.assertIn("titan chemicals", roots)
        
        # Test acquisition provenance reassignment
        cg.add("Zenith Motors Ltd", "Orion Steel Corp", "completed_acquisition", "news", deal_status="Completed")
        graph_data = cg.to_graph_data()
        node_names = [n["name"] for n in graph_data["nodes"]]
        self.assertIn("Zenith Motors Ltd", node_names)
        self.assertIn("Orion Steel Corp", node_names)
        
        # Verify edge exists
        edge_exists = any(
            e["source_name"] == "Zenith Motors Ltd" and e["target_name"] == "Orion Steel Corp"
            for e in graph_data["edges"]
        )
        self.assertTrue(edge_exists)

    def test_database_persistence_and_query(self):
        db_path = "output/test_corporate_events.db"
        try:
            if os.path.exists(db_path):
                os.remove(db_path)
        except Exception:
            pass

        db.init_db(db_path)
        
        sample_event = {
            "title": "Acme Corp to acquire Beta Inc",
            "event_type": "ACQUISITION",
            "event_subtype": "Definitive Agreement",
            "acquirer": "Acme Corp",
            "target": "Beta Inc",
            "deal_value": "$500 million",
            "deal_structure": "Equity Purchase",
            "event_date": "2026-05-10",
            "effective_timeline": "Q4 2026",
            "status": "Announced",
            "strategic_rationale": "Market expansion",
            "event_brief": "Acme Corp announced an agreement to buy Beta Inc for $500 million.",
            "confidence": 0.92,
            "source": "Reuters",
            "url": "http://example.com/acme",
            "companies": ["Acme Corp", "Beta Inc"],
            "people": []
        }
        
        db.save_events([sample_event], db_path=db_path)
        results = db.query_events(company="Acme", db_path=db_path)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["acquirer"], "Acme Corp")
        self.assertEqual(results[0]["deal_value"], "$500 million")
        
        stats = db.get_db_stats(db_path)
        self.assertEqual(stats["total_events"], 1)
        self.assertEqual(stats["total_capital_usd_m"], 500.0)

    def test_presentation_mode_html_integrity(self):
        dash_path = "output/dashboard.html"
        self.assertTrue(os.path.exists(dash_path), "output/dashboard.html must exist")
        with open(dash_path, encoding="utf-8") as f:
            html = f.read()
        
        # Phase 6 verification
        self.assertIn("presentationSteps =", html)
        self.assertIn("Project Overview & Architecture", html)
        self.assertIn("Company Relationship Explorer", html)
        self.assertIn("Real-Data Financial Analytics", html)
        self.assertIn("Pipeline Health & Diagnostics", html)
        self.assertIn("Technical Methodology & Conclusion", html)
        self.assertIn("btnToggleNotes", html)
        self.assertIn("presStepDots", html)
        self.assertIn("spotlight-active", html)


if __name__ == "__main__":
    unittest.main()
