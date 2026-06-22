"""All HTTP routes. The frontend's primary integration point is POST /analyze."""
from __future__ import annotations
from fastapi import APIRouter

from app.schemas import FrameIn, AdvisoryRequest
from app.api.pipeline import analyze, graph
from app.ml.features import frame_to_features
from app.ml import registry
from app.fusion.engine import fuse
from app.intervention.engine import recommend
from app.advisor.llm import advise
from app.db.models import log_event

router = APIRouter()


@router.get("/health")
def health():
    return {"status": "ok", "models": registry.status()}


@router.post("/analyze")
def analyze_frame(frame: FrameIn):
    """Full pipeline in one call — what SENTINEL hits every tick."""
    f = frame.model_dump()
    result = analyze(f, with_advisory=True)
    log_event(f.get("zone", "Tank B"), f, result)
    return result


@router.post("/predict/risk")
def predict_risk(frame: FrameIn):
    feat = frame_to_features(frame.model_dump())
    scores = registry.risk_model().predict(feat)
    return {"scores": scores, "trained": registry.risk_model().ready,
            "importances": {k: registry.risk_model().top_features(k) for k in scores}}


@router.post("/detect/anomaly")
def detect_anomaly(frame: FrameIn):
    return registry.anomaly_model().score(frame_to_features(frame.model_dump()))


@router.post("/predict/forecast")
def predict_forecast(frame: FrameIn):
    fc = registry.forecaster()
    feat = frame_to_features(frame.model_dump())
    fc.observe(frame.zone, feat)
    return fc.forecast(frame.zone)


@router.post("/fuse")
def fuse_only(frame: FrameIn):
    feat = frame_to_features(frame.model_dump())
    scores = registry.risk_model().predict(feat)
    anom = registry.anomaly_model().score(feat)
    return fuse(feat, scores, anom)


@router.post("/intervene")
def intervene(frame: FrameIn):
    feat = frame_to_features(frame.model_dump())
    scores = registry.risk_model().predict(feat)
    anom = registry.anomaly_model().score(feat)
    return {"interventions": recommend(fuse(feat, scores, anom))}


@router.post("/advisor")
def advisor(req: AdvisoryRequest):
    f = req.frame.model_dump()
    feat = frame_to_features(f)
    scores = registry.risk_model().predict(feat)
    anom = registry.anomaly_model().score(feat)
    return advise(fuse(feat, scores, anom), f)


@router.get("/graph/context/{location_id}")
def graph_context(location_id: str):
    return {"location": location_id, "context": graph().context(location_id),
            "boost": graph().context_boost(location_id)}
