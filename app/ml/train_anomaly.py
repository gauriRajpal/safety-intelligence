"""Anomaly Detection Engine — training (Isolation Forest).

Catches the risks no rule and no label anticipates: a combination of values
that is individually in-range but jointly unprecedented (e.g. normal CH4 +
hot valve + active hot-work permit). We fit ONLY on nominal states, so anything
far from the learned "normal manifold" scores as anomalous.

Usage: python -m app.ml.train_anomaly
Artifacts: models/anomaly_iforest.joblib (Pipeline: scaler -> IsolationForest)
"""
from __future__ import annotations
import os
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
import joblib

from app.ml.features import FEATURE_ORDER, RISK_TARGETS

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
DATA = os.path.join(ROOT, "data", "tabular.csv")
MODELS = os.path.join(ROOT, "models")


def train():
    if not os.path.exists(DATA):
        raise SystemExit("data/tabular.csv missing — run `python -m app.ml.synth` first")
    df = pd.read_csv(DATA)
    # "nominal" = low across every risk target
    nominal = df[(df[RISK_TARGETS] < 30).all(axis=1)]
    X = nominal[FEATURE_ORDER].values
    pipe = Pipeline([
        ("scale", StandardScaler()),
        ("iforest", IsolationForest(n_estimators=300, contamination=0.04,
                                    random_state=42, n_jobs=4)),
    ])
    pipe.fit(X)
    os.makedirs(MODELS, exist_ok=True)
    joblib.dump(pipe, os.path.join(MODELS, "anomaly_iforest.joblib"))
    print(f"trained IsolationForest on {len(X)} nominal samples -> models/anomaly_iforest.joblib")


if __name__ == "__main__":
    train()
