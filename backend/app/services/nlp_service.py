"""NLP: wraps the original classifier + extractor + graph modules (no logic rewritten)."""
import copy
import csv
import os
import time

from src import classifier, extractor
from src.company_tree import CompanyGraph

from ..core.config import settings
from ..repositories.event_repository import EventRepository


class NlpService:
    def __init__(self, repo: EventRepository):
        self.repo = repo
        self._model = None

    def _get_model(self):
        if self._model is None:
            # classifier uses cwd-relative paths
            os.chdir(settings.repo_root)
            self._model = classifier.load_model()
        return self._model

    def analyze_text(self, title: str, text: str) -> dict:
        """Run classification -> extraction -> relationship mining on one article, live."""
        art = {"title": title, "text": text, "source": "ad-hoc", "url": "", "published": ""}
        art = classifier.classify([art], self._get_model())[0]
        events = extractor.extract_all([copy.deepcopy(art)]) if art["is_corporate_event"] else []
        g = CompanyGraph()
        g.add_from_articles([art], events)
        return {
            "classification": {k: art[k] for k in ("event_type", "event_subtype", "confidence", "is_corporate_event")},
            "events": events,
            "relationships": g.to_graph_data(),
        }

    def evaluate_model(self) -> dict:
        """Hold-out evaluation identical to the original /api/health/evaluate-model."""
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.linear_model import LogisticRegression
        from sklearn.metrics import accuracy_score, confusion_matrix, precision_recall_fscore_support
        from sklearn.model_selection import train_test_split
        from sklearn.pipeline import Pipeline

        path = settings.repo_root / "data" / "training_data.csv"
        if not path.exists():
            return {"status": "unavailable", "message": "data/training_data.csv not found"}
        with open(path, encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
        X, y = [r["text"] for r in rows], [r["label"] for r in rows]
        X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.25, random_state=42, stratify=y)
        m = Pipeline([("tfidf", TfidfVectorizer(ngram_range=(1, 2), lowercase=True, sublinear_tf=True, min_df=1)),
                      ("clf", LogisticRegression(max_iter=3000, C=6.0, class_weight="balanced"))])
        m.fit(X_tr, y_tr)
        pred = m.predict(X_te)
        p, r, f1, _ = precision_recall_fscore_support(y_te, pred, average="weighted", zero_division=0)
        labels = sorted(set(y))
        return {
            "status": "ok", "evaluation_type": "Hold-out (25% stratified)",
            "total_examples": len(rows), "train_examples": len(y_tr), "test_examples": len(y_te),
            "accuracy": round(accuracy_score(y_te, pred), 4), "precision": round(p, 4),
            "recall": round(r, 4), "f1_score": round(f1, 4),
            "labels": labels, "confusion_matrix": confusion_matrix(y_te, pred, labels=labels).tolist(),
            "evaluated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        }
