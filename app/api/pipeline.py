"""The end-to-end analysis pipeline, called by /analyze.

frame -> features -> {risk model, anomaly, forecast, graph context}
      -> fusion -> intervention -> (optional advisory) -> response
"""
from __future__ import annotations
from typing import Dict

from app.ml.features import frame_to_features
from app.ml import registry
from app.fusion.engine import fuse
from app.intervention.engine import recommend
from app.advisor.llm import advise

_graph = None


def graph():
    global _graph
    if _graph is None:
        from app.graph.neo4j_client import GraphClient
        _graph = GraphClient()
    return _graph


def analyze(frame: Dict, with_advisory: bool = True) -> Dict:
    feat = frame_to_features(frame)
    zone = frame.get("zone", "Tank B")

    rm = registry.risk_model()
    am = registry.anomaly_model()
    fc = registry.forecaster()

    risk_scores = rm.predict(feat)
    anomaly = am.score(feat)
    fc.observe(zone, feat)
    forecast = fc.forecast(zone)

    boost = 0.0
    loc = frame.get("location_id")
    if loc:
        try:
            boost = graph().context_boost(loc)
        except Exception:
            boost = 0.0

    fused = fuse(feat, risk_scores, anomaly, forecast, graph_boost=boost)
    interventions = recommend(fused)

    result = {
        **fused,
        "interventions": interventions,
        "graph_boost": boost,
        "models": registry.status(),
    }
    if with_advisory:
        result["advisory"] = advise(fused, frame)["advisory"]
    return result
