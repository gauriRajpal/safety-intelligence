"""Isolation Forest inference. Returns an anomaly score in 0-100 plus a flag."""
from __future__ import annotations
import os
import numpy as np
import joblib

from app.ml.features import to_vector

MODELS = os.path.join(os.path.dirname(__file__), "..", "..", "models")


class AnomalyModel:
    def __init__(self):
        self.pipe = None
        self.ready = False
        path = os.path.join(MODELS, "anomaly_iforest.joblib")
        if os.path.exists(path):
            try:
                self.pipe = joblib.load(path)
                self.ready = True
            except Exception as e:  # pragma: no cover
                print("AnomalyModel load failed:", e)

    def score(self, feat: dict) -> dict:
        if not self.ready:
            return {"anomaly_score": 0.0, "is_anomaly": False, "trained": False}
        x = to_vector(feat).reshape(1, -1)
        # decision_function: higher = more normal. Map to 0-100 (higher = more anomalous).
        raw = float(self.pipe.decision_function(x)[0])
        score = float(np.clip(50 - raw * 120, 0, 100))
        return {"anomaly_score": round(score, 1),
                "is_anomaly": bool(self.pipe.predict(x)[0] == -1),
                "trained": True}
