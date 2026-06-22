"""Risk model inference wrapper. Falls back to a transparent heuristic if the
XGBoost artifact hasn't been trained yet, so the API is always live."""
from __future__ import annotations
import os
import numpy as np
import joblib

from app.ml.features import FEATURE_ORDER, RISK_TARGETS, to_vector

MODELS = os.path.join(os.path.dirname(__file__), "..", "..", "models")


class RiskModel:
    def __init__(self):
        self.models = None
        self.ready = False
        path = os.path.join(MODELS, "risk_xgb.joblib")
        if os.path.exists(path):
            try:
                self.models = joblib.load(path)
                self.ready = True
            except Exception as e:  # pragma: no cover
                print("RiskModel load failed:", e)

    def predict(self, feat: dict) -> dict:
        if self.ready:
            x = to_vector(feat).reshape(1, -1)
            return {t: float(np.clip(self.models[t].predict(x)[0], 0, 100)) for t in RISK_TARGETS}
        return self._heuristic(feat)

    def top_features(self, tgt: str, k: int = 4):
        """Per-risk feature importances (for explainability), if trained."""
        if not self.ready:
            return []
        imp = self.models[tgt].feature_importances_
        order = np.argsort(imp)[::-1][:k]
        return [(FEATURE_ORDER[i], round(float(imp[i]), 3)) for i in order]

    @staticmethod
    def _heuristic(f: dict) -> dict:
        n = lambda v, lo, hi: float(np.clip((v - lo) / (hi - lo), 0, 1))
        def syn(drivers, w):
            base = float(np.dot(drivers, w)); a = sum(d > 0.4 for d in drivers)
            return float(np.clip(base * 100 * (1.34 if a >= 3 else 1.13 if a == 2 else 1.0), 0, 100))
        fire = syn([n(f["ch4"], 800, 9000), f["hot_work"], n(f["valve_temp"], 35, 120),
                    n(f["workers_near_valve"], 0, 3)], [0.34, 0.24, 0.26, 0.16])
        toxic = syn([n(f["h2s"], 2, 20), n(20.9 - f["o2"], 0, 4.9),
                     n(f["workers_in_confined"], 0, 2), f["confined_active"]], [0.4, 0.34, 0.16, 0.1])
        equip = syn([n(f["pump_vibration"], 2.5, 12), n(f["pump_temp"], 50, 105),
                     n(f["maint_overdue_days"], 0, 21), n(f["pump_load"], 60, 100)], [0.34, 0.26, 0.22, 0.18])
        human = syn([n(f["duty_hours"], 8, 12), f["fatigue"], f["is_night"] * 0.6,
                     n(f["ppe_violations"], 0, 3)], [0.3, 0.34, 0.16, 0.2])
        return {"fire": fire, "explosion": fire * (0.7 + 0.3 * n(f["pressure"], 1.4, 3.0)),
                "toxic": toxic, "equipment": equip, "human_error": human}
